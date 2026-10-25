import {
  MULTILINGUAL_QUESTIONS,
  resolveTopicMetadata,
  type AdaptiveQuestionItem,
  type LanguageCode,
} from '../../data/learningContent';
import { sortAttemptsChronologically } from '../assessment/masteryEngine';
import type {
  AttemptRecord,
  DifficultyBand,
  EvidenceRecommendation,
  ExplanationStrategy,
  NextLearningAction,
  RecurringMistakePattern,
  SessionAdaptationDelta,
  PersistenceStatus,
  TopicMasteryMetrics,
} from '../assessment/types';

export interface AdaptiveDifficultyDecision {
  targetLevel: number; // 1..5
  targetBand: DifficultyBand;
  reason: string;
}

export interface AdaptiveQuestionSelection {
  question: AdaptiveQuestionItem | null;
  targetDifficulty: number;
  actualDifficulty: number;
  targetBand: DifficultyBand;
  actualBand: DifficultyBand;
  isDifficultyFallback: boolean;
  fallbackNotice: string | null;
  isLanguageFallback: boolean;
  activeLanguage: LanguageCode;
  selectionReason: string;
}

export interface ExplanationStrategyDecision {
  strategy: ExplanationStrategy;
  strategyLabel: string;
  strategyReason: string;
  includeWorkedExample: boolean;
  prerequisiteTopicId?: string;
  prerequisiteTopicName?: string;
}

export function levelToDifficultyBand(level: number): DifficultyBand {
  if (level <= 2) return 'easy';
  if (level === 3) return 'medium';
  return 'hard';
}

export function bandToRepresentativeLevel(band: DifficultyBand): number {
  switch (band) {
    case 'easy':
      return 2;
    case 'medium':
      return 3;
    case 'hard':
      return 4;
  }
}

export const STRATEGY_LABELS: Record<ExplanationStrategy, string> = {
  'step-by-step': 'Step-by-Step Breakdown',
  'simple-analogy': 'Simple Real-World Analogy',
  'worked-example': 'Annotated Worked Example',
  'conceptual-recap': 'Core Conceptual Recap',
  'prerequisite-review': 'Prerequisite Foundation Review',
  'guided-practice': 'Guided Practice & Challenge',
};

/**
 * Determine initial or next difficulty level (1..5) from topic mastery and
 * recent in-session or historical attempts.
 *
 * Enforces bounded progression:
 * - Never jumps more than +/- 1 difficulty level after a single question.
 * - Requires at least 2 consecutive correct answers before increasing difficulty
 *   during a session, whereas an incorrect answer steps down by 1 (min 1) when struggling.
 */
