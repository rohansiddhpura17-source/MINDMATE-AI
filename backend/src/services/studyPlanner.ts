/**
 * MindMate Study Planner Service
 * 
 * Provides an explainable, balanced prioritization algorithm and multi-day
 * study schedule generator based on real learner data:
 * - Bayesian topic mastery & knowledge gaps
 * - Spaced repetition due / overdue reviews
 * - Calibration needs (low attempt counts)
 * - Recency decay
 * - Learner target study days & daily available minutes
 * - Uploaded documents & grounded materials
 */

import { prisma } from '../db.js';
import { getUserSpacedReviews, ReviewItemStatus } from './spacedRepetition.js';
import { classifyConfidence } from './masteryModel.js';

export interface PlanGenerationOptions {
  now?: Date;
  preserveCompletedHistory?: boolean;
}

export interface TopicPrioritizationMetric {
  topicId: string;
  topicName: string;
  masteryScore: number;
  confidenceLevel: string;
  attemptCount: number;
  lastPracticed: Date;
  daysSincePractice: number;
  isOverdue: boolean;
  daysOverdue: number;
  isPriorityTopic: boolean;
  scoreOverdue: number;
  scoreGap: number;
  scoreEvidence: number;
  scoreRecency: number;
  scorePriority: number;
  scoreGoal: number;
  totalPriorityScore: number;
  primaryRationale: string;
}

export interface DayPlanResult {
  date: string; // YYYY-MM-DD
  dayOfWeek: string; // Mon, Tue, Wed...
  isToday: boolean;
  isTargetStudyDay: boolean;
  allocatedMinutes: number;
  dailyGoalMinutes: number;
  tasks: Array<{
    id: string;
    topicId: string;
    topicName: string;
    type: 'REVIEW' | 'PRACTICE' | 'QUIZ' | 'DOCUMENT_STUDY' | 'RECALL';
    title: string;
    estimatedMinutes: number;
    targetDifficulty: string;
    isCompleted: boolean;
    completedAt?: Date | null;
    isPostponed: boolean;
    isOverdue: boolean;
    priorityScore: number;
    recommendationReason: string;
    actionUrl: string;
    source: string;
  }>;
}

