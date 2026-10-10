/**
 * MindMate Adaptive Learning Engine — Mastery Model
 *
 * Implements an Empirical Bayesian Beta-Binomial updating model with explicit
 * confidence classification and difficulty transition dynamics.
 *
 * Mathematical Foundations:
 * 1. Prior: Beta(alpha_0 = 2, beta_0 = 2)
 *    - Uninformative, symmetric prior centered at 50% proficiency with a prior weight of 4 pseudo-observations.
 *    - Prevents volatile swings (e.g., a single correct answer does not yield 100% mastery).
 * 2. Likelihood & Posterior:
 *    - Given c correct answers and k incorrect answers (total n = c + k):
 *      Posterior: Beta(alpha_0 + c, beta_0 + k)
 *    - Expected Mastery Score:
 *      E[theta] = (alpha_0 + c) / (alpha_0 + beta_0 + n)
 *      Mastery% = round(((2 + c) / (4 + n)) * 100)
 * 3. Confidence Classification:
 *    - n < 3: INSUFFICIENT_EVIDENCE (Status: CALIBRATING)
 *    - 3 <= n < 7: LOW
 *    - 7 <= n < 15: MEDIUM
 *    - n >= 15: HIGH
 *    - Explicitly communicates to learners when estimates are preliminary due to small sample size.
 */

export type ConfidenceLevel = 'INSUFFICIENT_EVIDENCE' | 'LOW' | 'MEDIUM' | 'HIGH';
export type MasteryStatus = 'CALIBRATING' | 'NEEDS_PRACTICE' | 'DEVELOPING' | 'PROFICIENT' | 'MASTERED';
export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export interface MasteryEvaluationInput {
  currentMasteryScore: number;
  attemptCount: number;
  correctCount: number;
  consecutiveCorrect: number;
  consecutiveIncorrect: number;
  currentDifficulty: DifficultyLevel;
  isCorrect: boolean;
}

export interface MasteryEvaluationResult {
  newMasteryScore: number;
  newAttemptCount: number;
  newCorrectCount: number;
  consecutiveCorrect: number;
  consecutiveIncorrect: number;
  confidenceLevel: ConfidenceLevel;
  confidenceScore: number; // 0.0 to 1.0
  status: MasteryStatus;
  newDifficulty: DifficultyLevel;
  difficultyTransitionReason: string;
  evidenceSummary: string;
}

/**
 * Calculates deterministic Beta-Binomial expected mastery percentage.
 */
export function calculateBetaMastery(correctCount: number, attemptCount: number): number {
  const alpha0 = 2;
  const beta0 = 2;
  const alpha = alpha0 + Math.max(0, correctCount);
  const beta = beta0 + Math.max(0, attemptCount - correctCount);
  const expected = alpha / (alpha + beta);
  return Math.round(expected * 100);
}

/**
 * Classifies confidence based on sample size (empirical evidence count).
 */
export function classifyConfidence(attemptCount: number): {
  level: ConfidenceLevel;
  score: number;
  description: string;
} {
  const n = Math.max(0, attemptCount);
  // Monotonically increasing confidence score: 1 - 1 / sqrt(1 + n/2)
  const score = Math.round((1 - 1 / Math.sqrt(1 + n / 2)) * 100) / 100;

  if (n < 3) {
    return {
      level: 'INSUFFICIENT_EVIDENCE',
      score,
      description: `Insufficient evidence (${n} attempt${n === 1 ? '' : 's'}). Need at least 3 attempts to establish an initial trend.`,
    };
  }
  if (n < 7) {
    return {
      level: 'LOW',
      score,
      description: `Preliminary estimate based on ${n} attempts.`,
    };
  }
  if (n < 15) {
    return {
      level: 'MEDIUM',
      score,
      description: `Moderate evidence based on ${n} attempts.`,
    };
  }
  return {
    level: 'HIGH',
    score,
    description: `Substantial evidence based on ${n} attempts.`,
  };
}