export function selectAdaptiveDifficulty(
  topicMetric: TopicMasteryMetrics | null,
  sessionAttempts: AttemptRecord[] = [],
  currentDifficulty?: number
): AdaptiveDifficultyDecision {
  const orderedSession = sortAttemptsChronologically(sessionAttempts);

  // If we are mid-session and have a currentDifficulty + at least 1 session attempt:
  if (currentDifficulty !== undefined && orderedSession.length > 0) {
    const clampedCurrent = Math.max(1, Math.min(5, Math.round(currentDifficulty)));
    const lastAttempt = orderedSession[orderedSession.length - 1];
    const prevAttempt =
      orderedSession.length >= 2
        ? orderedSession[orderedSession.length - 2]
        : null;

    if (!lastAttempt.is_correct) {
      const nextLevel = Math.max(1, clampedCurrent - 1);
      return {
        targetLevel: nextLevel,
        targetBand: levelToDifficultyBand(nextLevel),
        reason:
          nextLevel < clampedCurrent
            ? `Stepped down from difficulty ${clampedCurrent} to ${nextLevel} (${levelToDifficultyBand(nextLevel)}) after an incorrect response to reinforce core understanding.`
            : `Staying at baseline difficulty 1 (easy) after an incorrect response.`,
      };
    }

    // Last attempt was correct: require 2 consecutive correct answers before stepping up
    if (prevAttempt && prevAttempt.is_correct) {
      const nextLevel = Math.min(5, clampedCurrent + 1);
      return {
        targetLevel: nextLevel,
        targetBand: levelToDifficultyBand(nextLevel),
        reason:
          nextLevel > clampedCurrent
            ? `Stepped up by +1 from difficulty ${clampedCurrent} to ${nextLevel} (${levelToDifficultyBand(nextLevel)}) after 2 consecutive correct answers.`
            : `Maintained maximum difficulty 5 (hard) after consecutive correct answers.`,
      };
    }

    // Single correct answer -> hold steady at current difficulty (avoid abrupt jump after 1 question)
    return {
      targetLevel: clampedCurrent,
      targetBand: levelToDifficultyBand(clampedCurrent),
      reason: `Holding at difficulty ${clampedCurrent} (${levelToDifficultyBand(clampedCurrent)}) after 1 correct answer to verify stability before increasing difficulty.`,
    };
  }

  // Baseline selection before session attempts exist: derive from TopicMasteryMetrics
  if (!topicMetric || topicMetric.totalAttempts === 0) {
    return {
      targetLevel: 2,
      targetBand: 'easy',
      reason:
        'No prior attempts recorded for this topic; starting at difficulty 2 (easy) for baseline calibration.',
    };
  }

  if (
    topicMetric.masteryScore < 45 ||
    topicMetric.recentAccuracy < 50 ||
    topicMetric.recurringMistakesCount > 0
  ) {
    const level = topicMetric.masteryScore < 35 ? 1 : 2;
    return {
      targetLevel: level,
      targetBand: 'easy',
      reason: `Selected difficulty ${level} (easy) because topic mastery is ${topicMetric.masteryScore}% with ${topicMetric.recentAccuracy}% recent accuracy and ${topicMetric.incorrectAnswers} incorrect attempt(s).`,
    };
  }

  if (
    topicMetric.masteryScore >= 75 &&
    topicMetric.recentAccuracy >= 80 &&
    topicMetric.totalAttempts >= 4
  ) {
    const level = topicMetric.masteryScore >= 88 ? 5 : 4;
    return {
      targetLevel: level,
      targetBand: 'hard',
      reason: `Selected difficulty ${level} (hard) based on strong mastery (${topicMetric.masteryScore}%) and ${topicMetric.recentAccuracy}% recent accuracy across ${topicMetric.totalAttempts} attempts.`,
    };
  }

  return {
    targetLevel: 3,
    targetBand: 'medium',
    reason: `Selected difficulty 3 (medium) for developing mastery (${topicMetric.masteryScore}% across ${topicMetric.totalAttempts} attempts).`,
  };
}

/**
 * Select the next question from the verified question bank at the requested difficulty,
 * avoiding already-answered question IDs in the current session.
 * If no unanswered question exists at the exact target difficulty, falls back cleanly
 * to the closest available difficulty and documents the fallback explicitly.
 */
export function selectNextQuestion(params: {
  topicId: string;
  targetDifficulty: number;
  answeredQuestionIds?: string[];
  language?: LanguageCode;
  customPool?: AdaptiveQuestionItem[];
}): AdaptiveQuestionSelection {
  const {
    topicId,
    targetDifficulty,
    answeredQuestionIds = [],
    language = 'en',
    customPool,
  } = params;

  const clampedTarget = Math.max(1, Math.min(5, Math.round(targetDifficulty)));
  const targetBand = levelToDifficultyBand(clampedTarget);
  const resolvedTopic = resolveTopicMetadata(topicId);
  const answeredSet = new Set(answeredQuestionIds);

  const sourcePool = customPool || MULTILINGUAL_QUESTIONS;

  // Filter by topic (or all if 'all') and preferred language
  let pool = sourcePool.filter(
    (q) =>
      (q.topicId === resolvedTopic.id || q.topicId === topicId || topicId === 'all') &&
      q.language === language
  );
  let isLanguageFallback = false;
  let activeLanguage: LanguageCode = language;

  if (pool.length === 0 && language !== 'en') {
    pool = sourcePool.filter(
      (q) =>
        (q.topicId === resolvedTopic.id || q.topicId === topicId || topicId === 'all') &&
        q.language === 'en'
    );
    isLanguageFallback = pool.length > 0;
    activeLanguage = 'en';
  }

  if (pool.length === 0) {
    return {
      question: null,
      targetDifficulty: clampedTarget,
      actualDifficulty: clampedTarget,
      targetBand,
      actualBand: targetBand,
      isDifficultyFallback: false,
      fallbackNotice: `No questions found in the question bank for topic "${resolvedTopic.name}".`,
      isLanguageFallback,
      activeLanguage,
      selectionReason: 'Question pool is empty for the requested topic.',
    };
  }

  // Prefer unanswered questions in the current session; if all have been answered, reset filter
  const unansweredPool = pool.filter((q) => !answeredSet.has(q.id));
  const candidatePool = unansweredPool.length > 0 ? unansweredPool : pool;

  // 1. Exact difficulty match
  const exactMatches = candidatePool.filter(
    (q) => q.difficulty === clampedTarget
  );
  if (exactMatches.length > 0) {
    const chosen = exactMatches[0];
    return {
      question: chosen,
      targetDifficulty: clampedTarget,
      actualDifficulty: chosen.difficulty,
      targetBand,
      actualBand: levelToDifficultyBand(chosen.difficulty),
      isDifficultyFallback: false,
      fallbackNotice: null,
      isLanguageFallback,
      activeLanguage,
      selectionReason: `Selected difficulty ${chosen.difficulty} (${levelToDifficultyBand(chosen.difficulty)}) question matching target difficulty.`,
    };
  }

  // 2. Closest available difficulty fallback (sorted by |d - target|, then preferring slightly easier over harder on ties)
  const sortedByCloseness = [...candidatePool].sort((a, b) => {
    const distA = Math.abs(a.difficulty - clampedTarget);
    const distB = Math.abs(b.difficulty - clampedTarget);
    if (distA !== distB) return distA - distB;
    return a.difficulty - b.difficulty;
  });

  const fallbackQuestion = sortedByCloseness[0];
  const actualBand = levelToDifficultyBand(fallbackQuestion.difficulty);

  return {
    question: fallbackQuestion,
    targetDifficulty: clampedTarget,
    actualDifficulty: fallbackQuestion.difficulty,
    targetBand,
    actualBand,
    isDifficultyFallback: true,
    fallbackNotice: `No unanswered ${targetBand} (level ${clampedTarget}) question remained for ${resolvedTopic.name}; serving closest available ${actualBand} (level ${fallbackQuestion.difficulty}) question instead.`,
    isLanguageFallback,
    activeLanguage,
    selectionReason: `Fallback from target difficulty ${clampedTarget} (${targetBand}) to closest available difficulty ${fallbackQuestion.difficulty} (${actualBand}).`,
  };
}