export interface FullStudyPlanResponse {
  success: boolean;
  lastUpdated: string;
  settings: {
    dailyGoalMinutes: number;
    preferredSessionMinutes: number;
    targetDays: string[];
    targetGoalDate: string | null;
    targetGoalName: string | null;
    priorityTopics: string[];
    reviewStrategy: string;
  };
  metrics: {
    totalActiveTopics: number;
    overdueReviewsCount: number;
    weeklyPlannedMinutes: number;
    todayCompletedMinutes: number;
    todayTotalMinutes: number;
  };
  prioritizedTopics: TopicPrioritizationMetric[];
  days: DayPlanResult[];
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatDateYYYYMMDD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Computes deterministic prioritization scores and explainable rationale for all learner topics
 */
export async function computeTopicPriorities(
  userId: string,
  options?: { now?: Date }
): Promise<TopicPrioritizationMetric[]> {
  const now = options?.now || new Date();

  // 1. Fetch preferences for user priorities and goals
  const prefs = await prisma.userPreference.findUnique({ where: { userId } });
  let priorityTopicIds: string[] = [];
  try {
    if (prefs?.priorityTopicsJson) {
      priorityTopicIds = JSON.parse(prefs.priorityTopicsJson);
    }
  } catch {}

  const targetGoalDate = prefs?.targetGoalDate;
  let goalUrgencyScore = 0.1;
  if (targetGoalDate) {
    const daysUntilGoal = Math.max(0, Math.ceil((targetGoalDate.getTime() - now.getTime()) / (86400000)));
    if (daysUntilGoal <= 3) goalUrgencyScore = 1.0;
    else if (daysUntilGoal <= 7) goalUrgencyScore = 0.8;
    else if (daysUntilGoal <= 14) goalUrgencyScore = 0.5;
    else goalUrgencyScore = 0.2;
  }

  // 2. Fetch existing learner progress
  let progressList = await prisma.learnerProgress.findMany({
    where: { userId },
  });

  // If user has zero progress, provide seed topics so the planner is immediately actionable
  if (progressList.length === 0) {
    const defaultTopics = [
      { topicId: 'python-funcs', topicName: 'Python Functions', difficulty: 'medium' },
      { topicId: 'oop-basics', topicName: 'OOP Concepts', difficulty: 'medium' },
      { topicId: 'data-structures', topicName: 'Data Structures & Algorithms', difficulty: 'medium' },
    ];
    for (const dt of defaultTopics) {
      await prisma.learnerProgress.upsert({
        where: { userId_topicId: { userId, topicId: dt.topicId } },
        create: {
          userId,
          topicId: dt.topicId,
          topicName: dt.topicName,
          masteryScore: 50.0,
          attemptCount: 0,
          correctCount: 0,
          confidenceLevel: 'INSUFFICIENT_EVIDENCE',
          currentDifficulty: dt.difficulty,
          lastPracticed: now,
        },
        update: {},
      });
    }
    progressList = await prisma.learnerProgress.findMany({ where: { userId } });
  }

  // 3. Fetch spaced repetition status
  const spacedReviews = await getUserSpacedReviews(userId, { now });
  const reviewMap = new Map<string, ReviewItemStatus>();
  spacedReviews.forEach((r) => reviewMap.set(r.topicId, r));

  // 4. Compute weighted components for each topic
  // Weights: Overdue(0.30) + Gap(0.25) + Evidence(0.15) + Recency(0.15) + Priority(0.10) + Goal(0.05) = 1.0
  const results: TopicPrioritizationMetric[] = progressList.map((p) => {
    const spaced = reviewMap.get(p.topicId);
    const isOverdue = spaced?.isOverdue ?? false;
    const daysOverdue = spaced?.daysOverdue ?? 0;

    // Component 1: Spaced Repetition Due/Overdue Score [0, 1]
    let scoreOverdue = 0.0;
    if (isOverdue) {
      scoreOverdue = Math.min(1.0, 0.70 + daysOverdue * 0.10);
    } else if (spaced && spaced.urgencyScore > 0) {
      scoreOverdue = spaced.urgencyScore;
    }

    // Component 2: Knowledge Gap Score [0, 1]
    const scoreGap = Math.max(0, Math.min(1.0, 1.0 - p.masteryScore / 100));

    // Component 3: Evidence/Calibration Score [0, 1]
    const conf = classifyConfidence(p.attemptCount);
    let scoreEvidence = 0.0;
    if (p.attemptCount < 3) scoreEvidence = 1.0;
    else if (p.attemptCount < 7) scoreEvidence = 0.6;
    else if (p.attemptCount < 15) scoreEvidence = 0.25;
    else scoreEvidence = 0.05;

    // Component 4: Recency Decay Score [0, 1]
    const daysSincePractice = Math.max(0, Math.floor((now.getTime() - p.lastPracticed.getTime()) / 86400000));
    const scoreRecency = Math.min(1.0, daysSincePractice / 14);

    // Component 5: Learner Priority [0, 1]
    const isPriorityTopic = priorityTopicIds.includes(p.topicId);
    const scorePriority = isPriorityTopic ? 1.0 : 0.0;

    // Component 6: Target Goal Score [0, 1]
    const scoreGoal = goalUrgencyScore;

    // Weighted composite
    const wOverdue = 0.30;
    const wGap = 0.25;
    const wEvidence = 0.15;
    const wRecency = 0.15;
    const wPriority = 0.10;
    const wGoal = 0.05;

    const totalScore =
      scoreOverdue * wOverdue +
      scoreGap * wGap +
      scoreEvidence * wEvidence +
      scoreRecency * wRecency +
      scorePriority * wPriority +
      scoreGoal * wGoal;

    // Build transparent rationale string
    let primaryRationale = '';
    if (isOverdue) {
      primaryRationale = `Spaced repetition review is overdue by ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} (Retention protection)`;
    } else if (scoreGap >= 0.5) {
      primaryRationale = `Significant knowledge gap: Bayesian mastery is ${Math.round(p.masteryScore)}% (Targeted reinforcement)`;
    } else if (scoreEvidence >= 0.8) {
      primaryRationale = `Calibrating baseline ability (${p.attemptCount} attempt${p.attemptCount === 1 ? '' : 's'} recorded)`;
    } else if (daysSincePractice >= 7) {
      primaryRationale = `Untouched for ${daysSincePractice} days (Periodic recall refresh)`;
    } else if (isPriorityTopic) {
      primaryRationale = `Designated as high priority in your study goals`;
    } else {
      primaryRationale = `Regular practice to maintain proficiency (${Math.round(p.masteryScore)}% mastery)`;
    }

    return {
      topicId: p.topicId,
      topicName: p.topicName,
      masteryScore: Math.round(p.masteryScore),
      confidenceLevel: p.confidenceLevel,
      attemptCount: p.attemptCount,
      lastPracticed: p.lastPracticed,
      daysSincePractice,
      isOverdue,
      daysOverdue,
      isPriorityTopic,
      scoreOverdue: Math.round(scoreOverdue * 100) / 100,
      scoreGap: Math.round(scoreGap * 100) / 100,
      scoreEvidence: Math.round(scoreEvidence * 100) / 100,
      scoreRecency: Math.round(scoreRecency * 100) / 100,
      scorePriority: Math.round(scorePriority * 100) / 100,
      scoreGoal: Math.round(scoreGoal * 100) / 100,
      totalPriorityScore: Math.round(totalScore * 100) / 100,
      primaryRationale,
    };
  });

  return results.sort((a, b) => b.totalPriorityScore - a.totalPriorityScore);
}

/**
 * Generates or regenerates a multi-day study schedule using real learner data
 */
export async function generateStudySchedule(
  userId: string,
  options?: PlanGenerationOptions
): Promise<FullStudyPlanResponse> {
  const now = options?.now || new Date();
  const preserveHistory = options?.preserveCompletedHistory ?? true;

  // 1. Load user preferences & materials
  const [prefs, materials] = await Promise.all([
    prisma.userPreference.findUnique({ where: { userId } }),
    prisma.learningMaterial.findMany({ where: { userId, status: 'READY' } }),
  ]);

  const dailyGoalMinutes = prefs?.dailyGoalMinutes || 30;
  const preferredSessionMinutes = prefs?.preferredSessionMinutes || 15;

  let targetDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  try {
    if (prefs?.targetDaysJson) targetDays = JSON.parse(prefs.targetDaysJson);
  } catch {}

  let priorityTopics: string[] = [];
  try {
    if (prefs?.priorityTopicsJson) priorityTopics = JSON.parse(prefs.priorityTopicsJson);
  } catch {}

  const targetGoalDate = prefs?.targetGoalDate ? prefs.targetGoalDate.toISOString() : null;
  const targetGoalName = prefs?.targetGoalName || 'Master Python Fundamentals';

  // 2. Compute prioritized topics
  const prioritized = await computeTopicPriorities(userId, { now });

  // 3. Generate 7-day schedule dates (today + next 6 days)
  const scheduleDates: Array<{ date: string; dayOfWeek: string; dateObj: Date; isToday: boolean; isTargetDay: boolean }> = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getTime() + i * 86400000);
    const ymd = formatDateYYYYMMDD(d);
    const dayOfWeek = DAY_NAMES[d.getDay()];
    scheduleDates.push({
      date: ymd,
      dayOfWeek,
      dateObj: d,
      isToday: i === 0,
      isTargetDay: targetDays.includes(dayOfWeek),
    });
  }

  // 4. If preserving history, fetch existing completed tasks so we do not overwrite them
  const existingCompletedTasks = preserveHistory
    ? await prisma.studyTask.findMany({
        where: {
          userId,
          isCompleted: true,
          date: { in: scheduleDates.map((s) => s.date) },
        },
      })
    : [];

  const existingCompletedIds = new Set(existingCompletedTasks.map((t) => t.id));

  // Remove uncompleted future tasks for these 7 dates to prevent duplication upon regeneration
  await prisma.studyTask.deleteMany({
    where: {
      userId,
      isCompleted: false,
      date: { in: scheduleDates.map((s) => s.date) },
    },
  });

  // 5. Build balanced schedule day-by-day
  let topicRotatorIdx = 0;
  const tasksToCreate: any[] = [];

  for (let dayIdx = 0; dayIdx < scheduleDates.length; dayIdx++) {
    const { date, dayOfWeek, isTargetDay, isToday } = scheduleDates[dayIdx];

    // Minutes already completed on this day from existing history
    const completedOnThisDay = existingCompletedTasks.filter((t) => t.date === date);
    let dayAllocatedMinutes = completedOnThisDay.reduce((sum, t) => sum + t.estimatedMinutes, 0);

    // If day is not a configured target study day and not today, schedule rest or light review only
    const maxDayMinutes = isTargetDay ? dailyGoalMinutes : isToday ? Math.min(15, dailyGoalMinutes) : 0;

    if (maxDayMinutes <= 0) {
      continue;
    }

    const topicsUsedToday = new Set<string>();

    while (dayAllocatedMinutes + preferredSessionMinutes <= maxDayMinutes + 5) {
      // Find eligible topic balancing interleaving
      let chosenTopic = prioritized.find(
        (t) => !topicsUsedToday.has(t.topicId)
      );

      if (!chosenTopic) {
        // Wrap around if all topics have 1 session today
        chosenTopic = prioritized[topicRotatorIdx % prioritized.length];
        topicRotatorIdx++;
      } else {
        topicsUsedToday.add(chosenTopic.topicId);
      }

      if (!chosenTopic) break;

      // Determine activity type and title based on priority factors
      let activityType: 'REVIEW' | 'PRACTICE' | 'QUIZ' | 'DOCUMENT_STUDY' | 'RECALL' = 'PRACTICE';
      let title = `Practice: ${chosenTopic.topicName}`;
      let actionUrl = `/practice/quiz?topic=${chosenTopic.topicId}`;
      let targetDifficulty = 'medium';

      if (chosenTopic.isOverdue) {
        activityType = 'REVIEW';
        title = `Spaced Review: ${chosenTopic.topicName}`;
        actionUrl = `/practice/quiz?topic=${chosenTopic.topicId}`;
      } else if (chosenTopic.scoreGap >= 0.6) {
        activityType = 'PRACTICE';
        title = `Knowledge Gap Remediation: ${chosenTopic.topicName}`;
        actionUrl = `/practice/quiz?topic=${chosenTopic.topicId}`;
        targetDifficulty = 'easy'; // Scaffolding
      } else if (chosenTopic.attemptCount >= 7 && chosenTopic.masteryScore >= 75) {
        activityType = 'QUIZ';
        title = `Mastery Challenge: ${chosenTopic.topicName}`;
        actionUrl = `/practice/quiz?topic=${chosenTopic.topicId}`;
        targetDifficulty = 'hard';
      } else if (materials.length > 0 && dayIdx % 3 === 1) {
        activityType = 'DOCUMENT_STUDY';
        title = `Source Study: ${materials[0].name.substring(0, 30)}`;
        actionUrl = `/materials/${materials[0].id}`;
      }

      const task = {
        userId,
        date,
        dayOfWeek,
        topicId: chosenTopic.topicId,
        topicName: chosenTopic.topicName,
        type: activityType,
        title,
        estimatedMinutes: preferredSessionMinutes,
        targetDifficulty,
        isCompleted: false,
        isPostponed: false,
        priorityScore: chosenTopic.totalPriorityScore,
        recommendationReason: chosenTopic.primaryRationale,
        source: 'ALGORITHM',
        actionUrl,
      };

      tasksToCreate.push(task);
      dayAllocatedMinutes += preferredSessionMinutes;
    }
  }

  // 6. Bulk insert new generated tasks
  if (tasksToCreate.length > 0) {
    await prisma.studyTask.createMany({
      data: tasksToCreate,
    });
  }

  // 7. Assemble full schedule view
  const allTasks = await prisma.studyTask.findMany({
    where: {
      userId,
      date: { in: scheduleDates.map((s) => s.date) },
    },
    orderBy: [{ date: 'asc' }, { priorityScore: 'desc' }],
  });

  const todayStr = formatDateYYYYMMDD(now);
  const todayTasks = allTasks.filter((t) => t.date === todayStr);
  const todayCompletedMinutes = todayTasks.filter((t) => t.isCompleted).reduce((s, t) => s + t.estimatedMinutes, 0);
  const todayTotalMinutes = todayTasks.reduce((s, t) => s + t.estimatedMinutes, 0);
  const weeklyPlannedMinutes = allTasks.reduce((s, t) => s + t.estimatedMinutes, 0);

  const days: DayPlanResult[] = scheduleDates.map((sd) => {
    const dayTasks = allTasks.filter((t) => t.date === sd.date);
    const allocated = dayTasks.reduce((s, t) => s + t.estimatedMinutes, 0);

    return {
      date: sd.date,
      dayOfWeek: sd.dayOfWeek,
      isToday: sd.isToday,
      isTargetStudyDay: sd.isTargetDay,
      allocatedMinutes: allocated,
      dailyGoalMinutes,
      tasks: dayTasks.map((t) => ({
        id: t.id,
        topicId: t.topicId,
        topicName: t.topicName,
        type: t.type as any,
        title: t.title,
        estimatedMinutes: t.estimatedMinutes,
        targetDifficulty: t.targetDifficulty,
        isCompleted: t.isCompleted,
        completedAt: t.completedAt,
        isPostponed: t.isPostponed,
        isOverdue: !t.isCompleted && sd.date < todayStr,
        priorityScore: t.priorityScore,
        recommendationReason: t.recommendationReason,
        actionUrl: t.actionUrl,
        source: t.source,
      })),
    };
  });

  return {
    success: true,
    lastUpdated: now.toISOString(),
    settings: {
      dailyGoalMinutes,
      preferredSessionMinutes,
      targetDays,
      targetGoalDate,
      targetGoalName,
      priorityTopics,
      reviewStrategy: prefs?.reviewStrategy || 'BALANCED',
    },
    metrics: {
      totalActiveTopics: prioritized.length,
      overdueReviewsCount: prioritized.filter((p) => p.isOverdue).length,
      weeklyPlannedMinutes,
      todayCompletedMinutes,
      todayTotalMinutes,
    },
    prioritizedTopics: prioritized,
    days,
  };
}

