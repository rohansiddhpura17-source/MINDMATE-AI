/**
 * MindMate - Imported Friend Database Models & Local SQLite Bridge Test Suite
 * 
 * Verifies that the friend's 7 database models (profiles, topics, chat_messages,
 * quiz_sessions, planner_tasks, materials, insights) work natively in our
 * local SQLite database with strict multi-user isolation and zero external cloud dependency.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import express from 'express';
import cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import { authRouter } from '../src/routes/auth.js';
import dbBridgeRouter from '../src/routes/dbBridge.js';

const prisma = new PrismaClient();
const app = express();
app.use(cookieParser());
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/db', dbBridgeRouter);

let server: http.Server;
let port: number;

function request(path: string, options: {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  cookie?: string;
} = {}): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any }> {
  return new Promise((resolve, reject) => {
    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    if (options.cookie) {
      reqHeaders['Cookie'] = options.cookie;
    }

    const postData = options.body ? JSON.stringify(options.body) : undefined;
    if (postData) {
      reqHeaders['Content-Length'] = Buffer.byteLength(postData).toString();
    }

    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method: options.method || 'GET',
      headers: reqHeaders,
    }, (res) => {
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        let parsed = rawData;
        try {
          parsed = JSON.parse(rawData);
        } catch (_) {}
        resolve({
          status: res.statusCode || 500,
          headers: res.headers,
          body: parsed,
        });
      });
    });

    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

function extractCookie(headers: http.IncomingHttpHeaders): string {
  const setCookie = headers['set-cookie'];
  if (!setCookie) return '';
  const first = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return first.split(';')[0];
}

describe('Imported Friend Database & Local SQLite Bridge Suite', () => {
  let userACookie: string;
  let userBCookie: string;
  let userAId: string;
  let userBId: string;

  before(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address() as any;
        port = address.port;
        resolve();
      });
    });

    // Register User A
    const regA = await request('/api/auth/register', {
      method: 'POST',
      body: {
        name: 'Friend Test Alice',
        email: `friend_alice_${Date.now()}@test.local`,
        password: 'Password123!',
        goal: 'Learn Systems Programming',
      },
    });
    assert.strictEqual(regA.status, 201);
    userACookie = extractCookie(regA.headers);
    userAId = regA.body.user.id;

    // Register User B
    const regB = await request('/api/auth/register', {
      method: 'POST',
      body: {
        name: 'Friend Test Bob',
        email: `friend_bob_${Date.now()}@test.local`,
        password: 'Password123!',
        goal: 'Learn Web Development',
      },
    });
    assert.strictEqual(regB.status, 201);
    userBCookie = extractCookie(regB.headers);
    userBId = regB.body.user.id;
  });

  test('1. Profiles: Auto-seeds from user registration and allows profile updates', async () => {
    const res = await request(`/api/db/profiles/${userAId}`, {
      cookie: userACookie,
    });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.data);
    assert.strictEqual(res.body.data.name, 'Friend Test Alice');
    assert.strictEqual(res.body.data.learningStyle, 'Examples first');

    // Update profile
    const updateRes = await request(`/api/db/profiles/${userAId}`, {
      method: 'PATCH',
      cookie: userACookie,
      body: {
        goal: 'Master Distributed Systems',
        preferred_session: '45-60 min',
      },
    });
    assert.strictEqual(updateRes.status, 200);

    const recheck = await request(`/api/db/profiles/${userAId}`, {
      cookie: userACookie,
    });
    assert.strictEqual(recheck.body.data.goal, 'Master Distributed Systems');
    assert.strictEqual(recheck.body.data.preferredSession, '45-60 min');
  });

  test('2. Topics: Auto-seeds default curriculum topics and updates mastery status', async () => {
    const res = await request('/api/db/topics', {
      cookie: userACookie,
    });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.strictEqual(res.body.data.length, 6); // Variables, Conditions, Loops, Functions, OOP, DBMS

    const oopTopic = res.body.data.find((t: any) => t.name === 'OOP');
    assert.ok(oopTopic);

    // Update topic mastery
    const patchRes = await request(`/api/db/topics/${oopTopic.id}`, {
      method: 'PATCH',
      cookie: userACookie,
      body: { mastery: 75 },
    });
    assert.strictEqual(patchRes.status, 200);
    assert.strictEqual(patchRes.body.data.mastery, 75);
    assert.strictEqual(patchRes.body.data.status, 'strong');
  });

  test('3. Chat Messages: Records conversation history locally', async () => {
    const postRes = await request('/api/db/chat', {
      method: 'POST',
      cookie: userACookie,
      body: {
        role: 'user',
        content: 'Explain binary search trees.',
        topic: 'Data Structures',
      },
    });
    assert.strictEqual(postRes.status, 201);
    assert.strictEqual(postRes.body.data.content, 'Explain binary search trees.');

    const getRes = await request('/api/db/chat', {
      cookie: userACookie,
    });
    assert.strictEqual(getRes.status, 200);
    assert.ok(getRes.body.data.length >= 1);
    assert.strictEqual(getRes.body.data[0].content, 'Explain binary search trees.');
  });

  test('4. Quiz Sessions: Records quiz scores and returns session history', async () => {
    const postRes = await request('/api/db/quiz', {
      method: 'POST',
      cookie: userACookie,
      body: {
        topic: 'Functions',
        score: 4,
        total: 5,
        accuracy: 80.0,
        main_gap: 'Variable scope',
      },
    });
    assert.strictEqual(postRes.status, 201);
    assert.strictEqual(postRes.body.data.accuracy, 80);

    const getRes = await request('/api/db/quiz', {
      cookie: userACookie,
    });
    assert.strictEqual(getRes.status, 200);
    assert.ok(getRes.body.data.length >= 1);
    assert.strictEqual(getRes.body.data[0].mainGap, 'Variable scope');
  });

  test('5. Planner Tasks: Seeds default weekly tasks and toggles completion', async () => {
    const res = await request('/api/db/planner', {
      cookie: userACookie,
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.length, 5);

    const task1 = res.body.data[0];
    assert.strictEqual(task1.completed, false);

    // Toggle completed
    const patchRes = await request(`/api/db/planner/${task1.id}`, {
      method: 'PATCH',
      cookie: userACookie,
      body: { completed: true },
    });
    assert.strictEqual(patchRes.status, 200);
    assert.strictEqual(patchRes.body.data.completed, true);
  });

  test('6. Materials & Insights: Creates study materials and manages proactive insights', async () => {
    // Material create
    const matRes = await request('/api/db/materials', {
      method: 'POST',
      cookie: userACookie,
      body: {
        name: 'Systems Notes.pdf',
        type: 'PDF',
        raw_content: 'Notes on threads and concurrency',
        summary: 'Thread concurrency overview',
        key_concepts: 'Mutex, Semaphore',
      },
    });
    assert.strictEqual(matRes.status, 201);

    // Material list
    const matList = await request('/api/db/materials', {
      cookie: userACookie,
    });
    assert.strictEqual(matList.status, 200);
    assert.ok(matList.body.data.length >= 1);

    // Insights list & mark read
    const insList = await request('/api/db/insights', {
      cookie: userACookie,
    });
    assert.strictEqual(insList.status, 200);
    assert.strictEqual(insList.body.data.length, 2);

    const markRes = await request(`/api/db/insights/${insList.body.data[0].id}`, {
      method: 'PATCH',
      cookie: userACookie,
    });
    assert.strictEqual(markRes.status, 200);
    assert.strictEqual(markRes.body.data.isRead, true);
  });

  test('7. Multi-User Isolation: User B cannot see User A chats, quizzes, or tasks', async () => {
    // User B chat list should be empty
    const bChats = await request('/api/db/chat', {
      cookie: userBCookie,
    });
    assert.strictEqual(bChats.status, 200);
    assert.strictEqual(bChats.body.data.length, 0);

    // User B quiz list should be empty
    const bQuizzes = await request('/api/db/quiz', {
      cookie: userBCookie,
    });
    assert.strictEqual(bQuizzes.status, 200);
    assert.strictEqual(bQuizzes.body.data.length, 0);

    // User B materials should be empty
    const bMats = await request('/api/db/materials', {
      cookie: userBCookie,
    });
    assert.strictEqual(bMats.status, 200);
    assert.strictEqual(bMats.body.data.length, 0);
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
  });
});