/**
 * Deterministically select an explanation strategy based on topic mastery,
 * recurring mistake patterns, prerequisite mastery, and recent errors.
 */
export function selectExplanationStrategy(params: {
  topicMetric: TopicMasteryMetrics | null;
  mistakePatterns?: RecurringMistakePattern[];
  allTopicMetrics?: TopicMasteryMetrics[];
  recentSessionMistakes?: number;
}): ExplanationStrategyDecision {
  const {
    topicMetric,
    mistakePatterns = [],
    allTopicMetrics = [],
    recentSessionMistakes = 0,
  } = params;

  if (!topicMetric || topicMetric.totalAttempts === 0) {
    return {
      strategy: 'conceptual-recap',
      strategyLabel: STRATEGY_LABELS['conceptual-recap'],
      strategyReason:
        'No prior question attempts exist for this topic; starting with a foundational conceptual recap and worked example.',
      includeWorkedExample: true,
    };
  }

  const topicMeta = resolveTopicMetadata(topicMetric.topicId);
  const topicPatterns = mistakePatterns.filter(
    (p) => p.topicId === topicMetric.topicId
  );

  // 1. Check if a curriculum prerequisite is weak while learner is struggling in this topic
  if (
    (topicMetric.masteryScore < 60 ||
      topicMetric.incorrectAnswers >= 2 ||
      recentSessionMistakes >= 2) &&
    topicMeta.prerequisites &&
    topicMeta.prerequisites.length > 0
  ) {
    for (const prereqId of topicMeta.prerequisites) {
      const prereqMetric = allTopicMetrics.find((m) => m.topicId === prereqId);
      if (
        prereqMetric &&
        prereqMetric.totalAttempts > 0 &&
        prereqMetric.masteryScore < 60
      ) {
        const prereqMeta = resolveTopicMetadata(prereqId);
        return {
          strategy: 'prerequisite-review',
          strategyLabel: STRATEGY_LABELS['prerequisite-review'],
          strategyReason: `Selected Prerequisite Review because ${topicMetric.topicName} is at ${topicMetric.masteryScore}% mastery while prerequisite ${prereqMeta.name} is at ${prereqMetric.masteryScore}% mastery.`,
          includeWorkedExample: true,
          prerequisiteTopicId: prereqMeta.id,
          prerequisiteTopicName: prereqMeta.name,
        };
      }
    }
  }

  // 2. Repeated mistakes (>= 3 errors in topic or >= 2 consecutive session errors) -> simple analogy + worked example
  const confirmedPattern = topicPatterns.find((p) => p.isConfirmedPattern);
  if (
    recentSessionMistakes >= 2 ||
    (confirmedPattern && confirmedPattern.occurrences >= 3) ||
    (topicMetric.masteryScore < 40 && topicMetric.incorrectAnswers >= 2)
  ) {
    return {
      strategy: 'simple-analogy',
      strategyLabel: STRATEGY_LABELS['simple-analogy'],
      strategyReason: confirmedPattern
        ? `Selected Simple Real-World Analogy + Worked Example because of ${confirmedPattern.summary.toLowerCase()} (${confirmedPattern.occurrences} misses).`
        : `Selected Simple Real-World Analogy + Worked Example after ${Math.max(recentSessionMistakes, topicMetric.incorrectAnswers)} incorrect responses in ${topicMetric.topicName}.`,
      includeWorkedExample: true,
    };
  }

  // 3. Confirmed 2-error pattern or declining recent accuracy -> worked-example
  if (
    confirmedPattern ||
    topicMetric.unresolvedMistakesCount >= 2 ||
    (topicMetric.totalAttempts >= 3 && topicMetric.recentAccuracy < 60)
  ) {
    return {
      strategy: 'worked-example',
      strategyLabel: STRATEGY_LABELS['worked-example'],
      strategyReason: confirmedPattern
        ? `Selected Annotated Worked Example to address ${confirmedPattern.summary.toLowerCase()}.`
        : `Selected Annotated Worked Example because recent accuracy in ${topicMetric.topicName} is ${topicMetric.recentAccuracy}% across ${topicMetric.totalAttempts} attempts.`,
      includeWorkedExample: true,
    };
  }

  // 4. Developing mastery (45%..74%) or 1 recent error -> step-by-step
  if (topicMetric.masteryScore < 75 || topicMetric.incorrectAnswers > 0) {
    return {
      strategy: 'step-by-step',
      strategyLabel: STRATEGY_LABELS['step-by-step'],
      strategyReason: `Selected Step-by-Step Breakdown for developing mastery (${topicMetric.masteryScore}% across ${topicMetric.totalAttempts} attempts) to consolidate procedural understanding.`,
      includeWorkedExample: true,
    };
  }

  // 5. High mastery (>= 75%) and strong recent accuracy -> guided-practice
  return {
    strategy: 'guided-practice',
    strategyLabel: STRATEGY_LABELS['guided-practice'],
    strategyReason: `Selected Guided Practice & Challenge because mastery in ${topicMetric.topicName} is ${topicMetric.masteryScore}% with ${topicMetric.recentAccuracy}% recent accuracy.`,
    includeWorkedExample: false,
  };
}

