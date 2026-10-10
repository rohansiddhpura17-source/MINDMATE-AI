/**
 * MindMate Evidence-Based Learning Insights Engine
 *
 * Mines deterministic patterns over actual learner study records:
 * - Repeated errors on a skill/topic
 * - Topics with persistently low mastery estimates (knowledge gaps)
 * - Meaningful performance changes (improvement or decline) across comparable attempts
 * - Overdue spaced repetition reviews
 * - Topics not practiced recently (retention decay)
 * - Calibrating topics with insufficient evidence
 * - Sustained proficiency milestones (strong foundations)
 *
 * Strict Pedagogical Science Standards:
 * - Explicit sample bounds, comparison windows, and statistical limitations
 * - No speculative psychological claims (no 'fatigue', 'low motivation', 'learning style')
 * - Direct, actionable links to practice quizzes, documents, or planner tasks
 * - 1-Click scheduling into the study planner
 */

import { prisma } from '../db.js';
import { calculateBetaMastery, classifyConfidence, ConfidenceLevel } from './masteryModel.js';

export type InsightType = 'mistake' | 'behavior' | 'mastery' | 'info';

export type InsightPattern =
  | 'REPEATED_MISTAKES'
  | 'KNOWLEDGE_GAP'
  | 'SUSTAINED_IMPROVEMENT'
  | 'PERFORMANCE_DECLINE'
  | 'OVERDUE_REVIEW'
  | 'RECENCY_DECAY'
  | 'CALIBRATION_NEEDED'
  | 'STRONG_FOUNDATION';

export type EvidenceCertainty =
  | 'HIGH_CERTAINTY'
  | 'MODERATE'
  | 'PRELIMINARY_EVIDENCE'
  | 'INSUFFICIENT_DATA';

export interface InsightEvidence {
  attemptCount: number;
  correctCount: number;
  accuracyPct: number;
  timeframe: string;
  baselineAccuracy?: number;
  recentAccuracy?: number;
  scoreDelta?: number;
  daysOverdue?: number;
  daysInactive?: number;
  evidenceLevel: EvidenceCertainty;
  sampleSufficiencyDescription: string;
}

export interface LearnerInsight {
  id: string;
  pattern: InsightPattern;
  type: InsightType;
  title: string;
  topicId: string;
  topicName: string;
  description: string;
  evidence: InsightEvidence;
  pedagogicalRationale: string;
  recommendation: string;
  actionUrl: string;
  actionLabel: string;
  suggestedTaskType: 'PRACTICE' | 'REVIEW' | 'QUIZ' | 'DOCUMENT_STUDY';
  createdAt: string;
}

export interface InsightsResponse {
  userId: string;
  insights: LearnerInsight[];
  metrics: {
    totalInsights: number;
    urgentCount: number;
    gapsCount: number;
    improvementsCount: number;
    calibrationsCount: number;
  };
  emptyStateReason?: string;
  generatedAt: string;
}

/**
 * Standard known topics in curriculum.
 */
const CURRICULUM_TOPICS: Array<{ id: string; name: string }> = [
  { id: 'python-funcs', name: 'Python Functions & Scope' },
  { id: 'oop-basics', name: 'Object-Oriented Programming (OOP)' },
  { id: 'web-basics', name: 'Web & API Fundamentals' },
  { id: 'dsa-arrays', name: 'Data Structures & Algorithms' },
  { id: 'db-sql', name: 'Database Queries & SQL' },
];

/**
 * Formats date range in readable English (e.g. "Oct 4 – Oct 10, 2026").
 */
function formatDateRange(startDate: Date, endDate: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const s = startDate.toLocaleDateString('en-US', opts);
  const e = endDate.toLocaleDateString('en-US', opts);
  return s === e ? s : `${s} – ${e}`;
}

/**
 * Generates deterministic insights from authentic learner records.
 */
