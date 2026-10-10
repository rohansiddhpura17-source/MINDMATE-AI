import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import app from '../src/server.js';
import { prisma } from '../src/db.js';
import { buildLearnerTwinProfile } from '../src/services/learningTwin.js';
import { generateLearnerInsights, scheduleInsightAsTask } from '../src/services/learningInsights.js';
import { synthesizeTwinProfile, buildDeterministicSynthesis } from '../src/services/twinAiSynthesis.js';

let server: http.Server;
let baseUrl = '';

let userAId = '';
let userACookie = '';
let userBId = '';
let userBCookie = '';

function makeRequest(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any }> {
  return new Promise((resolve, reject) => {
    const fullUrl = new URL(url, baseUrl);
    const req = http.request(
      fullUrl,
      {
        method: options.method || 'GET',
        headers: options.headers || {},
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed = data;
          try {
            parsed = JSON.parse(data);
          } catch {
            // Keep raw string
          }
          resolve({ status: res.statusCode || 500, headers: res.headers, body: parsed });
        });
      }
    );

    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

describe('MindMate Milestone 7: Learning Twin & Evidence-Based AI Insights', () => {
  before(async () => {
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address() as any;
        baseUrl = `http://localhost:${addr.port}`;
        resolve();
      });
    });

    // Clean test database tables
    await prisma.studyTask.deleteMany({});
    await prisma.spacedRepetitionItem.deleteMany({});
    await prisma.quizAttempt.deleteMany({});
    await prisma.learnerProgress.deleteMany({});
    await prisma.learningMaterial.deleteMany({});
    await prisma.session.deleteMany({});
    await prisma.userPreference.deleteMany({});
    await prisma.user.deleteMany({});

    // Register User A
    const regA = await makeRequest('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'twin.usera@mindmate.test',
        password: 'Password123!',
        name: 'Alice Learner',
        goal: 'Master Python & Algorithms',
      }),
    });
    assert.strictEqual(regA.status, 201);
    userAId = regA.body.user.id;
    const cookieHeaderA = regA.headers['set-cookie'];
    userACookie = (Array.isArray(cookieHeaderA) ? cookieHeaderA[0] : cookieHeaderA)?.split(';')[0] || '';

    // Register User B
    const regB = await makeRequest('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'twin.userb@mindmate.test',
        password: 'Password123!',
        name: 'Bob Learner',
        goal: 'Learn Web APIs',
      }),
    });
    assert.strictEqual(regB.status, 201);
    userBId = regB.body.user.id;
    const cookieHeaderB = regB.headers['set-cookie'];
    userBCookie = (Array.isArray(cookieHeaderB) ? cookieHeaderB[0] : cookieHeaderB)?.split(';')[0] || '';

    // Clear auto-seeded default progress to start with completely clean test state
    await prisma.learnerProgress.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
    await prisma.quizAttempt.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
  });

  test('1. Learner with Zero History: Returns unassessed profile with no false claims', async () => {
    const res = await makeRequest('/api/learner/twin', {
      headers: { Cookie: userACookie },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    const profile = res.body.profile;

    assert.strictEqual(profile.userId, userAId);
    assert.strictEqual(profile.overview.assessedTopicsCount, 0);
    assert.strictEqual(profile.overview.totalQuestionsAnswered, 0);
    assert.strictEqual(profile.strengths.length, 0, 'No strengths claimed without evidence');
    assert.strictEqual(profile.knowledgeGaps.length, 0, 'No knowledge gaps claimed without evidence');

    // All default curriculum topics should be marked unassessed
    assert.ok(profile.unassessedTopics.length > 0);
    for (const t of profile.unassessedTopics) {
      assert.strictEqual(t.isAssessed, false);
      assert.strictEqual(t.measuredObservations.totalAttempts, 0);
      assert.strictEqual(t.recommendedAction.type, 'DIAGNOSTIC');
    }

    // Insights endpoint for new learner returns empty list with explanatory reason
    const insightsRes = await makeRequest('/api/learner/insights', {
      headers: { Cookie: userACookie },
    });
    assert.strictEqual(insightsRes.status, 200);
    assert.strictEqual(insightsRes.body.insights.length, 0);
    assert.ok(insightsRes.body.emptyStateReason.includes('No study records found'));
  });

  test('2. Insufficient Evidence Learner: Flags calibration needed, does not diagnose weakness', async () => {
    // Record only 2 attempts on python-funcs with 1 correct
    await prisma.learnerProgress.create({
      data: {
        userId: userAId,
        topicId: 'python-funcs',
        topicName: 'Python Functions & Scope',
        masteryScore: 50.0,
        attemptCount: 2,
        correctCount: 1,
        confidenceLevel: 'INSUFFICIENT_EVIDENCE',
        currentDifficulty: 'medium',
      },
    });

    await prisma.quizAttempt.create({
      data: {
        userId: userAId,
        topicId: 'python-funcs',
        topicName: 'Python Functions & Scope',
        score: 50.0,
        totalQuestions: 2,
        correctAnswers: 1,
      },
    });

    const res = await makeRequest('/api/learner/twin', {
      headers: { Cookie: userACookie },
    });
    assert.strictEqual(res.status, 200);
    const profile = res.body.profile;

    const pythonTopic = profile.topics.find((t: any) => t.topicId === 'python-funcs');
    assert.ok(pythonTopic);
    assert.strictEqual(pythonTopic.isAssessed, true);
    assert.strictEqual(pythonTopic.measuredObservations.totalAttempts, 2);
    assert.strictEqual(pythonTopic.modelEstimates.confidenceLevel, 'INSUFFICIENT_EVIDENCE');
    assert.strictEqual(pythonTopic.modelEstimates.status, 'CALIBRATING');

    // Must NOT be placed in knowledge gaps because attempts < 3
    assert.strictEqual(
      profile.knowledgeGaps.some((g: any) => g.topicId === 'python-funcs'),
      false
    );
    assert.strictEqual(
      profile.calibratingTopics.some((c: any) => c.topicId === 'python-funcs'),
      true
    );

    // Insights must flag CALIBRATION_NEEDED
    const insightsRes = await makeRequest('/api/learner/insights', {
      headers: { Cookie: userACookie },
    });
    assert.strictEqual(insightsRes.status, 200);
    const calibInsight = insightsRes.body.insights.find(
      (i: any) => i.topicId === 'python-funcs' && i.pattern === 'CALIBRATION_NEEDED'
    );
    assert.ok(calibInsight, 'Must provide CALIBRATION_NEEDED insight');
    assert.strictEqual(calibInsight.evidence.evidenceLevel, 'INSUFFICIENT_DATA');
  });

  test('3. Repeated Errors Pattern Mining: Identifies persistent misconceptions with targeted scaffolding', async () => {
    // Record repeated errors on oop-basics: 6 attempts, only 1 correct (17% accuracy)
    await prisma.learnerProgress.create({
      data: {
        userId: userAId,
        topicId: 'oop-basics',
        topicName: 'Object-Oriented Programming (OOP)',
        masteryScore: 30.0,
        attemptCount: 6,
        correctCount: 1,
        consecutiveIncorrect: 3,
        confidenceLevel: 'LOW',
        currentDifficulty: 'easy',
      },
    });

    const now = new Date();
    await prisma.quizAttempt.create({
      data: {
        userId: userAId,
        topicId: 'oop-basics',
        topicName: 'Object-Oriented Programming (OOP)',
        score: 20.0,
        totalQuestions: 3,
        correctAnswers: 0,
        createdAt: new Date(now.getTime() - 86400000 * 2),
      },
    });
    await prisma.quizAttempt.create({
      data: {
        userId: userAId,
        topicId: 'oop-basics',
        topicName: 'Object-Oriented Programming (OOP)',
        score: 33.0,
        totalQuestions: 3,
        correctAnswers: 1,
        createdAt: now,
      },
    });

    const insightsRes = await makeRequest('/api/learner/insights', {
      headers: { Cookie: userACookie },
    });
    assert.strictEqual(insightsRes.status, 200);

    const errorInsight = insightsRes.body.insights.find(
      (i: any) => i.topicId === 'oop-basics' && i.pattern === 'REPEATED_MISTAKES'
    );
    assert.ok(errorInsight, 'Must detect REPEATED_MISTAKES pattern');
    assert.strictEqual(errorInsight.type, 'mistake');
    assert.strictEqual(errorInsight.actionUrl, '/practice/quiz?topic=oop-basics');
    assert.ok(errorInsight.pedagogicalRationale.toLowerCase().includes('scaffolding'));
  });

  test('4. Sustained Improvement: Detects upward trajectory across comparable windows', async () => {
    // Record 4 attempts on dsa-arrays: 2 early attempts (scores 40, 50 = avg 45%), 2 recent attempts (scores 80, 90 = avg 85%)
    await prisma.learnerProgress.create({
      data: {
        userId: userAId,
        topicId: 'dsa-arrays',
        topicName: 'Data Structures & Algorithms',
        masteryScore: 78.0,
        attemptCount: 8,
        correctCount: 6,
        confidenceLevel: 'MEDIUM',
        currentDifficulty: 'medium',
      },
    });

    const now = new Date();
    // Earlier baseline
    await prisma.quizAttempt.create({
      data: {
        userId: userAId,
        topicId: 'dsa-arrays',
        topicName: 'Data Structures & Algorithms',
        score: 40.0,
        totalQuestions: 2,
        correctAnswers: 1,
        createdAt: new Date(now.getTime() - 86400000 * 5),
      },
    });
    await prisma.quizAttempt.create({
      data: {
        userId: userAId,
        topicId: 'dsa-arrays',
        topicName: 'Data Structures & Algorithms',
        score: 50.0,
        totalQuestions: 2,
        correctAnswers: 1,
        createdAt: new Date(now.getTime() - 86400000 * 4),
      },
    });
    // Recent performance
    await prisma.quizAttempt.create({
      data: {
        userId: userAId,
        topicId: 'dsa-arrays',
        topicName: 'Data Structures & Algorithms',
        score: 80.0,
        totalQuestions: 2,
        correctAnswers: 2,
        createdAt: new Date(now.getTime() - 86400000 * 2),
      },
    });
    await prisma.quizAttempt.create({
      data: {
        userId: userAId,
        topicId: 'dsa-arrays',
        topicName: 'Data Structures & Algorithms',
        score: 90.0,
        totalQuestions: 2,
        correctAnswers: 2,
        createdAt: now,
      },
    });

    const insightsRes = await makeRequest('/api/learner/insights', {
      headers: { Cookie: userACookie },
    });
    assert.strictEqual(insightsRes.status, 200);

    const improvementInsight = insightsRes.body.insights.find(
      (i: any) => i.topicId === 'dsa-arrays' && i.pattern === 'SUSTAINED_IMPROVEMENT'
    );
    assert.ok(improvementInsight, 'Must detect SUSTAINED_IMPROVEMENT pattern');
    assert.strictEqual(improvementInsight.evidence.baselineAccuracy, 45);
    assert.strictEqual(improvementInsight.evidence.recentAccuracy, 85);
    assert.strictEqual(improvementInsight.evidence.scoreDelta, 40);
    assert.strictEqual(improvementInsight.type, 'mastery');
  });

  test('5. Performance Decline: Detects drop with comparison window and sample bounds', async () => {
    // Record web-basics: 2 earlier attempts (80, 80 = 80%), 2 recent attempts (50, 40 = 45% -> delta -35%)
    await prisma.learnerProgress.create({
      data: {
        userId: userAId,
        topicId: 'web-basics',
        topicName: 'Web & API Fundamentals',
        masteryScore: 55.0,
        attemptCount: 8,
        correctCount: 4,
        confidenceLevel: 'MEDIUM',
        currentDifficulty: 'medium',
      },
    });

    const now = new Date();
    await prisma.quizAttempt.create({
      data: {
        userId: userAId,
        topicId: 'web-basics',
        topicName: 'Web & API Fundamentals',
        score: 80.0,
        totalQuestions: 2,
        correctAnswers: 2,
        createdAt: new Date(now.getTime() - 86400000 * 6),
      },
    });
    await prisma.quizAttempt.create({
      data: {
        userId: userAId,
        topicId: 'web-basics',
        topicName: 'Web & API Fundamentals',
        score: 80.0,
        totalQuestions: 2,
        correctAnswers: 2,
        createdAt: new Date(now.getTime() - 86400000 * 5),
      },
    });
    await prisma.quizAttempt.create({
      data: {
        userId: userAId,
        topicId: 'web-basics',
        topicName: 'Web & API Fundamentals',
        score: 50.0,
        totalQuestions: 2,
        correctAnswers: 1,
        createdAt: new Date(now.getTime() - 86400000 * 1),
      },
    });
    await prisma.quizAttempt.create({
      data: {
        userId: userAId,
        topicId: 'web-basics',
        topicName: 'Web & API Fundamentals',
        score: 40.0,
        totalQuestions: 2,
        correctAnswers: 1,
        createdAt: now,
      },
    });

    const insightsRes = await makeRequest('/api/learner/insights', {
      headers: { Cookie: userACookie },
    });
    assert.strictEqual(insightsRes.status, 200);

    const declineInsight = insightsRes.body.insights.find(
      (i: any) => i.topicId === 'web-basics' && i.pattern === 'PERFORMANCE_DECLINE'
    );
    assert.ok(declineInsight, 'Must detect PERFORMANCE_DECLINE pattern');
    assert.strictEqual(declineInsight.evidence.baselineAccuracy, 80);
    assert.strictEqual(declineInsight.evidence.recentAccuracy, 45);
    assert.ok(declineInsight.evidence.sampleSufficiencyDescription.includes('variance'));
  });

  test('6. Overdue Spaced Repetition: Detects overdue review with days overdue and retention warning', async () => {
    // Add spaced repetition item overdue by 3 days
    const threeDaysAgo = new Date(Date.now() - 86400000 * 3);
    await prisma.spacedRepetitionItem.create({
      data: {
        userId: userAId,
        topicId: 'oop-basics',
        topicName: 'Object-Oriented Programming (OOP)',
        repetitionNumber: 1,
        intervalDays: 3.0,
        easeFactor: 2.5,
        lastReviewedAt: new Date(Date.now() - 86400000 * 6),
        nextReviewAt: threeDaysAgo,
        totalReviews: 2,
      },
    });

    const insightsRes = await makeRequest('/api/learner/insights', {
      headers: { Cookie: userACookie },
    });
    assert.strictEqual(insightsRes.status, 200);

    const overdueInsight = insightsRes.body.insights.find(
      (i: any) => i.topicId === 'oop-basics' && i.pattern === 'OVERDUE_REVIEW'
    );
    assert.ok(overdueInsight, 'Must detect OVERDUE_REVIEW pattern');
    assert.strictEqual(overdueInsight.evidence.evidenceLevel, 'HIGH_CERTAINTY');
    assert.ok(overdueInsight.evidence.daysOverdue! >= 3);
    assert.ok(overdueInsight.pedagogicalRationale.includes('forgetting curve'));
  });

  test('7. Missing or Inconsistent Records: Handles gracefully without throwing', async () => {
    // Progress with 0 attempts and mismatched streak
    await prisma.learnerProgress.create({
      data: {
        userId: userAId,
        topicId: 'db-sql',
        topicName: 'Database Queries & SQL',
        masteryScore: 50.0,
        attemptCount: 0,
        correctCount: 0,
        confidenceLevel: 'INSUFFICIENT_EVIDENCE',
      },
    });

    const res = await makeRequest('/api/learner/twin', {
      headers: { Cookie: userACookie },
    });
    assert.strictEqual(res.status, 200);
    const dbTopic = res.body.profile.topics.find((t: any) => t.topicId === 'db-sql');
    assert.ok(dbTopic);
    assert.strictEqual(dbTopic.isAssessed, false);
  });

  test('8. 1-Click Scheduling: Converts insight recommendation into active StudyTask in Planner', async () => {
    const insightsRes = await makeRequest('/api/learner/insights', {
      headers: { Cookie: userACookie },
    });
    const insightToSchedule = insightsRes.body.insights[0];
    assert.ok(insightToSchedule);

    const scheduleRes = await makeRequest(`/api/learner/insights/${insightToSchedule.id}/schedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: userACookie,
      },
      body: JSON.stringify({ targetDate: '2026-10-14' }),
    });

    assert.strictEqual(scheduleRes.status, 200);
    assert.strictEqual(scheduleRes.body.success, true);
    assert.strictEqual(scheduleRes.body.task.date, '2026-10-14');
    assert.strictEqual(scheduleRes.body.task.topicId, insightToSchedule.topicId);

    // Verify task appears in user study tasks
    const tasks = await prisma.studyTask.findMany({
      where: { userId: userAId, date: '2026-10-14' },
    });
    assert.strictEqual(tasks.length, 1);
  });

  test('9. Strict Cross-User Isolation: User B cannot access User A twin or insights', async () => {
    // User B requests their twin profile
    const twinResB = await makeRequest('/api/learner/twin', {
      headers: { Cookie: userBCookie },
    });
    assert.strictEqual(twinResB.status, 200);
    assert.strictEqual(twinResB.body.profile.userId, userBId);
    assert.strictEqual(twinResB.body.profile.learnerName, 'Bob Learner');
    assert.strictEqual(twinResB.body.profile.overview.totalQuestionsAnswered, 0);

    // User B requests insights
    const insightsResB = await makeRequest('/api/learner/insights', {
      headers: { Cookie: userBCookie },
    });
    assert.strictEqual(insightsResB.status, 200);
    assert.strictEqual(insightsResB.body.insights.length, 0);
  });

  test('10. AI Tutor Synthesis: Produces grounded pedagogical summary with deterministic fallback', async () => {
    // Test endpoint
    const synthRes = await makeRequest('/api/learner/twin/synthesize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: userACookie,
      },
      body: JSON.stringify({ allowCloudAi: false }), // Test deterministic fallback guarantee
    });

    assert.strictEqual(synthRes.status, 200);
    assert.strictEqual(synthRes.body.success, true);
    const synth = synthRes.body.synthesis;

    assert.strictEqual(synth.source, 'DETERMINISTIC_ENGINE');
    assert.ok(synth.summary.includes('calibrated'));
    assert.ok(synth.evidenceGrounding.totalQuestions > 0);
  });

  test('11. Regression Check: Milestones 1–6 endpoints remain fully operational', async () => {
    // M1: AI Status
    const aiStatus = await makeRequest('/api/ai/status', { headers: { Cookie: userACookie } });
    assert.strictEqual(aiStatus.status, 200);

    // M2: Auth / Me
    const me = await makeRequest('/api/auth/me', { headers: { Cookie: userACookie } });
    assert.strictEqual(me.status, 200);
    assert.strictEqual(me.body.user.email, 'twin.usera@mindmate.test');

    // M3: Sync Status
    const sync = await makeRequest('/api/learner/sync/status', { headers: { Cookie: userACookie } });
    assert.strictEqual(sync.status, 200);

    // M4: Materials
    const materials = await makeRequest('/api/learner/materials', { headers: { Cookie: userACookie } });
    assert.strictEqual(materials.status, 200);

    // M5: Adaptive Diagnostics
    const diag = await makeRequest('/api/learner/adaptive/diagnostic', { headers: { Cookie: userACookie } });
    assert.strictEqual(diag.status, 200);

    // M6: Study Planner
    const planner = await makeRequest('/api/learner/planner', { headers: { Cookie: userACookie } });
    assert.strictEqual(planner.status, 200);
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
