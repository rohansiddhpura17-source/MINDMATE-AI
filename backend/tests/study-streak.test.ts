import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import app from '../src/server.js';
import { prisma } from '../src/db.js';
import {
  calculateStreakFromDates,
  getUserStudyStreak,
  recordUserStudyActivity,
} from '../src/services/streakService.js';

let server: http.Server;
let baseUrl: string;

describe('MindMate Study Streak Persistence and Isolation Suite', () => {
  let userACookie: string;
  let userBCookie: string;
  let userAId: string;
  let userBId: string;

  before(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    const emailA = `streak_a_${Date.now()}@example.com`;
    const resA = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailA, password: 'Password123!', name: 'Streak Learner A' }),
    });
    userACookie = resA.headers.get('set-cookie')?.split(';')[0] || '';
    const bodyA = await resA.json();
    userAId = bodyA.user.id;

    const emailB = `streak_b_${Date.now()}@example.com`;
    const resB = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailB, password: 'Password123!', name: 'Streak Learner B' }),
    });
    userBCookie = resB.headers.get('set-cookie')?.split(';')[0] || '';
    const bodyB = await resB.json();
    userBId = bodyB.user.id;
  });

  after(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [userAId, userBId] } },
    });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test('1. Pure streak calculation logic: consecutive dates, missed days, and records', () => {
    const fixedToday = new Date('2026-10-10T12:00:00Z');

    // Case A: No study dates
    const resEmpty = calculateStreakFromDates([], fixedToday);
    assert.equal(resEmpty.currentStreak, 0);
    assert.equal(resEmpty.longestStreak, 0);

    // Case B: Studied today only
    const resToday = calculateStreakFromDates(['2026-10-10'], fixedToday);
    assert.equal(resToday.currentStreak, 1);
    assert.equal(resToday.longestStreak, 1);

    // Case C: Studied yesterday (alive streak, hasn't studied today yet)
    const resYesterday = calculateStreakFromDates(['2026-10-09'], fixedToday);
    assert.equal(resYesterday.currentStreak, 1);
    assert.equal(resYesterday.longestStreak, 1);

    // Case D: 4 consecutive days ending today
    const res4Days = calculateStreakFromDates(
      ['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'],
      fixedToday
    );
    assert.equal(res4Days.currentStreak, 4);
    assert.equal(res4Days.longestStreak, 4);

    // Case E: Missed yesterday & today (streak broken)
    const resBroken = calculateStreakFromDates(['2026-10-05', '2026-10-06'], fixedToday);
    assert.equal(resBroken.currentStreak, 0);
    assert.equal(resBroken.longestStreak, 2);

    // Case F: Historical long streak of 5 days, current streak of 2 days
    const resHistory = calculateStreakFromDates(
      [
        '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05',
        '2026-10-09', '2026-10-10'
      ],
      fixedToday
    );
    assert.equal(resHistory.currentStreak, 2);
    assert.equal(resHistory.longestStreak, 5);
  });

  test('2. Server API: GET /api/learner/streak returns clean initial state for new user', async () => {
    const res = await fetch(`${baseUrl}/api/learner/streak`, {
      headers: { Cookie: userACookie },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.currentStreak, 0);
    assert.equal(data.longestStreak, 0);
    assert.deepEqual(data.studyDates, []);
  });

  test('3. Server API: POST /api/learner/streak/record records study activity idempotently', async () => {
    // First record
    const res1 = await fetch(`${baseUrl}/api/learner/streak/record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userACookie },
      body: JSON.stringify({ date: '2026-10-10' }),
    });
    assert.equal(res1.status, 200);
    const data1 = await res1.json();
    assert.equal(data1.success, true);
    assert.equal(data1.currentStreak, 1);
    assert.equal(data1.longestStreak, 1);
    assert.ok(data1.studyDates.includes('2026-10-10'));

    // Duplicate record on SAME date must NOT increment or corrupt streak
    const res2 = await fetch(`${baseUrl}/api/learner/streak/record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userACookie },
      body: JSON.stringify({ date: '2026-10-10' }),
    });
    assert.equal(res2.status, 200);
    const data2 = await res2.json();
    assert.equal(data2.currentStreak, 1, 'Duplicate same-day submission must remain streak=1');
    assert.equal(data2.studyDates.filter((d: string) => d === '2026-10-10').length, 1);
  });

  test('4. Multi-user isolation: User A activity does not leak into User B streak', async () => {
    // User B should still have 0 streak
    const resB = await fetch(`${baseUrl}/api/learner/streak`, {
      headers: { Cookie: userBCookie },
    });
    assert.equal(resB.status, 200);
    const dataB = await resB.json();
    assert.equal(dataB.currentStreak, 0);
    assert.deepEqual(dataB.studyDates, []);

    // User A should still have their 1-day streak
    const resA = await fetch(`${baseUrl}/api/learner/streak`, {
      headers: { Cookie: userACookie },
    });
    const dataA = await resA.json();
    assert.equal(dataA.currentStreak, 1);
    assert.ok(dataA.studyDates.includes('2026-10-10'));
  });

  test('5. Offline Sync reconciliation of study events', async () => {
    const clientEventId = `offline_streak_${Date.now()}`;
    const syncRes = await fetch(`${baseUrl}/api/learner/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: userBCookie },
      body: JSON.stringify({
        events: [
          {
            eventId: clientEventId,
            userId: userBId,
            eventType: 'STUDY_ACTIVITY',
            timestamp: new Date().toISOString(),
            payload: { date: '2026-10-10' },
          },
        ],
      }),
    });
    assert.equal(syncRes.status, 200);
    const syncBody = await syncRes.json();
    assert.equal(syncBody.success, true);
    assert.ok(syncBody.processedEventIds.includes(clientEventId));

    // Verify User B now has streak recorded from offline sync
    const resB = await fetch(`${baseUrl}/api/learner/streak`, {
      headers: { Cookie: userBCookie },
    });
    const dataB = await resB.json();
    assert.equal(dataB.currentStreak, 1);
    assert.ok(dataB.studyDates.includes('2026-10-10'));
  });
});
