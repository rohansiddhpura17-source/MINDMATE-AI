/**
 * MindMate Spaced Repetition Service
 * 
 * Implements a deterministic Modified SuperMemo SM-2 scheduling baseline.
 * Updates intervals, ease factors, repetitions, and scheduled review dates
 * based on empirical learner performance.
 */

import { prisma } from '../db.js';

export type ReviewOutcome = 'PERFECT' | 'PASS' | 'PARTIAL' | 'FAIL' | 'CRITICAL_FAIL';

export interface SpacedScheduleResult {
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
  lastOutcome: ReviewOutcome;
  lastReviewedAt: Date;
  nextReviewAt: Date;
  isOverdue: boolean;
  daysOverdue: number;
}

export interface ReviewItemStatus {
  id: string;
  topicId: string;
  topicName: string;
  materialId?: string | null;
  repetitionNumber: number;
  intervalDays: number;
  easeFactor: number;
  lastReviewedAt: Date | null;
  nextReviewAt: Date;
  lastOutcome: string | null;
  totalReviews: number;
  isOverdue: boolean;
  daysOverdue: number;
  urgencyScore: number;
}

/**
 * Maps percentage score (0-100) or correctness ratio to a discrete review outcome grade
 */
export function scoreToReviewOutcome(scorePercentage: number): ReviewOutcome {
  if (scorePercentage >= 90) return 'PERFECT';
  if (scorePercentage >= 70) return 'PASS';
  if (scorePercentage >= 50) return 'PARTIAL';
  if (scorePercentage >= 30) return 'FAIL';
  return 'CRITICAL_FAIL';
}

/**
 * Maps discrete outcome to numeric grade (1 to 5) for SM-2 ease factor calculation
 */
function outcomeToGrade(outcome: ReviewOutcome): number {
  switch (outcome) {
    case 'PERFECT': return 5;
    case 'PASS': return 4;
    case 'PARTIAL': return 3;
    case 'FAIL': return 2;
    case 'CRITICAL_FAIL': return 1;
  }
}

/**
 * Pure calculation for the next spaced repetition schedule given current state and review outcome
 */
export function calculateNextReview(
  current: {
    repetitions: number;
    intervalDays: number;
    easeFactor: number;
  },
  outcome: ReviewOutcome,
  options?: { now?: Date }
): SpacedScheduleResult {
  const now = options?.now || new Date();
  const grade = outcomeToGrade(outcome);

  let newRepetitions = current.repetitions;
  let newIntervalDays = current.intervalDays;
  let newEaseFactor = current.easeFactor;

  // Grade >= 3 represents successful recall
  if (grade >= 3) {
    if (newRepetitions === 0) {
      newIntervalDays = 1.0;
    } else if (newRepetitions === 1) {
      newIntervalDays = 3.0;
    } else {
      newIntervalDays = Math.round(newIntervalDays * newEaseFactor * 10) / 10;
    }
    newRepetitions += 1;
  } else {
    // Failure resets repetitions and returns interval to 1 day
    newRepetitions = 0;
    newIntervalDays = 1.0;
  }

  // SM-2 Ease Factor formula adjustment:
  // EF' = EF + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))
  const deltaEF = 0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02);
  newEaseFactor = Math.max(1.3, Math.round((newEaseFactor + deltaEF) * 100) / 100);

  const nextReviewMs = now.getTime() + newIntervalDays * 24 * 60 * 60 * 1000;
  const nextReviewAt = new Date(nextReviewMs);

  const isOverdue = now.getTime() > nextReviewAt.getTime();
  const daysOverdue = isOverdue
    ? Math.max(0, Math.floor((now.getTime() - nextReviewAt.getTime()) / (24 * 60 * 60 * 1000)))
    : 0;

  return {
    repetitions: newRepetitions,
    intervalDays: newIntervalDays,
    easeFactor: newEaseFactor,
    lastOutcome: outcome,
    lastReviewedAt: now,
    nextReviewAt,
    isOverdue,
    daysOverdue,
  };
}