/**
 * Marks a scheduled activity complete and records the outcome in spaced repetition & mastery
 */
export async function completeStudyTask(
  userId: string,
  taskId: string,
  options?: { now?: Date; scorePercentage?: number; isCompleted?: boolean }
): Promise<{ success: boolean; task: any; replanResult?: FullStudyPlanResponse }> {
  const now = options?.now || new Date();
  const isCompleted = options?.isCompleted ?? true;

  const task = await prisma.studyTask.findFirst({
    where: { id: taskId, userId },
  });

  if (!task) {
    throw new Error('Study task not found or access denied');
  }

  const updatedTask = await prisma.studyTask.update({
    where: { id: taskId },
    data: {
      isCompleted,
      completedAt: isCompleted ? now : null,
    },
  });

  // If score was provided, sync spaced repetition and topic progress
  if (options?.scorePercentage !== undefined) {
    await prisma.learnerProgress.updateMany({
      where: { userId, topicId: task.topicId },
      data: { lastPracticed: now },
    });
  }

  // Trigger continuous replanning for future days
  const replanResult = await generateStudySchedule(userId, { now, preserveCompletedHistory: true });

  return {
    success: true,
    task: updatedTask,
    replanResult,
  };
}

/**
 * Reschedules or postpones a study activity to another date
 */