/**
 * Categorizes mastery status from score and confidence.
 */
export function getMasteryStatus(masteryScore: number, confidence: ConfidenceLevel): MasteryStatus {
  if (confidence === 'INSUFFICIENT_EVIDENCE') {
    return 'CALIBRATING';
  }
  if (masteryScore >= 80) return 'MASTERED';
  if (masteryScore >= 65) return 'PROFICIENT';
  if (masteryScore >= 50) return 'DEVELOPING';
  return 'NEEDS_PRACTICE';
}

/**
 * Evaluates difficulty progression based on consecutive performance streaks.
 */
export function evaluateDifficultyTransition(
  currentDifficulty: DifficultyLevel,
  consecutiveCorrect: number,
  consecutiveIncorrect: number
): {
  newDifficulty: DifficultyLevel;
  reason: string;
} {
  // Step up on 2 consecutive correct answers
  if (consecutiveCorrect >= 2) {
    if (currentDifficulty === 'easy') {
      return {
        newDifficulty: 'medium',
        reason: 'Stepped up difficulty to Medium after 2 consecutive correct answers.',
      };
    }
    if (currentDifficulty === 'medium') {
      return {
        newDifficulty: 'hard',
        reason: 'Stepped up difficulty to Hard after sustained success.',
      };
    }
    return {
      newDifficulty: 'hard',
      reason: 'Maintaining Hard difficulty (maximum level reached).',
    };
  }

  // Step down on 2 consecutive incorrect answers
  if (consecutiveIncorrect >= 2) {
    if (currentDifficulty === 'hard') {
      return {
        newDifficulty: 'medium',
        reason: 'Stepped down difficulty to Medium to scaffold concepts after repeated errors.',
      };
    }
    if (currentDifficulty === 'medium') {
      return {
        newDifficulty: 'easy',
        reason: 'Stepped down difficulty to Easy to reinforce foundational rules.',
      };
    }
    return {
      newDifficulty: 'easy',
      reason: 'Maintaining Easy difficulty for foundational remediation.',
    };
  }

  return {
    newDifficulty: currentDifficulty,
    reason: `Maintaining ${currentDifficulty.toUpperCase()} difficulty to solidify topic understanding.`,
  };
}

/**
 * Evaluates a single question answer and computes updated mastery, evidence, and difficulty.
 */
export function evaluateAnswerMastery(input: MasteryEvaluationInput): MasteryEvaluationResult {
  const newAttemptCount = input.attemptCount + 1;
  const newCorrectCount = input.correctCount + (input.isCorrect ? 1 : 0);

  const consecutiveCorrect = input.isCorrect ? input.consecutiveCorrect + 1 : 0;
  const consecutiveIncorrect = !input.isCorrect ? input.consecutiveIncorrect + 1 : 0;

  const newMasteryScore = calculateBetaMastery(newCorrectCount, newAttemptCount);
  const confidence = classifyConfidence(newAttemptCount);
  const status = getMasteryStatus(newMasteryScore, confidence.level);

  const difficultyTransition = evaluateDifficultyTransition(
    input.currentDifficulty,
    consecutiveCorrect,
    consecutiveIncorrect
  );

  const accuracyPct = Math.round((newCorrectCount / newAttemptCount) * 100);
  const evidenceSummary = `Mastery estimate is ${newMasteryScore}% based on ${newCorrectCount} correct of ${newAttemptCount} attempts (${accuracyPct}% accuracy). ${confidence.description}`;

  return {
    newMasteryScore,
    newAttemptCount,
    newCorrectCount,
    consecutiveCorrect,
    consecutiveIncorrect,
    confidenceLevel: confidence.level,
    confidenceScore: confidence.score,
    status,
    newDifficulty: difficultyTransition.newDifficulty,
    difficultyTransitionReason: difficultyTransition.reason,
    evidenceSummary,
  };
}
