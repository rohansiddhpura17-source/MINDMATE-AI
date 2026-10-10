/**
 * MindMate Learning Twin Service
 *
 * Constructs a transparent, evidence-based cognitive model of the learner from
 * authenticated ground-truth records:
 * - LearnerProgress (Beta-Binomial Bayesian mastery posterior)
 * - QuizAttempt (Raw historical quiz observations and question-level outcomes)
 * - SpacedRepetitionItem (SuperMemo SM-2 memory retention intervals and ease factors)
 * - StudyTask (Scheduled and completed study planner activities)
 * - LearningMaterial (Ingested course documents)
 *
 * Strict Architectural Separation:
 * - Measured Observations (Raw factual data: attempts, correct count, accuracy, timestamps)
 * - Model Estimates (Beta-Binomial posterior mastery %, confidence level, SM-2 interval)
 * - Pedagogical Inferences (Trend hypotheses, calibration suggestions, next steps)
 */

import { prisma } from '../db.js';
import { calculateBetaMastery, classifyConfidence, getMasteryStatus, ConfidenceLevel, MasteryStatus } from './masteryModel.js';

export interface MeasuredObservations {
  totalAttempts: number;
  correctCount: number;
  accuracyPct: number;
  lastPracticed: string | null;
  firstPracticed: string | null;
  streakDays: number;
  consecutiveCorrect: number;
  consecutiveIncorrect: number;
  totalQuizSessions: number;
}

export interface ModelEstimates {
  masteryScore: number; // Beta-Binomial posterior mean (0-100%)
  confidenceLevel: ConfidenceLevel;
  confidenceScore: number; // 0.0 to 1.0
  status: MasteryStatus;
  currentDifficulty: string; // easy | medium | hard
  spacedIntervalDays: number | null;
  spacedEaseFactor: number | null;
  isSpacedRepetitionDue: boolean;
  daysOverdue: number;
  nextReviewAt: string | null;
}

export interface TopicTrend {
  direction: 'IMPROVING' | 'DECLINING' | 'STABLE' | 'INSUFFICIENT_DATA';
  deltaScore: number;
  baselineScore: number | null;
  recentScore: number | null;
  sampleBaselineCount: number;
  sampleRecentCount: number;
  summary: string;
}

export interface TopicTwinDetail {
  topicId: string;
  topicName: string;
  isAssessed: boolean;
  measuredObservations: MeasuredObservations;
  modelEstimates: ModelEstimates;
  trend: TopicTrend;
  relevantMaterialsCount: number;
  materials: Array<{ id: string; name: string }>;
  recentQuizScores: Array<{ id: string; score: number; date: string }>;
  recommendedAction: {
    type: 'DIAGNOSTIC' | 'PRACTICE' | 'SPACED_REVIEW' | 'CHALLENGE' | 'MAINTAIN';
    title: string;
    rationale: string;
    actionUrl: string;
  };
}

export interface LearnerTwinOverview {
  totalActiveTopics: number;
  assessedTopicsCount: number;
  unassessedTopicsCount: number;
  overallMasteryPct: number; // Weighted by verified attempts
  totalQuestionsAnswered: number;
  totalCorrectAnswers: number;
  overallAccuracyPct: number;
  demonstratedStrengthsCount: number; // Mastery >= 75% with Medium/High confidence
  knowledgeGapsCount: number; // Mastery < 50% with >= 3 attempts
  uncalibratedTopicsCount: number; // 0 < attempts < 3
  overdueReviewsCount: number;
  totalStudySessionsCompleted: number;
  lastCalibratedAt: string;
  confidenceDistribution: {
    insufficient: number;
    low: number;
    medium: number;
    high: number;
  };
}

export interface LearnerTwinProfile {
  userId: string;
  learnerName: string;
  learningGoal: string | null;
  overview: LearnerTwinOverview;
  topics: TopicTwinDetail[];
  strengths: TopicTwinDetail[];
  knowledgeGaps: TopicTwinDetail[];
  calibratingTopics: TopicTwinDetail[];
  unassessedTopics: TopicTwinDetail[];
  deterministicSummary: string;
}

