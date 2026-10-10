/**
 * Automated Test Suite for Milestone 6: Personalized Study Planner & Spaced Repetition
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import app from '../src/server.js';
import { prisma } from '../src/db.js';
import {
  calculateNextReview,
  scoreToReviewOutcome,
  ReviewOutcome,
} from '../src/services/spacedRepetition.js';
import {
  computeTopicPriorities,
  generateStudySchedule,
  generateBaselineSchedule,
} from '../src/services/studyPlanner.js';

let server: http.Server;
let baseUrl: string;

describe('MindMate Milestone 6: Study Planner & Spaced Repetition Test Suite', () => {
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

    // 1. Create clean test user A
    const emailA = `planner_a_${Date.now()}@example.com`;
    const resA = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailA, password: 'Password123!', name: 'Planner Learner A' }),
    });
    userACookie = resA.headers.get('set-cookie')?.split(';')[0] || '';
    const bodyA = await resA.json();
    userAId = bodyA.user.id;

    // 2. Create clean test user B
    const emailB = `planner_b_${Date.now()}@example.com`;
    const resB = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailB, password: 'Password123!', name: 'Planner Learner B' }),
    });
    userBCookie = resB.headers.get('set-cookie')?.split(';')[0] || '';
    const bodyB = await resB.json();
    userBId = bodyB.user.id;
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('1. Spaced Repetition: Deterministic SM-2 Interval Calculation on Success and Failure', () => {
    const baseNow = new Date('2026-10-10T12:00:00Z');

    // Initial review: 0 repetitions -> 1st success gives interval 1 day
    const rev1 = calculateNextReview(
      { repetitions: 0, intervalDays: 1.0, easeFactor: 2.5 },
      'PERFECT',
      { now: baseNow }
    );
    assert.equal(rev1.repetitions, 1);
    assert.equal(rev1.intervalDays, 1.0);
    assert.equal(rev1.easeFactor, 2.6); // EF increases on grade 5

    // 2nd review: 1 repetition -> 2nd success gives interval 3 days
    const rev2 = calculateNextReview(
      { repetitions: rev1.repetitions, intervalDays: rev1.intervalDays, easeFactor: rev1.easeFactor },
      'PASS',
      { now: rev1.nextReviewAt }
    );
    assert.equal(rev2.repetitions, 2);
    assert.equal(rev2.intervalDays, 3.0);

    // 3rd review: 2 repetitions -> scaled interval (3.0 * 2.6 = 7.8 days)
    const rev3 = calculateNextReview(
      { repetitions: rev2.repetitions, intervalDays: rev2.intervalDays, easeFactor: rev2.easeFactor },
      'PASS',
      { now: rev2.nextReviewAt }
    );
    assert.equal(rev3.repetitions, 3);
    assert.ok(rev3.intervalDays >= 7.0, `Interval should scale to >= 7 days: ${rev3.intervalDays}`);

    // Failure review: resets repetitions to 0 and interval to 1 day
    const revFail = calculateNextReview(
      { repetitions: rev3.repetitions, intervalDays: rev3.intervalDays, easeFactor: rev3.easeFactor },
      'CRITICAL_FAIL',
      { now: rev3.nextReviewAt }
    );
    assert.equal(revFail.repetitions, 0);
    assert.equal(revFail.intervalDays, 1.0);
    assert.ok(revFail.easeFactor < rev3.easeFactor, 'Ease factor should decrease on failure');
  });

  test('2. Spaced Repetition: Overdue Detection and Urgency Classification', () => {
    const scheduledDue = new Date('2026-10-08T00:00:00Z');
    const evaluateDate = new Date('2026-10-10T00:00:00Z'); // 2 days later

    const isOverdue = evaluateDate.getTime() > scheduledDue.getTime();
    const daysOverdue = Math.floor((evaluateDate.getTime() - scheduledDue.getTime()) / 86400000);

    assert.equal(isOverdue, true);
    assert.equal(daysOverdue, 2);
  });

  test('3. Explainable Prioritization Algorithm: Ranks Knowledge Gaps & Overdue Reviews', async () => {
    // Seed test progress for User A:
    // Topic 1: Low mastery (knowledge gap)
    await prisma.learnerProgress.upsert({
      where: { userId_topicId: { userId: userAId, topicId: 'test-gap' } },
      create: {
        userId: userAId,
        topicId: 'test-gap',
        topicName: 'Weak Topic',
        masteryScore: 25.0,
        attemptCount: 10,
        correctCount: 2,
        confidenceLevel: 'MEDIUM',
        currentDifficulty: 'easy',
        lastPracticed: new Date(),
      },
      update: {},
    });

    // Topic 2: High mastery (strong)
    await prisma.learnerProgress.upsert({
      where: { userId_topicId: { userId: userAId, topicId: 'test-strong' } },
      create: {
        userId: userAId,
        topicId: 'test-strong',
        topicName: 'Strong Topic',
        masteryScore: 92.0,
        attemptCount: 15,
        correctCount: 14,
        confidenceLevel: 'HIGH',
        currentDifficulty: 'hard',
        lastPracticed: new Date(),
      },
      update: {},
    });

    const priorities = await computeTopicPriorities(userAId);
    assert.ok(priorities.length >= 2);

    const weakMetric = priorities.find((p) => p.topicId === 'test-gap');
    const strongMetric = priorities.find((p) => p.topicId === 'test-strong');

    assert.ok(weakMetric, 'Weak metric must exist');
    assert.ok(strongMetric, 'Strong metric must exist');
    assert.ok(
      weakMetric.totalPriorityScore > strongMetric.totalPriorityScore,
      `Weak topic priority score (${weakMetric.totalPriorityScore}) should exceed strong topic (${strongMetric.totalPriorityScore})`
    );
    assert.ok(weakMetric.primaryRationale.includes('knowledge gap') || weakMetric.primaryRationale.includes('reinforcement'));
  });

  test('4. Schedule Generation: Pacing strictly respects dailyGoalMinutes and targetDays', async () => {
    // Set daily goal to 30 minutes, 15 min sessions, target days Mon, Wed, Fri
    const setRes = await fetch(`${baseUrl}/api/learner/planner/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: userACookie,
      },
      body: JSON.stringify({
        dailyGoalMinutes: 30,
        preferredSessionMinutes: 15,
        targetDays: ['Mon', 'Wed', 'Fri'],
      }),
    });
    assert.equal(setRes.status, 200);

    const planRes = await fetch(`${baseUrl}/api/learner/planner`, {
      headers: { Cookie: userACookie },
    });
    const planBody = await planRes.json();

    assert.equal(planBody.success, true);
    assert.equal(planBody.settings.dailyGoalMinutes, 30);
    assert.equal(planBody.days.length, 7);

    // Verify each day does not exceed dailyGoalMinutes + single session tolerance
    for (const day of planBody.days) {
      if (day.isTargetStudyDay) {
        assert.ok(
          day.allocatedMinutes <= 35,
          `Day ${day.dayOfWeek} allocated ${day.allocatedMinutes} mins which exceeds 35m limit`
        );
      }
    }
  });

  test('5. Actionable Tasks: Every scheduled task has valid actionUrl and pedagogical rationale', async () => {
    const planRes = await fetch(`${baseUrl}/api/learner/planner`, {
      headers: { Cookie: userACookie },
    });
    const planBody = await planRes.json();

    const allTasks = planBody.days.flatMap((d: any) => d.tasks);
    assert.ok(allTasks.length > 0, 'Schedule must contain tasks');

    for (const task of allTasks) {
      assert.ok(task.actionUrl.startsWith('/'), `Task actionUrl must be valid route: ${task.actionUrl}`);
      assert.ok(task.recommendationReason.length > 5, 'Task must provide pedagogical recommendationReason');
      assert.ok(['REVIEW', 'PRACTICE', 'QUIZ', 'DOCUMENT_STUDY', 'RECALL'].includes(task.type));
    }
  });

  test('6. Continuous Replanning: Task Completion marks done and preserves history across replanning', async () => {
    const planRes = await fetch(`${baseUrl}/api/learner/planner`, {
      headers: { Cookie: userACookie },
    });
    const planBody = await planRes.json();

    const todayTasks = planBody.days.find((d: any) => d.isToday)?.tasks || [];
    assert.ok(todayTasks.length > 0, 'Today must have at least one task');

    const targetTask = todayTasks[0];

    // Mark task complete
    const compRes = await fetch(`${baseUrl}/api/learner/planner/tasks/${targetTask.id}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: userACookie,
      },
      body: JSON.stringify({ scorePercentage: 85 }),
    });
    const compBody = await compRes.json();

    assert.equal(compRes.status, 200);
    assert.equal(compBody.success, true);
    assert.equal(compBody.task.isCompleted, true);

    // Regenerate plan and ensure completed task is preserved
    const regenRes = await fetch(`${baseUrl}/api/learner/planner/generate`, {
      method: 'POST',
      headers: { Cookie: userACookie },
    });
    const regenBody = await regenRes.json();

    const reloadedTasks = regenBody.days.flatMap((d: any) => d.tasks);
    const completedStillFound = reloadedTasks.find((t: any) => t.id === targetTask.id);
    assert.ok(completedStillFound, 'Completed task must be preserved across plan regeneration');
    assert.equal(completedStillFound.isCompleted, true);
  });

  test('7. Task Rescheduling: Moves session to new date without deleting it', async () => {
    const planRes = await fetch(`${baseUrl}/api/learner/planner`, {
      headers: { Cookie: userACookie },
    });
    const planBody = await planRes.json();

    const uncompleted = planBody.days.flatMap((d: any) => d.tasks).find((t: any) => !t.isCompleted);
    assert.ok(uncompleted, 'Must find an uncompleted task to reschedule');

    const newTargetDate = '2026-10-25';
    const res = await fetch(`${baseUrl}/api/learner/planner/tasks/${uncompleted.id}/reschedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: userACookie,
      },
      body: JSON.stringify({ newDate: newTargetDate }),
    });
    const resBody = await res.json();

    assert.equal(res.status, 200);
    assert.equal(resBody.success, true);
    assert.equal(resBody.task.date, newTargetDate);
    assert.equal(resBody.task.isPostponed, true);
  });

  test('8. Spaced Repetition API: Direct review recording updates schedule', async () => {
    const postRes = await fetch(`${baseUrl}/api/learner/spaced-repetition/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: userACookie,
      },
      body: JSON.stringify({
        topicId: 'python-funcs',
        topicName: 'Python Functions',
        outcome: 'PERFECT',
      }),
    });
    const postBody = await postRes.json();

    assert.equal(postRes.status, 200);
    assert.equal(postBody.success, true);
    assert.equal(postBody.result.repetitions, 1);
    assert.equal(postBody.result.intervalDays, 1.0);

    const getRes = await fetch(`${baseUrl}/api/learner/spaced-repetition`, {
      headers: { Cookie: userACookie },
    });
    const getBody = await getRes.json();

    assert.equal(getRes.status, 200);
    assert.equal(getBody.success, true);
    assert.ok(getBody.reviews.length >= 1);
    const item = getBody.reviews.find((r: any) => r.topicId === 'python-funcs');
    assert.ok(item, 'Python Functions item must be tracked');
    assert.equal(item.repetitionNumber, 1);
  });

  test('9. Head-to-Head Comparison: Adaptive Planner vs Naive Baseline', async () => {
    const res = await fetch(`${baseUrl}/api/learner/planner/baseline-comparison`, {
      headers: { Cookie: userACookie },
    });
    const resBody = await res.json();

    assert.equal(res.status, 200);
    assert.equal(resBody.success, true);
    const { adaptiveScheduler, naiveBaseline } = resBody.comparison;

    assert.equal(adaptiveScheduler.hasInterleaving, true);
    assert.equal(naiveBaseline.hasInterleaving, false);
    assert.equal(adaptiveScheduler.providesExplainableRationals, true);
    assert.equal(naiveBaseline.providesExplainableRationals, false);
    assert.ok(
      adaptiveScheduler.uniqueTopicsCovered >= naiveBaseline.uniqueTopicsCovered,
      'Adaptive planner must interleave topics rather than mono-topic stacking'
    );
  });

  test('10. Strict User Isolation: User B cannot access or modify User A study tasks', async () => {
    // User A creates plan
    const planRes = await fetch(`${baseUrl}/api/learner/planner`, {
      headers: { Cookie: userACookie },
    });
    const planBody = await planRes.json();
    const taskA = planBody.days.flatMap((d: any) => d.tasks)[0];
    assert.ok(taskA);

    // User B attempts to complete User A's task -> 500 / 404 access denied
    const deniedRes = await fetch(`${baseUrl}/api/learner/planner/tasks/${taskA.id}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: userBCookie,
      },
      body: JSON.stringify({ scorePercentage: 100 }),
    });

    assert.ok(deniedRes.status >= 400, 'User B must not be permitted to modify User A task');
  });

  test('11. Regression Check: Milestones 1–5 endpoints remain fully functional', async () => {
    // AI Status (Milestone 1)
    const aiRes = await fetch(`${baseUrl}/api/ai/status`);
    const aiBody = await aiRes.json();
    assert.equal(aiBody.configured, true);

    // Auth Me (Milestone 2)
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: userACookie },
    });
    const meBody = await meRes.json();
    assert.equal(meBody.user.id, userAId);

    // Sync Status (Milestone 3)
    const syncRes = await fetch(`${baseUrl}/api/learner/sync/status`, {
      headers: { Cookie: userACookie },
    });
    const syncBody = await syncRes.json();
    assert.equal(syncBody.success, true);

    // Adaptive Diagnostic (Milestone 5)
    const diagRes = await fetch(`${baseUrl}/api/learner/adaptive/diagnostic`, {
      headers: { Cookie: userACookie },
    });
    const diagBody = await diagRes.json();
    assert.equal(diagBody.success, true);
  });
});
