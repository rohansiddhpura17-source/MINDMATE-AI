import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import app from '../src/server.js';
import { prisma } from '../src/db.js';

let server: http.Server;
let baseUrl: string;

function createPdfWithText(pagesText: string[]): Buffer {
  const objects: string[] = [];
  let objIndex = 3;
  const pageObjIndices: number[] = [];

  for (let i = 0; i < pagesText.length; i++) {
    const text = pagesText[i];
    const streamContent = 'BT /F1 12 Tf 50 700 Td (' + text.replace(/[()\\\\]/g, '\\$&') + ') Tj ET';
    const streamLen = Buffer.byteLength(streamContent);
    const contentObjIdx = objIndex++;
    const pageObjIdx = objIndex++;
    pageObjIndices.push(pageObjIdx);

    objects.push(
      `${contentObjIdx} 0 obj\n<< /Length ${streamLen} >>\nstream\n${streamContent}\nendstream\nendobj\n`
    );
    objects.push(
      `${pageObjIdx} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentObjIdx} 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>\nendobj\n`
    );
  }

  const pagesObj = `2 0 obj\n<< /Type /Pages /Kids [${pageObjIndices.map((idx) => `${idx} 0 R`).join(' ')}] /Count ${pagesText.length} >>\nendobj\n`;
  const catObj = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  objects.unshift(pagesObj);
  objects.unshift(catObj);

  let body = '%PDF-1.4\n';
  const xref: string[] = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`];

  for (const obj of objects) {
    const offset = Buffer.byteLength(body);
    xref.push(`${String(offset).padStart(10, '0')} 00000 n \n`);
    body += obj;
  }

  const startXref = Buffer.byteLength(body);
  body += `${xref.join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF`;
  return Buffer.from(body);
}

function createEmptyOrScannedPdf(): Buffer {
  const minimalPdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /MediaBox [0 0 612 792] /Parent 2 0 R /Resources << >> >>
endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000057 00000 n 
0000000115 00000 n 
trailer
<< /Size 4 /Root 1 0 R >>
startxref
205
%%EOF`;
  return Buffer.from(minimalPdf);
}

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address() as { port: number };
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  // Clean up any test users
  await prisma.user.deleteMany({
    where: {
      email: { in: ['alice.doc@mindmate.app', 'bob.doc@mindmate.app'] },
    },
  });
});

after(async () => {
  await prisma.user.deleteMany({
    where: {
      email: { in: ['alice.doc@mindmate.app', 'bob.doc@mindmate.app'] },
    },
  });
  await prisma.$disconnect();
  server.close();
});