/**
 * Standard known topics in MindMate curriculum (to ensure comprehensive coverage).
 */
const CURRICULUM_TOPICS: Array<{ id: string; name: string }> = [
  { id: 'python-funcs', name: 'Python Functions & Scope' },
  { id: 'oop-basics', name: 'Object-Oriented Programming (OOP)' },
  { id: 'web-basics', name: 'Web & API Fundamentals' },
  { id: 'dsa-arrays', name: 'Data Structures & Algorithms' },
  { id: 'db-sql', name: 'Database Queries & SQL' },
];

/**
 * Calculates historical trend for a topic by partitioning chronological quiz attempts
 * into a baseline window and a recent window.
 */
function calculateTopicTrend(attempts: Array<{ score: number; createdAt: Date }>): TopicTrend {
  if (attempts.length < 3) {
    return {
      direction: 'INSUFFICIENT_DATA',
      deltaScore: 0,
      baselineScore: null,
      recentScore: null,
      sampleBaselineCount: attempts.length,
      sampleRecentCount: 0,
      summary: `Insufficient data (${attempts.length} attempt${attempts.length === 1 ? '' : 's'}). Need at least 3 attempts to establish a trend.`,
    };
  }

  // Sort chronologically ascending
  const sorted = [...attempts].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const mid = Math.floor(sorted.length / 2);
  const baselineAttempts = sorted.slice(0, mid);
  const recentAttempts = sorted.slice(mid);

  const baselineAvg = Math.round(
    baselineAttempts.reduce((sum, a) => sum + a.score, 0) / baselineAttempts.length
  );
  const recentAvg = Math.round(
    recentAttempts.reduce((sum, a) => sum + a.score, 0) / recentAttempts.length
  );
  const delta = recentAvg - baselineAvg;

  let direction: TopicTrend['direction'] = 'STABLE';
  let summary = `Stable performance (Baseline: ${baselineAvg}%, Recent: ${recentAvg}%, delta: ${delta > 0 ? '+' : ''}${delta}%).`;

  if (delta >= 12) {
    direction = 'IMPROVING';
    summary = `Meaningful improvement of +${delta}% (from baseline ${baselineAvg}% across ${baselineAttempts.length} attempts to ${recentAvg}% across ${recentAttempts.length} attempts).`;
  } else if (delta <= -12) {
    direction = 'DECLINING';
    summary = `Performance decline of ${delta}% (from baseline ${baselineAvg}% across ${baselineAttempts.length} attempts to ${recentAvg}% across ${recentAttempts.length} attempts). Scaffolding recommended.`;
  }

  return {
    direction,
    deltaScore: delta,
    baselineScore: baselineAvg,
    recentScore: recentAvg,
    sampleBaselineCount: baselineAttempts.length,
    sampleRecentCount: recentAttempts.length,
    summary,
  };
}

/**
 * Builds the complete, evidence-based Learning Twin profile for a given user.
 */
