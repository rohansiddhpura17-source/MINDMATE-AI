import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import app from '../src/server.js';
import { prisma } from '../src/db.js';

let server: http.Server;
let baseUrl: string;

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address() as { port: number };
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  // Clean up any test users from previous test runs
  await prisma.user.deleteMany({
    where: {
      email: {
        in: ['sync.alice@mindmate.app', 'sync.bob@mindmate.app'],
      },
    },
  });
});

after(async () => {
  await prisma.user.deleteMany({
    where: {
      email: {
        in: ['sync.alice@mindmate.app', 'sync.bob@mindmate.app'],
      },
    },
  });
  await prisma.$disconnect();
  server.close();
});

describe('MindMate Milestone 3: Offline Synchronization & Idempotency Test Suite', () => {
  let aliceCookie = '';
  let aliceId = '';
  let bobCookie = '';
  let bobId = '';

  test('1. Setup Test Users (Alice & Bob)', async () => {
    // Register Alice
    const regAlice = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Sync Alice',
        email: 'sync.alice@mindmate.app',
        password: 'Password123!',
      }),
    });
    assert.equal(regAlice.status, 201);
    const aliceData = await regAlice.json();
    aliceId = aliceData.user.id;
    aliceCookie = regAlice.headers.get('set-cookie')!.split(';')[0];

    // Register Bob
    const regBob = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Sync Bob',
        email: 'sync.bob@mindmate.app',
        password: 'Password123!',
      }),
    });
    assert.equal(regBob.status, 201);
    const bobData = await regBob.json();
    bobId = bobData.user.id;
    bobCookie = regBob.headers.get('set-cookie')!.split(';')[0];
  });

  test('2. Sync Status endpoint validates account identity', async () => {
    // Unauthenticated request
    const unauthRes = await fetch(`${baseUrl}/api/learner/sync/status`);
    assert.equal(unauthRes.status, 401);

    // Authenticated request with Alice's cookie
    const authRes = await fetch(`${baseUrl}/api/learner/sync/status`, {
      headers: { Cookie: aliceCookie },
    });
    assert.equal(authRes.status, 200);
    const data = await authRes.json();
    assert.equal(data.success, true);
    assert.equal(data.userId, aliceId);
    assert.equal(data.userEmail, 'sync.alice@mindmate.app');
    assert.ok(data.serverTime);
  });

  test('3. Batch Sync handles offline Quiz Attempt with idempotency', async () => {
    const eventId = `quiz_evt_${Date.now()}_test1`;
    const syncPayload = {
      events: [
        {
          eventId,
          eventType: 'QUIZ_ATTEMPT',
          timestamp: new Date().toISOString(),
          payload: {
            topicId: 'python-funcs',
            topicName: 'Python Functions',
            score: 80,
            totalQuestions: 5,
            correctAnswers: 4,
            answers: [{ questionId: 1, isCorrect: true }],
          },
        },
      ],
    };

    // First synchronization
    const res1 = await fetch(`${baseUrl}/api/learner/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
      body: JSON.stringify(syncPayload),
    });
    assert.equal(res1.status, 200);
    const data1 = await res1.json();
    assert.equal(data1.success, true);
    assert.ok(data1.processedEventIds.includes(eventId));

    // Verify record in database
    const attemptInDb = await prisma.quizAttempt.findUnique({
      where: { clientEventId: eventId },
    });
    assert.ok(attemptInDb);
    assert.equal(attemptInDb.userId, aliceId);
    assert.equal(attemptInDb.score, 80);

    // Re-send the exact same sync event (simulating network retry) -> MUST be idempotent
    const res2 = await fetch(`${baseUrl}/api/learner/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
      body: JSON.stringify(syncPayload),
    });
    assert.equal(res2.status, 200);
    const data2 = await res2.json();
    assert.equal(data2.success, true);
    assert.ok(data2.processedEventIds.includes(eventId));

    // Verify NO duplicate row was created in DB
    const attemptsCount = await prisma.quizAttempt.count({
      where: { clientEventId: eventId },
    });
    assert.equal(attemptsCount, 1, 'Duplicate row must not exist in quiz_attempts');
  });

  test('4. Direct Quiz Attempt with clientEventId is idempotent', async () => {
    const directEventId = `quiz_direct_${Date.now()}`;
    const payload = {
      topicId: 'oop-basics',
      topicName: 'Object-Oriented Programming (OOP)',
      score: 100,
      totalQuestions: 5,
      correctAnswers: 5,
      clientEventId: directEventId,
    };

    // First attempt
    const res1 = await fetch(`${baseUrl}/api/learner/quizzes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
      body: JSON.stringify(payload),
    });
    assert.equal(res1.status, 201);
    const data1 = await res1.json();
    assert.equal(data1.success, true);

    // Duplicate attempt with same clientEventId
    const res2 = await fetch(`${baseUrl}/api/learner/quizzes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
      body: JSON.stringify(payload),
    });
    assert.equal(res2.status, 200);
    const data2 = await res2.json();
    assert.equal(data2.isDuplicate, true);

    const count = await prisma.quizAttempt.count({
      where: { clientEventId: directEventId },
    });
    assert.equal(count, 1);
  });

  test('5. Progress Conflict Resolution preserves higher mastery score and merges attempts', async () => {
    // Force a newer server record timestamp for 'oop-basics'
    await prisma.learnerProgress.update({
      where: {
        userId_topicId: { userId: aliceId, topicId: 'oop-basics' },
      },
      data: {
        masteryScore: 85,
        attemptCount: 10,
        correctCount: 8,
        updatedAt: new Date(Date.now() + 10000), // Newer than old offline timestamp
      },
    });

    const eventId = `prog_conflict_${Date.now()}`;
    const oldTimestamp = new Date(Date.now() - 50000).toISOString(); // Old client timestamp

    const syncPayload = {
      events: [
        {
          eventId,
          eventType: 'PROGRESS_UPDATE',
          timestamp: oldTimestamp,
          payload: {
            topicId: 'oop-basics',
            topicName: 'Object-Oriented Programming (OOP)',
            masteryScore: 40, // Older/lower mastery from offline session
            streakDays: 1,
            attemptDelta: 5,
            correctDelta: 2,
          },
        },
      ],
    };

    const res = await fetch(`${baseUrl}/api/learner/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
      body: JSON.stringify(syncPayload),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);

    // Check conflict detected
    assert.ok(data.conflicts.length > 0, 'Expected conflict to be reported');
    assert.equal(data.conflicts[0].eventId, eventId);
    assert.equal(data.conflicts[0].resolution, 'merged_counts_preserve_higher_mastery');

    // Verify DB state: higher mastery preserved (85, not 40), attempt count accumulated (10 + 5 = 15)
    const updated = await prisma.learnerProgress.findUnique({
      where: { userId_topicId: { userId: aliceId, topicId: 'oop-basics' } },
    });
    assert.ok(updated);
    assert.equal(updated.masteryScore, 85, 'Higher mastery score must be preserved');
    assert.equal(updated.attemptCount, 15, 'Attempt counts must be merged');
  });

  test('6. User Isolation during Sync (Bob cannot modify or access Alice data)', async () => {
    const bobEventId = `bob_sync_${Date.now()}`;
    const syncPayload = {
      events: [
        {
          eventId: bobEventId,
          eventType: 'QUIZ_ATTEMPT',
          timestamp: new Date().toISOString(),
          payload: {
            topicId: 'python-funcs',
            topicName: 'Python Functions',
            score: 60,
            totalQuestions: 5,
            correctAnswers: 3,
          },
        },
      ],
    };

    // Bob syncs
    const bobRes = await fetch(`${baseUrl}/api/learner/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: bobCookie },
      body: JSON.stringify(syncPayload),
    });
    assert.equal(bobRes.status, 200);

    // Confirm Bob's attempt is stored under Bob's userId
    const bobAttempt = await prisma.quizAttempt.findUnique({
      where: { clientEventId: bobEventId },
    });
    assert.ok(bobAttempt);
    assert.equal(bobAttempt.userId, bobId);

    // Confirm Alice's quiz history does NOT include Bob's attempt
    const aliceQuizzes = await fetch(`${baseUrl}/api/learner/quizzes`, {
      headers: { Cookie: aliceCookie },
    });
    const aliceData = await aliceQuizzes.json();
    assert.ok(!aliceData.quizzes.some((q: any) => q.clientEventId === bobEventId));
  });

  test('7. AI Tutor Regression Check (Milestone 1)', async () => {
    const aiRes = await fetch(`${baseUrl}/api/ai/status`);
    assert.equal(aiRes.status, 200);
    const data = await aiRes.json();
    assert.equal(data.status, 'ok');
    assert.equal(data.configured, true);
    assert.equal(data.provider, 'gemini');
  });
});
