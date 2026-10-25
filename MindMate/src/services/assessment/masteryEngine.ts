import { TOPICS, resolveTopicMetadata } from '../../data/learningContent';
import type {
  AttemptRecord,
  ConfidenceLevel,
  DifficultyPerformance,
  MasteryStatus,
  TopicMasteryMetrics,
} from './types';

export const RECENT_ATTEMPT_WINDOW = 5;
export const PRIOR_MASTERY_BASELINE = 45;
export const FULL_CONFIDENCE_ATTEMPTS = 5;
export const EASY_ONLY_CEILING = 75;

/**
 * Difficulty weight factor for difficulty levels 1..5.
 * Higher difficulty questions carry greater weight when answered correctly,
 * while missing an easy question carries a stronger penalty.
 */
export function getDifficultyWeight(difficulty: number): number {
  const clamped = Math.max(1, Math.min(5, Math.round(difficulty || 1)));
  switch (clamped) {
    case 1:
      return 0.85;
    case 2:
      return 0.95;
    case 3:
      return 1.05;
    case 4:
      return 1.15;
    case 5:
      return 1.25;
    default:
      return 1.0;
  }
}

/**
 * Determine confidence level from evidence count (number of completed attempts).
 */
export function getConfidenceLevel(evidenceCount: number): ConfidenceLevel {
  if (evidenceCount <= 0) return 'none';
  if (evidenceCount <= 2) return 'insufficient';
  if (evidenceCount <= 4) return 'low';
  if (evidenceCount <= 7) return 'medium';
  return 'high';
}

/**
 * Determine mastery status from score, evidence count, and whether medium/hard
 * evidence exists. A topic is never marked 'mastered' or 'strong' on 1-2 attempts
 * or solely on easy questions.
 */
export function getMasteryStatus(
  masteryScore: number,
  evidenceCount: number,
  hasMediumOrHardSuccess: boolean
): MasteryStatus {
  if (evidenceCount <= 0) return 'unassessed';
  if (masteryScore >= 85 && evidenceCount >= 5 && hasMediumOrHardSuccess) {
    return 'mastered';
  }
  if (masteryScore >= 70 && evidenceCount >= 3) {
    return 'strong';
  }
  if (masteryScore >= 45) {
    return 'developing';
  }
  return 'weak';
}

function computeBandPerformance(attempts: AttemptRecord[]): DifficultyPerformance {
  if (attempts.length === 0) {
    return { attempts: 0, correct: 0, accuracy: null };
  }
  const correct = attempts.filter((a) => a.is_correct).length;
  return {
    attempts: attempts.length,
    correct,
    accuracy: Math.round((correct / attempts.length) * 100),
  };
}

/**
 * Sort attempts chronologically (oldest -> newest) with deterministic tie-breaking.
 */
export function sortAttemptsChronologically(attempts: AttemptRecord[]): AttemptRecord[] {
  return [...attempts].sort((a, b) => {
    const tA = Date.parse(a.attempted_at || '') || 0;
    const tB = Date.parse(b.attempted_at || '') || 0;
    if (tA !== tB) return tA - tB;
    return (a.id || '').localeCompare(b.id || '');
  });
}

/**
 * Pure, deterministic calculation of topic mastery from question-level attempts.
 *
 * Scoring Rule:
 * 1. Overall accuracy = correct / total.
 * 2. Recent weighted accuracy over last N=5 attempts uses linear recency weights
 *    (1..k, newest highest) multiplied by difficulty weight.
 * 3. Raw composite = 0.60 * recentWeightedScore + 0.40 * overallWeightedScore.
 * 4. If all correct answers are only on easy questions (difficulty <= 2), raw composite
 *    is capped at EASY_ONLY_CEILING (75) so easy questions alone never yield 'mastered'.
 * 5. Evidence damping: score = round(alpha * rawComposite + (1 - alpha) * PRIOR_MASTERY_BASELINE)
 *    where alpha = min(1, totalAttempts / 5). This guarantees 1 easy question correct yields ~51%
 *    ('developing', confidence 'insufficient') rather than 100%.
 */