describe('MindMate Milestone 4: Document Ingestion and Source-Grounded Learning', () => {
  let aliceCookie = '';
  let aliceId = '';
  let bobCookie = '';
  let bobId = '';
  let aliceMaterialId = '';

  test('1. Setup Test Users (Alice & Bob)', async () => {
    const regAlice = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Alice Documenter',
        email: 'alice.doc@mindmate.app',
        password: 'Password123!',
      }),
    });
    assert.equal(regAlice.status, 201);
    const aliceData = await regAlice.json();
    aliceId = aliceData.user.id;
    const setCookieAlice = regAlice.headers.get('set-cookie');
    assert.ok(setCookieAlice && setCookieAlice.includes('mindmate_session='));
    aliceCookie = setCookieAlice.split(';')[0];

    const regBob = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bob Documenter',
        email: 'bob.doc@mindmate.app',
        password: 'Password123!',
      }),
    });
    assert.equal(regBob.status, 201);
    const bobData = await regBob.json();
    bobId = bobData.user.id;
    const setCookieBob = regBob.headers.get('set-cookie');
    assert.ok(setCookieBob && setCookieBob.includes('mindmate_session='));
    bobCookie = setCookieBob.split(';')[0];
  });

  test('2. PDF Magic Byte Validation: Rejects non-PDF files', async () => {
    const formData = new FormData();
    const fakeFile = new Blob(['Not a PDF file content here'], { type: 'text/plain' });
    formData.append('file', fakeFile, 'notes.txt');

    const res = await fetch(`${baseUrl}/api/learner/materials/upload`, {
      method: 'POST',
      headers: { Cookie: aliceCookie },
      body: formData,
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('%PDF-') || data.error.includes('signature'));
  });

  test('3. Rejection of corrupted / malformed PDF files', async () => {
    const formData = new FormData();
    // Has %PDF- signature but corrupted payload
    const corruptedBuffer = Buffer.concat([Buffer.from('%PDF-1.4\ncorrupted junk binary garbage %%%')]);
    const corruptedBlob = new Blob([corruptedBuffer], { type: 'application/pdf' });
    formData.append('file', corruptedBlob, 'corrupted.pdf');

    const res = await fetch(`${baseUrl}/api/learner/materials/upload`, {
      method: 'POST',
      headers: { Cookie: aliceCookie },
      body: formData,
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.toLowerCase().includes('fail') || data.error.toLowerCase().includes('parse') || data.error.toLowerCase().includes('pdf'));
  });

  test('4. Scanned / Empty PDF Detection: Returns OCR_NEEDED with guidance', async () => {
    const emptyPdfBuffer = createEmptyOrScannedPdf();
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(emptyPdfBuffer)], { type: 'application/pdf' });
    formData.append('file', blob, 'scanned_notes.pdf');

    const res = await fetch(`${baseUrl}/api/learner/materials/upload`, {
      method: 'POST',
      headers: { Cookie: aliceCookie },
      body: formData,
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.material.status, 'OCR_NEEDED');
    assert.ok(data.material.errorMessage.includes('OCR is required'));
  });

  test('5. Real Multi-Page PDF Ingestion: Extracts text, creates chunks, and generates grounded learning assets', async () => {
    const validPdfBuffer = createPdfWithText([
      'Python Data Structures and Algorithms. Python lists are ordered and mutable sequences. Dictionaries store key value pairs with hash table efficiency.',
      'Binary Search and Recursion. Binary search runs in logarithmic time O of log N on sorted collections. Recursion requires a base condition to terminate.',
    ]);

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(validPdfBuffer)], { type: 'application/pdf' });
    formData.append('file', blob, 'python_algorithms_lecture.pdf');

    const res = await fetch(`${baseUrl}/api/learner/materials/upload`, {
      method: 'POST',
      headers: { Cookie: aliceCookie },
      body: formData,
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.material.name, 'python_algorithms_lecture.pdf');
    assert.equal(data.material.status, 'READY');
    assert.equal(data.material.pages, 2);
    assert.ok(data.material.chunksCount >= 2, `Expected at least 2 chunks, got ${data.material.chunksCount}`);
    assert.ok(data.material.summary, 'Summary should be generated');
    assert.ok(Array.isArray(data.material.keyConcepts), 'Key concepts should be an array');
    assert.ok(Array.isArray(data.material.flashcards), 'Flashcards should be an array');

    aliceMaterialId = data.material.id;
    assert.ok(aliceMaterialId);
  });

  test('6. Document Detail & Chunks Retrieval', async () => {
    // 6a. Detail endpoint
    const resDetail = await fetch(`${baseUrl}/api/learner/materials/${aliceMaterialId}`, {
      headers: { Cookie: aliceCookie },
    });
    assert.equal(resDetail.status, 200);
    const detailData = await resDetail.json();
    assert.equal(detailData.success, true);
    assert.equal(detailData.material.id, aliceMaterialId);
    assert.equal(detailData.material.status, 'READY');

    // 6b. Chunks endpoint
    const resChunks = await fetch(`${baseUrl}/api/learner/materials/${aliceMaterialId}/chunks`, {
      headers: { Cookie: aliceCookie },
    });
    assert.equal(resChunks.status, 200);
    const chunksData = await resChunks.json();
    assert.equal(chunksData.success, true);
    assert.ok(chunksData.totalChunks >= 2);
    assert.equal(chunksData.chunks[0].pageNumber, 1);
    assert.ok(chunksData.chunks[0].content.includes('Python Data Structures'));
    assert.equal(chunksData.chunks[1].pageNumber, 2);
    assert.ok(chunksData.chunks[1].content.includes('Binary Search'));
  });

  test('7. Source-Grounded Document Q&A with Page Citations', async () => {
    const res = await fetch(`${baseUrl}/api/learner/materials/${aliceMaterialId}/query`, {
      method: 'POST',
      headers: {
        Cookie: aliceCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question: 'What is the time complexity of Binary Search according to the notes?',
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.answer, 'Should provide an answer');
    assert.ok(Array.isArray(data.citations), 'Should include citations');
    assert.ok(data.citations.length > 0, 'Should cite relevant chunks');
    assert.ok(data.citations.some((c: any) => c.pageNumber === 2), 'Should cite Page 2 for binary search');
  });

  test('8. Grounded Q&A Negative Test: Out-of-scope query refuses without hallucinating', async () => {
    const res = await fetch(`${baseUrl}/api/learner/materials/${aliceMaterialId}/query`, {
      method: 'POST',
      headers: {
        Cookie: aliceCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question: 'What is the temperature of the ozone layer in Mars atmosphere?',
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    const answerLower = data.answer.toLowerCase();
    assert.ok(
      answerLower.includes('could not find') ||
      answerLower.includes('not mention') ||
      answerLower.includes('not found') ||
      answerLower.includes('does not appear') ||
      answerLower.includes('provided document'),
      `Expected refusal message for out-of-scope question, got: "${data.answer}"`
    );
  });

  test('9. Document-Grounded Quiz Generation', async () => {
    const res = await fetch(`${baseUrl}/api/learner/materials/${aliceMaterialId}/quiz`, {
      method: 'POST',
      headers: {
        Cookie: aliceCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ count: 3 }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(Array.isArray(data.questions));
    assert.ok(data.questions.length > 0);
    const q = data.questions[0];
    assert.ok(q.question);
    assert.ok(Array.isArray(q.options));
    assert.equal(typeof q.correct, 'number');
    assert.ok(q.pageCitation >= 1);
  });

  test('10. Strict User Isolation: Bob cannot access, query, or delete Alice document', async () => {
    // 10a. Bob attempts to get Alice document detail
    const resDetail = await fetch(`${baseUrl}/api/learner/materials/${aliceMaterialId}`, {
      headers: { Cookie: bobCookie },
    });
    assert.equal(resDetail.status, 404);

    // 10b. Bob attempts to get Alice chunks
    const resChunks = await fetch(`${baseUrl}/api/learner/materials/${aliceMaterialId}/chunks`, {
      headers: { Cookie: bobCookie },
    });
    assert.equal(resChunks.status, 404);

    // 10c. Bob attempts to query Alice document
    const resQuery = await fetch(`${baseUrl}/api/learner/materials/${aliceMaterialId}/query`, {
      method: 'POST',
      headers: {
        Cookie: bobCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ question: 'Can I see Alice notes?' }),
    });
    assert.equal(resQuery.status, 404);

    // 10d. Bob attempts to delete Alice document
    const resDelete = await fetch(`${baseUrl}/api/learner/materials/${aliceMaterialId}`, {
      method: 'DELETE',
      headers: { Cookie: bobCookie },
    });
    assert.equal(resDelete.status, 404);
  });

  test('11. Document Deletion & Storage Cleanup', async () => {
    // Check material exists in DB
    const beforeDel = await prisma.learningMaterial.findUnique({
      where: { id: aliceMaterialId },
    });
    assert.ok(beforeDel);
    assert.ok(beforeDel.filePath);
    assert.ok(fs.existsSync(beforeDel.filePath), 'File should exist on disk before deletion');

    // Delete as Alice
    const res = await fetch(`${baseUrl}/api/learner/materials/${aliceMaterialId}`, {
      method: 'DELETE',
      headers: { Cookie: aliceCookie },
    });
    assert.equal(res.status, 200);

    // Verify DB record is gone
    const afterDel = await prisma.learningMaterial.findUnique({
      where: { id: aliceMaterialId },
    });
    assert.equal(afterDel, null);

    // Verify chunks are deleted via cascade
    const chunksLeft = await prisma.documentChunk.count({
      where: { materialId: aliceMaterialId },
    });
    assert.equal(chunksLeft, 0);

    // Verify file on disk is removed
    assert.equal(fs.existsSync(beforeDel.filePath), false, 'File should be removed from disk');
  });

  test('12. Milestone 1-3 Regression Check: AI Status and Auth', async () => {
    const resAi = await fetch(`${baseUrl}/api/ai/status`);
    assert.equal(resAi.status, 200);
    const aiData = await resAi.json();
    assert.equal(aiData.configured, true);

    const resMe = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: aliceCookie },
    });
    assert.equal(resMe.status, 200);
    const meData = await resMe.json();
    assert.equal(meData.user.id, aliceId);
  });
});
