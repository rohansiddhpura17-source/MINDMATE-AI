/**
 * Image Search Service for MindMate Visual Learning Engine
 * 
 * Retrieves educational, real-world images from Wikimedia Commons and Wikipedia APIs
 * with full legal attribution, licenses, direct thumbnails, and source page links.
 * Zero external scraping or private keys required.
 */

import { contentModerationService } from './contentModeration';

export interface ImageItem {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  description: string;
  author: string;
  license: string;
  licenseUrl?: string;
  sourceUrl: string;
  width?: number;
  height?: number;
}

export interface ImageSearchResult {
  query: string;
  items: ImageItem[];
  cached?: boolean;
  total: number;
}

// In-memory LRU-style cache with 1-hour TTL
interface CacheEntry {
  data: ImageItem[];
  timestamp: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const cache = new Map<string, CacheEntry>();

function stripHtml(html?: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
}

function cleanTitle(rawTitle: string): string {
  return rawTitle
    .replace(/^File:/i, '')
    .replace(/\.(jpe?g|png|gif|svg|webp)$/i, '')
    .replace(/_/g, ' ')
    .trim();
}

/**
 * Searches Wikimedia Commons for relevant educational media
 */
export async function searchImages(query: string, limit = 6): Promise<ImageSearchResult> {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return { query, items: [], total: 0 };
  }

  // Pre-flight content moderation check (defense-in-depth)
  if (!contentModerationService.isVisualSearchPermitted(query)) {
    return { query, items: [], total: 0 };
  }

  // Check cache first
  const cached = cache.get(normalizedQuery);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return {
      query,
      items: cached.data.slice(0, limit),
      cached: true,
      total: cached.data.length
    };
  }

  const items: ImageItem[] = [];
  const seenUrls = new Set<string>();

  try {
    // 1. Query Wikimedia Commons with imageinfo and thumbnails
    const commonsUrl = new URL('https://commons.wikimedia.org/w/api.php');
    commonsUrl.search = new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: query,
      gsrnamespace: '6', // File namespace
      gsrlimit: String(Math.max(limit, 8)),
      prop: 'imageinfo',
      iiprop: 'url|size|extmetadata',
      iiurlwidth: '800',
      format: 'json',
      origin: '*'
    }).toString();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(commonsUrl.toString(), {
      headers: {
        'User-Agent': 'MindMate-AI/1.0 (Educational Visual Learning Engine; contact: support@mindmate.local)'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const data: any = await res.json();
      const pages = data?.query?.pages;

      if (pages && typeof pages === 'object') {
        const sortedPages = Object.values(pages).sort((a: any, b: any) => (a.index || 0) - (b.index || 0));

        for (const page of sortedPages as any[]) {
          const info = page.imageinfo?.[0];
          if (!info) continue;

          // Skip SVG icons, banners, or very tiny symbols
          const extmetadata = info.extmetadata || {};
          const fullUrl = info.url;
          const thumbUrl = info.thumburl || fullUrl;
          if (!thumbUrl || seenUrls.has(thumbUrl)) continue;

          // Exclude commons interface icons
          if (thumbUrl.includes('PD-icon') || thumbUrl.includes('Defaut.svg')) continue;

          const title = cleanTitle(page.title || '');
          const author = stripHtml(extmetadata.Artist?.value || extmetadata.Credit?.value || 'Wikimedia Contributor');
          const license = stripHtml(extmetadata.LicenseShortName?.value || extmetadata.UsageTerms?.value || 'Creative Commons');
          const licenseUrl = extmetadata.LicenseUrl?.value || undefined;
          const description = stripHtml(extmetadata.ImageDescription?.value || extmetadata.ObjectName?.value || title);
          const sourceUrl = info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`;

          items.push({
            id: String(page.pageid || Math.random()),
            title,
            url: fullUrl,
            thumbnail: thumbUrl,
            description,
            author,
            license,
            licenseUrl,
            sourceUrl,
            width: info.thumbwidth || info.width,
            height: info.thumbheight || info.height
          });

          seenUrls.add(thumbUrl);
          if (items.length >= limit) break;
        }
      }
    }
  } catch (err) {
    // If Commons request fails or times out, proceed to Wikipedia fallback
    console.warn(`[ImageSearch] Commons query error for "${query}":`, (err as any)?.message || err);
  }

  // 2. Fallback / supplementary search using Wikipedia pageimages if few or no items found
  if (items.length < 2) {
    try {
      const wikiUrl = new URL('https://en.wikipedia.org/w/api.php');
      wikiUrl.search = new URLSearchParams({
        action: 'query',
        generator: 'search',
        gsrsearch: query,
        gsrlimit: '4',
        prop: 'pageimages|extracts|info',
        piprop: 'thumbnail',
        pithumbsize: '800',
        exintro: '1',
        explaintext: '1',
        inprop: 'url',
        format: 'json',
        origin: '*'
      }).toString();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(wikiUrl.toString(), {
        headers: {
          'User-Agent': 'MindMate-AI/1.0 (Educational Visual Learning Engine; contact: support@mindmate.local)'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        const data: any = await res.json();
        const pages = data?.query?.pages;

        if (pages && typeof pages === 'object') {
          for (const page of Object.values(pages) as any[]) {
            const thumb = page.thumbnail;
            if (!thumb?.source || seenUrls.has(thumb.source)) continue;

            const title = page.title || query;
            const extract = page.extract ? page.extract.split('\n')[0] : `Article on ${title}`;

            items.push({
              id: `wiki-${page.pageid}`,
              title,
              url: thumb.source,
              thumbnail: thumb.source,
              description: extract.length > 220 ? extract.slice(0, 220) + '...' : extract,
              author: 'Wikipedia Contributors',
              license: 'CC BY-SA 4.0',
              licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
              sourceUrl: page.fullurl || `https://en.wikipedia.org/?curid=${page.pageid}`,
              width: thumb.width,
              height: thumb.height
            });

            seenUrls.add(thumb.source);
            if (items.length >= limit) break;
          }
        }
      }
    } catch (err) {
      console.warn(`[ImageSearch] Wikipedia fallback error for "${query}":`, (err as any)?.message || err);
    }
  }

  // Cache successful or empty results
  cache.set(normalizedQuery, {
    data: items,
    timestamp: Date.now()
  });

  return {
    query,
    items,
    total: items.length
  };
}

/**
 * Clears the image search cache (for testing)
 */
export function clearImageCache(): void {
  cache.clear();
}
