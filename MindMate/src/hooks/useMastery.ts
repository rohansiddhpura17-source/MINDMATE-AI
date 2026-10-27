import { useCallback, useEffect, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import {
  ANALYTICS_UPDATED_EVENT,
  buildLearnerAnalyticsSnapshot,
  loadLearnerAnalytics,
  readLocalAttempts,
  recordVerifiedAttempt,
} from '../services/assessment/assessmentService';
import type { LearnerAnalyticsSnapshot } from '../services/assessment/types';
import type { Topic } from '../types';

type TopicPerformance = {
  attempts: number;
  correct: number;
};

function mapMasteryStatusToLegacy(
  status: string,
  masteryScore: number,
  totalAttempts: number
): Topic['status'] {
  if (totalAttempts === 0) return 'needs-work';
  if (status === 'mastered') return 'mastered';
  if (status === 'strong') return 'strong';
  if (status === 'developing') return 'developing';
  if (masteryScore < 30) return 'critical';
  return 'needs-work';
}

export function useMastery() {
  const { user } = useAppContext();
  const userId = user?.id || 'guest';

  const [snapshot, setSnapshot] = useState<LearnerAnalyticsSnapshot>(() =>
    buildLearnerAnalyticsSnapshot(user?.id || null, readLocalAttempts(userId))
  );
  const [loading, setLoading] = useState<boolean>(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await loadLearnerAnalytics(user?.id || null);
      setSnapshot(next);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const syncLocal = () => {
      setSnapshot(
        buildLearnerAnalyticsSnapshot(user?.id || null, readLocalAttempts(userId))
      );
    };

    window.addEventListener('focus', syncLocal);
    window.addEventListener('storage', syncLocal);
    window.addEventListener(ANALYTICS_UPDATED_EVENT, syncLocal);
    window.addEventListener('mindmate-mastery-updated', syncLocal);
    window.addEventListener('mindmate-demo-mode-changed', syncLocal);

    return () => {
      window.removeEventListener('focus', syncLocal);
      window.removeEventListener('storage', syncLocal);
      window.removeEventListener(ANALYTICS_UPDATED_EVENT, syncLocal);
      window.removeEventListener('mindmate-mastery-updated', syncLocal);
      window.removeEventListener('mindmate-demo-mode-changed', syncLocal);
    };
  }, [user?.id, userId]);

  const recordAnswer = useCallback(
    (
      topicName: string,
      isCorrect: boolean,
      extra?: {
        questionId?: string;
        questionText?: string;
        options?: string[];
        selectedOption?: number;
        correctOption?: number;
        difficulty?: number;
        explanation?: string;
        quizId?: string;
        attemptType?: 'diagnostic' | 'follow_up' | 'adaptive' | 'mistake_review';
        sessionId?: string;
        clientAttemptId?: string;
        responseDurationMs?: number;
      }
    ) => {
      void recordVerifiedAttempt({
        user_id: userId,
        client_attempt_id: extra?.clientAttemptId,
        quiz_id: extra?.quizId || 'diagnostic-quiz',
        attempt_type: extra?.attemptType || 'diagnostic',
        session_id: extra?.sessionId || `diag-${Date.now()}`,
        topic_id: topicName,
        topic_name: topicName,
        question_id: extra?.questionId || `q-${topicName}-${Date.now()}`,
        question_text: extra?.questionText || `${topicName} diagnostic question`,
        options: extra?.options || [],
        selected_option: extra?.selectedOption ?? (isCorrect ? 0 : 1),
        correct_option: extra?.correctOption ?? 0,
        is_correct: isCorrect,
        difficulty: extra?.difficulty ?? 2,
        explanation: extra?.explanation || '',
        response_duration_ms: extra?.responseDurationMs,
      });
    },
    [userId]
  );

  const topics: Topic[] = snapshot.topics.map((t) => ({
    name: t.topicName,
    mastery: t.masteryScore,
    status: mapMasteryStatusToLegacy(t.status, t.masteryScore, t.totalAttempts),
  }));

  const performance: Record<string, TopicPerformance> = {};
  for (const t of snapshot.topics) {
    performance[t.topicName] = {
      attempts: t.totalAttempts,
      correct: t.correctAnswers,
    };
  }

  const assessedTopics = snapshot.topics.filter((t) => t.totalAttempts > 0);
  const weakestMetric =
    assessedTopics.length > 0
      ? [...assessedTopics].sort((a, b) => a.masteryScore - b.masteryScore)[0]
      : snapshot.topics[0];
  const strongestMetric =
    assessedTopics.length > 0
      ? [...assessedTopics].sort((a, b) => b.masteryScore - a.masteryScore)[0]
      : snapshot.topics[0];

  const weakestTopic: Topic = weakestMetric
    ? {
        name: weakestMetric.topicName,
        mastery: weakestMetric.masteryScore,
        status: mapMasteryStatusToLegacy(
          weakestMetric.status,
          weakestMetric.masteryScore,
          weakestMetric.totalAttempts
        ),
      }
    : { name: 'Variables & Scope', mastery: 0, status: 'needs-work' };

  const strongestTopic: Topic = strongestMetric
    ? {
        name: strongestMetric.topicName,
        mastery: strongestMetric.masteryScore,
        status: mapMasteryStatusToLegacy(
          strongestMetric.status,
          strongestMetric.masteryScore,
          strongestMetric.totalAttempts
        ),
      }
    : { name: 'Variables & Scope', mastery: 0, status: 'needs-work' };

  return {
    topics,
    performance,
    recordAnswer,
    weakestTopic,
    strongestTopic,
    overallMastery: snapshot.averageMastery,
    snapshot,
    loading,
    refresh,
  };
}
