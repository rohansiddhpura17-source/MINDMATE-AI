import assert from 'node:assert/strict';
import {
  calculateTopicMastery,
  calculateAllTopicsMastery,
  PRIOR_MASTERY_BASELINE,
  EASY_ONLY_CEILING,
} from '../assessment/masteryEngine';
import { analyzeRecurringMistakes } from '../assessment/mistakeAnalyzer';
import { generateEvidenceRecommendations } from '../assessment/recommendationEngine';
import {
  recordVerifiedAttempt,
  readLocalAttempts,
  clearLocalAttempts,
  loadLearnerAnalytics,
  buildLearnerAnalyticsSnapshot,
} from '../assessment/assessmentService';
import {
  selectAdaptiveDifficulty,
  selectNextQuestion,
  selectExplanationStrategy,
  determineNextLearningAction,
  buildSessionAdaptationDelta,
} from '../adaptive/adaptiveLearningEngine';
import {
  OllamaAdapter,
  OllamaError,
  DEFAULT_OLLAMA_MODEL,
  sanitizePromptText,
  validateGeneratedQuestionDraft,
} from '../ai/ollamaAdapter';
import { aiTutorService, AITutorService } from '../ai/aiTutorService';
import { cloudAIAdapter } from '../ai/cloudAdapter';
import { localWebLLMAdapter } from '../ai/localWebLLMAdapter';
import {
  validateZoomMeetingUrl,
  validateZoomClassInput,
  createZoomClass,
  updateZoomClass,
  deleteZoomClass,
  listZoomClasses,
  getDeterministicPlannerTaskId,
} from '../zoom/zoomClassesService';
import { AttemptRecord } from '../assessment/types';
import { MULTILINGUAL_QUESTIONS } from '../../data/learningContent';

export interface TestCaseResult {
  id: number;
  name: string;
  passed: boolean;
  error?: string;
}

function makeAttempt(overrides: Partial<AttemptRecord> & { index?: number }): AttemptRecord {
  const idx = overrides.index ?? 1;
  const isCorrect = overrides.is_correct ?? true;
  return {
    id: overrides.id ?? `att-${idx}`,
    client_attempt_id: overrides.client_attempt_id ?? `client-att-${idx}`,
    user_id: overrides.user_id ?? 'test-learner-1',
    quiz_id: overrides.quiz_id ?? 'quiz-1',
    attempt_type: overrides.attempt_type ?? 'adaptive',
    session_id: overrides.session_id ?? 'sess-1',
    subject_id: overrides.subject_id ?? 'python',
    topic_id: overrides.topic_id ?? 'python-loops',
    topic_name: overrides.topic_name ?? 'Loops & Iteration',
    concept_tag: overrides.concept_tag ?? 'for-while-loops',
    question_id: overrides.question_id ?? `py-loop-${idx}`,
    question_text: overrides.question_text ?? `Question ${idx}`,
    options: overrides.options ?? ['Option A', 'Option B', 'Option C', 'Option D'],
    selected_option: overrides.selected_option ?? (isCorrect ? 0 : 1),
    correct_option: overrides.correct_option ?? 0,
    is_correct: isCorrect,
    difficulty: overrides.difficulty ?? 3,
    explanation: overrides.explanation ?? 'Detailed explanation.',
    response_duration_ms: overrides.response_duration_ms ?? 4200,
    resolved: overrides.resolved ?? isCorrect,
    attempted_at:
      overrides.attempted_at ?? new Date(Date.UTC(2026, 9, 25, 10, 0, idx)).toISOString(),
    persistence_source: overrides.persistence_source ?? 'local',
  };
}

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const mockStorage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockStorage,
    configurable: true,
    writable: true,
  });
  return mockStorage;
}

