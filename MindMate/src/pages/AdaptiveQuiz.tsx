import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import {
  Brain,
  CheckCircle2,
  XCircle,
  ArrowRight,
  RotateCcw,
  Trophy,
  Flame,
  Sparkles,
  AlertCircle,
  TrendingUp,
  Award,
  Cloud,
  HardDrive,
  RefreshCw,
  BookOpen,
  Cpu,
  Info,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { offlineLearner } from '../services/storage/offlineLearner';
import {
  TOPICS,
  resolveTopicMetadata,
  type LanguageCode,
  type AdaptiveQuestionItem,
} from '../data/learningContent';
import {
  saveQuizSession,
  completePlannerTaskActivity,
  recordLearningWin,
} from '../lib/db';
import {
  loadLearnerAnalytics,
  readLocalAttempts,
  recordVerifiedAttempt,
  retryUnsyncedAttempts,
} from '../services/assessment/assessmentService';
import { calculateTopicMastery } from '../services/assessment/masteryEngine';
import {
  buildSessionAdaptationDelta,
  selectAdaptiveDifficulty,
  selectNextQuestion,
  STRATEGY_LABELS,
  type AdaptiveQuestionSelection,
} from '../services/adaptive/adaptiveLearningEngine';
import type {
  AttemptRecord,
  AttemptType,
  PersistenceStatus,
  SessionAdaptationDelta,
  TopicMasteryMetrics,
} from '../services/assessment/types';
import { ollamaAdapter } from '../services/ai/ollamaAdapter';

const SESSION_QUESTION_LIMIT = 4;

export default function AdaptiveQuiz() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, language, showToast } = useAppContext();
  const effectiveUserId = user?.id || 'guest';

  const rawQueryTopic = searchParams.get('topic') || 'python-functions';
  const resolvedInitialTopic = resolveTopicMetadata(rawQueryTopic).id;
  const queryTaskId = searchParams.get('taskId');
  const queryAttemptType =
    (searchParams.get('type') as AttemptType) || 'adaptive';
  const queryDifficulty = searchParams.get('difficulty')
    ? Number(searchParams.get('difficulty'))
    : undefined;

  const [selectedTopic, setSelectedTopic] = useState<string>(resolvedInitialTopic);
  const [attemptType, setAttemptType] = useState<AttemptType>(queryAttemptType);
  const [sessionId, setSessionId] = useState<string>(() => `aq-${Date.now()}`);
  const [difficulty, setDifficulty] = useState<number>(2);
  const [initialDifficulty, setInitialDifficulty] = useState<number>(2);
  const [difficultyReason, setDifficultyReason] = useState<string>('');
  const [streak, setStreak] = useState<number>(0);

  const [answeredQuestionIds, setAnsweredQuestionIds] = useState<string[]>([]);
  const [sessionAttempts, setSessionAttempts] = useState<AttemptRecord[]>([]);
  const [customDraftQuestions, setCustomDraftQuestions] = useState<AdaptiveQuestionItem[]>([]);
  const [currentSelection, setCurrentSelection] = useState<AdaptiveQuestionSelection | null>(null);

  const [stepIndex, setStepIndex] = useState<number>(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState<boolean>(false);
  const [isCorrect, setIsCorrect] = useState<boolean>(false);
  const [score, setScore] = useState<number>(0);
  const [totalAnswered, setTotalAnswered] = useState<number>(0);
  const [difficultyDelta, setDifficultyDelta] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState<boolean>(false);
  const [taskCompletedNotice, setTaskCompletedNotice] = useState<boolean>(false);

  // Persistence & mastery tracking
  const [baselineMastery, setBaselineMastery] = useState<TopicMasteryMetrics>(() =>
    calculateTopicMastery(resolvedInitialTopic, readLocalAttempts(effectiveUserId))
  );
  const [liveTopicMastery, setLiveTopicMastery] = useState<TopicMasteryMetrics>(() =>
    calculateTopicMastery(resolvedInitialTopic, readLocalAttempts(effectiveUserId))
  );
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus>('idle');
  const [persistenceMessage, setPersistenceMessage] = useState<string>('');
  const [retryingSync, setRetryingSync] = useState<boolean>(false);
  const [adaptationDelta, setAdaptationDelta] = useState<SessionAdaptationDelta | null>(null);

  // Optional local Gemma 4 question draft generation state
  const [generatingDraft, setGeneratingDraft] = useState<boolean>(false);
  const [draftNotice, setDraftNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const questionStartRef = useRef<number>(Date.now());

  const startNewSession = useCallback(
    (topicId: string, typeOverride?: AttemptType, difficultyOverride?: number) => {
      const canonicalTopic = resolveTopicMetadata(topicId).id;
      const existingAttempts = readLocalAttempts(effectiveUserId);
      const baseline = calculateTopicMastery(canonicalTopic, existingAttempts);
      setBaselineMastery(baseline);
      setLiveTopicMastery(baseline);

      const diffDecision = selectAdaptiveDifficulty(baseline, []);
      const startLvl =
        difficultyOverride && difficultyOverride >= 1 && difficultyOverride <= 5
          ? difficultyOverride
          : diffDecision.targetLevel;

      const newSessionId = `aq-${canonicalTopic}-${Date.now()}`;
      setSessionId(newSessionId);
      setAttemptType(typeOverride || queryAttemptType || 'adaptive');
      setDifficulty(startLvl);
      setInitialDifficulty(startLvl);
      setDifficultyReason(diffDecision.reason);
      setStreak(0);
      setAnsweredQuestionIds([]);
      setSessionAttempts([]);
      setStepIndex(0);
      setSelectedOption(null);
      setIsAnswered(false);
      setIsCorrect(false);
      setScore(0);
      setTotalAnswered(0);
      setDifficultyDelta(null);
      setIsComplete(false);
      setTaskCompletedNotice(false);
      setAdaptationDelta(null);
      setDraftNotice(null);

      const selection = selectNextQuestion({
        topicId: canonicalTopic,
        targetDifficulty: startLvl,
        answeredQuestionIds: [],
        language: (language as LanguageCode) || 'en',
      });
      setCurrentSelection(selection);
      questionStartRef.current = Date.now();
    },
    [effectiveUserId, language, queryAttemptType]
  );

  useEffect(() => {
    setSelectedTopic(resolvedInitialTopic);
    startNewSession(resolvedInitialTopic, queryAttemptType, queryDifficulty);
  }, [resolvedInitialTopic, queryAttemptType, queryDifficulty, startNewSession]);

  const currentQuestion = currentSelection?.question || null;

  const handleTopicChange = (newTopicId: string) => {
    setSelectedTopic(newTopicId);
    startNewSession(newTopicId, 'adaptive');
  };

  const handleSelectOption = (idx: number) => {
    if (isAnswered) return;
    setSelectedOption(idx);
  };

  const handleSubmitAnswer = async () => {
    if (selectedOption === null || isAnswered || !currentQuestion) return;

    const responseDurationMs = Math.max(0, Date.now() - questionStartRef.current);
    const correct = selectedOption === currentQuestion.correct;
    setIsAnswered(true);
    setIsCorrect(correct);
    setTotalAnswered((prev) => prev + 1);
    setAnsweredQuestionIds((prev) => [...prev, currentQuestion.id]);

    if (correct) {
      setScore((prev) => prev + 1);
      setStreak((prev) => prev + 1);
    } else {
      setStreak(0);
    }

    // Persist attempt idempotently via assessmentService
    setPersistenceStatus('saving');
    setPersistenceMessage('Saving attempt and updating topic mastery...');

    const topicMeta = resolveTopicMetadata(currentQuestion.topicId);
    const clientAttemptId = `${sessionId}:${currentQuestion.id}:step-${stepIndex}`;

    const persistResult = await recordVerifiedAttempt({
      user_id: effectiveUserId,
      client_attempt_id: clientAttemptId,
      quiz_id: `adaptive-quiz-${topicMeta.id}`,
      attempt_type: attemptType,
      session_id: sessionId,
      subject_id: topicMeta.subjectId,
      topic_id: topicMeta.id,
      topic_name: topicMeta.name,
      concept_tag: currentQuestion.concept,
      question_id: currentQuestion.id,
      question_text: currentQuestion.question,
      options: currentQuestion.options,
      selected_option: selectedOption,
      correct_option: currentQuestion.correct,
      is_correct: correct,
      difficulty: currentQuestion.difficulty,
      explanation: currentQuestion.explanation,
      response_duration_ms: responseDurationMs,
    });

    setPersistenceStatus(persistResult.status);
    setPersistenceMessage(persistResult.message);
    setLiveTopicMastery(persistResult.topicMastery);

    const updatedSessionAttempts = [...sessionAttempts, persistResult.attempt];
    setSessionAttempts(updatedSessionAttempts);

    // Compute adaptive next difficulty using bounded progression rules
    const nextDiffDecision = selectAdaptiveDifficulty(
      persistResult.topicMastery,
      updatedSessionAttempts,
      difficulty
    );

    if (nextDiffDecision.targetLevel > difficulty) {
      setDifficultyDelta(`+1 Difficulty (Level ${nextDiffDecision.targetLevel})`);
    } else if (nextDiffDecision.targetLevel < difficulty) {
      setDifficultyDelta(`-1 Difficulty for Reinforcement (Level ${nextDiffDecision.targetLevel})`);
    } else {
      setDifficultyDelta(`Steady at Level ${nextDiffDecision.targetLevel}`);
    }
    setDifficulty(nextDiffDecision.targetLevel);
    setDifficultyReason(nextDiffDecision.reason);
  };

  const handleNext = async () => {
    setDifficultyDelta(null);
    const nextStep = stepIndex + 1;

    if (nextStep >= SESSION_QUESTION_LIMIT) {
      setIsComplete(true);
      await finishSession();
      return;
    }

    const nextSelection = selectNextQuestion({
      topicId: selectedTopic,
      targetDifficulty: difficulty,
      answeredQuestionIds,
      language: (language as LanguageCode) || 'en',
      customPool:
        customDraftQuestions.length > 0
          ? [...customDraftQuestions, ...(currentSelection?.question ? [currentSelection.question] : [])]
          : undefined,
    });

    if (!nextSelection.question) {
      setIsComplete(true);
      await finishSession();
      return;
    }

    setStepIndex(nextStep);
    setCurrentSelection(nextSelection);
    setSelectedOption(null);
    setIsAnswered(false);
    questionStartRef.current = Date.now();
  };

  const finishSession = async () => {
    const finalTotal = totalAnswered;
    const finalScore = score;
    const accuracy = finalTotal > 0 ? Math.round((finalScore / finalTotal) * 100) : 0;
    const topicMeta = resolveTopicMetadata(selectedTopic);

    const sessionSaveRes = await saveQuizSession(effectiveUserId, {
      topic: topicMeta.name,
      topic_id: topicMeta.id,
      quiz_id: `adaptive-quiz-${topicMeta.id}`,
      attempt_type: attemptType,
      session_id: sessionId,
      client_session_id: sessionId,
      score: finalScore,
      total: finalTotal,
      accuracy,
      difficulty_start: initialDifficulty,
      difficulty_end: difficulty,
      main_gap: accuracy < 70 ? `${topicMeta.name} core concepts` : undefined,
    });

    setPersistenceStatus(sessionSaveRes.persistenceStatus);
    setPersistenceMessage(sessionSaveRes.message);

    try {
      await offlineLearner.saveQuizAttemptOffline(effectiveUserId, {
        topicId: topicMeta.id,
        topicName: topicMeta.name,
        score: finalScore,
        totalQuestions: finalTotal,
        correctAnswers: finalScore,
      });
    } catch {
      // Non-blocking IndexedDB backup
    }

    if (user && queryTaskId) {
      await completePlannerTaskActivity(queryTaskId, user.id, 'quiz');
      setTaskCompletedNotice(true);
      showToast('Planner activity verified and marked completed!', 'success');
    }

    if (accuracy >= 80 && finalTotal >= 3) {
      await recordLearningWin(effectiveUserId, {
        title: `High Accuracy in ${topicMeta.name}`,
        description: `Achieved ${accuracy}% accuracy (${finalScore}/${finalTotal}) in ${attemptType.replace('_', '-')} assessment.`,
        category: 'quiz',
        icon: 'Trophy',
        metric_value: `${accuracy}%`,
      });
    }

    // Build full post-session adaptation delta
    const fullSnapshot = await loadLearnerAnalytics(user?.id || null);
    const updatedTopicMetric =
      fullSnapshot.topics.find((t) => t.topicId === topicMeta.id) || liveTopicMastery;

    const delta = buildSessionAdaptationDelta({
      topicId: topicMeta.id,
      previousMetric: baselineMastery,
      updatedMetric: updatedTopicMetric,
      previousDifficulty: initialDifficulty,
      mistakePatterns: fullSnapshot.mistakePatterns,
      allTopicMetrics: fullSnapshot.topics,
      recommendations: fullSnapshot.recommendations,
      sessionMistakesCount: finalTotal - finalScore,
      persistenceStatus: sessionSaveRes.persistenceStatus,
      persistenceMessage: sessionSaveRes.message,
    });
    setAdaptationDelta(delta);
  };

  const handleRetrySync = async () => {
    setRetryingSync(true);
    try {
      const res = await retryUnsyncedAttempts(effectiveUserId);
      setPersistenceStatus(res.status);
      setPersistenceMessage(res.message);
    } finally {
      setRetryingSync(false);
    }
  };

  const handleGenerateGemmaQuestion = async () => {
    setGeneratingDraft(true);
    setDraftNotice(null);
    try {
      const draft = await ollamaAdapter.generateValidatedPracticeQuestion({
        topicId: selectedTopic,
        difficulty,
        focusConcept: currentQuestion?.concept,
      });
      setCustomDraftQuestions((prev) => [draft, ...prev]);
      setCurrentSelection({
        question: draft,
        targetDifficulty: difficulty,
        actualDifficulty: draft.difficulty,
        targetBand: difficulty <= 2 ? 'easy' : difficulty === 3 ? 'medium' : 'hard',
        actualBand: draft.difficulty <= 2 ? 'easy' : draft.difficulty === 3 ? 'medium' : 'hard',
        isDifficultyFallback: false,
        fallbackNotice: null,
        isLanguageFallback: false,
        activeLanguage: 'en',
        selectionReason: `Generated and schema-validated via Local Gemma 4 (${ollamaAdapter.getModel()}) at difficulty ${draft.difficulty}.`,
      });
      setSelectedOption(null);
      setIsAnswered(false);
      questionStartRef.current = Date.now();
      setDraftNotice({
        type: 'success',
        text: `Validated practice question generated by local ${ollamaAdapter.getModel()}.`,
      });
    } catch (err) {
      setDraftNotice({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Local Ollama (gemma4:e2b) is unavailable. Serving verified curriculum question bank instead.',
      });
    } finally {
      setGeneratingDraft(false);
    }
  };

  const getDifficultyLabel = (lvl: number) => {
    switch (lvl) {
      case 1:
        return 'Easy (Level 1)';
      case 2:
        return 'Easy (Level 2)';
      case 3:
        return 'Medium (Level 3)';
      case 4:
        return 'Hard (Level 4)';
      case 5:
        return 'Hard (Level 5)';
      default:
        return `Level ${lvl}`;
    }
  };

  return (
    <AppShell
      pageTitle={
        attemptType === 'diagnostic'
          ? 'Diagnostic Assessment'
          : attemptType === 'follow_up'
            ? 'Follow-Up Verification Quiz'
            : 'Adaptive Quiz'
      }
      pageSubtitle="Deterministic mastery calibration, bounded difficulty scaling, and idempotent attempt persistence"
    >
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Top Topic, Mastery & Difficulty Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-surface p-4 rounded-card border border-[#E2E8F0] shadow-soft">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#EEF2FF] text-[#4F46E5] border border-[#C7D2FE]">
              <Brain className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted font-medium">Topic Focus:</span>
                <Badge variant="default" className="text-[10px] uppercase">
                  {attemptType.replace('_', ' ')}
                </Badge>
              </div>
              <select
                value={selectedTopic}
                onChange={(e) => handleTopicChange(e.target.value)}
                disabled={isAnswered || totalAnswered > 0}
                aria-label="Select assessment topic"
                className="block text-sm font-bold text-dark bg-transparent border-0 p-0 focus:ring-0 cursor-pointer"
              >
                {TOPICS.map((t) => (
                  <option key={t.id} value={t.id} className="bg-surface text-dark">
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
            <div className="text-xs bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-1.5 rounded-xl">
              <span className="text-muted">Mastery: </span>
              <span className="font-bold text-dark">
                {liveTopicMastery.totalAttempts > 0
                  ? `${liveTopicMastery.masteryScore}% (${liveTopicMastery.confidenceLevel})`
                  : 'Unassessed'}
              </span>
            </div>

            <div className="flex items-center gap-1.5 bg-[#EEF2FF] border border-[#C7D2FE] px-3 py-1.5 rounded-xl">
              <TrendingUp className="h-4 w-4 text-[#4F46E5]" />
              <span className="text-xs font-semibold text-[#3730A3]">
                {getDifficultyLabel(difficulty)}
              </span>
            </div>

            <div className="flex items-center gap-1 text-[#92400E] font-bold text-xs bg-[#FFFBEB] border border-[#FDE68A] px-2.5 py-1.5 rounded-xl">
              <Flame className="h-4 w-4" />
              <span>{streak} Streak</span>
            </div>
          </div>
        </div>

        {/* Persistence Status Banner */}
        {persistenceStatus !== 'idle' && (
          <div
            role="status"
            aria-live="polite"
            className={`flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl border text-xs font-semibold ${
              persistenceStatus === 'saved_cloud'
                ? 'border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]'
                : persistenceStatus === 'saved_local_only'
                  ? 'border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]'
                  : persistenceStatus === 'failed'
                    ? 'border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]'
                    : 'border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]'
            }`}
          >
            <div className="flex items-center gap-2">
              {persistenceStatus === 'saved_cloud' && <Cloud className="h-4 w-4 shrink-0" />}
              {persistenceStatus === 'saved_local_only' && (
                <HardDrive className="h-4 w-4 shrink-0" />
              )}
              {persistenceStatus === 'failed' && <AlertCircle className="h-4 w-4 shrink-0" />}
              {persistenceStatus === 'saving' && (
                <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
              )}
              <span>{persistenceMessage}</span>
            </div>
            {(persistenceStatus === 'failed' || persistenceStatus === 'saved_local_only') &&
              user && (
                <button
                  type="button"
                  onClick={handleRetrySync}
                  disabled={retryingSync}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface border border-[#CBD5E1] text-dark hover:border-[#4F46E5] transition-colors font-semibold"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${retryingSync ? 'animate-spin' : ''}`} />
                  {retryingSync ? 'Syncing...' : 'Retry Cloud Sync'}
                </button>
              )}
          </div>
        )}

        {/* Difficulty Fallback Notice (B2 requirement) */}
        {!isComplete && currentSelection?.isDifficultyFallback && currentSelection.fallbackNotice && (
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] text-xs text-[#92400E]">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Adaptive Difficulty Fallback: </span>
              {currentSelection.fallbackNotice}
            </div>
          </div>
        )}

        {/* Gemma 4 Draft Notice */}
        {draftNotice && (
          <div
            className={`flex items-start gap-2.5 px-4 py-3 rounded-xl border text-xs font-medium ${
              draftNotice.type === 'success'
                ? 'border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]'
                : 'border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]'
            }`}
          >
            <Cpu className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{draftNotice.text}</span>
          </div>
        )}

        {!isComplete && currentQuestion && (
          <Card className="p-6 sm:p-8 space-y-6 border border-[#E2E8F0] shadow-soft">
            {/* Header with question progress & difficulty badge */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#E2E8F0]">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted uppercase tracking-wider">
                  Question {stepIndex + 1} of {SESSION_QUESTION_LIMIT}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="primary" className="text-[11px]">
                    Question Difficulty {currentQuestion.difficulty}/5
                  </Badge>
                  {currentQuestion.concept && (
                    <Badge variant="default" className="text-[11px]">
                      Concept: {currentQuestion.concept}
                    </Badge>
                  )}
                  {difficultyDelta && (
                    <span className="text-xs font-semibold text-[#4F46E5]">
                      {difficultyDelta}
                    </span>
                  )}
                </div>
                {difficultyReason && (
                  <p className="text-[11px] text-muted">{difficultyReason}</p>
                )}
              </div>

              <div className="flex items-center gap-3">
                {!isAnswered && (
                  <button
                    type="button"
                    onClick={handleGenerateGemmaQuestion}
                    disabled={generatingDraft}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border border-[#C7D2FE] bg-[#EEF2FF] text-[#4338CA] hover:bg-[#E0E7FF] transition-colors shadow-2xs"
                    title="Generate a schema-validated practice question using local Ollama Gemma 4 (gemma4:e2b)"
                  >
                    <Cpu className="h-3.5 w-3.5" />
                    {generatingDraft ? 'Generating via Gemma 4...' : 'Draft with Local Gemma 4'}
                  </button>
                )}
                <span className="text-sm font-bold text-dark">
                  Score: {score}/{totalAnswered}
                </span>
              </div>
            </div>

            {/* Question Text */}
            <div className="space-y-3">
              <h3 className="text-lg sm:text-xl font-semibold text-dark leading-relaxed">
                {currentQuestion.question}
              </h3>
            </div>

            {/* Options */}
            <div className="space-y-3 pt-2">
              {currentQuestion.options.map((opt: string, idx: number) => {
                let btnStyle =
                  'border-[#E2E8F0] bg-surface hover:border-[#4F46E5] hover:bg-[#F8FAFC] text-dark';
                let letterStyle =
                  'border-[#CBD5E1] text-muted bg-[#F8FAFC]';
                let icon = null;

                if (selectedOption === idx) {
                  btnStyle =
                    'border-[#4F46E5] bg-[#EEF2FF] text-[#1E1B4B] font-semibold ring-2 ring-[#4F46E5]/20';
                  letterStyle =
                    'border-[#4F46E5] bg-[#4F46E5] text-white';
                }

                if (isAnswered) {
                  if (idx === currentQuestion.correct) {
                    btnStyle =
                      'border-[#A7F3D0] bg-[#ECFDF5] text-[#047857] font-semibold ring-2 ring-[#047857]/20';
                    letterStyle =
                      'border-[#047857] bg-[#047857] text-white';
                    icon = <CheckCircle2 className="h-5 w-5 text-[#047857] shrink-0" />;
                  } else if (selectedOption === idx) {
                    btnStyle =
                      'border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C] font-semibold ring-2 ring-[#B91C1C]/20';
                    letterStyle =
                      'border-[#B91C1C] bg-[#B91C1C] text-white';
                    icon = <XCircle className="h-5 w-5 text-[#B91C1C] shrink-0" />;
                  } else {
                    btnStyle = 'opacity-55 border-[#E2E8F0] bg-[#F8FAFC] text-muted';
                    letterStyle = 'border-[#E2E8F0] text-muted bg-surface';
                  }
                }

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectOption(idx)}
                    disabled={isAnswered}
                    className={`w-full flex items-center justify-between p-4 rounded-xl border text-left transition-all shadow-2xs ${btnStyle}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-7 h-7 rounded-lg border flex items-center justify-center text-xs font-bold shrink-0 ${letterStyle}`}>
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <span className="text-sm sm:text-base">{opt}</span>
                    </div>
                    {icon}
                  </button>
                );
              })}
            </div>

            {/* Explanation card after answering */}
            {isAnswered && (
              <div
                className={`p-4 rounded-xl border animate-in fade-in duration-200 ${
                  isCorrect
                    ? 'border-[#A7F3D0] bg-[#ECFDF5] text-dark'
                    : 'border-[#FECACA] bg-[#FEF2F2] text-dark'
                }`}
              >
                <div className="flex items-start gap-3">
                  {isCorrect ? (
                    <Sparkles className="h-5 w-5 text-[#047857] shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-[#B91C1C] shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1">
                    <p className={`text-xs font-bold uppercase tracking-wider ${isCorrect ? 'text-[#047857]' : 'text-[#B91C1C]'}`}>
                      {isCorrect
                        ? 'Correct! Authoritative Answer Evaluation:'
                        : 'Incorrect — Recorded for Adaptive Mistake Analysis:'}
                    </p>
                    <p className="text-sm text-dark leading-relaxed">
                      {currentQuestion.explanation}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end pt-4 border-t border-[#E2E8F0]">
              {!isAnswered ? (
                <Button
                  onClick={handleSubmitAnswer}
                  disabled={selectedOption === null}
                  className="px-6 py-2.5 font-bold"
                >
                  Confirm Answer
                </Button>
              ) : (
                <Button
                  onClick={handleNext}
                  className="px-6 py-2.5 font-bold flex items-center gap-2"
                >
                  {stepIndex + 1 >= SESSION_QUESTION_LIMIT
                    ? 'Complete Quiz & View Adaptation Report'
                    : 'Next Adaptive Question'}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </Card>
        )}

        {/* Quiz Completed Summary + What Changed & Why (B4 requirement) */}
        {isComplete && (
          <Card className="p-8 sm:p-10 space-y-6 border border-[#E2E8F0] shadow-soft">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-[#EEF2FF] border border-[#C7D2FE] text-[#4F46E5] mx-auto flex items-center justify-center">
                <Trophy className="h-8 w-8" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-dark">
                Assessment Session Complete
              </h2>
              <p className="text-sm text-muted max-w-xl mx-auto">
                Your question responses have been evaluated and your topic mastery model has been recalibrated.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl mx-auto py-2">
              <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-center">
                <span className="text-xs text-muted block">Session Score</span>
                <span className="text-xl font-bold text-dark">
                  {score}/{totalAnswered}
                </span>
              </div>
              <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-center">
                <span className="text-xs text-muted block">Session Accuracy</span>
                <span className="text-xl font-bold text-[#4F46E5]">
                  {totalAnswered > 0 ? Math.round((score / totalAnswered) * 100) : 0}%
                </span>
              </div>
              <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-center">
                <span className="text-xs text-muted block">Topic Mastery</span>
                <span className="text-xl font-bold text-[#047857]">
                  {adaptationDelta
                    ? `${adaptationDelta.previousMastery}% → ${adaptationDelta.newMastery}%`
                    : `${liveTopicMastery.masteryScore}%`}
                </span>
              </div>
              <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-center">
                <span className="text-xs text-muted block">Confidence</span>
                <span className="text-xl font-bold text-[#92400E] capitalize">
                  {adaptationDelta?.newConfidence || liveTopicMastery.confidenceLevel}
                </span>
              </div>
            </div>

            {/* What Changed & Why Card */}
            {adaptationDelta && (
              <div className="p-5 rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] space-y-4 text-left max-w-2xl mx-auto">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[#1D4ED8] flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    What Changed & Why — Adaptive Engine Decision
                  </h3>
                  <Badge variant="primary" className="text-xs">
                    Next Difficulty: Level {adaptationDelta.nextSuggestedDifficulty}/5
                  </Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3.5 rounded-xl bg-surface border border-[#E2E8F0] space-y-1 shadow-2xs">
                    <span className="text-muted font-semibold block">
                      Selected Teaching Strategy:
                    </span>
                    <span className="font-bold text-dark text-sm block">
                      {STRATEGY_LABELS[adaptationDelta.selectedStrategy]}
                    </span>
                    <p className="text-muted leading-relaxed">
                      {adaptationDelta.strategyReason}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-surface border border-[#E2E8F0] space-y-1 shadow-2xs">
                    <span className="text-muted font-semibold block">
                      Recommended Next Step:
                    </span>
                    <span className="font-bold text-dark text-sm block capitalize">
                      {adaptationDelta.nextAction.suggestedActivity.replace(/-/g, ' ')} —{' '}
                      {adaptationDelta.nextAction.nextTopicName}
                    </span>
                    <p className="text-muted leading-relaxed">
                      {adaptationDelta.nextAction.reason}
                    </p>
                  </div>
                </div>

                <p className="text-[11px] text-dark">
                  <strong>Evidence Trail:</strong> {adaptationDelta.nextAction.supportingEvidence.detail}
                </p>
              </div>
            )}

            {taskCompletedNotice && (
              <div className="p-3.5 rounded-xl bg-[#ECFDF5] border border-[#A7F3D0] text-[#047857] text-sm font-semibold max-w-lg mx-auto flex items-center justify-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Linked Planner Task has been marked Completed!
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              {adaptationDelta && (
                <Button
                  onClick={() =>
                    navigate(
                      `/learn?topic=${encodeURIComponent(adaptationDelta.topicId)}&strategy=${encodeURIComponent(adaptationDelta.selectedStrategy)}`
                    )
                  }
                  className="flex items-center gap-2"
                >
                  <BookOpen className="h-4 w-4" />
                  Open Adaptive Lesson ({STRATEGY_LABELS[adaptationDelta.selectedStrategy]})
                </Button>
              )}

              {adaptationDelta?.nextAction.prerequisiteReview.required &&
                adaptationDelta.nextAction.prerequisiteReview.prerequisiteTopicId && (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      startNewSession(
                        adaptationDelta.nextAction.prerequisiteReview.prerequisiteTopicId!,
                        'follow_up',
                        1
                      )
                    }
                    className="flex items-center gap-2"
                  >
                    <Brain className="h-4 w-4" />
                    Review Prerequisite ({adaptationDelta.nextAction.prerequisiteReview.prerequisiteTopicName})
                  </Button>
                )}

              <Button
                variant="secondary"
                onClick={() =>
                  startNewSession(
                    selectedTopic,
                    'follow_up',
                    adaptationDelta?.nextSuggestedDifficulty
                  )
                }
                className="flex items-center gap-2"
              >
                <Sparkles className="h-4 w-4" />
                Take Follow-Up Quiz (Lvl {adaptationDelta?.nextSuggestedDifficulty ?? difficulty})
              </Button>

              {totalAnswered - score > 0 && (
                <Button
                  variant="secondary"
                  onClick={() => navigate('/practice/mistake-review')}
                  className="flex items-center gap-2"
                >
                  <RotateCcw className="h-4 w-4" /> Review Mistakes
                </Button>
              )}

              <Button
                variant="ghost"
                onClick={() => navigate('/progress')}
                className="flex items-center gap-2"
              >
                <Award className="h-4 w-4" /> View Live Analytics
              </Button>
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
