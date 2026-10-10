import React, { useState, useEffect } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { Button } from '../components/ui/Button';
import { QuizQuestion } from '../components/shared/QuizQuestion';
import { QuizResult } from '../components/shared/QuizResult';
import { quizQuestions } from '../data/mockData';
import { X, Sparkles, TrendingUp, ShieldAlert, Award, Brain, Loader2 } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { learnerApi, DifficultyLevel, AdaptiveAnswerResult, AdaptiveQuestionItem } from '../services/api/learnerApi';
import { useAppContext } from '../context/AppContext';
import { offlineLearner } from '../services/storage/offlineLearner';
import { useStudyStreak } from '../hooks/useStudyStreak';

export default function Quiz() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isOnline, showToast, triggerSync } = useAppContext();
  const { recordStudyActivity } = useStudyStreak();

  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const totalQuestions = 5;

  const [topicId, setTopicId] = useState<string>('python-funcs');
  const [topicName, setTopicName] = useState<string>('Python Functions');
  const [targetDifficulty, setTargetDifficulty] = useState<DifficultyLevel>('medium');
  const [selectionReason, setSelectionReason] = useState<string>('Calibrating student ability');

  const [currentQuestion, setCurrentQuestion] = useState<{
    id: string | number;
    question: string;
    options: string[];
    correct?: number;
    explanation?: string;
    difficulty: DifficultyLevel;
  } | null>(null);

  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [isOfflineFallback, setIsOfflineFallback] = useState(false);

  const [sessionExcludedIds, setSessionExcludedIds] = useState<string[]>([]);
  const [lastResult, setLastResult] = useState<AdaptiveAnswerResult | null>(null);
  const [liveMastery, setLiveMastery] = useState<{
    masteryScore: number;
    confidenceLevel: string;
    confidenceScore: number;
    confidenceDescription: string;
  } | null>(null);

  // Load first adaptive question on mount
  useEffect(() => {
    let isMounted = true;
    const loadFirstQuestion = async () => {
      setLoading(true);
      const queryTopic = searchParams.get('topic') || undefined;

      try {
        const res = await learnerApi.getNextAdaptiveQuestion({ topicId: queryTopic });
        if (!isMounted) return;

        if (res.success && res.question) {
          setCurrentQuestion({
            id: res.question.id,
            question: res.question.question,
            options: res.question.options,
            difficulty: res.question.difficulty,
            explanation: res.question.explanation,
          });
          setTopicId(res.topicId);
          setTopicName(res.topicName);
          setTargetDifficulty(res.targetDifficulty);
          setSelectionReason(res.selectionReason);
          setSessionExcludedIds([res.question.id]);
          setIsOfflineFallback(false);
        }
      } catch (err) {
        console.warn('[Adaptive Load Fallback]', err);
        if (!isMounted) return;
        setIsOfflineFallback(true);
        const fallback = quizQuestions[0];
        setCurrentQuestion({
          id: fallback.id,
          question: fallback.question,
          options: fallback.options,
          correct: fallback.correct,
          explanation: fallback.explanation,
          difficulty: 'medium',
        });
        setTopicId('python-funcs');
        setTopicName('Python Functions');
        setTargetDifficulty('medium');
        setSelectionReason('Offline fallback: Practice initialized with local questions');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadFirstQuestion();
    return () => {
      isMounted = false;
    };
  }, [searchParams]);

  const handleSelectOption = async (index: number) => {
    if (isAnswered || isSubmitting || !currentQuestion) return;

    setSelectedOption(index);
    setIsSubmitting(true);

    if (!isOfflineFallback && typeof currentQuestion.id === 'string') {
      try {
        const res = await learnerApi.submitAdaptiveAnswer({
          questionId: currentQuestion.id,
          selectedOption: index,
          sessionExcludedIds,
        });

        if (res.success && res.result) {
          const rawResult = res.result as any;
          setLastResult(res.result);
          if (rawResult.updatedMastery) {
            setLiveMastery({
              masteryScore: rawResult.updatedMastery.masteryScore,
              confidenceLevel: rawResult.updatedMastery.confidenceLevel,
              confidenceScore: rawResult.updatedMastery.confidenceScore,
              confidenceDescription: rawResult.updatedMastery.confidenceDescription,
            });
          } else if (typeof rawResult.masteryAfter === 'number') {
            setLiveMastery({
              masteryScore: Math.round(rawResult.masteryAfter),
              confidenceLevel: rawResult.confidenceLevel || 'MODERATE_EVIDENCE',
              confidenceScore: rawResult.confidenceScore || 0.5,
              confidenceDescription: rawResult.evidenceSummary || rawResult.confidenceLevel || 'Mastery updated',
            });
          }
          if (res.result.isCorrect) {
            setScore((prev) => prev + 1);
          }
          setIsAnswered(true);
        }
      } catch (err) {
        console.warn('[Adaptive Answer Submit Error, local fallback]', err);
        // Fallback local evaluation
        const isCorrect = currentQuestion.correct === undefined || currentQuestion.correct === index;
        if (isCorrect) setScore((prev) => prev + 1);
        setIsAnswered(true);
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // Offline fallback handling
      const isCorrect = currentQuestion.correct === index;
      if (isCorrect) {
        setScore((prev) => prev + 1);
      }
      setIsAnswered(true);
      setIsSubmitting(false);
    }
  };

  const handleNext = async () => {
    if (currentIndex + 1 >= totalQuestions) {
      recordStudyActivity();
      setIsComplete(true);
      const attemptData = {
        topicId,
        topicName,
        score: Math.round((score / totalQuestions) * 100),
        totalQuestions,
        correctAnswers: score,
      };

      if (user?.id) {
        offlineLearner
          .saveQuizAttemptOffline(user.id, attemptData)
          .then(() => {
            if (isOnline) {
              triggerSync().catch(() => {});
            } else {
              showToast('Quiz saved offline. Will sync when reconnected.', 'info');
            }
          })
          .catch((err) => console.warn('[Offline Quiz Save Error]', err));
      } else if (isOnline) {
        learnerApi.recordQuiz(attemptData).catch((err) => console.warn('[Quiz Persistence Error]', err));
      }
      return;
    }

    // Advance to next question
    setLoading(true);
    setSelectedOption(null);
    setIsAnswered(false);

    if (lastResult?.nextQuestion) {
      const rawNq = lastResult.nextQuestion as any;
      const qObj = rawNq.question && typeof rawNq.question === 'object' ? rawNq.question : rawNq;
      setCurrentQuestion({
        id: qObj.id,
        question: qObj.question,
        options: qObj.options || [],
        difficulty: qObj.difficulty || targetDifficulty,
        explanation: qObj.explanation,
      });
      setTopicId(qObj.topicId || topicId);
      setTopicName(qObj.topicName || topicName);
      setTargetDifficulty(rawNq.targetDifficulty || (lastResult as any).nextDifficulty || qObj.difficulty || targetDifficulty);
      setSelectionReason(rawNq.selectionReason || (lastResult as any).nextSelectionReason || 'Adaptive practice personalized for you');
      setSessionExcludedIds((prev) => [...prev, qObj.id]);
      setLastResult(null);
      setCurrentIndex((prev) => prev + 1);
      setLoading(false);
    } else if (!isOfflineFallback) {
      try {
        const res = await learnerApi.getNextAdaptiveQuestion({
          topicId,
          exclude: sessionExcludedIds,
        });

        if (res.success && res.question) {
          setCurrentQuestion({
            id: res.question.id,
            question: res.question.question,
            options: res.question.options,
            difficulty: res.question.difficulty,
            explanation: res.question.explanation,
          });
          setTopicId(res.topicId);
          setTopicName(res.topicName);
          setTargetDifficulty(res.targetDifficulty);
          setSelectionReason(res.selectionReason);
          setSessionExcludedIds((prev) => [...prev, res.question.id]);
          setLastResult(null);
          setCurrentIndex((prev) => prev + 1);
        }
      } catch (err) {
        console.warn('[Adaptive Next Fetch Error, using mock]', err);
        const nextIdx = (currentIndex + 1) % quizQuestions.length;
        const fallback = quizQuestions[nextIdx];
        setCurrentQuestion({
          id: fallback.id,
          question: fallback.question,
          options: fallback.options,
          correct: fallback.correct,
          explanation: fallback.explanation,
          difficulty: 'medium',
        });
        setCurrentIndex((prev) => prev + 1);
      } finally {
        setLoading(false);
      }
    } else {
      const nextIdx = (currentIndex + 1) % quizQuestions.length;
      const fallback = quizQuestions[nextIdx];
      setCurrentQuestion({
        id: fallback.id,
        question: fallback.question,
        options: fallback.options,
        correct: fallback.correct,
        explanation: fallback.explanation,
        difficulty: 'medium',
      });
      setCurrentIndex((prev) => prev + 1);
      setLoading(false);
    }
  };

  const getDifficultyBadge = (diff: DifficultyLevel) => {
    switch (diff) {
      case 'easy':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-200">🟢 Easy</span>;
      case 'medium':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">🟡 Medium</span>;
      case 'hard':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">🟣 Hard</span>;
    }
  };

  if (isComplete) {
    return (
      <AppShell pageTitle="Session Complete">
        <QuizResult score={score} total={totalQuestions} topic={topicName} />
        <div className="mt-6 flex justify-center">
          <Button onClick={() => navigate('/practice')}>
            Back to Practice
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell pageTitle="Adaptive Learning Session" pageSubtitle={`Personalized practice for ${topicName}`}>
      <div className="max-w-3xl mx-auto">
        {/* Top Header & Navigation */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-muted">
              Question {currentIndex + 1} of {totalQuestions}
            </span>
            {currentQuestion && getDifficultyBadge(currentQuestion.difficulty || targetDifficulty)}
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/practice')} className="text-muted">
            <X className="h-4 w-4 mr-2" /> Exit Session
          </Button>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1.5 bg-gray-200 rounded-full mb-6 overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${(currentIndex / totalQuestions) * 100}%` }}
          />
        </div>

        {/* Adaptive Selection Reason Callout */}
        <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-3 mb-6 flex items-start gap-3 text-xs text-indigo-900">
          <Brain className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold text-primary">Adaptive Decision: </span>
            <span>{selectionReason}</span>
          </div>
        </div>

        {loading || !currentQuestion ? (
          <div className="p-12 text-center text-muted flex flex-col items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
            <p>Selecting personalized adaptive question...</p>
          </div>
        ) : (
          <>
            <QuizQuestion
              question={{
                id: currentQuestion.id,
                question: currentQuestion.question,
                options: currentQuestion.options,
                correct: lastResult ? lastResult.correctOption : currentQuestion.correct,
                explanation: lastResult ? lastResult.explanation : currentQuestion.explanation,
                topic: topicName,
              }}
              selectedOption={selectedOption}
              onSelectOption={handleSelectOption}
              isAnswered={isAnswered}
            />

            {isSubmitting && (
              <div className="mt-4 flex items-center justify-center gap-2 text-sm text-primary">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Evaluating response and updating mastery model...</span>
              </div>
            )}

            {isAnswered && (
              <div className="mt-6 animate-in fade-in slide-in-from-bottom-3 space-y-4">
                {/* Correct / Incorrect Feedback Box */}
                <div
                  className={`p-4 rounded-xl border ${
                    (lastResult ? lastResult.isCorrect : selectedOption === currentQuestion.correct)
                      ? 'bg-green-50 border-green-200 text-green-900'
                      : 'bg-red-50 border-red-200 text-red-900'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5 font-semibold">
                    {(lastResult ? lastResult.isCorrect : selectedOption === currentQuestion.correct) ? (
                      <>
                        <Award className="h-5 w-5 text-green-700" />
                        <span>Correct! Outstanding reasoning.</span>
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="h-5 w-5 text-red-700" />
                        <span>Not quite right. Review the rationale below.</span>
                      </>
                    )}
                  </div>
                  <p className="text-sm opacity-95">
                    {lastResult ? lastResult.explanation : currentQuestion.explanation}
                  </p>
                </div>

                {/* Difficulty Transition Alert (if stepped up or stepped down) */}
                {(lastResult?.transitionReason || (lastResult as any)?.difficultyTransitionReason) && (
                  <div className="p-3.5 rounded-xl border bg-purple-50/80 border-purple-200 text-purple-900 text-sm flex items-start gap-2.5">
                    <Sparkles className="h-4 w-4 text-purple-700 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">Engine Update: </span>
                      <span>{lastResult?.transitionReason || (lastResult as any)?.difficultyTransitionReason}</span>
                    </div>
                  </div>
                )}

                {/* Real-Time Bayesian Mastery Tracker */}
                {liveMastery && (
                  <div className="p-3.5 rounded-xl border bg-gray-50 border-gray-200 flex items-center justify-between text-xs text-gray-700">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      <span>
                        <strong>{topicName} Mastery:</strong> {liveMastery.masteryScore}%
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded bg-white border font-medium text-gray-600">
                        {liveMastery.confidenceDescription}
                      </span>
                    </div>
                  </div>
                )}

                {/* Next Button */}
                <div className="flex justify-end pt-2">
                  <Button onClick={handleNext} size="lg">
                    {currentIndex + 1 >= totalQuestions ? 'Finish Session' : 'Next Question'}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