/**
 * Determine the primary structured NextLearningAction across the learner's profile.
 */
export function determineNextLearningAction(params: {
  topicMetrics: TopicMasteryMetrics[];
  mistakePatterns: RecurringMistakePattern[];
  recommendations: EvidenceRecommendation[];
  focusTopicId?: string;
}): NextLearningAction {
  const {
    topicMetrics,
    mistakePatterns,
    recommendations,
    focusTopicId,
  } = params;

  // If a specific topic is requested and exists in metrics, or pick the highest-priority recommendation
  const focusMetric = focusTopicId
    ? topicMetrics.find(
        (m) =>
          m.topicId === resolveTopicMetadata(focusTopicId).id ||
          m.topicId === focusTopicId
      ) || null
    : null;

  const topRec = focusTopicId
    ? recommendations.find(
        (r) =>
          r.topicId === resolveTopicMetadata(focusTopicId).id ||
          r.topicId === focusTopicId
      ) || recommendations[0]
    : recommendations[0];

  const targetTopicId =
    focusMetric?.topicId || topRec?.topicId || 'python-variables';
  const targetMeta = resolveTopicMetadata(targetTopicId);
  const metric =
    topicMetrics.find((m) => m.topicId === targetMeta.id) || null;

  const strategyDecision = selectExplanationStrategy({
    topicMetric: metric,
    mistakePatterns,
    allTopicMetrics: topicMetrics,
  });

  const difficultyDecision = selectAdaptiveDifficulty(metric);

  if (topRec && (!focusTopicId || topRec.topicId === targetMeta.id)) {
    return {
      nextTopicId: topRec.topicId,
      nextTopicName: topRec.topicName,
      subjectId: topRec.subjectId,
      suggestedDifficulty: topRec.suggestedDifficulty,
      suggestedDifficultyLevel: topRec.suggestedDifficultyLevel,
      explanationStrategy: strategyDecision.strategy,
      strategyReason: strategyDecision.strategyReason,
      includeWorkedExample: strategyDecision.includeWorkedExample,
      prerequisiteReview: {
        required:
          topRec.action === 'prerequisite-review' ||
          strategyDecision.strategy === 'prerequisite-review',
        prerequisiteTopicId:
          topRec.supportingEvidence.prerequisiteTopicId ||
          strategyDecision.prerequisiteTopicId,
        prerequisiteTopicName:
          topRec.supportingEvidence.prerequisiteTopicName ||
          strategyDecision.prerequisiteTopicName,
        reason:
          topRec.action === 'prerequisite-review' ? topRec.reason : undefined,
      },
      suggestedActivity: topRec.action,
      reason: topRec.reason,
      supportingEvidence: topRec.supportingEvidence,
      confidenceLevel: metric?.confidenceLevel || 'none',
    };
  }

  return {
    nextTopicId: targetMeta.id,
    nextTopicName: targetMeta.name,
    subjectId: targetMeta.subjectId,
    suggestedDifficulty: difficultyDecision.targetBand,
    suggestedDifficultyLevel: difficultyDecision.targetLevel,
    explanationStrategy: strategyDecision.strategy,
    strategyReason: strategyDecision.strategyReason,
    includeWorkedExample: strategyDecision.includeWorkedExample,
    prerequisiteReview: {
      required: strategyDecision.strategy === 'prerequisite-review',
      prerequisiteTopicId: strategyDecision.prerequisiteTopicId,
      prerequisiteTopicName: strategyDecision.prerequisiteTopicName,
      reason:
        strategyDecision.strategy === 'prerequisite-review'
          ? strategyDecision.strategyReason
          : undefined,
    },
    suggestedActivity:
      !metric || metric.totalAttempts === 0
        ? 'diagnostic-quiz'
        : metric.totalAttempts <= 2
          ? 'follow-up-quiz'
          : metric.masteryScore < 60
            ? 'targeted-practice'
            : 'advance-difficulty',
    reason: difficultyDecision.reason,
    supportingEvidence: {
      totalAttempts: metric?.totalAttempts ?? 0,
      accuracy: metric?.overallAccuracy ?? 0,
      recentAccuracy: metric?.recentAccuracy ?? 0,
      masteryScore: metric?.masteryScore ?? 0,
      confidenceLevel: metric?.confidenceLevel ?? 'none',
      recurringMistakes: metric?.recurringMistakesCount ?? 0,
      detail:
        metric && metric.totalAttempts > 0
          ? `${metric.correctAnswers}/${metric.totalAttempts} correct (${metric.masteryScore}% mastery, ${metric.confidenceLevel} confidence).`
          : `0 attempts recorded for ${targetMeta.name}.`,
    },
    confidenceLevel: metric?.confidenceLevel ?? 'none',
  };
}