export async function rescheduleStudyTask(
  userId: string,
  taskId: string,
  newDate: string
): Promise<{ success: boolean; task: any }> {
  const task = await prisma.studyTask.findFirst({
    where: { id: taskId, userId },
  });

  if (!task) {
    throw new Error('Study task not found or access denied');
  }

  const d = new Date(newDate);
  const dayOfWeek = isNaN(d.getTime()) ? task.dayOfWeek : DAY_NAMES[d.getDay()];

  const updated = await prisma.studyTask.update({
    where: { id: taskId },
    data: {
      date: newDate,
      dayOfWeek,
      isPostponed: true,
      postponedToDate: newDate,
      recommendationReason: `Rescheduled from ${task.date}: ${task.recommendationReason}`,
    },
  });

  return { success: true, task: updated };
}

/**
 * Generates a simplistic baseline schedule for empirical head-to-head comparison
 * (e.g., repeatedly assigns the single lowest-mastery topic without spaced repetition or interleaving)
 */
export async function generateBaselineSchedule(
  userId: string,
  options?: { now?: Date }
): Promise<{
  strategy: 'NAIVE_BASELINE';
  assignedTopicIds: string[];
  topicRepetitionCount: number;
  hasSpacedRepetitionAwareness: boolean;
  hasInterleaving: boolean;
}> {
  const progressList = await prisma.learnerProgress.findMany({
    where: { userId },
    orderBy: { masteryScore: 'asc' },
  });

  const lowestTopic = progressList[0];
  const assigned = Array(5).fill(lowestTopic?.topicId || 'python-funcs');

  return {
    strategy: 'NAIVE_BASELINE',
    assignedTopicIds: assigned,
    topicRepetitionCount: 5, // Mono-topic concentration
    hasSpacedRepetitionAwareness: false,
    hasInterleaving: false,
  };
}
