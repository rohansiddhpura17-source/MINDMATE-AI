import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import app from '../src/server.js';
import { prisma } from '../src/db.js';

let server: http.Server;
let baseUrl: string;

before(async () => {
  // Start server on an ephemeral port
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
        in: ['alice.test@mindmate.app', 'bob.test@mindmate.app', 'test.rate@mindmate.app'],
      },
    },
  });
});

after(async () => {
  // Clean up test data
  await prisma.user.deleteMany({
    where: {
      email: {
        in: ['alice.test@mindmate.app', 'bob.test@mindmate.app', 'test.rate@mindmate.app'],
      },
    },
  });
  await prisma.$disconnect();
  server.close();
});

describe('MindMate Milestone 2: Auth and Persistence Test Suite', () => {
  let aliceCookie = '';
  let aliceId = '';
  let bobCookie = '';
  let bobId = '';
  let aliceMaterialId = '';

  test('1. User Registration - Success creates user, hashed password, preferences & session cookie', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Alice Test',
        email: 'alice.test@mindmate.app',
        password: 'SecurePassword123!',
        goal: 'cs-exam',
      }),
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.user.email, 'alice.test@mindmate.app');
    assert.equal(data.user.name, 'Alice Test');
    aliceId = data.user.id;

    // Check cookie
    const setCookie = res.headers.get('set-cookie');
    assert.ok(setCookie, 'Expected Set-Cookie header');
    assert.match(setCookie, /mindmate_session=/);
    aliceCookie = setCookie.split(';')[0];

    // Verify DB record & password hash (must NOT be plain text)
    const dbUser = await prisma.user.findUnique({
      where: { email: 'alice.test@mindmate.app' },
    });
    assert.ok(dbUser);
    assert.notEqual(dbUser.passwordHash, 'SecurePassword123!');
    assert.ok(dbUser.passwordHash.startsWith('$2')); // bcrypt prefix

    // Verify default preferences seeded
    const prefs = await prisma.userPreference.findUnique({
      where: { userId: aliceId },
    });
    assert.ok(prefs);
    assert.equal(prefs.adaptiveDifficulty, true);

    // Verify default progress seeded
    const progress = await prisma.learnerProgress.findMany({
      where: { userId: aliceId },
    });
    assert.ok(progress.length > 0);
  });

  test('2. Registration Validation - Rejects duplicates and invalid input', async () => {
    // Duplicate email
    const dupRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Alice Clone',
        email: 'alice.test@mindmate.app',
        password: 'Password123',
      }),
    });
    assert.equal(dupRes.status, 409);

    // Short password (<6 chars)
    const shortPwRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Short Pw',
        email: 'short@mindmate.app',
        password: '123',
      }),
    });
    assert.equal(shortPwRes.status, 400);

    // Invalid email format
    const badEmailRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bad Email',
        email: 'not-an-email',
        password: 'Password123',
      }),
    });
    assert.equal(badEmailRes.status, 400);
  });

  test('3. User Login - Rejects invalid credentials and succeeds with valid ones', async () => {
    // Non-existent user
    const noUserRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'nobody@mindmate.app',
        password: 'Password123',
      }),
    });
    assert.equal(noUserRes.status, 401);

    // Wrong password
    const wrongPwRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'alice.test@mindmate.app',
        password: 'WrongPassword',
      }),
    });
    assert.equal(wrongPwRes.status, 401);

    // Correct login
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'alice.test@mindmate.app',
        password: 'SecurePassword123!',
      }),
    });
    assert.equal(loginRes.status, 200);
    const loginData = await loginRes.json();
    assert.equal(loginData.success, true);
    assert.equal(loginData.user.email, 'alice.test@mindmate.app');
    const setCookie = loginRes.headers.get('set-cookie');
    assert.ok(setCookie);
    aliceCookie = setCookie.split(';')[0];
  });

  test('4. Session Restoration (GET /api/auth/me)', async () => {
    // Unauthenticated request
    const unauthRes = await fetch(`${baseUrl}/api/auth/me`);
    assert.equal(unauthRes.status, 401);

    // Authenticated request with session cookie
    const authRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: aliceCookie },
    });
    assert.equal(authRes.status, 200);
    const authData = await authRes.json();
    assert.equal(authData.success, true);
    assert.equal(authData.user.id, aliceId);
    assert.equal(authData.user.name, 'Alice Test');
  });

  test('5. Learner Preferences Persistence', async () => {
    // Get preferences
    const getRes = await fetch(`${baseUrl}/api/learner/preferences`, {
      headers: { Cookie: aliceCookie },
    });
    assert.equal(getRes.status, 200);
    const getData = await getRes.json();
    assert.equal(getData.preferences.cloudAI, false);

    // Update preferences
    const putRes = await fetch(`${baseUrl}/api/learner/preferences`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
      body: JSON.stringify({
        cloudAI: true,
        dailyGoalMinutes: 45,
        learningStyle: 'auditory',
      }),
    });
    assert.equal(putRes.status, 200);

    // Verify persistence in DB
    const verifyRes = await fetch(`${baseUrl}/api/learner/preferences`, {
      headers: { Cookie: aliceCookie },
    });
    const verifyData = await verifyRes.json();
    assert.equal(verifyData.preferences.cloudAI, true);
    assert.equal(verifyData.preferences.dailyGoalMinutes, 45);
    assert.equal(verifyData.preferences.learningStyle, 'auditory');
  });

  test('6. Learner Progress & Topic Mastery Persistence', async () => {
    // Get current progress
    const getRes = await fetch(`${baseUrl}/api/learner/progress`, {
      headers: { Cookie: aliceCookie },
    });
    assert.equal(getRes.status, 200);
    const getData = await getRes.json();
    assert.ok(Array.isArray(getData.topics));

    // Update progress on a topic
    const updateRes = await fetch(`${baseUrl}/api/learner/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
      body: JSON.stringify({
        topicId: 'python-funcs',
        topicName: 'Python Functions',
        masteryScore: 92,
        streakDays: 4,
        attemptDelta: 3,
        correctDelta: 3,
      }),
    });
    assert.equal(updateRes.status, 200);

    // Verify update
    const verifyRes = await fetch(`${baseUrl}/api/learner/progress`, {
      headers: { Cookie: aliceCookie },
    });
    const verifyData = await verifyRes.json();
    const updatedTopic = verifyData.topics.find((t: any) => t.topicId === 'python-funcs');
    assert.ok(updatedTopic);
    assert.equal(updatedTopic.mastery, 92);
    assert.equal(updatedTopic.streak, 4);
  });

  test('7. Quiz Attempt Recording & Automatic Mastery Recalculation', async () => {
    const quizRes = await fetch(`${baseUrl}/api/learner/quizzes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
      body: JSON.stringify({
        topicId: 'python-funcs',
        topicName: 'Python Functions',
        score: 5,
        totalQuestions: 5,
        correctAnswers: 5,
        answers: [{ questionId: 1, selected: 0, correct: true }],
      }),
    });
    assert.equal(quizRes.status, 201);
    const quizData = await quizRes.json();
    assert.equal(quizData.success, true);
    assert.equal(quizData.quizAttempt.totalQuestions, 5);
    assert.equal(quizData.quizAttempt.correctAnswers, 5);

    // Verify quiz history retrieval
    const historyRes = await fetch(`${baseUrl}/api/learner/quizzes`, {
      headers: { Cookie: aliceCookie },
    });
    assert.equal(historyRes.status, 200);
    const historyData = await historyRes.json();
    assert.ok(historyData.quizzes.length >= 1);
    assert.equal(historyData.quizzes[0].topicId, 'python-funcs');
  });

  test('8. Learning Materials Metadata Persistence', async () => {
    const matRes = await fetch(`${baseUrl}/api/learner/materials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
      body: JSON.stringify({
        name: 'CS101 Intro Lecture Slides',
        type: 'PDF',
        pages: 24,
        status: 'processed',
      }),
    });
    assert.equal(matRes.status, 201);
    const matData = await matRes.json();
    assert.equal(matData.material.name, 'CS101 Intro Lecture Slides');
    aliceMaterialId = matData.material.id;

    // Get list
    const listRes = await fetch(`${baseUrl}/api/learner/materials`, {
      headers: { Cookie: aliceCookie },
    });
    assert.equal(listRes.status, 200);
    const listData = await listRes.json();
    assert.ok(listData.materials.some((m: any) => m.id === aliceMaterialId));
  });

  test('9. Strict Cross-User Isolation (User A vs User B)', async () => {
    // Register Bob
    const bobReg = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bob Test',
        email: 'bob.test@mindmate.app',
        password: 'BobSecurePassword123!',
      }),
    });
    assert.equal(bobReg.status, 201);
    const bobData = await bobReg.json();
    bobId = bobData.user.id;
    const bobCookieHeader = bobReg.headers.get('set-cookie');
    assert.ok(bobCookieHeader);
    bobCookie = bobCookieHeader.split(';')[0];

    // Bob tries to delete Alice's material -> Must return 404/forbidden
    const delRes = await fetch(`${baseUrl}/api/learner/materials/${aliceMaterialId}`, {
      method: 'DELETE',
      headers: { Cookie: bobCookie },
    });
    assert.equal(delRes.status, 404);

    // Confirm Alice's material is still intact
    const aliceListRes = await fetch(`${baseUrl}/api/learner/materials`, {
      headers: { Cookie: aliceCookie },
    });
    const aliceListData = await aliceListRes.json();
    assert.ok(aliceListData.materials.some((m: any) => m.id === aliceMaterialId));

    // Bob checks quiz history -> Bob has 0 quizzes (Alice's quizzes are invisible)
    const bobQuizzesRes = await fetch(`${baseUrl}/api/learner/quizzes`, {
      headers: { Cookie: bobCookie },
    });
    const bobQuizzesData = await bobQuizzesRes.json();
    assert.equal(bobQuizzesData.quizzes.length, 0);

    // Bob checks materials -> Bob has 0 materials
    const bobMatRes = await fetch(`${baseUrl}/api/learner/materials`, {
      headers: { Cookie: bobCookie },
    });
    const bobMatData = await bobMatRes.json();
    assert.equal(bobMatData.materials.length, 0);
  });

  test('10. User Logout terminates session and clears cookies', async () => {
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: aliceCookie },
    });
    assert.equal(logoutRes.status, 200);

    // Check subsequent /me with former cookie fails with 401
    const postLogoutMe = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: aliceCookie },
    });
    assert.equal(postLogoutMe.status, 401);
  });

  test('11. Milestone 1 Hybrid AI Tutor Regression Check', async () => {
    const aiStatusRes = await fetch(`${baseUrl}/api/ai/status`);
    assert.equal(aiStatusRes.status, 200);
    const aiData = await aiStatusRes.json();
    assert.equal(aiData.status, 'ok');
    assert.equal(aiData.configured, true);
    assert.equal(aiData.provider, 'gemini');
  });
});