/**
 * Records a review outcome in the database for a user and topic, updating the spaced repetition schedule
 */
export async function recordTopicReview(
  userId: string,
  topicId: string,
  topicName: string,
  outcome: ReviewOutcome,
  options?: { now?: Date; materialId?: string }
): Promise<SpacedScheduleResult> {
  const now = options?.now || new Date();

  // Find existing record or initialize defaults
  const existing = await prisma.spacedRepetitionItem.findUnique({
    where: { userId_topicId: { userId, topicId } },
  });

  const current = {
    repetitions: existing?.repetitionNumber ?? 0,
    intervalDays: existing?.intervalDays ?? 1.0,
    easeFactor: existing?.easeFactor ?? 2.5,
  };

  const calculated = calculateNextReview(current, outcome, { now });

  await prisma.spacedRepetitionItem.upsert({
    where: { userId_topicId: { userId, topicId } },
    create: {
      userId,
      topicId,
      topicName,
      materialId: options?.materialId || null,
      repetitionNumber: calculated.repetitions,
      intervalDays: calculated.intervalDays,
      easeFactor: calculated.easeFactor,
      lastReviewedAt: calculated.lastReviewedAt,
      nextReviewAt: calculated.nextReviewAt,
      lastOutcome: calculated.lastOutcome,
      totalReviews: 1,
    },
    update: {
      repetitionNumber: calculated.repetitions,
      intervalDays: calculated.intervalDays,
      easeFactor: calculated.easeFactor,
      lastReviewedAt: calculated.lastReviewedAt,
      nextReviewAt: calculated.nextReviewAt,
      lastOutcome: calculated.lastOutcome,
      totalReviews: { increment: 1 },
    },
  });

  return calculated;
}

/**
 * Automatically synchronizes spaced repetition record when learner completes a quiz or practice session
 */
export async function syncSpacedRepetitionFromAttempt(
  userId: string,
  topicId: string,
  topicName: string,
  scorePercentage: number,
  options?: { now?: Date; materialId?: string }
): Promise<SpacedScheduleResult> {
  const outcome = scoreToReviewOutcome(scorePercentage);
  return recordTopicReview(userId, topicId, topicName, outcome, options);
}

/**
 * Retrieves all spaced repetition items for a user, indicating due/overdue status and urgency
 */
export async function getUserSpacedReviews(userId: string, options?: { now?: Date }): Promise<ReviewItemStatus[]> {
  const now = options?.now || new Date();

  const items = await prisma.spacedRepetitionItem.findMany({
    where: { userId },
    orderBy: { nextReviewAt: 'asc' },
  });

  return items.map((item) => {
    const isOverdue = now.getTime() >= item.nextReviewAt.getTime();
    const daysOverdue = isOverdue
      ? Math.max(0, Math.floor((now.getTime() - item.nextReviewAt.getTime()) / (24 * 60 * 60 * 1000)))
      : 0;

    // Urgency score: bounded [0, 1]. Overdue items get high base score + penalty for days overdue.
    let urgencyScore = 0.0;
    if (isOverdue) {
      urgencyScore = Math.min(1.0, 0.7 + daysOverdue * 0.1);
    } else {
      const hoursUntilDue = (item.nextReviewAt.getTime() - now.getTime()) / (3600 * 1000);
      if (hoursUntilDue <= 24) {
        urgencyScore = Math.max(0.1, 0.5 - (hoursUntilDue / 24) * 0.4);
      }
    }

    return {
      id: item.id,
      topicId: item.topicId,
      topicName: item.topicName,
      materialId: item.materialId,
      repetitionNumber: item.repetitionNumber,
      intervalDays: item.intervalDays,
      easeFactor: item.easeFactor,
      lastReviewedAt: item.lastReviewedAt,
      nextReviewAt: item.nextReviewAt,
      lastOutcome: item.lastOutcome,
      totalReviews: item.totalReviews,
      isOverdue,
      daysOverdue,
      urgencyScore: Math.round(urgencyScore * 100) / 100,
    };
  });
}
