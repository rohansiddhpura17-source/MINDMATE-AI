import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';
import app from '../src/server.js';
import { prisma } from '../src/db.js';
import { setupMultiplayerWebSocket } from '../src/services/multiplayerSocket.js';
import bcrypt from 'bcryptjs';

let server: http.Server;
let baseUrl: string;
let wsUrl: string;

let userA: { id: string; email: string; token: string; name: string };
let userB: { id: string; email: string; token: string; name: string };
let userC: { id: string; email: string; token: string; name: string };

before(async () => {
  server = http.createServer(app);
  setupMultiplayerWebSocket(server);

  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      const addr = server.address() as { port: number };
      baseUrl = `http://127.0.0.1:${addr.port}`;
      wsUrl = `ws://127.0.0.1:${addr.port}/ws/challenge`;
      resolve();
    });
  });

  const testEmails = ['social.a@mindmate.app', 'social.b@mindmate.app', 'social.c@mindmate.app'];
  await prisma.user.deleteMany({
    where: { email: { in: testEmails } },
  });

  const pwdHash = await bcrypt.hash('Password123!', 10);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  // Create User A
  const createdA = await prisma.user.create({
    data: {
      email: 'social.a@mindmate.app',
      name: 'Alice Duelist',
      passwordHash: pwdHash,
      role: 'STUDENT',
      goal: 'Master Python & Algorithms',
    },
  });
  const sessionA = await prisma.session.create({
    data: {
      userId: createdA.id,
      token: 'session-token-alice-social',
      expiresAt,
    },
  });
  userA = { id: createdA.id, email: createdA.email, token: sessionA.token, name: createdA.name };

  // Create User B
  const createdB = await prisma.user.create({
    data: {
      email: 'social.b@mindmate.app',
      name: 'Bob Competitor',
      passwordHash: pwdHash,
      role: 'STUDENT',
      goal: 'Ace Technical Interviews',
    },
  });
  const sessionB = await prisma.session.create({
    data: {
      userId: createdB.id,
      token: 'session-token-bob-social',
      expiresAt,
    },
  });
  userB = { id: createdB.id, email: createdB.email, token: sessionB.token, name: createdB.name };

  // Create User C (neutral third user)
  const createdC = await prisma.user.create({
    data: {
      email: 'social.c@mindmate.app',
      name: 'Charlie Solo',
      passwordHash: pwdHash,
      role: 'STUDENT',
      goal: 'Learn Web Development',
    },
  });
  const sessionC = await prisma.session.create({
    data: {
      userId: createdC.id,
      token: 'session-token-charlie-social',
      expiresAt,
    },
  });
  userC = { id: createdC.id, email: createdC.email, token: sessionC.token, name: createdC.name };
});

after(async () => {
  const testEmails = ['social.a@mindmate.app', 'social.b@mindmate.app', 'social.c@mindmate.app'];
  await prisma.user.deleteMany({
    where: { email: { in: testEmails } },
  });
  await prisma.$disconnect();
  server.close();
});

describe('Milestone 8: Social Learning & Friend Relationships', { concurrency: 1 }, () => {
  test('Search users returns privacy-conscious profiles without exposing email addresses', async () => {
    const res = await fetch(`${baseUrl}/api/social/users/search?q=Bob`, {
      headers: { Authorization: `Bearer ${userA.token}` },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.users));
    assert.ok(data.users.length >= 1);

    const bob = data.users.find((u: any) => u.id === userB.id);
    assert.ok(bob, 'Bob should be found in search');
    assert.equal(bob.name, 'Bob Competitor');
    assert.equal(bob.role, 'STUDENT');
    assert.equal((bob as any).email, undefined, 'Search result must not expose private email');
  });

  test('Cannot send friend request to oneself', async () => {
    const res = await fetch(`${baseUrl}/api/social/friends/request`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userA.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ addresseeId: userA.id }),
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /yourself/i);
  });

  let friendshipId: string;

  test('Alice sends friend request to Bob', async () => {
    const res = await fetch(`${baseUrl}/api/social/friends/request`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userA.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ addresseeId: userB.id }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.friendship.status, 'PENDING');
    friendshipId = data.friendship.id;
  });

  test('Prevent duplicate friend request while pending', async () => {
    const res = await fetch(`${baseUrl}/api/social/friends/request`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userA.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ addresseeId: userB.id }),
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /already/i);
  });

  test('Bob views pending incoming request and accepts it', async () => {
    const overviewRes = await fetch(`${baseUrl}/api/social/friends`, {
      headers: { Authorization: `Bearer ${userB.token}` },
    });
    assert.equal(overviewRes.status, 200);
    const overview = await overviewRes.json();
    assert.ok(overview.incomingRequests.some((r: any) => r.friendshipId === friendshipId));

    const acceptRes = await fetch(`${baseUrl}/api/social/friends/accept`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userB.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ friendshipId }),
    });
    assert.equal(acceptRes.status, 200);
    const acceptData = await acceptRes.json();
    assert.equal(acceptData.success, true);
    assert.equal(acceptData.friendship.status, 'ACCEPTED');

    const achResA = await fetch(`${baseUrl}/api/social/achievements`, {
      headers: { Authorization: `Bearer ${userA.token}` },
    });
    const achDataA = await achResA.json();
    const firstFriendA = achDataA.achievements.find((a: any) => a.key === 'FIRST_FRIEND');
    assert.equal(firstFriendA.isUnlocked, true);
  });
});