export async function runAllAdaptiveAndAssessmentTests(): Promise<TestCaseResult[]> {
  installMemoryLocalStorage();
  const results: TestCaseResult[] = [];

  async function runTest(id: number, name: string, fn: () => Promise<void> | void) {
    try {
      await fn();
      results.push({ id, name, passed: true });
    } catch (err: any) {
      results.push({
        id,
        name,
        passed: false,
        error: err?.stack || err?.message || String(err),
      });
    }
  }

  // TEST 1: Mastery calculation with all correct, all wrong, and mixed attempts
  await runTest(1, 'Mastery calculation with all correct, all wrong, and mixed attempts', () => {
    const allCorrect = [1, 2, 3, 4, 5, 6, 7, 8].map((i) =>
      makeAttempt({
        index: i,
        is_correct: true,
        difficulty: i <= 2 ? 2 : i <= 5 ? 3 : 4,
      })
    );
    const mCorrect = calculateTopicMastery('python-loops', allCorrect);
    assert.equal(mCorrect.totalAttempts, 8);
    assert.equal(mCorrect.correctAnswers, 8);
    assert.equal(mCorrect.incorrectAnswers, 0);
    assert.equal(mCorrect.overallAccuracy, 100);
    assert.equal(mCorrect.recentAccuracy, 100);
    assert.equal(mCorrect.masteryScore, 100);
    assert.equal(mCorrect.status, 'mastered');
    assert.equal(mCorrect.confidenceLevel, 'high');

    const allWrong = [1, 2, 3, 4, 5].map((i) =>
      makeAttempt({
        index: i,
        is_correct: false,
        selected_option: 1,
        correct_option: 0,
        difficulty: 2,
      })
    );
    const mWrong = calculateTopicMastery('python-loops', allWrong);
    assert.equal(mWrong.totalAttempts, 5);
    assert.equal(mWrong.correctAnswers, 0);
    assert.equal(mWrong.incorrectAnswers, 5);
    assert.equal(mWrong.overallAccuracy, 0);
    assert.equal(mWrong.masteryScore, 0);
    assert.equal(mWrong.status, 'weak');

    const mixed = [
      makeAttempt({ index: 1, is_correct: true, difficulty: 2 }),
      makeAttempt({ index: 2, is_correct: false, selected_option: 2, difficulty: 3 }),
      makeAttempt({ index: 3, is_correct: true, difficulty: 3 }),
      makeAttempt({ index: 4, is_correct: false, selected_option: 1, difficulty: 4 }),
      makeAttempt({ index: 5, is_correct: true, difficulty: 3 }),
    ];
    const mMixed = calculateTopicMastery('python-loops', mixed);
    assert.equal(mMixed.totalAttempts, 5);
    assert.equal(mMixed.correctAnswers, 3);
    assert.equal(mMixed.incorrectAnswers, 2);
    assert.equal(mMixed.overallAccuracy, 60);
    assert.ok(mMixed.masteryScore > 40 && mMixed.masteryScore < 80);
    assert.equal(mMixed.status, 'developing');
    assert.equal(mMixed.difficultyPerformance.easy.attempts, 1);
    assert.equal(mMixed.difficultyPerformance.medium.attempts, 3);
    assert.equal(mMixed.difficultyPerformance.hard.attempts, 1);
  });

  // TEST 2: Recency weighting where recent performance improves or declines
  await runTest(2, 'Recency weighting where recent performance improves or declines', () => {
    // 4 wrong followed by 4 correct (improving learner)
    const improving = [1, 2, 3, 4, 5, 6, 7, 8].map((i) =>
      makeAttempt({
        index: i,
        is_correct: i > 4,
        selected_option: i > 4 ? 0 : 1,
        difficulty: 3,
      })
    );
    // 4 correct followed by 4 wrong (declining learner)
    const declining = [1, 2, 3, 4, 5, 6, 7, 8].map((i) =>
      makeAttempt({
        index: i,
        is_correct: i <= 4,
        selected_option: i <= 4 ? 0 : 1,
        difficulty: 3,
      })
    );

    const mImproving = calculateTopicMastery('python-loops', improving);
    const mDeclining = calculateTopicMastery('python-loops', declining);

    assert.equal(mImproving.overallAccuracy, 50);
    assert.equal(mDeclining.overallAccuracy, 50);
    assert.ok(
      mImproving.recentAccuracy > mDeclining.recentAccuracy,
      `Expected improving recentAccuracy (${mImproving.recentAccuracy}) > declining (${mDeclining.recentAccuracy})`
    );
    assert.ok(
      mImproving.masteryScore > mDeclining.masteryScore,
      `Expected improving masteryScore (${mImproving.masteryScore}) > declining (${mDeclining.masteryScore})`
    );
  });

  // TEST 3: Insufficient-evidence handling (1 easy question does not produce definitive mastery)
  await runTest(3, 'Insufficient-evidence handling (1 easy question never marks topic mastered)', () => {
    const singleEasy = [
      makeAttempt({
        index: 1,
        topic_id: 'python-variables',
        topic_name: 'Variables & Data Types',
        is_correct: true,
        difficulty: 1,
      }),
    ];
    const mSingleEasy = calculateTopicMastery('python-variables', singleEasy);
    assert.equal(mSingleEasy.evidenceCount, 1);
    assert.equal(mSingleEasy.confidenceLevel, 'insufficient');
    assert.notEqual(mSingleEasy.status, 'mastered');
    assert.equal(mSingleEasy.status, 'developing');
    // Sample-size shrinkage with EASY_ONLY_CEILING (75) and PRIOR_MASTERY_BASELINE (45):
    // round(0.2 * 75 + 0.8 * 45) = 51
    const expectedSingleScore = Math.round(0.2 * EASY_ONLY_CEILING + 0.8 * PRIOR_MASTERY_BASELINE);
    assert.equal(mSingleEasy.masteryScore, expectedSingleScore);

    // Even 6 easy questions correct without any medium/hard questions is capped at EASY_ONLY_CEILING (75%)
    const sixEasyOnly = [1, 2, 3, 4, 5, 6].map((i) =>
      makeAttempt({
        index: i,
        topic_id: 'python-variables',
        topic_name: 'Variables & Data Types',
        is_correct: true,
        difficulty: 1,
      })
    );
    const mSixEasy = calculateTopicMastery('python-variables', sixEasyOnly);
    assert.equal(mSixEasy.masteryScore, EASY_ONLY_CEILING);
    assert.notEqual(mSixEasy.status, 'mastered');
    assert.equal(mSixEasy.status, 'strong');
  });

  // TEST 4: Adaptive difficulty selection across boundary values and exhausted-level fallback
  await runTest(4, 'Adaptive difficulty selection across boundary values and fallback notices', () => {
    // Unassessed topic -> starts at easy (level 2)
    const unassessedMetric = calculateTopicMastery('python-loops', []);
    const startDiff = selectAdaptiveDifficulty(unassessedMetric, []);
    assert.equal(startDiff.targetBand, 'easy');
    assert.equal(startDiff.targetLevel, 2);

    // Single correct answer at difficulty 2 -> stays at 2 (requires 2 consecutive correct to step up)
    const oneCorrect = [makeAttempt({ index: 1, is_correct: true, difficulty: 2 })];
    const dAfterOne = selectAdaptiveDifficulty(
      calculateTopicMastery('python-loops', oneCorrect),
      oneCorrect,
      2
    );
    assert.equal(dAfterOne.targetLevel, 2);

    // Two consecutive correct answers at difficulty 2 -> steps up by +1 to difficulty 3 (medium)
    const twoCorrect = [
      makeAttempt({ index: 1, is_correct: true, difficulty: 2 }),
      makeAttempt({ index: 2, is_correct: true, difficulty: 2 }),
    ];
    const dAfterTwo = selectAdaptiveDifficulty(
      calculateTopicMastery('python-loops', twoCorrect),
      twoCorrect,
      2
    );
    assert.equal(dAfterTwo.targetLevel, 3);
    assert.equal(dAfterTwo.targetBand, 'medium');

    // Wrong answer at difficulty 4 -> steps down by 1 to difficulty 3 (bounded step, never jumps 4 -> 1)
    const wrongAtFour = [
      makeAttempt({ index: 1, is_correct: true, difficulty: 3 }),
      makeAttempt({ index: 2, is_correct: false, selected_option: 2, difficulty: 4 }),
    ];
    const dAfterWrong = selectAdaptiveDifficulty(
      calculateTopicMastery('python-loops', wrongAtFour),
      wrongAtFour,
      4
    );
    assert.equal(dAfterWrong.targetLevel, 3);

    // Exhausted difficulty level in selectNextQuestion -> returns fallbackNotice and isDifficultyFallback=true
    const loopQuestions = MULTILINGUAL_QUESTIONS.filter(
      (q) => q.topicId === 'python-loops' && q.language === 'en'
    );
    const level3Ids = loopQuestions.filter((q) => q.difficulty === 3).map((q) => q.id);
    const fallbackSelection = selectNextQuestion({
      topicId: 'python-loops',
      targetDifficulty: 3,
      answeredQuestionIds: level3Ids,
      language: 'en',
    });
    assert.ok(fallbackSelection.question !== null);
    assert.equal(fallbackSelection.isDifficultyFallback, true);
    assert.ok(
      fallbackSelection.fallbackNotice &&
        fallbackSelection.fallbackNotice.includes('level 3'),
      `Expected fallback notice mentioning level 3, got: ${fallbackSelection.fallbackNotice}`
    );
  });

  // TEST 5: Repeated error detection and explanation strategy selection
  await runTest(5, 'Repeated error detection and deterministic explanation strategy selection', () => {
    // 1 wrong answer -> topic_error_summary, isConfirmedPattern=false, no invented misconception
    const oneWrong = [
      makeAttempt({
        index: 1,
        topic_id: 'python-loops',
        concept_tag: 'for-while-loops',
        is_correct: false,
        selected_option: 1,
        correct_option: 0,
        difficulty: 2,
      }),
    ];
    const singlePatterns = analyzeRecurringMistakes(oneWrong);
    assert.equal(singlePatterns.length, 1);
    assert.equal(singlePatterns[0].isConfirmedPattern, false);
    assert.equal(singlePatterns[0].patternType, 'topic_error_summary');
    assert.ok(singlePatterns[0].summary.includes('insufficient evidence for a recurring pattern'));

    // 2 consecutive session errors -> simple-analogy strategy
    const analogyDecision = selectExplanationStrategy({
      topicMetric: calculateTopicMastery('python-loops', oneWrong),
      mistakePatterns: singlePatterns,
      allTopicMetrics: calculateAllTopicsMastery(oneWrong),
      recentSessionMistakes: 2,
    });
    assert.equal(analogyDecision.strategy, 'simple-analogy');
    assert.ok(analogyDecision.strategyReason.length > 15);

    // Repeated concept errors (2 misses on same concept, with prerequisite strong) -> repeated_concept_error & worked-example
    const repeatedMediumWrong = [
      makeAttempt({
        index: 1,
        topic_id: 'python-variables',
        topic_name: 'Variables & Data Types',
        is_correct: true,
        difficulty: 3,
      }),
      makeAttempt({
        index: 2,
        topic_id: 'python-variables',
        topic_name: 'Variables & Data Types',
        is_correct: true,
        difficulty: 3,
      }),
      makeAttempt({
        index: 3,
        topic_id: 'python-variables',
        topic_name: 'Variables & Data Types',
        is_correct: true,
        difficulty: 3,
      }),
      makeAttempt({
        index: 4,
        topic_id: 'python-loops',
        concept_tag: 'for-while-loops',
        question_id: 'py-loop-a',
        is_correct: false,
        selected_option: 1,
        correct_option: 0,
        difficulty: 3,
      }),
      makeAttempt({
        index: 5,
        topic_id: 'python-loops',
        concept_tag: 'for-while-loops',
        question_id: 'py-loop-b',
        is_correct: false,
        selected_option: 2,
        correct_option: 0,
        difficulty: 3,
      }),
      makeAttempt({
        index: 6,
        topic_id: 'python-loops',
        concept_tag: 'comprehensions',
        question_id: 'py-loop-c',
        is_correct: true,
        difficulty: 3,
      }),
    ];
    const allMetricsMed = calculateAllTopicsMastery(repeatedMediumWrong);
    const recurringPatterns = analyzeRecurringMistakes(repeatedMediumWrong, allMetricsMed);
    const loopPattern = recurringPatterns.find(
      (p) => p.topicId === 'python-loops' && p.isConfirmedPattern
    );
    assert.ok(loopPattern);
    assert.equal(loopPattern.patternType, 'repeated_concept_error');

    const loopMetricMed = allMetricsMed.find((m) => m.topicId === 'python-loops')!;
    const workedStrategy = selectExplanationStrategy({
      topicMetric: loopMetricMed,
      mistakePatterns: recurringPatterns,
      allTopicMetrics: allMetricsMed,
      recentSessionMistakes: 0,
    });
    assert.equal(workedStrategy.strategy, 'worked-example');
  });

  // TEST 6: Recommendation generation with evidence tracing and prerequisite detection
  await runTest(6, 'Recommendation generation with evidence tracing and prerequisite detection', () => {
    // Learner fails prerequisite (python-variables) AND fails dependent topic (python-loops)
    const prereqAttempts = [
      makeAttempt({
        index: 1,
        topic_id: 'python-variables',
        topic_name: 'Variables & Data Types',
        is_correct: false,
        selected_option: 1,
        difficulty: 2,
      }),
      makeAttempt({
        index: 2,
        topic_id: 'python-variables',
        topic_name: 'Variables & Data Types',
        is_correct: false,
        selected_option: 2,
        difficulty: 2,
      }),
      makeAttempt({
        index: 3,
        topic_id: 'python-loops',
        topic_name: 'Loops & Iteration',
        is_correct: false,
        selected_option: 1,
        difficulty: 3,
      }),
      makeAttempt({
        index: 4,
        topic_id: 'python-loops',
        topic_name: 'Loops & Iteration',
        is_correct: false,
        selected_option: 2,
        difficulty: 3,
      }),
    ];

    const metrics = calculateAllTopicsMastery(prereqAttempts);
    const mistakes = analyzeRecurringMistakes(prereqAttempts, metrics);
    const recs = generateEvidenceRecommendations(metrics, mistakes);

    assert.ok(recs.length > 0);
    const prereqRec = recs.find((r) => r.action === 'prerequisite-review');
    assert.ok(prereqRec, 'Expected a prerequisite-review recommendation when python-variables is weak');
    assert.equal(prereqRec.topicId, 'python-variables');
    assert.equal(prereqRec.supportingEvidence.prerequisiteTopicId, 'python-variables');
    assert.ok(prereqRec.supportingEvidence.detail.length > 10);
  });

  // TEST 7: Attempt persistence and duplicate-submission protection (idempotency)
  await runTest(7, 'Attempt persistence and duplicate-submission protection via client_attempt_id', async () => {
    const userId = 'guest-idempotency-user';
    clearLocalAttempts(userId);

    const firstRes = await recordVerifiedAttempt({
      user_id: userId,
      client_attempt_id: 'idem-attempt-001',
      quiz_id: 'quiz-idem',
      attempt_type: 'diagnostic',
      session_id: 'sess-idem',
      subject_id: 'python',
      topic_id: 'python-variables',
      topic_name: 'Variables & Data Types',
      concept_tag: 'variable-binding',
      question_id: 'py-var-1',
      question_text: 'What is dynamic typing?',
      options: ['A', 'B', 'C', 'D'],
      selected_option: 1,
      correct_option: 1,
      is_correct: true,
      difficulty: 2,
      explanation: 'Python binds types to values at runtime.',
    });

    assert.equal(firstRes.duplicate, false);
    assert.ok(firstRes.attempt);

    // Retry with identical client_attempt_id
    const secondRes = await recordVerifiedAttempt({
      user_id: userId,
      client_attempt_id: 'idem-attempt-001',
      quiz_id: 'quiz-idem',
      attempt_type: 'diagnostic',
      session_id: 'sess-idem',
      subject_id: 'python',
      topic_id: 'python-variables',
      topic_name: 'Variables & Data Types',
      concept_tag: 'variable-binding',
      question_id: 'py-var-1',
      question_text: 'What is dynamic typing?',
      options: ['A', 'B', 'C', 'D'],
      selected_option: 1,
      correct_option: 1,
      is_correct: true,
      difficulty: 2,
      explanation: 'Python binds types to values at runtime.',
    });

    assert.equal(secondRes.duplicate, true);
    const stored = readLocalAttempts(userId);
    assert.equal(stored.length, 1, 'Duplicate submission must not create a second attempt record');
    assert.equal(secondRes.topicMastery.totalAttempts, 1);
  });

  // TEST 8: Analytics update after quiz completion
  await runTest(8, 'Analytics snapshot updates consistently after quiz completion', async () => {
    const userId = 'guest-analytics-user';
    clearLocalAttempts(userId);

    const beforeSnap = await loadLearnerAnalytics(userId);
    assert.equal(beforeSnap.totalAttempts, 0);
    assert.equal(beforeSnap.assessedTopicsCount, 0);

    await recordVerifiedAttempt({
      user_id: userId,
      client_attempt_id: 'batch-1',
      quiz_id: 'quiz-b1',
      attempt_type: 'diagnostic',
      session_id: 'sess-b1',
      subject_id: 'dbms',
      topic_id: 'dbms-sql',
      topic_name: 'SQL Queries & Joins',
      concept_tag: 'joins',
      question_id: 'db-sql-1',
      question_text: 'Which JOIN returns matching rows in both tables?',
      options: ['LEFT', 'INNER', 'OUTER', 'CROSS'],
      selected_option: 1,
      correct_option: 1,
      is_correct: true,
      difficulty: 2,
      explanation: 'INNER JOIN returns rows matching in both tables.',
    });

    await recordVerifiedAttempt({
      user_id: userId,
      client_attempt_id: 'batch-2',
      quiz_id: 'quiz-b1',
      attempt_type: 'diagnostic',
      session_id: 'sess-b1',
      subject_id: 'dbms',
      topic_id: 'dbms-sql',
      topic_name: 'SQL Queries & Joins',
      concept_tag: 'sql-filtering-aggregation',
      question_id: 'db-sql-2',
      question_text: 'Which clause filters grouped rows?',
      options: ['WHERE', 'HAVING', 'ORDER BY', 'GROUP BY'],
      selected_option: 1,
      correct_option: 1,
      is_correct: true,
      difficulty: 3,
      explanation: 'HAVING filters aggregated groups.',
    });

    const afterSnap = await loadLearnerAnalytics(userId);
    assert.equal(afterSnap.totalAttempts, 2);
    assert.equal(afterSnap.totalCorrect, 2);
    assert.equal(afterSnap.overallAccuracy, 100);
    assert.equal(afterSnap.assessedTopicsCount, 1);
    const sqlMetric = afterSnap.topics.find((m) => m.topicId === 'dbms-sql')!;
    assert.equal(sqlMetric.totalAttempts, 2);
    assert.ok(sqlMetric.masteryScore > PRIOR_MASTERY_BASELINE);
  });

  // TEST 9: Fallback behavior when Supabase is not configured
  await runTest(9, 'Fallback behavior when Supabase is not configured never fakes cloud save', async () => {
    const userId = 'guest-offline-user';
    clearLocalAttempts(userId);

    const res = await recordVerifiedAttempt({
      user_id: userId,
      client_attempt_id: 'offline-only-1',
      quiz_id: 'quiz-off',
      attempt_type: 'adaptive',
      session_id: 'sess-off',
      subject_id: 'dsa',
      topic_id: 'dsa-trees',
      topic_name: 'Trees & Graphs',
      question_id: 'dsa-tree-1',
      question_text: 'Inorder traversal of BST yields?',
      options: ['Random', 'Sorted ascending', 'Reverse', 'Level order'],
      selected_option: 1,
      correct_option: 1,
      is_correct: true,
      difficulty: 2,
      explanation: 'In-order traversal visits left-root-right, yielding sorted order.',
    });

    assert.notEqual(res.status, 'saved_cloud');
    assert.equal(res.status, 'saved_local_only');
    assert.ok(res.message.toLowerCase().includes('saved locally'));
  });

  // TEST 10: Fallback behavior when Ollama is not running or model gemma4:e2b is missing
  await runTest(10, 'Ollama health check detects not_running and model_missing for gemma4:e2b', async () => {
    const adapterNotRunning = new OllamaAdapter({
      baseUrl: 'http://127.0.0.1:11434',
      model: 'gemma4:e2b',
      fetchImpl: async () => {
        throw new TypeError('fetch failed: ECONNREFUSED');
      },
    });

    const statusDown = await adapterNotRunning.checkHealth();
    assert.equal(statusDown.available, false);
    assert.equal(statusDown.status, 'not_running');
    assert.ok(
      statusDown.recoveryGuidance && statusDown.recoveryGuidance.includes('ollama serve')
    );

    const adapterMissingModel = new OllamaAdapter({
      baseUrl: 'http://127.0.0.1:11434',
      model: 'gemma4:e2b',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            models: [{ name: 'llama3.2:1b' }, { name: 'qwen2.5:0.5b' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        ),
    });

    const statusMissing = await adapterMissingModel.checkHealth();
    assert.equal(statusMissing.available, false);
    assert.equal(statusMissing.status, 'model_missing');
    assert.ok(
      statusMissing.recoveryGuidance &&
        statusMissing.recoveryGuidance.includes('ollama pull gemma4:e2b')
    );
    assert.deepEqual(statusMissing.availableModels, ['llama3.2:1b', 'qwen2.5:0.5b']);
  });

  // TEST 11: Timeout and malformed model output handling in OllamaAdapter + question validator
  await runTest(11, 'Timeout and malformed model output handling in OllamaAdapter', async () => {
    const slowAdapter = new OllamaAdapter({
      baseUrl: 'http://127.0.0.1:11434',
      model: 'gemma4:e2b',
      fetchImpl: async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const abortErr = new Error('The operation was aborted');
            abortErr.name = 'AbortError';
            reject(abortErr);
          });
        }),
    });

    const timeoutStatus = await slowAdapter.checkHealth(30);
    assert.equal(timeoutStatus.status, 'timeout');
    assert.equal(timeoutStatus.available, false);

    // Malformed output in chat stream (empty NDJSON response after healthy /api/tags)
    const emptyOutputAdapter = new OllamaAdapter({
      baseUrl: 'http://127.0.0.1:11434',
      model: 'gemma4:e2b',
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith('/api/tags')) {
          return new Response(
            JSON.stringify({ models: [{ name: 'gemma4:e2b' }] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ message: { content: '   ' }, done: true }) + '\n', {
          status: 200,
        });
      },
    });

    let capturedError: OllamaError | null = null;
    await assert.rejects(async () => {
      await emptyOutputAdapter.sendChatStream(
        {
          messages: [{ role: 'user', content: 'Explain recursion' }],
        },
        {
          onChunk: () => {},
          onComplete: () => {},
          onError: (err) => {
            capturedError = err as OllamaError;
          },
        }
      );
    });
    assert.ok(capturedError !== null);
    assert.equal((capturedError as OllamaError).kind, 'invalid_output');

    // Practice question schema validation rejects malformed drafts and accepts valid drafts
    const invalidDraft = validateGeneratedQuestionDraft(
      '{"question": "Too short", "options": ["A", "A", "B", "C"], "correct": 0, "explanation": "ok"}',
      'python-loops',
      2
    );
    assert.equal(invalidDraft.valid, false);

    const validDraft = validateGeneratedQuestionDraft(
      JSON.stringify({
        topicId: 'python-loops',
        difficulty: 2,
        question: 'Which Python keyword immediately terminates the nearest enclosing loop?',
        options: ['continue', 'pass', 'break', 'return'],
        correct: 2,
        explanation: 'The break statement terminates the current loop immediately.',
        concept: 'for-while-loops',
      }),
      'python-loops',
      2
    );
    assert.equal(validDraft.valid, true);
    if (validDraft.valid) {
      assert.equal(validDraft.draft.correct, 2);
    }

    // Privacy sanitizer strips emails and bearer tokens
    const sanitized = sanitizePromptText(
      'Contact student@university.edu with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def'
    );
    assert.ok(!sanitized.includes('student@university.edu'));
    assert.ok(sanitized.includes('[redacted-email]'));
  });

  // TEST 12: Verification that local mode ('ollama' and 'offline') never calls cloud AI
  await runTest(12, 'Local AI modes (ollama and offline) never invoke cloudAIAdapter', async () => {
    let cloudStreamCalls = 0;
    let cloudStatusCalls = 0;
    const origCloudStream = cloudAIAdapter.sendChatStream.bind(cloudAIAdapter);
    const origCloudStatus = cloudAIAdapter.getStatus.bind(cloudAIAdapter);

    cloudAIAdapter.sendChatStream = async (...args) => {
      cloudStreamCalls += 1;
      return origCloudStream(...args);
    };
    cloudAIAdapter.getStatus = async (...args) => {
      cloudStatusCalls += 1;
      return origCloudStatus(...args);
    };

    try {
      const isolatedTutor = new AITutorService({
        cloudAdapter: cloudAIAdapter,
        localWebLLMAdapter,
        ollamaAdapter: new OllamaAdapter({
          baseUrl: 'http://127.0.0.1:11434',
          model: 'gemma4:e2b-it-qat',
          fetchImpl: async () => {
            throw new TypeError('fetch failed: ECONNREFUSED');
          },
        }),
        initialMode: 'ollama',
      });
      cloudStreamCalls = 0;
      cloudStatusCalls = 0;

      await isolatedTutor.getStatus();
      assert.equal(cloudStatusCalls, 0, 'getStatus() in ollama mode must not call cloudAIAdapter.getStatus()');

      await assert.rejects(async () => {
        await isolatedTutor.sendMessageStream(
          {
            messages: [{ role: 'user', content: 'Help me understand SQL joins' }],
            adaptiveContext: {
              topicId: 'dbms-sql',
              topicName: 'SQL Queries & Joins',
              masteryScore: 42,
              confidenceLevel: 'low',
              targetDifficulty: 'easy',
              explanationStrategy: 'simple-analogy',
              strategyReason: 'Test local mode isolation',
            },
          },
          {}
        );
      });
      assert.equal(cloudStreamCalls, 0, 'sendMessageStream() in ollama mode must NEVER call cloudAIAdapter');

      aiTutorService.setMode('offline');
      cloudStreamCalls = 0;
      cloudStatusCalls = 0;

      await aiTutorService.getStatus();
      assert.equal(cloudStatusCalls, 0, 'getStatus() in offline mode must not call cloudAIAdapter.getStatus()');

      await assert.rejects(async () => {
        await aiTutorService.sendMessageStream(
          {
            messages: [{ role: 'user', content: 'Explain binary search trees' }],
          },
          {}
        );
      });
      assert.equal(cloudStreamCalls, 0, 'sendMessageStream() in offline mode must NEVER call cloudAIAdapter');
    } finally {
      cloudAIAdapter.sendChatStream = origCloudStream;
      cloudAIAdapter.getStatus = origCloudStatus;
      aiTutorService.setMode('auto');
    }
  });

  // TEST 13: End-to-end flow: diagnostic quiz -> mastery update -> recommendation -> follow-up quiz -> updated analytics
  await runTest(
    13,
    'End-to-end flow: diagnostic attempt -> mastery -> recommendation -> follow-up quiz -> updated analytics',
    async () => {
      const userId = 'guest-e2e-learner';
      clearLocalAttempts(userId);

      // 1. Diagnostic quiz on python-loops (1 correct, 2 wrong on for-while-loops)
      await recordVerifiedAttempt({
        user_id: userId,
        client_attempt_id: 'e2e-diag-1',
        quiz_id: 'diag-loops',
        attempt_type: 'diagnostic',
        session_id: 'sess-e2e-diag',
        subject_id: 'python',
        topic_id: 'python-loops',
        topic_name: 'Loops & Iteration',
        concept_tag: 'for-while-loops',
        question_id: 'py-loop-1',
        question_text: 'What does range(3) produce?',
        options: ['0, 1, 2', '1, 2, 3', '0, 1, 2, 3', 'Error'],
        selected_option: 0,
        correct_option: 0,
        is_correct: true,
        difficulty: 1,
        explanation: 'range(3) yields 0, 1, 2.',
      });

      await recordVerifiedAttempt({
        user_id: userId,
        client_attempt_id: 'e2e-diag-2',
        quiz_id: 'diag-loops',
        attempt_type: 'diagnostic',
        session_id: 'sess-e2e-diag',
        subject_id: 'python',
        topic_id: 'python-loops',
        topic_name: 'Loops & Iteration',
        concept_tag: 'for-while-loops',
        question_id: 'py-loop-2',
        question_text: 'What happens if a while condition never becomes False?',
        options: ['Infinite loop', 'SyntaxError', 'Auto break', 'Returns None'],
        selected_option: 2,
        correct_option: 0,
        is_correct: false,
        difficulty: 2,
        explanation: 'A while loop runs indefinitely until its condition is False or break is executed.',
      });

      await recordVerifiedAttempt({
        user_id: userId,
        client_attempt_id: 'e2e-diag-3',
        quiz_id: 'diag-loops',
        attempt_type: 'diagnostic',
        session_id: 'sess-e2e-diag',
        subject_id: 'python',
        topic_id: 'python-loops',
        topic_name: 'Loops & Iteration',
        concept_tag: 'for-while-loops',
        question_id: 'py-loop-3',
        question_text: 'Which statement skips the rest of the current iteration?',
        options: ['break', 'continue', 'pass', 'stop'],
        selected_option: 0,
        correct_option: 1,
        is_correct: false,
        difficulty: 2,
        explanation: 'continue skips to the next loop iteration.',
      });

      // 2. Verify mastery update & recurring mistake detection after diagnostic
      const afterDiagSnap = buildLearnerAnalyticsSnapshot(userId, readLocalAttempts(userId));
      const diagLoopMetric = afterDiagSnap.topics.find((m) => m.topicId === 'python-loops')!;
      assert.equal(diagLoopMetric.totalAttempts, 3);
      assert.equal(diagLoopMetric.correctAnswers, 1);
      assert.equal(diagLoopMetric.incorrectAnswers, 2);
      assert.equal(diagLoopMetric.status, 'weak');

      const diagMistake = afterDiagSnap.mistakePatterns.find(
        (p) => p.topicId === 'python-loops' && p.isConfirmedPattern
      )!;
      assert.ok(diagMistake);
      assert.equal(diagMistake.conceptTag, 'for-while-loops');

      // 3. Verify evidence-based recommendation & nextLearningAction
      const loopRec = afterDiagSnap.recommendations.find((r) => r.topicId === 'python-loops');
      assert.ok(loopRec, 'Expected recommendation targeting python-loops after diagnostic failures');
      const nextActionAfterDiag = determineNextLearningAction({
        topicMetrics: afterDiagSnap.topics,
        mistakePatterns: afterDiagSnap.mistakePatterns,
        recommendations: afterDiagSnap.recommendations,
      });
      assert.ok(nextActionAfterDiag.explanationStrategy);
      assert.ok(nextActionAfterDiag.strategyReason.length > 10);

      // 4. Follow-up adaptive quiz (4 correct answers on python-loops at difficulty 2 & 3)
      const followUpInputs = [
        {
          client_attempt_id: 'e2e-fu-1',
          question_id: 'py-loop-2',
          concept_tag: 'for-while-loops',
          difficulty: 2,
        },
        {
          client_attempt_id: 'e2e-fu-2',
          question_id: 'py-loop-3',
          concept_tag: 'for-while-loops',
          difficulty: 2,
        },
        {
          client_attempt_id: 'e2e-fu-3',
          question_id: 'py-loop-4',
          concept_tag: 'comprehensions',
          difficulty: 3,
        },
        {
          client_attempt_id: 'e2e-fu-4',
          question_id: 'py-loop-5',
          concept_tag: 'comprehensions',
          difficulty: 3,
        },
      ];

      for (const item of followUpInputs) {
        await recordVerifiedAttempt({
          user_id: userId,
          client_attempt_id: item.client_attempt_id,
          quiz_id: 'followup-loops',
          attempt_type: 'follow_up',
          session_id: 'sess-e2e-fu',
          subject_id: 'python',
          topic_id: 'python-loops',
          topic_name: 'Loops & Iteration',
          concept_tag: item.concept_tag,
          question_id: item.question_id,
          question_text: `Follow-up question ${item.question_id}`,
          options: ['Correct', 'Wrong 1', 'Wrong 2', 'Wrong 3'],
          selected_option: 0,
          correct_option: 0,
          is_correct: true,
          difficulty: item.difficulty,
          explanation: 'Verified follow-up explanation.',
        });
      }

      // 5. Verify updated analytics and positive adaptation delta
      const afterFollowUpSnap = buildLearnerAnalyticsSnapshot(userId, readLocalAttempts(userId));
      const updatedLoopMetric = afterFollowUpSnap.topics.find((m) => m.topicId === 'python-loops')!;
      assert.equal(updatedLoopMetric.totalAttempts, 7);
      assert.equal(updatedLoopMetric.correctAnswers, 5);
      assert.ok(
        updatedLoopMetric.masteryScore > diagLoopMetric.masteryScore,
        `Expected follow-up mastery (${updatedLoopMetric.masteryScore}) > diagnostic mastery (${diagLoopMetric.masteryScore})`
      );

      const delta = buildSessionAdaptationDelta({
        topicId: 'python-loops',
        previousMetric: diagLoopMetric,
        updatedMetric: updatedLoopMetric,
        previousDifficulty: 2,
        mistakePatterns: afterFollowUpSnap.mistakePatterns,
        allTopicMetrics: afterFollowUpSnap.topics,
        recommendations: afterFollowUpSnap.recommendations,
        sessionMistakesCount: 0,
        persistenceStatus: 'saved_local_only',
        persistenceMessage: 'Saved locally.',
      });
      assert.ok(delta.masteryDelta > 0);
      assert.ok(delta.newMastery > delta.previousMastery);
      assert.equal(delta.topicId, 'python-loops');
    }
  );

  // TEST 14: Exact configured model gemma4:e2b-it-qat verification + streaming with think:false
  await runTest(
    14,
    'Exact configured model gemma4:e2b-it-qat verification and streaming payload with think:false',
    async () => {
      assert.equal(DEFAULT_OLLAMA_MODEL, 'gemma4:e2b-it-qat');

      // Verify exact tag mismatch: if gemma4:e2b is installed but gemma4:e2b-it-qat is configured, report model_missing
      const adapterTagMismatch = new OllamaAdapter({
        baseUrl: 'http://127.0.0.1:11434',
        model: 'gemma4:e2b-it-qat',
        fetchImpl: async () =>
          new Response(
            JSON.stringify({ models: [{ name: 'gemma4:e2b' }, { name: 'gemma3:1b' }] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          ),
      });
      const mismatchHealth = await adapterTagMismatch.checkHealth(1000, true);
      assert.equal(mismatchHealth.available, false);
      assert.equal(mismatchHealth.status, 'model_missing');

      // Verify streaming request sends think: false and model: gemma4:e2b-it-qat
      let capturedChatBody: Record<string, unknown> | null = null;
      const streamingAdapter = new OllamaAdapter({
        baseUrl: 'http://127.0.0.1:11434',
        model: 'gemma4:e2b-it-qat',
        fetchImpl: async (input, init) => {
          const url = String(input);
          if (url.endsWith('/api/tags')) {
            return new Response(
              JSON.stringify({ models: [{ name: 'gemma4:e2b-it-qat' }] }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
          capturedChatBody = JSON.parse(String(init?.body || '{}'));
          const ndjson =
            JSON.stringify({
              model: 'gemma4:e2b-it-qat',
              message: { role: 'assistant', content: 'A base case ' },
              done: false,
            }) +
            '\n' +
            JSON.stringify({
              model: 'gemma4:e2b-it-qat',
              message: { role: 'assistant', content: 'stops recursion.' },
              done: true,
              load_duration: 42_000_000,
              prompt_eval_duration: 110_000_000,
              eval_duration: 260_000_000,
            }) +
            '\n';
          return new Response(ndjson, { status: 200 });
        },
      });

      const chunks: string[] = [];
      const res = await streamingAdapter.sendChatStream(
        { messages: [{ role: 'user', content: 'What is a base case?' }] },
        { onChunk: (c) => chunks.push(c) }
      );
      assert.ok(capturedChatBody !== null);
      assert.equal((capturedChatBody as Record<string, unknown>).model, 'gemma4:e2b-it-qat');
      assert.equal((capturedChatBody as Record<string, unknown>).think, false);
      assert.equal(chunks.join(''), 'A base case stops recursion.');
      assert.equal(res.content, 'A base case stops recursion.');
      assert.equal(res.model, 'gemma4:e2b-it-qat');
      assert.equal(res.loadDurationMs, 42);
    }
  );

  // TEST 15: WebGPU isolation when Ollama mode is selected
  await runTest(
    15,
    'Selecting Ollama mode never queries WebLLM cache or initializes WebGPU',
    async () => {
      let cacheChecks = 0;
      const origIsCached = localWebLLMAdapter.isModelCached.bind(localWebLLMAdapter);
      localWebLLMAdapter.isModelCached = async () => {
        cacheChecks += 1;
        return origIsCached();
      };

      try {
        aiTutorService.setMode('ollama');
        cacheChecks = 0;
        const status = await aiTutorService.getStatus();
        assert.equal(
          cacheChecks,
          0,
          'getStatus() in ollama mode must not query localWebLLM.isModelCached()'
        );
        assert.equal(status.localLoadingProgress, undefined);

        await assert.rejects(
          async () => {
            await aiTutorService.initializeLocalModel();
          },
          /Cannot initialize Browser WebGPU model while Ollama/
        );
      } finally {
        localWebLLMAdapter.isModelCached = origIsCached;
        aiTutorService.setMode('auto');
      }
    }
  );

  // TEST 16: Zoom Classes validation, CRUD, user isolation, and Planner deduplication
  await runTest(
    16,
    'Zoom Classes validation, CRUD, user isolation, and Planner task deduplication',
    async () => {
      // 1. URL validation
      assert.equal(validateZoomMeetingUrl('https://zoom.us/j/1234567890').valid, true);
      assert.equal(
        validateZoomMeetingUrl('https://us06web.zoom.us/j/9876543210?pwd=abc').valid,
        true
      );
      assert.equal(validateZoomMeetingUrl('http://zoom.us/j/1234567890').valid, false);
      assert.equal(validateZoomMeetingUrl('https://google.com/j/1234567890').valid, false);
      assert.equal(validateZoomMeetingUrl('https://zoom.us/pricing').valid, false);

      // 2. Input validation
      const invalidInput = validateZoomClassInput({
        title: 'Hi',
        scheduled_date: '2026-13-45',
        start_time: '25:99',
        duration_minutes: 5,
        meeting_url: 'not-a-url',
      });
      assert.equal(invalidInput.valid, false);
      assert.ok(invalidInput.errors.title);
      assert.ok(invalidInput.errors.scheduled_date);
      assert.ok(invalidInput.errors.start_time);
      assert.ok(invalidInput.errors.duration_minutes);
      assert.ok(invalidInput.errors.meeting_url);

      // 3. Create, update, user isolation, and Planner deduplication
      const userA = 'zoom-test-user-a';
      const userB = 'zoom-test-user-b';

      const created = await createZoomClass(userA, {
        title: 'Python Recursion Live Lab',
        description: 'Call stack walkthrough',
        instructor_name: 'Dr. Rao',
        scheduled_date: '2026-10-28',
        start_time: '15:30',
        duration_minutes: 60,
        meeting_url: 'https://zoom.us/j/1122334455',
        topic_id: 'python-functions',
      });
      assert.equal(created.error, null);
      assert.ok(created.data);
      const classId = created.data.id;
      assert.equal(created.data.persistence_source, 'local');

      // User B must not see User A's class
      const listB = await listZoomClasses(userB);
      assert.equal(listB.data.length, 0);

      // Update the class twice and verify planner_tasks has exactly 1 deterministic entry
      await updateZoomClass(userA, classId, {
        title: 'Python Recursion Live Lab (Updated)',
        start_time: '16:00',
      });
      const updated2 = await updateZoomClass(userA, classId, {
        duration_minutes: 90,
      });
      assert.equal(updated2.error, null);
      assert.equal(updated2.data?.title, 'Python Recursion Live Lab (Updated)');
      assert.equal(updated2.data?.duration_minutes, 90);

      const plannerRaw = localStorage.getItem(`mindmate_planner_tasks_${userA}`);
      assert.ok(plannerRaw);
      const plannerTasks = JSON.parse(plannerRaw!);
      const matchingTasks = plannerTasks.filter(
        (t: { id: string }) => t.id === getDeterministicPlannerTaskId(classId)
      );
      assert.equal(
        matchingTasks.length,
        1,
        'Repeated Zoom class updates must not duplicate Planner tasks'
      );
      assert.equal(matchingTasks[0].duration, '90 min');

      // Delete class and verify removal from both Zoom classes and Planner
      await deleteZoomClass(userA, classId);
      const listAfterDelete = await listZoomClasses(userA);
      assert.equal(listAfterDelete.data.length, 0);

      const plannerAfterDelete = JSON.parse(
        localStorage.getItem(`mindmate_planner_tasks_${userA}`) || '[]'
      );
      assert.equal(
        plannerAfterDelete.filter(
          (t: { id: string }) => t.id === getDeterministicPlannerTaskId(classId)
        ).length,
        0
      );
    }
  );

  // TEST 17: Live local Ollama (gemma4:e2b-it-qat) streaming inference verification
  await runTest(
    17,
    'Live local Ollama (http://127.0.0.1:11434) inference with gemma4:e2b-it-qat',
    async () => {
      const liveAdapter = new OllamaAdapter({
        baseUrl: 'http://127.0.0.1:11434',
        model: 'gemma4:e2b-it-qat',
      });
      const health = await liveAdapter.checkHealth(3000, true);
      assert.equal(
        health.available,
        true,
        `Expected local Ollama with gemma4:e2b-it-qat to be available, got: ${health.status} (${health.message})`
      );

      let streamedChunks = 0;
      const response = await liveAdapter.sendChatStream(
        {
          messages: [
            {
              role: 'user',
              content: 'In one short sentence, what does a return statement do in a Python function?',
            },
          ],
        },
        {
          onChunk: (chunk) => {
            if (chunk.length > 0) streamedChunks += 1;
          },
        }
      );

      assert.equal(response.source, 'ollama');
      assert.equal(response.model, 'gemma4:e2b-it-qat');
      assert.ok(response.content.trim().length > 10, 'Expected non-empty response from gemma4:e2b-it-qat');
      assert.ok(streamedChunks >= 1, 'Expected at least 1 streamed chunk from gemma4:e2b-it-qat');
      assert.ok((response.elapsedMs ?? 0) > 0);
    }
  );

  return results;
}