export async function generateLearnerInsights(userId: string): Promise<InsightsResponse> {
  const now = new Date();

  // 1. Fetch user data concurrently
  const [progressList, quizAttempts, spacedItems, materials] = await Promise.all([
    prisma.learnerProgress.findMany({
      where: { userId },
    }),
    prisma.quizAttempt.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.spacedRepetitionItem.findMany({
      where: { userId },
    }),
    prisma.learningMaterial.findMany({
      where: { userId },
      select: { id: true, name: true },
    }),
  ]);

  const insights: LearnerInsight[] = [];

  // Edge case: Learner has zero recorded attempts
  if (quizAttempts.length === 0 && progressList.length === 0) {
    return {
      userId,
      insights: [],
      metrics: {
        totalInsights: 0,
        urgentCount: 0,
        gapsCount: 0,
        improvementsCount: 0,
        calibrationsCount: 0,
      },
      emptyStateReason:
        'No study records found. Complete at least 1-3 diagnostic quiz sessions to generate evidence-backed insights.',
      generatedAt: now.toISOString(),
    };
  }

  // 2. Index data by topic
  const attemptsByTopic = new Map<string, typeof quizAttempts>();
  for (const q of quizAttempts) {
    if (!attemptsByTopic.has(q.topicId)) {
      attemptsByTopic.set(q.topicId, []);
    }
    attemptsByTopic.get(q.topicId)!.push(q);
  }

  const progressByTopic = new Map<string, (typeof progressList)[0]>();
  for (const p of progressList) {
    progressByTopic.set(p.topicId, p);
  }

  const spacedByTopic = new Map<string, (typeof spacedItems)[0]>();
  for (const s of spacedItems) {
    spacedByTopic.set(s.topicId, s);
  }

  // Collect all topic IDs
  const allTopicIds = new Set<string>();
  for (const c of CURRICULUM_TOPICS) allTopicIds.add(c.id);
  for (const p of progressList) allTopicIds.add(p.topicId);
  for (const q of quizAttempts) allTopicIds.add(q.topicId);

  // 3. Pattern Mining per topic
  for (const topicId of allTopicIds) {
    const prog = progressByTopic.get(topicId);
    const attempts = attemptsByTopic.get(topicId) || [];
    const spaced = spacedByTopic.get(topicId);

    const curriculumMatch = CURRICULUM_TOPICS.find((c) => c.id === topicId);
    const topicName = prog?.topicName || attempts[0]?.topicName || curriculumMatch?.name || topicId;

    const totalAttempts = prog ? prog.attemptCount : attempts.reduce((sum, a) => sum + a.totalQuestions, 0);
    const correctCount = prog ? prog.correctCount : attempts.reduce((sum, a) => sum + a.correctAnswers, 0);
    const accuracyPct = totalAttempts > 0 ? Math.round((correctCount / totalAttempts) * 100) : 0;
    const masteryScore = totalAttempts > 0 ? calculateBetaMastery(correctCount, totalAttempts) : 50;

    const sortedAttemptsAsc = [...attempts].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const firstDate = sortedAttemptsAsc.length > 0 ? sortedAttemptsAsc[0].createdAt : now;
    const lastDate = sortedAttemptsAsc.length > 0 ? sortedAttemptsAsc[sortedAttemptsAsc.length - 1].createdAt : now;
    const timeframeStr = sortedAttemptsAsc.length > 0 ? formatDateRange(firstDate, lastDate) : 'Recently';

    // -------------------------------------------------------------
    // PATTERN 1: OVERDUE SPACED REPETITION REVIEW (Top Urgency)
    // -------------------------------------------------------------
    if (spaced && spaced.nextReviewAt.getTime() <= now.getTime()) {
      const daysOverdue = Math.max(
        1,
        Math.floor((now.getTime() - spaced.nextReviewAt.getTime()) / (1000 * 60 * 60 * 24))
      );

      insights.push({
        id: `insight-overdue-${topicId}`,
        pattern: 'OVERDUE_REVIEW',
        type: 'behavior',
        title: `Spaced Review Overdue (${daysOverdue}d): ${topicName}`,
        topicId,
        topicName,
        description: `Scheduled retention review for "${topicName}" is overdue by ${daysOverdue} day${daysOverdue === 1 ? '' : 's'}. SuperMemo SM-2 memory interval has elapsed.`,
        evidence: {
          attemptCount: spaced.totalReviews,
          correctCount: spaced.repetitionNumber,
          accuracyPct: Math.round((spaced.repetitionNumber / Math.max(1, spaced.totalReviews)) * 100),
          timeframe: `Scheduled for ${spaced.nextReviewAt.toLocaleDateString('en-US')}`,
          daysOverdue,
          evidenceLevel: 'HIGH_CERTAINTY',
          sampleSufficiencyDescription: `Deterministic SM-2 interval boundary (${spaced.intervalDays} day${spaced.intervalDays === 1 ? '' : 's'}, ease factor ${spaced.easeFactor}).`,
        },
        pedagogicalRationale:
          'Ebbinghaus forgetting curve modeling demonstrates rapid retention decay when spaced recall intervals are missed. Immediate review restores the memory trace.',
        recommendation: `Complete a 15-minute spaced review session to reset your retention interval.`,
        actionUrl: `/practice/quiz?topic=${topicId}`,
        actionLabel: 'Start Spaced Review',
        suggestedTaskType: 'REVIEW',
        createdAt: now.toISOString(),
      });
    }

    // -------------------------------------------------------------
    // PATTERN 2: REPEATED ERRORS ON SKILL / TOPIC
    // -------------------------------------------------------------
    // Condition: At least 3 attempts recorded, AND either:
    // a) consecutive errors >= 2, or
    // b) last 2 attempts scored < 60%, or
    // c) total accuracy < 50%
    const recentAttempts = attempts.slice(0, 3);
    const hasConsecutiveErrors = prog && prog.consecutiveIncorrect >= 2;
    const hasRecentLowScores =
      recentAttempts.length >= 2 && recentAttempts.every((a) => a.score < 60);

    if (totalAttempts >= 3 && (hasConsecutiveErrors || hasRecentLowScores || (totalAttempts >= 5 && accuracyPct < 50))) {
      const errorCount = totalAttempts - correctCount;
      const errorRate = Math.round((errorCount / totalAttempts) * 100);
      const isHighCertainty = totalAttempts >= 6;

      insights.push({
        id: `insight-errors-${topicId}`,
        pattern: 'REPEATED_MISTAKES',
        type: 'mistake',
        title: `Repeated Errors Pattern: ${topicName}`,
        topicId,
        topicName,
        description: `Persistent errors observed in "${topicName}". ${errorCount} incorrect responses across ${totalAttempts} attempts (${errorRate}% error rate).`,
        evidence: {
          attemptCount: totalAttempts,
          correctCount,
          accuracyPct,
          timeframe: timeframeStr,
          evidenceLevel: isHighCertainty ? 'HIGH_CERTAINTY' : 'MODERATE',
          sampleSufficiencyDescription: `Based on ${totalAttempts} total attempts across ${attempts.length} quiz session${attempts.length === 1 ? '' : 's'}.`,
        },
        pedagogicalRationale:
          'Repeated misconceptions can fossilize without prompt diagnostic intervention. Scaffolding concepts with Easy difficulty breaks the error loop.',
        recommendation: `Engage in targeted adaptive remediation at Easy difficulty to reinforce foundational rules before tackling complex scenarios.`,
        actionUrl: `/practice/quiz?topic=${topicId}`,
        actionLabel: 'Practice Weak Concepts',
        suggestedTaskType: 'PRACTICE',
        createdAt: now.toISOString(),
      });
    }

    // -------------------------------------------------------------
    // PATTERN 3: CRITICAL KNOWLEDGE GAP (Persistently Low Mastery)
    // -------------------------------------------------------------
    // Condition: Beta-Binomial mastery < 50% with at least 3 attempts (preventing false alarms on unassessed topics)
    if (totalAttempts >= 3 && masteryScore < 50 && !insights.some((i) => i.id === `insight-errors-${topicId}`)) {
      insights.push({
        id: `insight-gap-${topicId}`,
        pattern: 'KNOWLEDGE_GAP',
        type: 'mistake',
        title: `Knowledge Gap Identified: ${topicName}`,
        topicId,
        topicName,
        description: `Bayesian mastery estimate is ${masteryScore}% (${accuracyPct}% empirical accuracy over ${totalAttempts} attempts). Significant gap from target proficiency.`,
        evidence: {
          attemptCount: totalAttempts,
          correctCount,
          accuracyPct,
          timeframe: timeframeStr,
          evidenceLevel: totalAttempts >= 7 ? 'HIGH_CERTAINTY' : 'MODERATE',
          sampleSufficiencyDescription: `Empirical Beta-Binomial posterior with prior weight 4. Confidence level is ${classifyConfidence(totalAttempts).level}.`,
        },
        pedagogicalRationale:
          'Mastery deficit indicates missing conceptual building blocks. Targeted practice with immediate step-by-step explanations produces highest remediation gains.',
        recommendation: `Schedule focused practice sessions to bridge this knowledge gap.`,
        actionUrl: `/practice/quiz?topic=${topicId}`,
        actionLabel: 'Close Knowledge Gap',
        suggestedTaskType: 'PRACTICE',
        createdAt: now.toISOString(),
      });
    }

    // -------------------------------------------------------------
    // PATTERN 4: SUSTAINED PERFORMANCE IMPROVEMENT
    // -------------------------------------------------------------
    // Condition: At least 4 attempts in topic, split into baseline vs recent window,
    // where recent window is at least +15% higher.
    if (attempts.length >= 4) {
      const sorted = [...attempts].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const mid = Math.floor(sorted.length / 2);
      const baseline = sorted.slice(0, mid);
      const recent = sorted.slice(mid);

      const baselineAvg = Math.round(baseline.reduce((sum, a) => sum + a.score, 0) / baseline.length);
      const recentAvg = Math.round(recent.reduce((sum, a) => sum + a.score, 0) / recent.length);
      const delta = recentAvg - baselineAvg;

      if (delta >= 15) {
        const isHighCertainty = sorted.length >= 6;
        insights.push({
          id: `insight-improvement-${topicId}`,
          pattern: 'SUSTAINED_IMPROVEMENT',
          type: 'mastery',
          title: `Demonstrated Growth (+${delta}%): ${topicName}`,
          topicId,
          topicName,
          description: `Clear performance upward trajectory in "${topicName}". Accuracy progressed from ${baselineAvg}% baseline to ${recentAvg}% in recent sessions.`,
          evidence: {
            attemptCount: sorted.length,
            correctCount,
            accuracyPct,
            timeframe: `${formatDateRange(baseline[0].createdAt, recent[recent.length - 1].createdAt)}`,
            baselineAccuracy: baselineAvg,
            recentAccuracy: recentAvg,
            scoreDelta: delta,
            evidenceLevel: isHighCertainty ? 'HIGH_CERTAINTY' : 'MODERATE',
            sampleSufficiencyDescription: `Compared ${baseline.length} earlier sessions (${baselineAvg}%) against ${recent.length} recent sessions (${recentAvg}%).`,
          },
          pedagogicalRationale:
            'Positive transfer and concept consolidation observed. Sustained improvement signals readiness to progress to higher cognitive challenge levels.',
          recommendation: `Consolidate your gains by attempting Hard difficulty questions or spaced review.`,
          actionUrl: `/practice/quiz?topic=${topicId}`,
          actionLabel: 'Take Challenge Quiz',
          suggestedTaskType: 'QUIZ',
          createdAt: now.toISOString(),
        });
      }

      // -----------------------------------------------------------
      // PATTERN 5: MEANINGFUL PERFORMANCE DECLINE
      // -----------------------------------------------------------
      // Baseline was >= 70%, but recent dropped by >= 20%
      if (baselineAvg >= 70 && delta <= -20) {
        insights.push({
          id: `insight-decline-${topicId}`,
          pattern: 'PERFORMANCE_DECLINE',
          type: 'behavior',
          title: `Recent Score Drop (${delta}%): ${topicName}`,
          topicId,
          topicName,
          description: `Recent accuracy dropped from ${baselineAvg}% to ${recentAvg}% across comparable study sessions.`,
          evidence: {
            attemptCount: sorted.length,
            correctCount,
            accuracyPct,
            timeframe: `${formatDateRange(baseline[0].createdAt, recent[recent.length - 1].createdAt)}`,
            baselineAccuracy: baselineAvg,
            recentAccuracy: recentAvg,
            scoreDelta: delta,
            evidenceLevel: 'MODERATE',
            sampleSufficiencyDescription: `Window of ${recent.length} recent sessions compared to ${baseline.length} baseline sessions. Note: Question difficulty or specific edge cases may account for score variance.`,
          },
          pedagogicalRationale:
            'Performance drops often reflect newly introduced advanced nuances rather than regression. Re-verifying core principles eliminates confusion.',
          recommendation: `Review recent mistakes to distinguish conceptual uncertainty from complex problem variants.`,
          actionUrl: `/practice/quiz?topic=${topicId}`,
          actionLabel: 'Review Topic Mistakes',
          suggestedTaskType: 'PRACTICE',
          createdAt: now.toISOString(),
        });
      }
    }

    // -------------------------------------------------------------
    // PATTERN 6: RECENCY DECAY (Inactive Topic with Prior Mastery)
    // -------------------------------------------------------------
    if (prog && prog.attemptCount >= 3 && masteryScore >= 60) {
      const daysInactive = Math.floor((now.getTime() - prog.lastPracticed.getTime()) / (1000 * 60 * 60 * 24));
      if (daysInactive >= 7 && !insights.some((i) => i.topicId === topicId && i.pattern === 'OVERDUE_REVIEW')) {
        insights.push({
          id: `insight-decay-${topicId}`,
          pattern: 'RECENCY_DECAY',
          type: 'behavior',
          title: `Dormant Topic (${daysInactive}d Idle): ${topicName}`,
          topicId,
          topicName,
          description: `You achieved ${masteryScore}% mastery in "${topicName}", but have not practiced it in ${daysInactive} days.`,
          evidence: {
            attemptCount: totalAttempts,
            correctCount,
            accuracyPct,
            timeframe: `Last practiced on ${prog.lastPracticed.toLocaleDateString('en-US')}`,
            daysInactive,
            evidenceLevel: 'MODERATE',
            sampleSufficiencyDescription: `Last practiced ${daysInactive} days ago. Prior mastery estimate: ${masteryScore}%.`,
          },
          pedagogicalRationale:
            'Active recall intervals maintain neural pathway strength. Periodic refresher quizzes halt forgetting curve deterioration.',
          recommendation: `Complete a quick 5-question refresher to keep this topic sharp.`,
          actionUrl: `/practice/quiz?topic=${topicId}`,
          actionLabel: 'Quick Refresher Quiz',
          suggestedTaskType: 'PRACTICE',
          createdAt: now.toISOString(),
        });
      }
    }

    // -------------------------------------------------------------
    // PATTERN 7: UNCALIBRATED / INSUFFICIENT EVIDENCE TOPIC
    // -------------------------------------------------------------
    if (totalAttempts > 0 && totalAttempts < 3) {
      insights.push({
        id: `insight-calib-${topicId}`,
        pattern: 'CALIBRATION_NEEDED',
        type: 'info',
        title: `Calibration Needed (${totalAttempts}/3 attempts): ${topicName}`,
        topicId,
        topicName,
        description: `Only ${totalAttempts} question${totalAttempts === 1 ? '' : 's'} answered for "${topicName}". Statistically insufficient to establish reliable ability.`,
        evidence: {
          attemptCount: totalAttempts,
          correctCount,
          accuracyPct,
          timeframe: timeframeStr,
          evidenceLevel: 'INSUFFICIENT_DATA',
          sampleSufficiencyDescription: `Sample size ${totalAttempts} is below the empirical threshold (minimum 3 attempts required for initial low-confidence estimate).`,
        },
        pedagogicalRationale:
          'Small sample sizes produce high estimator variance. Answering 3-5 diagnostic questions allows the Bayesian model to converge.',
        recommendation: `Complete a short diagnostic quiz to calibrate your ability level.`,
        actionUrl: `/practice/quiz?topic=${topicId}`,
        actionLabel: 'Calibrate Topic',
        suggestedTaskType: 'PRACTICE',
        createdAt: now.toISOString(),
      });
    }

    // -------------------------------------------------------------
    // PATTERN 8: DEMONSTRATED STRENGTH / MASTERY FOUNDATION
    // -------------------------------------------------------------
    if (totalAttempts >= 7 && masteryScore >= 80 && accuracyPct >= 75) {
      insights.push({
        id: `insight-strength-${topicId}`,
        pattern: 'STRONG_FOUNDATION',
        type: 'mastery',
        title: `Demonstrated Mastery (${masteryScore}%): ${topicName}`,
        topicId,
        topicName,
        description: `Strong conceptual proficiency in "${topicName}" verified across ${totalAttempts} questions with ${accuracyPct}% accuracy.`,
        evidence: {
          attemptCount: totalAttempts,
          correctCount,
          accuracyPct,
          timeframe: timeframeStr,
          evidenceLevel: totalAttempts >= 15 ? 'HIGH_CERTAINTY' : 'MODERATE',
          sampleSufficiencyDescription: `Substantial evidence base (${totalAttempts} attempts, ${correctCount} correct). Confidence: ${classifyConfidence(totalAttempts).level}.`,
        },
        pedagogicalRationale:
          'Concept mastery demonstrated. Moving from foundational drills to synthesis and hard challenges accelerates domain expertise.',
        recommendation: `Maintain retention via scheduled spaced repetition, or advance to project-based application.`,
        actionUrl: `/practice/quiz?topic=${topicId}`,
        actionLabel: 'Hard Difficulty Challenge',
        suggestedTaskType: 'QUIZ',
        createdAt: now.toISOString(),
      });
    }
  }

  // 4. Sort insights by pedagogical urgency
  const PRIORITY_ORDER: Record<InsightPattern, number> = {
    OVERDUE_REVIEW: 1,
    REPEATED_MISTAKES: 2,
    KNOWLEDGE_GAP: 3,
    PERFORMANCE_DECLINE: 4,
    RECENCY_DECAY: 5,
    SUSTAINED_IMPROVEMENT: 6,
    CALIBRATION_NEEDED: 7,
    STRONG_FOUNDATION: 8,
  };

  insights.sort((a, b) => PRIORITY_ORDER[a.pattern] - PRIORITY_ORDER[b.pattern]);

  const metrics = {
    totalInsights: insights.length,
    urgentCount: insights.filter((i) => i.pattern === 'OVERDUE_REVIEW' || i.pattern === 'REPEATED_MISTAKES').length,
    gapsCount: insights.filter((i) => i.pattern === 'KNOWLEDGE_GAP').length,
    improvementsCount: insights.filter((i) => i.pattern === 'SUSTAINED_IMPROVEMENT' || i.pattern === 'STRONG_FOUNDATION').length,
    calibrationsCount: insights.filter((i) => i.pattern === 'CALIBRATION_NEEDED').length,
  };

  return {
    userId,
    insights,
    metrics,
    generatedAt: now.toISOString(),
  };
}

