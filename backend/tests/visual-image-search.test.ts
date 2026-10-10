import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { searchImages, clearImageCache } from '../src/services/imageSearch.js';
import app from '../src/server.js';

describe('MindMate Visual Learning Engine: Image Search Service & Route', () => {
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  test('1. Valid search query returns real Wikimedia Commons educational media with attribution and license', async () => {
    clearImageCache();
    const result = await searchImages('Eiffel Tower', 3);

    assert.ok(result);
    assert.strictEqual(result.query, 'Eiffel Tower');
    assert.ok(result.items.length > 0, 'Should find at least 1 image for Eiffel Tower');

    const first = result.items[0];
    assert.ok(first.thumbnail.startsWith('http'), 'Thumbnail should be valid HTTP URL');
    assert.ok(first.author, 'Should provide author or attribution');
    assert.ok(first.license, 'Should provide license');
    assert.ok(first.sourceUrl.startsWith('http'), 'Should provide source URL');
  });

  test('2. In-memory caching works and returns cached: true on repeat query', async () => {
    const result1 = await searchImages('Pyramids', 2);
    const result2 = await searchImages('Pyramids', 2);

    assert.strictEqual(result2.cached, true, 'Repeat search should be served from memory cache');
    assert.strictEqual(result1.items.length, result2.items.length);
  });

  test('3. Empty or blank query returns empty items array without throwing', async () => {
    const result = await searchImages('   ', 4);
    assert.strictEqual(result.items.length, 0);
    assert.strictEqual(result.total, 0);
  });

  test('4. Route GET /api/visual/images returns 400 when query parameter "q" is missing', async () => {
    const res = await fetch(`${baseUrl}/api/visual/images`);
    assert.strictEqual(res.status, 400);
    const body: any = await res.json();
    assert.ok(body.error);
  });

  test('5. Route GET /api/visual/images?q=... returns 200 with vetted image items', async () => {
    const res = await fetch(`${baseUrl}/api/visual/images?q=DNA&limit=2`);
    assert.strictEqual(res.status, 200);
    const body: any = await res.json();
    assert.strictEqual(body.query, 'DNA');
    assert.ok(Array.isArray(body.items));
  });
});
