import * as pdfjsLib from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';
import { offlineLearner } from '../storage/offlineLearner';
import { supabase } from '../../lib/supabase';

// Configure pdfjs worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  isOcr?: boolean;
}

export interface DocumentChunkData {
  chunkIndex: number;
  pageNumber: number;
  content: string;
  tokenCount: number;
}

export interface ExtractionResult {
  fileName: string;
  fileType: 'PDF' | 'IMAGE' | 'TEXT';
  fileSize: number;
  pages: ExtractedPage[];
  totalPages: number;
  totalChars: number;
  isScannedOrEmpty: boolean;
  ocrApplied: boolean;
  rawContent: string;
}

export interface KeyConceptItem {
  concept: string;
  definition: string;
  pageNumber: number;
}

export interface FlashcardItem {
  id: string;
  front: string;
  back: string;
  pageCitation: number;
}

export interface MaterialQuizQuestion {
  id: number;
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  pageCitation: number;
}

export interface MaterialArtifacts {
  summary: {
    overview: string;
    keyThemes: Array<{ theme: string; description: string; pages: number[] }>;
    takeaways: Array<{ text: string; page: number }>;
  };
  keyConcepts: KeyConceptItem[];
  flashcards: FlashcardItem[];
  quizQuestions: MaterialQuizQuestion[];
}

export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
export const MAX_PAGE_COUNT = 100;
const PDF_MAGIC_BYTES = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

/**
 * Validates document type, size, and magic signature.
 */
