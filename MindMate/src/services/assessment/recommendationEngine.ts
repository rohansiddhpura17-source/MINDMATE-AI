import { TOPICS, resolveTopicMetadata } from '../../data/learningContent';
import type {
  DifficultyBand,
  EvidenceRecommendation,
  ExplanationStrategy,
  RecurringMistakePattern,
  TopicMasteryMetrics,
} from './types';

function difficultyNumberToBand(level: number): DifficultyBand {
  if (level <= 2) return 'easy';
  if (level === 3) return 'medium';
  return 'hard';
}

function chooseExplanationStrategyForTopic(
  metric: TopicMasteryMetrics,
  topicPatterns: RecurringMistakePattern[],
  hasWeakPrerequisite: boolean
): ExplanationStrategy {
  if (hasWeakPrerequisite) {
    return 'prerequisite-review';
  }
  const confirmedPattern = topicPatterns.find((p) => p.isConfirmedPattern);
  if (confirmedPattern) {
    return confirmedPattern.suggestedStrategy;
  }
  if (metric.totalAttempts === 0) {
    return 'conceptual-recap';
  }
  if (metric.masteryScore < 45 || metric.recentAccuracy < 50) {
    return metric.incorrectAnswers >= 3 ? 'simple-analogy' : 'worked-example';
  }
  if (metric.masteryScore < 75) {
    return 'step-by-step';
  }
  return 'guided-practice';
}

/**
 * Generate prioritized, evidence-backed learning recommendations from actual
 * stored topic mastery metrics and recurring mistake patterns.
 *
 * Every recommendation includes explicit supporting evidence traced to real learner attempts.
 */
