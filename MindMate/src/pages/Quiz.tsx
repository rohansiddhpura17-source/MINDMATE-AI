import { useRef, useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { Button } from '../components/ui/Button';
import { QuizQuestion } from '../components/shared/QuizQuestion';
import { QuizResult } from '../components/shared/QuizResult';
import { quizQuestions } from '../data/mockData';
import { resolveTopicMetadata } from '../data/learningContent';
import { X, Cloud, HardDrive, AlertCircle, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { saveQuizSession } from '../lib/db';
import { useStudyStreak } from '../hooks/useStudyStreak';
import {
  loadLearnerAnalytics,
  recordVerifiedAttempt,
  retryUnsyncedAttempts,
} from '../services/assessment/assessmentService';
import type {
  NextLearningAction,
  PersistenceStatus,
} from '../services/assessment/types';

export default function Quiz() {
  const navigate = useNavigate();
  const { user } = useAppContext();
  const effectiveUserId = user?.id || 'guest';
  const { recordStudyActivity } = useStudyStreak();

  const [sessionId] = useState(() => `diag-session-${Date.now()}`);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [persistenceStatus, setPersistenceStatus] =
    useState<PersistenceStatus>('idle');
  const [persistenceMessage, setPersistenceMessage] = useState<string>('');
  const [nextAction, setNextAction] = useState<NextLearningAction | undefined>(
    undefined
  );
  const [retrying, setRetrying] = useState(false);

  const questionStartRef = useRef<number>(Date.now());

  const currentQuestion = quizQuestions[currentIndex % quizQuestions.length];
  const totalQuestions = quizQuestions.length;

  const handleSelectOption = async (index: number) => {
    if (isAnswered) return;
    const durationMs = Math.max(0, Date.now() - questionStartRef.current);
    const isCorrect = index === currentQuestion.correct;
    setSelectedOption(index);
    setIsAnswered(true);

    if (isCorrect) {
      setScore((prev) => prev + 1);
    }

    const topicMeta = resolveTopicMetadata(currentQuestion.topic);
    setPersistenceStatus('saving');
    setPersistenceMessage('Saving diagnostic response...');

    const res = await recordVerifiedAttempt({
      user_id: effectiveUserId,
      client_attempt_id: `${sessionId}:diag-q-${currentQuestion.id}`,
      quiz_id: 'diagnostic-baseline-quiz',
      attempt_type: 'diagnostic',
      session_id: sessionId,
      subject_id: topicMeta.subjectId,
      topic_id: topicMeta.id,
      topic_name: topicMeta.name,
      question_id: `diag-q-${currentQuestion.id}`,
      question_text: currentQuestion.question,
      options: currentQuestion.options,
      selected_option: index,
      correct_option: currentQuestion.correct,
      is_correct: isCorrect,
      difficulty: 2,
      explanation: currentQuestion.explanation,
      response_duration_ms: durationMs,
    });

    setPersistenceStatus(res.status);
    setPersistenceMessage(res.message);
  };

  const handleRetrySync = async () => {
    setRetrying(true);
    try {
      const res = await retryUnsyncedAttempts(effectiveUserId);
      setPersistenceStatus(res.status);
      setPersistenceMessage(res.message);
    } finally {
      setRetrying(false);
    }
  };

  const handleNext = async () => {
    if (currentIndex + 1 >= totalQuestions) {
      recordStudyActivity();
      const accuracy = Math.round((score / totalQuestions) * 100);
      const saveRes = await saveQuizSession(effectiveUserId, {
        topic: 'Multi-Topic Diagnostic',
        quiz_id: 'diagnostic-baseline-quiz',
        attempt_type: 'diagnostic',
        session_id: sessionId,
        client_session_id: sessionId,
        score,
        total: totalQuestions,
        accuracy,
        main_gap: accuracy < 80 ? 'Diagnostic Foundations' : undefined,
      });
      setPersistenceStatus(saveRes.persistenceStatus);
      setPersistenceMessage(saveRes.message);

      const snapshot = await loadLearnerAnalytics(user?.id || null);
      setNextAction(snapshot.nextLearningAction);
      setIsComplete(true);
    } else {
      setCurrentIndex((prev) => prev + 1);
      setSelectedOption(null);
      setIsAnswered(false);
      questionStartRef.current = Date.now();
    }
  };

  if (isComplete) {
    return (
      <AppShell pageTitle="Diagnostic Quiz Complete">
        <QuizResult
          score={score}
          total={totalQuestions}
          topic="Multi-Topic Diagnostic"
          nextAction={nextAction}
          persistenceStatus={persistenceStatus}
          persistenceMessage={persistenceMessage}
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      pageTitle="Diagnostic Assessment"
      pageSubtitle={`Topic: ${resolveTopicMetadata(currentQuestion.topic).name}`}
    >
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-muted">
            Question {currentIndex + 1} of {totalQuestions}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/practice')}
            className="text-muted"
          >
            <X className="h-4 w-4 mr-2" /> Exit Quiz
          </Button>
        </div>

        {persistenceStatus !== 'idle' && (
          <div
            role="status"
            aria-live="polite"
            className={`flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl border text-xs font-medium ${
              persistenceStatus === 'saved_cloud'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                : persistenceStatus === 'failed'
                  ? 'border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-300'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {persistenceStatus === 'saved_cloud' && <Cloud className="h-4 w-4" />}
              {persistenceStatus === 'saved_local_only' && (
                <HardDrive className="h-4 w-4" />
              )}
              {persistenceStatus === 'failed' && <AlertCircle className="h-4 w-4" />}
              <span>{persistenceMessage}</span>
            </div>
            {(persistenceStatus === 'failed' ||
              persistenceStatus === 'saved_local_only') &&
              user && (
                <button
                  type="button"
                  onClick={handleRetrySync}
                  disabled={retrying}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface border border-border text-dark font-semibold"
                >
                  <RefreshCw className={`h-3 w-3 ${retrying ? 'animate-spin' : ''}`} />
                  Retry Sync
                </button>
              )}
          </div>
        )}

        {/* Progress bar */}
        <div className="w-full h-1.5 bg-gray-200 dark:bg-slate-800 rounded-full">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${(currentIndex / totalQuestions) * 100}%` }}
          />
        </div>

        <QuizQuestion
          question={currentQuestion}
          selectedOption={selectedOption}
          onSelectOption={handleSelectOption}
          isAnswered={isAnswered}
        />

        {isAnswered && (
          <div className="mt-8 animate-in fade-in slide-in-from-bottom-4">
            <div
              className={`p-4 rounded-xl border mb-6 ${
                selectedOption === currentQuestion.correct
                  ? 'bg-green-50 dark:bg-emerald-950/30 border-green-200 dark:border-emerald-800 text-green-900 dark:text-emerald-200'
                  : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-900 dark:text-red-200'
              }`}
            >
              <h4 className="font-semibold mb-2">
                {selectedOption === currentQuestion.correct
                  ? 'Correct!'
                  : 'Not quite right.'}
              </h4>
              <p className="text-sm opacity-90">{currentQuestion.explanation}</p>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleNext} size="lg">
                {currentIndex + 1 >= totalQuestions
                  ? 'Finish Diagnostic Quiz'
                  : 'Next Question'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