export async function validateDocument(file: File): Promise<{ valid: boolean; error?: string }> {
  if (!file) {
    return { valid: false, error: 'No file provided.' };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size exceeds the 20MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB). Please upload a smaller file.`
    };
  }

  const name = file.name.toLowerCase();
  const isPdf = name.endsWith('.pdf') || file.type === 'application/pdf';
  const isImage = /\.(png|jpe?g|webp|bmp)$/i.test(name) || file.type.startsWith('image/');
  const isText = /\.(txt|md|markdown|json)$/i.test(name) || file.type.startsWith('text/');

  if (!isPdf && !isImage && !isText) {
    return {
      valid: false,
      error: 'Unsupported file format. Please upload a PDF (.pdf), Image (.png, .jpg, .webp), or Text file (.txt, .md).'
    };
  }

  // If PDF, verify magic header bytes
  if (isPdf) {
    try {
      const headerSlice = await file.slice(0, 5).arrayBuffer();
      const headerBytes = new Uint8Array(headerSlice);
      const isSignatureValid = PDF_MAGIC_BYTES.every((byte, idx) => headerBytes[idx] === byte);
      if (!isSignatureValid) {
        return {
          valid: false,
          error: 'Invalid PDF format: File header is missing the %PDF- magic signature. File may be corrupted or disguised.'
        };
      }
    } catch (e: any) {
      return {
        valid: false,
        error: `Failed to read file signature: ${e.message}`
      };
    }
  }

  return { valid: true };
}

/**
 * Extracts page-by-page text with direct parser and automated OCR fallback.
 */
export async function extractDocumentContent(
  file: File,
  onProgress?: (status: string, percent: number) => void
): Promise<ExtractionResult> {
  const validation = await validateDocument(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const name = file.name;
  const lowerName = name.toLowerCase();

  // 1. Text File Flow
  if (lowerName.endsWith('.txt') || lowerName.endsWith('.md') || file.type.startsWith('text/')) {
    onProgress?.('Reading text file...', 50);
    const text = await file.text();
    const cleaned = text.trim();
    onProgress?.('Text extraction complete.', 100);

    return {
      fileName: name,
      fileType: 'TEXT',
      fileSize: file.size,
      pages: [{ pageNumber: 1, text: cleaned }],
      totalPages: 1,
      totalChars: cleaned.length,
      isScannedOrEmpty: cleaned.length < 20,
      ocrApplied: false,
      rawContent: cleaned
    };
  }

  // 2. Image File Flow (Direct OCR)
  if (/\.(png|jpe?g|webp|bmp)$/i.test(lowerName) || file.type.startsWith('image/')) {
    onProgress?.('Initializing optical character recognition (OCR)...', 15);
    const worker = await createWorker('eng');
    try {
      onProgress?.('Running OCR on image document...', 40);
      const ret = await worker.recognize(file);
      onProgress?.('Processing recognized text...', 90);
      const cleaned = (ret.data?.text || '').trim();
      onProgress?.('Image OCR complete.', 100);

      return {
        fileName: name,
        fileType: 'IMAGE',
        fileSize: file.size,
        pages: [{ pageNumber: 1, text: cleaned, isOcr: true }],
        totalPages: 1,
        totalChars: cleaned.length,
        isScannedOrEmpty: cleaned.length < 20,
        ocrApplied: true,
        rawContent: cleaned
      };
    } finally {
      await worker.terminate();
    }
  }

  // 3. PDF File Flow (Hybrid Direct Extraction + Scanned Page OCR)
  onProgress?.('Loading PDF document...', 10);
  const arrayBuffer = await file.arrayBuffer();

  let pdfDoc: pdfjsLib.PDFDocumentProxy;
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
      cMapPacked: true
    });
    pdfDoc = await loadingTask.promise;
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.toLowerCase().includes('password') || msg.toLowerCase().includes('encrypted')) {
      throw new Error('This PDF is password-protected or encrypted. Please upload an unlocked PDF.');
    }
    throw new Error(`Failed to open PDF document: ${msg}`);
  }

  const totalPages = Math.min(pdfDoc.numPages, MAX_PAGE_COUNT);
  const pages: ExtractedPage[] = [];
  let totalChars = 0;

  // Direct text extraction pass
  for (let i = 1; i <= totalPages; i++) {
    onProgress?.(`Extracting text from page ${i} of ${totalPages}...`, Math.round(15 + (i / totalPages) * 45));
    const page = await pdfDoc.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    pages.push({
      pageNumber: i,
      text: pageText
    });
    totalChars += pageText.length;
  }

  // Detect whether PDF is scanned or image-only
  const isScannedOrEmpty = totalChars < 50 || (totalPages > 0 && totalChars / totalPages < 20);
  let ocrApplied = false;

  // Scanned PDF Fallback: Run OCR page by page
  if (isScannedOrEmpty) {
    onProgress?.('Document appears scanned or image-based. Initializing OCR engine...', 62);
    const worker = await createWorker('eng');
    try {
      ocrApplied = true;
      for (let i = 1; i <= totalPages; i++) {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          onProgress?.(`Rendering scanned page ${i} for OCR...`, Math.round(65 + (i / totalPages) * 15));
          await page.render({ canvasContext: ctx, viewport }).promise;

          onProgress?.(`Recognizing text on page ${i} of ${totalPages}...`, Math.round(75 + (i / totalPages) * 20));
          const ret = await worker.recognize(canvas);
          const ocrText = (ret.data?.text || '').trim();

          if (ocrText.length > 0) {
            pages[i - 1].text = ocrText;
            pages[i - 1].isOcr = true;
            totalChars += ocrText.length;
          }
        }
      }
    } catch (ocrErr: any) {
      console.warn('[DocumentProcessor] OCR page recognition failed:', ocrErr);
    } finally {
      await worker.terminate();
    }
  }

  const rawContent = pages.map((p) => `--- Page ${p.pageNumber} ---\n${p.text}`).join('\n\n');
  onProgress?.('Document processing complete.', 100);

  return {
    fileName: name,
    fileType: 'PDF',
    fileSize: file.size,
    pages,
    totalPages,
    totalChars,
    isScannedOrEmpty: isScannedOrEmpty && totalChars < 50,
    ocrApplied,
    rawContent
  };
}

/**
 * Splits extracted pages into overlapping chunks with exact page attribution.
 */
export function chunkExtractedPages(
  pages: ExtractedPage[],
  options: { chunkSize?: number; overlap?: number } = {}
): DocumentChunkData[] {
  const chunkSize = options.chunkSize || 800;
  const overlap = options.overlap || 150;
  const chunks: DocumentChunkData[] = [];
  let chunkIndex = 0;

  for (const page of pages) {
    const text = page.text.trim();
    if (!text) continue;

    if (text.length <= chunkSize) {
      chunks.push({
        chunkIndex: chunkIndex++,
        pageNumber: page.pageNumber,
        content: text,
        tokenCount: Math.ceil(text.length / 4)
      });
      continue;
    }

    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + chunkSize, text.length);

      if (end < text.length) {
        const lookback = text.slice(Math.max(start + chunkSize - 120, start), end);
        const lastBreak = Math.max(
          lookback.lastIndexOf('\n'),
          lookback.lastIndexOf('. '),
          lookback.lastIndexOf('? '),
          lookback.lastIndexOf('! ')
        );
        if (lastBreak > 0) {
          end = Math.max(start + chunkSize - 120, start) + lastBreak + 1;
        }
      }

      const chunkText = text.slice(start, end).trim();
      if (chunkText.length > 0) {
        chunks.push({
          chunkIndex: chunkIndex++,
          pageNumber: page.pageNumber,
          content: chunkText,
          tokenCount: Math.ceil(chunkText.length / 4)
        });
      }

      if (end >= text.length) break;
      start = Math.max(end - overlap, start + 1);
    }
  }

  return chunks;
}

/**
 * Generates grounded summary, key concepts, flashcards, and quiz questions from extracted content.
 */
export async function generateMaterialArtifacts(
  title: string,
  chunks: DocumentChunkData[],
  rawContent: string
): Promise<MaterialArtifacts> {
  const representativeChunks = chunks.slice(0, 10);
  const sampleContext = representativeChunks.map((c) => `[Page ${c.pageNumber}] ${c.content}`).join('\n\n');

  // Attempt online AI generation if available
  try {
    const prompt = `You are MindMate educational assistant. Analyze this study material: "${title}".
Document excerpt:
${sampleContext.slice(0, 4000)}

Generate a complete JSON response matching this schema strictly without additional text:
{
  "summary": {
    "overview": "Clear 2-paragraph synthesis of the material.",
    "keyThemes": [
      { "theme": "Theme title", "description": "Short explanation", "pages": [1] }
    ],
    "takeaways": [
      { "text": "Core takeaway concept", "page": 1 }
    ]
  },
  "keyConcepts": [
    { "concept": "Concept Name", "definition": "Clear concise definition from text", "pageNumber": 1 }
  ],
  "flashcards": [
    { "id": "card-1", "front": "Question or prompt", "back": "Clear answer or explanation", "pageCitation": 1 }
  ],
  "quizQuestions": [
    {
      "id": 1,
      "question": "Question text?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct": 0,
      "explanation": "Why this is correct",
      "pageCitation": 1
    }
  ]
}`;

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: prompt, topic: title })
    });

    if (res.ok) {
      const data = await res.json();
      const rawText = data.content || '';
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.summary && parsed.keyConcepts && parsed.flashcards) {
          return parsed as MaterialArtifacts;
        }
      }
    }
  } catch (err) {
    console.warn('[generateMaterialArtifacts] Remote AI generation skipped/failed, using structured extractor:', err);
  }

  // High-Quality Rule-Based Extractor Fallback (Offline & Zero-Remote Guaranteed)
  const sentences = rawContent
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && s.length < 200);

  const words = rawContent
    .replace(/[^a-zA-Z0-9_\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 4 && !/^(about|after|before|their|which|there|these|could|would|should)$/i.test(w));

  // Determine top concepts by frequency
  const freqMap = new Map<string, number>();
  words.forEach((w) => {
    const lower = w.toLowerCase();
    freqMap.set(lower, (freqMap.get(lower) || 0) + 1);
  });
  const topWords = Array.from(freqMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([w]) => w.charAt(0).toUpperCase() + w.slice(1));

  const keyConcepts: KeyConceptItem[] = topWords.map((word, idx) => {
    const matchingSent = sentences.find((s) => s.toLowerCase().includes(word.toLowerCase())) ||
      `${word} represents a foundational topic addressed in this document.`;
    return {
      concept: word,
      definition: matchingSent,
      pageNumber: chunks[idx % Math.max(chunks.length, 1)]?.pageNumber || 1
    };
  });

  const flashcards: FlashcardItem[] = keyConcepts.map((item, idx) => ({
    id: `card-${idx + 1}`,
    front: `What is the significance of ${item.concept}?`,
    back: item.definition,
    pageCitation: item.pageNumber
  }));

  const quizQuestions: MaterialQuizQuestion[] = keyConcepts.slice(0, 4).map((item, idx) => {
    const wrongOptions = keyConcepts
      .filter((k) => k.concept !== item.concept)
      .map((k) => k.definition)
      .slice(0, 3);

    while (wrongOptions.length < 3) {
      wrongOptions.push(`A secondary rule inapplicable to ${item.concept}.`);
    }

    return {
      id: idx + 1,
      question: `Which statement best describes "${item.concept}" based on the text?`,
      options: [item.definition, ...wrongOptions].sort(() => 0.5 - Math.random()),
      correct: 0,
      explanation: `According to the document text on page ${item.pageNumber}: ${item.definition}`,
      pageCitation: item.pageNumber
    };
  });

  // Re-adjust correct indices after sort
  quizQuestions.forEach((q, idx) => {
    const correctText = keyConcepts[idx].definition;
    const correctIdx = q.options.indexOf(correctText);
    q.correct = correctIdx >= 0 ? correctIdx : 0;
  });

  return {
    summary: {
      overview: sentences.slice(0, 3).join(' ') || `This document provides comprehensive study notes on ${title}.`,
      keyThemes: chunks.slice(0, 3).map((c, i) => ({
        theme: topWords[i] || `Section ${i + 1}`,
        description: c.content.slice(0, 140) + '...',
        pages: [c.pageNumber]
      })),
      takeaways: chunks.slice(0, 4).map((c) => ({
        text: c.content.slice(0, 90) + '...',
        page: c.pageNumber
      }))
    },
    keyConcepts,
    flashcards,
    quizQuestions
  };
}

/**
 * Saves processed material to Supabase database and local offline cache.
 */
export async function saveProcessedMaterial(
  userId: string,
  extraction: ExtractionResult,
  artifacts: MaterialArtifacts
): Promise<any> {
  const materialRecord = {
    name: extraction.fileName,
    type: extraction.fileType,
    status: 'processed',
    raw_content: extraction.rawContent,
    summary: JSON.stringify(artifacts.summary),
    key_concepts: JSON.stringify(artifacts.keyConcepts),
    pages: extraction.totalPages,
    metadata: {
      fileSize: extraction.fileSize,
      totalChars: extraction.totalChars,
      ocrApplied: extraction.ocrApplied,
      flashcards: artifacts.flashcards,
      quizQuestions: artifacts.quizQuestions
    }
  };

  // 1. Save to Supabase
  let dbResult: any = null;
  try {
    const res = await supabase.from('materials').insert({
      user_id: userId,
      name: materialRecord.name,
      type: materialRecord.type,
      status: materialRecord.status,
      raw_content: materialRecord.raw_content,
      summary: materialRecord.summary,
      key_concepts: materialRecord.key_concepts
    }).select().single();

    if (res.data) {
      dbResult = res.data;
    }
  } catch (err) {
    console.warn('[DocumentProcessor] Supabase persistence skipped or failed, saving offline:', err);
  }

  const finalId = dbResult?.id || `local-mat-${Date.now()}`;
  const fullMaterial = {
    ...materialRecord,
    id: finalId,
    user_id: userId,
    created_at: new Date().toISOString()
  };

  // 2. Cache in IndexedDB for Offline Study
  try {
    await offlineLearner.cacheMaterial(userId, fullMaterial);
    const chunks = chunkExtractedPages(extraction.pages);
    await offlineLearner.cacheMaterialChunks(finalId, chunks);
  } catch (cacheErr) {
    console.warn('[DocumentProcessor] Offline caching failed:', cacheErr);
  }

  return fullMaterial;
}