describe('Milestone 8: Authoritative Multiplayer Quiz Duels', { concurrency: 1 }, () => {
  let challengeId: string;

  before(async () => {
    const res = await fetch(`${baseUrl}/api/social/challenges`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userA.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        opponentId: userB.id,
        topic: 'data-structures',
        difficulty: 'medium',
        questionsCount: 3,
      }),
    });
    const data = await res.json();
    challengeId = data.challenge.id;
  });

  test('Alice created challenge and unlocked FIRST_CHALLENGE', async () => {
    assert.ok(challengeId, 'challengeId should be defined');
    const achRes = await fetch(`${baseUrl}/api/social/achievements`, {
      headers: { Authorization: `Bearer ${userA.token}` },
    });
    const achData = await achRes.json();
    const firstChallenge = achData.achievements.find((a: any) => a.key === 'FIRST_CHALLENGE');
    assert.equal(firstChallenge.isUnlocked, true);
  });

  test('Server authoritatively sanitizes questions: correct answers and explanations omitted before finish', async () => {
    const res = await fetch(`${baseUrl}/api/social/challenges/${challengeId}`, {
      headers: { Authorization: `Bearer ${userA.token}` },
    });
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.questions.length, 3);
    for (const q of data.questions) {
      assert.ok(q.question, 'Question text must exist');
      assert.ok(Array.isArray(q.options), 'Options must exist');
      assert.equal(q.correct, undefined, 'Correct answer must NOT be sent to client ahead of time');
      assert.equal(q.explanation, undefined, 'Explanation must NOT be sent to client ahead of time');
    }
  });

  test('Bob accepts the challenge', async () => {
    const res = await fetch(`${baseUrl}/api/social/challenges/${challengeId}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userB.token}` },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.challenge.status, 'ACCEPTED');
  });

  test('Third party cannot view or submit answers to duel', async () => {
    const res = await fetch(`${baseUrl}/api/social/challenges/${challengeId}`, {
      headers: { Authorization: `Bearer ${userC.token}` },
    });
    assert.equal(res.status, 404);
  });

  test('Alice submits correct answer in 2 seconds and earns points + speed bonus + SPEED_DEMON', async () => {
    const challengeInDb = await prisma.quizChallenge.findUnique({ where: { id: challengeId } });
    const fullQuestions = JSON.parse(challengeInDb!.questionsJson);
    const q0 = fullQuestions[0];

    const res = await fetch(`${baseUrl}/api/social/challenges/${challengeId}/submit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userA.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        questionIndex: 0,
        selectedOption: q0.correct,
        timeTakenSeconds: 2.0,
      }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.isCorrect, true);
    assert.equal(data.pointsEarned, 190);
    assert.equal(data.challengerScore, 190);

    const achRes = await fetch(`${baseUrl}/api/social/achievements`, {
      headers: { Authorization: `Bearer ${userA.token}` },
    });
    const achData = await achRes.json();
    const speedDemon = achData.achievements.find((a: any) => a.key === 'SPEED_DEMON');
    assert.equal(speedDemon.isUnlocked, true);
  });

  test('Duplicate submission for the same question is rejected', async () => {
    const res = await fetch(`${baseUrl}/api/social/challenges/${challengeId}/submit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userA.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        questionIndex: 0,
        selectedOption: 0,
        timeTakenSeconds: 5.0,
      }),
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /already been answered/i);
  });

  test('Bob submits incorrect answer and earns 0 points', async () => {
    const challengeInDb = await prisma.quizChallenge.findUnique({ where: { id: challengeId } });
    const fullQuestions = JSON.parse(challengeInDb!.questionsJson);
    const q0 = fullQuestions[0];
    const wrongOption = (q0.correct + 1) % q0.options.length;

    const res = await fetch(`${baseUrl}/api/social/challenges/${challengeId}/submit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userB.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        questionIndex: 0,
        selectedOption: wrongOption,
        timeTakenSeconds: 4.0,
      }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.isCorrect, false);
    assert.equal(data.pointsEarned, 0);
    assert.equal(data.opponentScore, 0);
  });

  test('Both players complete all questions -> game concludes, winner awarded', async () => {
    const challengeInDb = await prisma.quizChallenge.findUnique({ where: { id: challengeId } });
    const fullQuestions = JSON.parse(challengeInDb!.questionsJson);

    // Alice finishes remaining questions (q1, q2) correctly
    for (let idx = 1; idx < 3; idx++) {
      const q = fullQuestions[idx];
      await fetch(`${baseUrl}/api/social/challenges/${challengeId}/submit`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${userA.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          questionIndex: idx,
          selectedOption: q.correct,
          timeTakenSeconds: 1.5,
        }),
      });
    }

    // Bob finishes remaining questions (q1, q2)
    for (let idx = 1; idx < 3; idx++) {
      const q = fullQuestions[idx];
      const isLast = (idx === 2);
      const res = await fetch(`${baseUrl}/api/social/challenges/${challengeId}/submit`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${userB.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          questionIndex: idx,
          selectedOption: q.correct,
          timeTakenSeconds: 10.0,
        }),
      });
      if (isLast) {
        const lastData = await res.json();
        assert.equal(lastData.isGameOver, true);
        assert.equal(lastData.winnerId, userA.id);
        assert.equal(lastData.challengeStatus, 'COMPLETED');
      }
    }

    // Verify answers and explanations are now revealed
    const finalRes = await fetch(`${baseUrl}/api/social/challenges/${challengeId}`, {
      headers: { Authorization: `Bearer ${userA.token}` },
    });
    const finalData = await finalRes.json();
    assert.equal(finalData.status, 'COMPLETED');
    assert.equal(finalData.winnerId, userA.id);
    assert.ok(typeof finalData.questions[0].correct === 'number', 'Revealed after game over');
    assert.ok(finalData.questions[0].explanation, 'Explanation revealed after game over');

    // Alice unlocks CHALLENGE_WINNER and PERFECT_DUEL
    const achRes = await fetch(`${baseUrl}/api/social/achievements`, {
      headers: { Authorization: `Bearer ${userA.token}` },
    });
    const achData = await achRes.json();
    const champ = achData.achievements.find((a: any) => a.key === 'CHALLENGE_WINNER');
    const perfect = achData.achievements.find((a: any) => a.key === 'PERFECT_DUEL');
    assert.equal(champ.isUnlocked, true);
    assert.equal(perfect.isUnlocked, true);
  });
});

describe('Milestone 8: Authentic Leaderboards & Real-time WebSocket', { concurrency: 1 }, () => {
  test('Leaderboard aggregates genuine duel wins and composite scores', async () => {
    const res = await fetch(`${baseUrl}/api/social/leaderboard`, {
      headers: { Authorization: `Bearer ${userA.token}` },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.globalLeaderboard));

    const aliceEntry = data.globalLeaderboard.find((e: any) => e.userId === userA.id);
    assert.ok(aliceEntry);
    assert.equal(aliceEntry.challengesWon, 1);
    assert.ok(aliceEntry.compositeScore > 0);
    assert.equal(data.currentUserRank, 1);
  });

  test('Native WebSocket connects and handles JOIN_CHALLENGE and live state', async () => {
    const createRes = await fetch(`${baseUrl}/api/social/challenges`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userA.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        opponentId: userB.id,
        topic: 'data-structures',
        questionsCount: 3,
      }),
    });
    const created = await createRes.json();
    const wsChallengeId = created.challenge.id;

    const wsA = new WebSocket(`${wsUrl}?token=${userA.token}`);
    let receivedAuth = false;
    let receivedState = false;

    await new Promise<void>((resolve, reject) => {
      wsA.on('open', () => {});

      wsA.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'AUTHENTICATED') {
          receivedAuth = true;
          wsA.send(JSON.stringify({ type: 'JOIN_CHALLENGE', challengeId: wsChallengeId }));
        } else if (msg.type === 'CHALLENGE_STATE') {
          receivedState = true;
          assert.equal(msg.challenge.id, wsChallengeId);
          wsA.close();
          resolve();
        }
      });

      wsA.on('error', (err) => {
        reject(err);
      });

      setTimeout(() => {
        if (!receivedState) reject(new Error('WebSocket timed out waiting for state'));
      }, 5000);
    });

    assert.equal(receivedAuth, true);
    assert.equal(receivedState, true);
  });
});