/**
 * 1-Click scheduling of an insight recommendation directly into the user's Study Plan.
 */
export async function scheduleInsightAsTask(
  userId: string,
  insightId: string,
  targetDate?: string
): Promise<{ success: boolean; task: any; message: string }> {
  // Generate insights to find the matching one
  const { insights } = await generateLearnerInsights(userId);
  const matched = insights.find((i) => i.id === insightId);

  if (!matched) {
    throw new Error('Insight not found or no longer active');
  }

  const now = new Date();
  const dateStr =
    targetDate ||
    new Date(now.getTime() + 86400000).toISOString().split('T')[0]; // Default tomorrow

  const dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(dateStr).getDay()];

  // Check if identical uncompleted task already exists on that date
  const existing = await prisma.studyTask.findFirst({
    where: {
      userId,
      date: dateStr,
      topicId: matched.topicId,
      type: matched.suggestedTaskType,
      isCompleted: false,
    },
  });

  if (existing) {
    return {
      success: true,
      task: existing,
      message: `Activity is already scheduled for ${dateStr} in your study planner.`,
    };
  }

  const createdTask = await prisma.studyTask.create({
    data: {
      userId,
      date: dateStr,
      dayOfWeek,
      topicId: matched.topicId,
      topicName: matched.topicName,
      type: matched.suggestedTaskType,
      title: `${matched.suggestedTaskType === 'REVIEW' ? 'Review' : 'Practice'}: ${matched.topicName}`,
      estimatedMinutes: 15,
      targetDifficulty: matched.pattern === 'REPEATED_MISTAKES' ? 'easy' : 'medium',
      isCompleted: false,
      priorityScore: 0.85,
      recommendationReason: matched.description,
      source: 'ALGORITHM',
      actionUrl: matched.actionUrl,
    },
  });

  return {
    success: true,
    task: createdTask,
    message: `Scheduled "${createdTask.title}" on ${dateStr} in your study planner.`,
  };
}