/**
 * Compute a session adaptation summary ("What Changed & Why") comparing topic state
 * before and after a completed quiz session.
 */
export function buildSessionAdaptationDelta(params: {
  topicId: string;
  previousMetric: TopicMasteryMetrics;
  updatedMetric: TopicMasteryMetrics;
  previousDifficulty: number;
  mistakePatterns: RecurringMistakePattern[];
  allTopicMetrics: TopicMasteryMetrics[];
  recommendations: EvidenceRecommendation[];
  sessionMistakesCount: number;
  persistenceStatus: PersistenceStatus;
  persistenceMessage: string;
}): SessionAdaptationDelta {
  const {
    topicId,
    previousMetric,
    updatedMetric,
    previousDifficulty,
    mistakePatterns,
    allTopicMetrics,
    recommendations,
    sessionMistakesCount,
    persistenceStatus,
    persistenceMessage,
  } = params;

  const difficultyDecision = selectAdaptiveDifficulty(updatedMetric);
  const strategyDecision = selectExplanationStrategy({
    topicMetric: updatedMetric,
    mistakePatterns,
    allTopicMetrics,
    recentSessionMistakes: sessionMistakesCount,
  });
  const nextAction = determineNextLearningAction({
    topicMetrics: allTopicMetrics,
    mistakePatterns,
    recommendations,
    focusTopicId: topicId,
  });

  return {
    topicId: updatedMetric.topicId,
    topicName: updatedMetric.topicName,
    previousMastery: previousMetric.masteryScore,
    newMastery: updatedMetric.masteryScore,
    masteryDelta: updatedMetric.masteryScore - previousMetric.masteryScore,
    previousConfidence: previousMetric.confidenceLevel,
    newConfidence: updatedMetric.confidenceLevel,
    previousDifficulty,
    nextSuggestedDifficulty: difficultyDecision.targetLevel,
    selectedStrategy: strategyDecision.strategy,
    strategyReason: strategyDecision.strategyReason,
    nextAction,
    persistenceStatus,
    persistenceMessage,
  };
}
