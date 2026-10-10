import fs from 'fs';
import path from 'path';
import { PDFParse } from 'pdf-parse';

export interface ExtractedPage {
  pageNumber: number;
  text: string;
}

export interface DocumentChunkData {
  chunkIndex: number;
  pageNumber: number;
  content: string;
  tokenCount: number;
}

export interface ExtractionResult {
  pages: ExtractedPage[];
  totalPages: number;
  totalChars: number;
  isScannedOrEmpty: boolean;
}

export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB
export const MAX_PAGE_COUNT = 100;
export const PDF_MAGIC_BYTES = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-

/**
 * Validates whether the buffer starts with the PDF magic bytes (%PDF-).
 */
export function validatePdfSignature(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 5) {
    return false;
  }
  return buffer.subarray(0, 5).equals(PDF_MAGIC_BYTES);
}

/**
 * Extracts page-by-page text from a PDF buffer and detects if document is scanned or empty.
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<ExtractionResult> {
  if (!validatePdfSignature(buffer)) {
    throw new Error('Invalid PDF format: Missing %PDF- magic signature.');
  }

  let parser: PDFParse | null = null;
  try {
    parser = new PDFParse({ data: buffer });
    const textResult = await parser.getText();
    const totalPages = textResult.total || textResult.pages.length || 1;

    if (totalPages > MAX_PAGE_COUNT) {
      throw new Error(`Document exceeds maximum limit of ${MAX_PAGE_COUNT} pages (got ${totalPages}).`);
    }

    const pages: ExtractedPage[] = [];
    let totalChars = 0;

    for (let i = 0; i < textResult.pages.length; i++) {
      const pageItem = textResult.pages[i];
      const pageNum = pageItem.num || (i + 1);
      // Clean up whitespace while preserving paragraph structure
      const cleaned = (pageItem.text || '')
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      pages.push({
        pageNumber: pageNum,
        text: cleaned,
      });
      totalChars += cleaned.length;
    }

    // Fallback: If pages array was somehow empty but full text exists
    if (pages.length === 0 && textResult.text && textResult.text.trim()) {
      pages.push({
        pageNumber: 1,
        text: textResult.text.trim(),
      });
      totalChars = textResult.text.trim().length;
    }

    // Scanned or image-only detection:
    // If the entire document has fewer than 40 readable characters or average chars per page < 15
    const isScannedOrEmpty = totalChars < 40 || (totalPages > 0 && totalChars / totalPages < 15);

    return {
      pages,
      totalPages,
      totalChars,
      isScannedOrEmpty,
    };
  } catch (err: any) {
    // Discriminate between password-protected PDFs and corrupted files
    const msg = err?.message || String(err);
    if (msg.toLowerCase().includes('password') || msg.toLowerCase().includes('encrypt')) {
      throw new Error('Password-protected or encrypted PDFs are not supported. Please upload an unlocked PDF.');
    }
    if (msg.includes('magic signature') || msg.includes('maximum limit')) {
      throw err;
    }
    throw new Error(`Failed to parse PDF document: ${msg}`);
  } finally {
    if (parser) {
      try {
        await parser.destroy();
      } catch {
        // Ignore destroy error
      }
    }
  }
}

/**
 * Splits extracted pages into overlapping chunks with precise page attribution.
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
        tokenCount: Math.ceil(text.length / 4),
      });
      continue;
    }

    // Split page text into overlapping windows respecting sentence/line breaks
    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + chunkSize, text.length);

      // If not at the end of the page, attempt to break on a sentence or paragraph boundary
      if (end < text.length) {
        const lookbackWindow = text.slice(Math.max(start + chunkSize - 120, start), end);
        const lastBreak = Math.max(
          lookbackWindow.lastIndexOf('\n'),
          lookbackWindow.lastIndexOf('. '),
          lookbackWindow.lastIndexOf('? '),
          lookbackWindow.lastIndexOf('! ')
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
          tokenCount: Math.ceil(chunkText.length / 4),
        });
      }

      if (end >= text.length) break;
      start = Math.max(end - overlap, start + 1);
    }
  }

  return chunks;
}

/**
 * Saves uploaded PDF file securely outside the public web root.
 */
export async function saveUploadedDocument(
  userId: string,
  materialId: string,
  buffer: Buffer
): Promise<string> {
  const baseStorageDir = path.resolve(process.cwd(), 'storage', 'documents', userId);
  await fs.promises.mkdir(baseStorageDir, { recursive: true });

  const filePath = path.join(baseStorageDir, `${materialId}.pdf`);
  await fs.promises.writeFile(filePath, buffer);
  return filePath;
}

/**
 * Deletes a stored document file safely if it exists.
 */
export async function deleteDocumentFile(filePath: string): Promise<void> {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  } catch (err) {
    console.warn(`[DocumentStorage] Failed to delete file at ${filePath}:`, err);
  }
}