export async function buildLearnerTwinProfile(userId: string): Promise<LearnerTwinProfile> {
  const now = new Date();

  // 1. Fetch authenticated learner data concurrently
  const [user, progressList, quizAttempts, spacedItems, studyTasks, materials] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: { preferences: true },
    }),
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
    prisma.studyTask.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
    }),
    prisma.learningMaterial.findMany({
      where: { userId },
      select: { id: true, name: true, createdAt: true },
    }),
  ]);

  if (!user) {
    throw new Error('User not found');
  }

  // 2. Index auxiliary records by topicId
  const progressMap = new Map<string, (typeof progressList)[0]>();
  for (const p of progressList) {
    progressMap.set(p.topicId, p);
  }

  const attemptsByTopic = new Map<string, typeof quizAttempts>();
  for (const q of quizAttempts) {
    if (!attemptsByTopic.has(q.topicId)) {
      attemptsByTopic.set(q.topicId, []);
    }
    attemptsByTopic.get(q.topicId)!.push(q);
  }

  const spacedMap = new Map<string, (typeof spacedItems)[0]>();
  for (const s of spacedItems) {
    spacedMap.set(s.topicId, s);
  }

  // 3. Assemble unified set of topic IDs (Curriculum topics + any custom user topics from progress/quizzes)
  const allTopicIds = new Set<string>();
  for (const c of CURRICULUM_TOPICS) allTopicIds.add(c.id);
  for (const p of progressList) allTopicIds.add(p.topicId);
  for (const q of quizAttempts) allTopicIds.add(q.topicId);

  // 4. Construct topic-level twin details
  const topicDetails: TopicTwinDetail[] = [];

  let totalQuestionsAnswered = 0;
  let totalCorrectAnswers = 0;
  let weightedMasterySum = 0;
  let weightedMasteryAttempts = 0;

  for (const topicId of allTopicIds) {
    const prog = progressMap.get(topicId);
    const attempts = attemptsByTopic.get(topicId) || [];
    const spaced = spacedMap.get(topicId);

    // Derive topic name
    const curriculumMatch = CURRICULUM_TOPICS.find((c) => c.id === topicId);
    const topicName = prog?.topicName || attempts[0]?.topicName || curriculumMatch?.name || topicId;

    const isAssessed = (prog && prog.attemptCount > 0) || attempts.length > 0;

    // Measured observations (Ground truth)
    const totalAttempts = prog ? prog.attemptCount : attempts.reduce((sum, a) => sum + a.totalQuestions, 0);
    const correctCount = prog ? prog.correctCount : attempts.reduce((sum, a) => sum + a.correctAnswers, 0);
    const accuracyPct = totalAttempts > 0 ? Math.round((correctCount / totalAttempts) * 100) : 0;

    const sortedAttemptsAsc = [...attempts].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const firstPracticed = sortedAttemptsAsc.length > 0 ? sortedAttemptsAsc[0].createdAt.toISOString() : null;
    const lastPracticed = prog?.lastPracticed ? prog.lastPracticed.toISOString() : attempts[0]?.createdAt ? attempts[0].createdAt.toISOString() : null;

    const streakDays = prog?.streakDays ?? 0;
    const consecutiveCorrect = prog?.consecutiveCorrect ?? 0;
    const consecutiveIncorrect = prog?.consecutiveIncorrect ?? 0;
    const totalQuizSessions = attempts.length;

    totalQuestionsAnswered += totalAttempts;
    totalCorrectAnswers += correctCount;

    // Model estimates
    const masteryScore = isAssessed ? calculateBetaMastery(correctCount, totalAttempts) : 50;
    const confidence = isAssessed ? classifyConfidence(totalAttempts) : { level: 'INSUFFICIENT_EVIDENCE' as ConfidenceLevel, score: 0, description: 'No attempts recorded' };
    const status = isAssessed ? getMasteryStatus(masteryScore, confidence.level) : ('CALIBRATING' as MasteryStatus);
    const currentDifficulty = prog?.currentDifficulty || 'medium';

    if (isAssessed && totalAttempts > 0) {
      weightedMasterySum += masteryScore * totalAttempts;
      weightedMasteryAttempts += totalAttempts;
    }

    // Spaced repetition metrics
    const isSpacedRepetitionDue = spaced ? spaced.nextReviewAt.getTime() <= now.getTime() : false;
    const daysOverdue = spaced && isSpacedRepetitionDue
      ? Math.max(1, Math.floor((now.getTime() - spaced.nextReviewAt.getTime()) / (1000 * 60 * 60 * 24)))
      : 0;

    // Trend calculation
    const trend = calculateTopicTrend(attempts);

    // Recommended action based on cognitive state
    let recommendedAction: TopicTwinDetail['recommendedAction'];
    if (!isAssessed) {
      recommendedAction = {
        type: 'DIAGNOSTIC',
        title: `Initial Diagnostic: ${topicName}`,
        rationale: 'Unassessed concept. Complete 3-5 initial questions to establish your baseline ability.',
        actionUrl: `/practice/quiz?topic=${topicId}`,
      };
    } else if (isSpacedRepetitionDue) {
      recommendedAction = {
        type: 'SPACED_REVIEW',
        title: `Retention Review: ${topicName}`,
        rationale: `Spaced repetition review is overdue by ${daysOverdue} day${daysOverdue === 1 ? '' : 's'}. Review now to prevent memory decay.`,
        actionUrl: `/practice/quiz?topic=${topicId}`,
      };
    } else if (status === 'NEEDS_PRACTICE' || masteryScore < 50) {
      recommendedAction = {
        type: 'PRACTICE',
        title: `Targeted Practice: ${topicName}`,
        rationale: `Knowledge gap identified (${masteryScore}% estimated mastery). Adaptive scaffolding will reinforce foundational rules.`,
        actionUrl: `/practice/quiz?topic=${topicId}`,
      };
    } else if (confidence.level === 'INSUFFICIENT_EVIDENCE') {
      recommendedAction = {
        type: 'DIAGNOSTIC',
        title: `Calibrate Baseline: ${topicName}`,
        rationale: `Only ${totalAttempts} attempt${totalAttempts === 1 ? '' : 's'} recorded. Additional practice needed to establish a confident ability rating.`,
        actionUrl: `/practice/quiz?topic=${topicId}`,
      };
    } else if (masteryScore >= 80) {
      recommendedAction = {
        type: 'CHALLENGE',
        title: `Advanced Challenge: ${topicName}`,
        rationale: `Strong foundation demonstrated (${masteryScore}% mastery). Advance to hard problems to deepen mastery.`,
        actionUrl: `/practice/quiz?topic=${topicId}`,
      };
    } else {
      recommendedAction = {
        type: 'MAINTAIN',
        title: `Proficiency Practice: ${topicName}`,
        rationale: `Solidifying proficiency (${masteryScore}% mastery). Regular practice maintains active recall.`,
        actionUrl: `/practice/quiz?topic=${topicId}`,
      };
    }

    // Recent scores sample (max 5)
    const recentQuizScores = attempts.slice(0, 5).map((a) => ({
      id: a.id,
      score: Math.round(a.score),
      date: a.createdAt.toISOString(),
    }));

    // Materials relevant to topic
    const matchedMaterials = materials
      .filter((m) => m.name.toLowerCase().includes(topicId.replace('-', ' ')) || m.name.toLowerCase().includes(topicName.toLowerCase()))
      .slice(0, 3);

    topicDetails.push({
      topicId,
      topicName,
      isAssessed: Boolean(isAssessed),
      measuredObservations: {
        totalAttempts,
        correctCount,
        accuracyPct,
        lastPracticed,
        firstPracticed,
        streakDays,
        consecutiveCorrect,
        consecutiveIncorrect,
        totalQuizSessions,
      },
      modelEstimates: {
        masteryScore,
        confidenceLevel: confidence.level,
        confidenceScore: confidence.score,
        status,
        currentDifficulty,
        spacedIntervalDays: spaced?.intervalDays ?? null,
        spacedEaseFactor: spaced?.easeFactor ?? null,
        isSpacedRepetitionDue,
        daysOverdue,
        nextReviewAt: spaced?.nextReviewAt ? spaced.nextReviewAt.toISOString() : null,
      },
      trend,
      relevantMaterialsCount: matchedMaterials.length,
      materials: matchedMaterials,
      recentQuizScores,
      recommendedAction,
    });
  }

  // 5. Categorize topics into clear cohorts
  const assessed = topicDetails.filter((t) => t.isAssessed);
  const unassessed = topicDetails.filter((t) => !t.isAssessed);

  // Strengths: Mastery >= 75% AND confidence != INSUFFICIENT_EVIDENCE
  const strengths = assessed.filter(
    (t) => t.modelEstimates.masteryScore >= 75 && t.modelEstimates.confidenceLevel !== 'INSUFFICIENT_EVIDENCE'
  );

  // Knowledge gaps: Mastery < 50% AND attempts >= 3 (NOT just unassessed)
  const knowledgeGaps = assessed.filter(
    (t) => t.modelEstimates.masteryScore < 50 && t.measuredObservations.totalAttempts >= 3
  );

  // Calibrating topics: Assessed but attempts < 3 (insufficient evidence)
  const calibratingTopics = assessed.filter(
    (t) => t.measuredObservations.totalAttempts < 3
  );

  const overdueReviewsCount = assessed.filter((t) => t.modelEstimates.isSpacedRepetitionDue).length;
  const completedTasksCount = studyTasks.filter((t) => t.isCompleted).length;

  const overallMasteryPct = weightedMasteryAttempts > 0
    ? Math.round(weightedMasterySum / weightedMasteryAttempts)
    : 0;

  const overallAccuracyPct = totalQuestionsAnswered > 0
    ? Math.round((totalCorrectAnswers / totalQuestionsAnswered) * 100)
    : 0;

  const confidenceDistribution = {
    insufficient: assessed.filter((t) => t.modelEstimates.confidenceLevel === 'INSUFFICIENT_EVIDENCE').length,
    low: assessed.filter((t) => t.modelEstimates.confidenceLevel === 'LOW').length,
    medium: assessed.filter((t) => t.modelEstimates.confidenceLevel === 'MEDIUM').length,
    high: assessed.filter((t) => t.modelEstimates.confidenceLevel === 'HIGH').length,
  };

  const overview: LearnerTwinOverview = {
    totalActiveTopics: topicDetails.length,
    assessedTopicsCount: assessed.length,
    unassessedTopicsCount: unassessed.length,
    overallMasteryPct,
    totalQuestionsAnswered,
    totalCorrectAnswers,
    overallAccuracyPct,
    demonstratedStrengthsCount: strengths.length,
    knowledgeGapsCount: knowledgeGaps.length,
    uncalibratedTopicsCount: calibratingTopics.length,
    overdueReviewsCount,
    totalStudySessionsCompleted: completedTasksCount,
    lastCalibratedAt: now.toISOString(),
    confidenceDistribution,
  };

  // 6. Generate deterministic scientific summary
  let deterministicSummary = '';
  if (assessed.length === 0) {
    deterministicSummary = `Welcome ${user.name}! Your Learning Twin currently has no recorded practice data. Complete your first diagnostic quiz session to establish baseline ability estimates and calibrate your cognitive model.`;
  } else {
    const strengthNames = strengths.map((s) => s.topicName).join(', ');
    const gapNames = knowledgeGaps.map((g) => g.topicName).join(', ');
    const overdueNames = assessed
      .filter((t) => t.modelEstimates.isSpacedRepetitionDue)
      .map((t) => t.topicName)
      .join(', ');

    const parts: string[] = [
      `Learning Twin calibrated over ${totalQuestionsAnswered} answered questions across ${assessed.length} assessed topic${assessed.length === 1 ? '' : 's'} (${overallAccuracyPct}% empirical accuracy, ${overallMasteryPct}% weighted Bayesian mastery).`,
    ];

    if (strengths.length > 0) {
      parts.push(`Demonstrated proficiency identified in: ${strengthNames}.`);
    }

    if (knowledgeGaps.length > 0) {
      parts.push(`Primary knowledge gap remediation prioritized for: ${gapNames}.`);
    }

    if (overdueReviewsCount > 0) {
      parts.push(`Spaced repetition retention reviews currently due for: ${overdueNames}.`);
    }

    if (calibratingTopics.length > 0) {
      parts.push(`${calibratingTopics.length} topic${calibratingTopics.length === 1 ? '' : 's'} remain in preliminary calibration (under 3 attempts recorded).`);
    }

    deterministicSummary = parts.join(' ');
  }

  return {
    userId,
    learnerName: user.name,
    learningGoal: user.goal || user.preferences?.targetGoalName || 'Master Full-Stack & Python Development',
    overview,
    topics: topicDetails,
    strengths,
    knowledgeGaps,
    calibratingTopics,
    unassessedTopics: unassessed,
    deterministicSummary,
  };
}