export function generateEvidenceRecommendations(
  topicMetrics: TopicMasteryMetrics[],
  mistakePatterns: RecurringMistakePattern[],
  nowIso: string = new Date().toISOString()
): EvidenceRecommendation[] {
  const recommendations: EvidenceRecommendation[] = [];
  const metricsMap = new Map<string, TopicMasteryMetrics>();
  for (const m of topicMetrics) {
    metricsMap.set(m.topicId, m);
  }

  const totalAttemptsAcrossAll = topicMetrics.reduce(
    (sum, m) => sum + m.totalAttempts,
    0
  );

  // Case 0: Brand new learner with 0 attempts anywhere -> Recommend Diagnostic Quiz on foundational topic
  if (totalAttemptsAcrossAll === 0) {
    const starterTopics = ['python-variables', 'python-functions', 'dbms-sql', 'dsa-queues-stacks'];
    starterTopics.forEach((topicId, idx) => {
      const meta = resolveTopicMetadata(topicId);
      recommendations.push({
        id: `rec-diagnostic-${topicId}`,
        action: 'diagnostic-quiz',
        topicId: meta.id,
        topicName: meta.name,
        subjectId: meta.subjectId,
        reason: `No assessment evidence exists yet for ${meta.name}. Take a short diagnostic quiz to establish your baseline mastery.`,
        supportingEvidence: {
          totalAttempts: 0,
          accuracy: 0,
          recentAccuracy: 0,
          masteryScore: 0,
          confidenceLevel: 'none',
          recurringMistakes: 0,
          detail: '0 attempts recorded; baseline diagnostic required before adaptive calibration.',
        },
        suggestedDifficulty: 'easy',
        suggestedDifficultyLevel: 2,
        explanationStrategy: 'conceptual-recap',
        priority: idx + 1,
        createdAt: nowIso,
      });
    });
    return recommendations;
  }

  for (const metric of topicMetrics) {
    const meta = resolveTopicMetadata(metric.topicId);
    const topicPatterns = mistakePatterns.filter((p) => p.topicId === metric.topicId);
    const confirmedMistakes = topicPatterns.filter((p) => p.isConfirmedPattern);

    // 1. Check explicit curriculum prerequisites when a topic has struggles (mastery < 60 or >= 2 errors)
    if (
      metric.totalAttempts > 0 &&
      (metric.masteryScore < 60 || metric.incorrectAnswers >= 2) &&
      meta.prerequisites &&
      meta.prerequisites.length > 0
    ) {
      for (const prereqId of meta.prerequisites) {
        const prereqMetric = metricsMap.get(prereqId);
        const prereqMeta = resolveTopicMetadata(prereqId);
        const prereqWeak =
          !prereqMetric ||
          prereqMetric.totalAttempts === 0 ||
          prereqMetric.masteryScore < 60;

        if (prereqWeak) {
          const prereqScore = prereqMetric?.masteryScore ?? 0;
          const prereqAttempts = prereqMetric?.totalAttempts ?? 0;
          recommendations.push({
            id: `rec-prereq-${metric.topicId}-via-${prereqId}`,
            action: 'prerequisite-review',
            topicId: prereqMeta.id,
            topicName: prereqMeta.name,
            subjectId: prereqMeta.subjectId,
            reason:
              prereqAttempts === 0
                ? `You missed ${metric.incorrectAnswers} of ${metric.totalAttempts} questions in ${metric.topicName}, and its prerequisite ${prereqMeta.name} has not been assessed yet.`
                : `Your mastery in ${metric.topicName} is ${metric.masteryScore}% (${metric.incorrectAnswers} errors), and foundational prerequisite ${prereqMeta.name} is also weak (${prereqScore}% mastery across ${prereqAttempts} attempts).`,
            supportingEvidence: {
              totalAttempts: metric.totalAttempts,
              accuracy: metric.overallAccuracy,
              recentAccuracy: metric.recentAccuracy,
              masteryScore: metric.masteryScore,
              confidenceLevel: metric.confidenceLevel,
              recurringMistakes: metric.recurringMistakesCount,
              prerequisiteTopicId: prereqMeta.id,
              prerequisiteTopicName: prereqMeta.name,
              prerequisiteMastery: prereqScore,
              detail: `${metric.topicName}: ${metric.correctAnswers}/${metric.totalAttempts} correct (${metric.masteryScore}% mastery); prerequisite ${prereqMeta.name}: ${prereqScore}% mastery.`,
            },
            suggestedDifficulty: 'easy',
            suggestedDifficultyLevel: 1,
            explanationStrategy: 'prerequisite-review',
            priority: 1,
            createdAt: nowIso,
          });
        }
      }
    }

    // 2. Topic with repeated / recurring errors (confirmed mistake pattern or >= 2 unresolved mistakes)
    if (confirmedMistakes.length > 0 || metric.unresolvedMistakesCount >= 2) {
      const topPattern = confirmedMistakes[0] || topicPatterns[0];
      const strategy = chooseExplanationStrategyForTopic(metric, topicPatterns, false);
      const targetLevel = metric.masteryScore < 45 ? 1 : 2;
      recommendations.push({
        id: `rec-mistakes-${metric.topicId}`,
        action: 'targeted-practice',
        topicId: metric.topicId,
        topicName: metric.topicName,
        subjectId: metric.subjectId,
        reason: topPattern
          ? `${topPattern.summary}. ${topPattern.evidenceDetail}`
          : `You have ${metric.unresolvedMistakesCount} unresolved mistakes in ${metric.topicName} (${metric.overallAccuracy}% accuracy across ${metric.totalAttempts} attempts).`,
        supportingEvidence: {
          totalAttempts: metric.totalAttempts,
          accuracy: metric.overallAccuracy,
          recentAccuracy: metric.recentAccuracy,
          masteryScore: metric.masteryScore,
          confidenceLevel: metric.confidenceLevel,
          recurringMistakes: Math.max(
            metric.recurringMistakesCount,
            confirmedMistakes.length
          ),
          detail: `${metric.incorrectAnswers} incorrect out of ${metric.totalAttempts} attempts (${metric.unresolvedMistakesCount} unresolved); recent accuracy ${metric.recentAccuracy}%.`,
        },
        suggestedDifficulty: difficultyNumberToBand(targetLevel),
        suggestedDifficultyLevel: targetLevel,
        explanationStrategy: strategy,
        priority: 2,
        createdAt: nowIso,
      });
      continue;
    }

    // 3. Declining recent accuracy (recentAccuracy dropped >= 15 points below overallAccuracy with >= 4 attempts)
    if (
      metric.totalAttempts >= 4 &&
      metric.recentAccuracy <= metric.overallAccuracy - 15
    ) {
      recommendations.push({
        id: `rec-decline-${metric.topicId}`,
        action: 'concept-explanation',
        topicId: metric.topicId,
        topicName: metric.topicName,
        subjectId: metric.subjectId,
        reason: `Recent accuracy in ${metric.topicName} dropped to ${metric.recentAccuracy}% compared to ${metric.overallAccuracy}% overall across ${metric.totalAttempts} attempts.`,
        supportingEvidence: {
          totalAttempts: metric.totalAttempts,
          accuracy: metric.overallAccuracy,
          recentAccuracy: metric.recentAccuracy,
          masteryScore: metric.masteryScore,
          confidenceLevel: metric.confidenceLevel,
          recurringMistakes: metric.recurringMistakesCount,
          detail: `Recent window accuracy (${metric.recentAccuracy}%) is ${metric.overallAccuracy - metric.recentAccuracy}% lower than overall accuracy (${metric.overallAccuracy}%).`,
        },
        suggestedDifficulty: 'medium',
        suggestedDifficultyLevel: 2,
        explanationStrategy: 'worked-example',
        priority: 3,
        createdAt: nowIso,
      });
      continue;
    }

    // 4. Insufficient evidence (1-2 attempts recorded) -> recommend follow-up quiz to build confidence
    if (metric.totalAttempts > 0 && metric.totalAttempts <= 2) {
      const nextLevel = metric.recentAccuracy >= 80 ? 3 : 2;
      recommendations.push({
        id: `rec-followup-${metric.topicId}`,
        action: 'follow-up-quiz',
        topicId: metric.topicId,
        topicName: metric.topicName,
        subjectId: metric.subjectId,
        reason: `Only ${metric.totalAttempts} attempt${metric.totalAttempts === 1 ? '' : 's'} recorded in ${metric.topicName} (${metric.confidenceLevel} confidence). Complete a follow-up quiz to verify your ${metric.masteryScore}% mastery estimate.`,
        supportingEvidence: {
          totalAttempts: metric.totalAttempts,
          accuracy: metric.overallAccuracy,
          recentAccuracy: metric.recentAccuracy,
          masteryScore: metric.masteryScore,
          confidenceLevel: metric.confidenceLevel,
          recurringMistakes: metric.recurringMistakesCount,
          detail: `${metric.correctAnswers}/${metric.totalAttempts} correct (${metric.confidenceLevel} confidence; at least 5 attempts needed for medium/high confidence).`,
        },
        suggestedDifficulty: difficultyNumberToBand(nextLevel),
        suggestedDifficultyLevel: nextLevel,
        explanationStrategy:
          metric.incorrectAnswers > 0 ? 'step-by-step' : 'guided-practice',
        priority: 4,
        createdAt: nowIso,
      });
      continue;
    }

    // 5. Strong mastery & recent accuracy (>= 70% mastery and >= 75% recent accuracy with >= 3 attempts) -> advance difficulty
    if (
      metric.totalAttempts >= 3 &&
      metric.masteryScore >= 70 &&
      metric.recentAccuracy >= 75
    ) {
      const hardAttempts = metric.difficultyPerformance.hard.attempts;
      const suggestedLevel = hardAttempts === 0 ? 4 : 5;
      recommendations.push({
        id: `rec-advance-${metric.topicId}`,
        action: 'advance-difficulty',
        topicId: metric.topicId,
        topicName: metric.topicName,
        subjectId: metric.subjectId,
        reason: `Strong performance in ${metric.topicName} (${metric.masteryScore}% mastery, ${metric.recentAccuracy}% recent accuracy across ${metric.totalAttempts} attempts). Advance to difficulty ${suggestedLevel} challenge questions.`,
        supportingEvidence: {
          totalAttempts: metric.totalAttempts,
          accuracy: metric.overallAccuracy,
          recentAccuracy: metric.recentAccuracy,
          masteryScore: metric.masteryScore,
          confidenceLevel: metric.confidenceLevel,
          recurringMistakes: metric.recurringMistakesCount,
          detail: `${metric.correctAnswers}/${metric.totalAttempts} correct (${metric.recentAccuracy}% recent accuracy, ${metric.confidenceLevel} confidence).`,
        },
        suggestedDifficulty: 'hard',
        suggestedDifficultyLevel: suggestedLevel,
        explanationStrategy: 'guided-practice',
        priority: 5,
        createdAt: nowIso,
      });
    }
  }

  // Also recommend diagnostic quiz for unassessed topics whose prerequisites are already strong (>= 65%)
  for (const topic of TOPICS) {
    const metric = metricsMap.get(topic.id);
    if (!metric || metric.totalAttempts === 0) {
      const prereqs = topic.prerequisites || [];
      const prereqsSatisfied =
        prereqs.length === 0 ||
        prereqs.every((pId) => (metricsMap.get(pId)?.masteryScore ?? 0) >= 60);
      if (prereqsSatisfied) {
        recommendations.push({
          id: `rec-unassessed-${topic.id}`,
          action: 'diagnostic-quiz',
          topicId: topic.id,
          topicName: topic.name,
          subjectId: topic.subjectId,
          reason:
            prereqs.length > 0
              ? `You have built a foundation in prerequisite topics and have 0 attempts in ${topic.name}. Take a diagnostic quiz to unlock adaptive practice.`
              : `No attempts recorded yet in ${topic.name}. Take a diagnostic quiz to measure baseline understanding.`,
          supportingEvidence: {
            totalAttempts: 0,
            accuracy: 0,
            recentAccuracy: 0,
            masteryScore: 0,
            confidenceLevel: 'none',
            recurringMistakes: 0,
            detail: `0 attempts in ${topic.name}.`,
          },
          suggestedDifficulty: 'easy',
          suggestedDifficultyLevel: 2,
          explanationStrategy: 'conceptual-recap',
          priority: 6,
          createdAt: nowIso,
        });
      }
    }
  }

  return recommendations.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.supportingEvidence.masteryScore - b.supportingEvidence.masteryScore;
  });
}