export function calculateTopicMastery(
  topicIdOrName: string,
  allTopicAttempts: AttemptRecord[]
): TopicMasteryMetrics {
  const topicMeta = resolveTopicMetadata(topicIdOrName);
  const canonicalId = topicMeta.id;

  const matchingAttempts = sortAttemptsChronologically(
    allTopicAttempts.filter((a) => {
      const resolved = resolveTopicMetadata(a.topic_id || a.topic_name);
      return resolved.id === canonicalId || a.topic_id === topicIdOrName;
    })
  );

  const totalAttempts = matchingAttempts.length;
  if (totalAttempts === 0) {
    return {
      topicId: canonicalId,
      topicName: topicMeta.name,
      subjectId: topicMeta.subjectId,
      totalAttempts: 0,
      correctAnswers: 0,
      incorrectAnswers: 0,
      overallAccuracy: 0,
      recentAccuracy: 0,
      recentWindowSize: RECENT_ATTEMPT_WINDOW,
      difficultyPerformance: {
        easy: { attempts: 0, correct: 0, accuracy: null },
        medium: { attempts: 0, correct: 0, accuracy: null },
        hard: { attempts: 0, correct: 0, accuracy: null },
      },
      recurringMistakesCount: 0,
      unresolvedMistakesCount: 0,
      lastPracticedAt: null,
      masteryScore: 0,
      status: 'unassessed',
      evidenceCount: 0,
      confidenceLevel: 'none',
      formulaSummary: 'No completed question attempts recorded for this topic yet.',
    };
  }

  const correctAnswers = matchingAttempts.filter((a) => a.is_correct).length;
  const incorrectAnswers = totalAttempts - correctAnswers;
  const overallAccuracy = Math.round((correctAnswers / totalAttempts) * 100);

  const recentSlice = matchingAttempts.slice(-RECENT_ATTEMPT_WINDOW);
  const recentCorrect = recentSlice.filter((a) => a.is_correct).length;
  const recentAccuracy = Math.round((recentCorrect / recentSlice.length) * 100);

  // Difficulty bands: easy (1-2), medium (3), hard (4-5)
  const easyAttempts = matchingAttempts.filter((a) => (a.difficulty || 1) <= 2);
  const mediumAttempts = matchingAttempts.filter((a) => (a.difficulty || 1) === 3);
  const hardAttempts = matchingAttempts.filter((a) => (a.difficulty || 1) >= 4);

  const difficultyPerformance = {
    easy: computeBandPerformance(easyAttempts),
    medium: computeBandPerformance(mediumAttempts),
    hard: computeBandPerformance(hardAttempts),
  };

  // Weighted overall accuracy
  let overallWeightedEarned = 0;
  let overallWeightedPossible = 0;
  for (const att of matchingAttempts) {
    const w = getDifficultyWeight(att.difficulty || 1);
    if (att.is_correct) {
      overallWeightedEarned += w;
      overallWeightedPossible += w;
    } else {
      // Missing an easier question weighs slightly more in denominator
      const missPenalty = (att.difficulty || 1) <= 2 ? 1.1 : w;
      overallWeightedPossible += missPenalty;
    }
  }
  const overallWeightedScore =
    overallWeightedPossible > 0
      ? (overallWeightedEarned / overallWeightedPossible) * 100
      : 0;

  // Recency-weighted accuracy over recentSlice (linear weights 1..k, newest = k)
  let recentWeightedEarned = 0;
  let recentWeightedPossible = 0;
  recentSlice.forEach((att, idx) => {
    const recencyWeight = idx + 1;
    const diffWeight = getDifficultyWeight(att.difficulty || 1);
    const combinedWeight = recencyWeight * diffWeight;
    if (att.is_correct) {
      recentWeightedEarned += combinedWeight;
      recentWeightedPossible += combinedWeight;
    } else {
      const missWeight = recencyWeight * ((att.difficulty || 1) <= 2 ? 1.1 : diffWeight);
      recentWeightedPossible += missWeight;
    }
  });
  const recentWeightedScore =
    recentWeightedPossible > 0
      ? (recentWeightedEarned / recentWeightedPossible) * 100
      : 0;

  let rawComposite = 0.6 * recentWeightedScore + 0.4 * overallWeightedScore;

  const hasMediumOrHardSuccess =
    difficultyPerformance.medium.correct > 0 || difficultyPerformance.hard.correct > 0;

  if (!hasMediumOrHardSuccess && rawComposite > EASY_ONLY_CEILING) {
    rawComposite = EASY_ONLY_CEILING;
  }

  // Sample-size shrinkage so 1-4 attempts cannot overstate mastery or collapse to 0 on 1 miss
  const alpha = Math.min(1, totalAttempts / FULL_CONFIDENCE_ATTEMPTS);
  const dampedScore = Math.round(
    alpha * rawComposite + (1 - alpha) * PRIOR_MASTERY_BASELINE
  );
  const masteryScore = Math.max(0, Math.min(100, dampedScore));

  // Count recurring mistakes (questions or concepts missed >= 2 times)
  const missByConceptOrQuestion = new Map<string, number>();
  let unresolvedMistakesCount = 0;
  for (const att of matchingAttempts) {
    if (!att.is_correct) {
      if (!att.resolved) unresolvedMistakesCount += 1;
      const key = att.concept_tag || att.question_id || att.question_text;
      missByConceptOrQuestion.set(key, (missByConceptOrQuestion.get(key) || 0) + 1);
    }
  }
  let recurringMistakesCount = 0;
  missByConceptOrQuestion.forEach((count) => {
    if (count >= 2) recurringMistakesCount += 1;
  });
  // Also count if learner has >= 3 total misses in the topic even across distinct questions
  if (recurringMistakesCount === 0 && incorrectAnswers >= 3) {
    recurringMistakesCount = 1;
  }

  const lastPracticedAt =
    matchingAttempts[matchingAttempts.length - 1]?.attempted_at || null;
  const confidenceLevel = getConfidenceLevel(totalAttempts);
  const status = getMasteryStatus(masteryScore, totalAttempts, hasMediumOrHardSuccess);

  const formulaSummary =
    `60% recent (${recentAccuracy}% over last ${recentSlice.length}) + 40% overall (${overallAccuracy}% over ${totalAttempts}), ` +
    `evidence factor ${(alpha * 100).toFixed(0)}% (${confidenceLevel} confidence)` +
    (!hasMediumOrHardSuccess && correctAnswers > 0 ? ', capped at 75% until medium/hard questions are answered.' : '.');

  return {
    topicId: canonicalId,
    topicName: topicMeta.name,
    subjectId: topicMeta.subjectId,
    totalAttempts,
    correctAnswers,
    incorrectAnswers,
    overallAccuracy,
    recentAccuracy,
    recentWindowSize: RECENT_ATTEMPT_WINDOW,
    difficultyPerformance,
    recurringMistakesCount,
    unresolvedMistakesCount,
    lastPracticedAt,
    masteryScore,
    status,
    evidenceCount: totalAttempts,
    confidenceLevel,
    formulaSummary,
  };
}

/**
 * Compute mastery metrics across all canonical curriculum topics plus any custom
 * topics present in the learner's attempt history.
 */
export function calculateAllTopicsMastery(
  attempts: AttemptRecord[]
): TopicMasteryMetrics[] {
  const topicIds = new Set<string>(TOPICS.map((t) => t.id));
  for (const att of attempts) {
    const resolved = resolveTopicMetadata(att.topic_id || att.topic_name);
    topicIds.add(resolved.id);
  }

  return Array.from(topicIds).map((topicId) =>
    calculateTopicMastery(topicId, attempts)
  );
}
