import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import {
  CheckCircle,
  RotateCcw,
  Sparkles,
  Check,
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
  BookOpen,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import {
  getUserMistakes,
  resolveMistake,
  QuestionAttempt,
  completePlannerTaskActivity,
  recordLearningWin,
} from '../lib/db';
import { useMastery } from '../hooks/useMastery';
import { STRATEGY_LABELS } from '../services/adaptive/adaptiveLearningEngine';
import { isDemoModeActive, clearDemoProgress, DEMO_MODE_CHANGED_EVENT } from '../services/demo/demoLearnerService';

export default function MistakeReview() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, showToast } = useAppContext();
  const effectiveUserId = user?.id || 'guest';
  const { snapshot, refresh } = useMastery();

  const queryTaskId = searchParams.get('taskId');

  const [mistakes, setMistakes] = useState<QuestionAttempt[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [activeRetryId, setActiveRetryId] = useState<string | null>(null);
  const [retrySelectedOption, setRetrySelectedOption] = useState<number | null>(null);
  const [taskDoneNotice, setTaskDoneNotice] = useState<boolean>(false);
  const [demoActive, setDemoActive] = useState(() => isDemoModeActive(user?.id));

  useEffect(() => {
    const handleDemoChange = (e: any) => {
      setDemoActive(Boolean(e.detail?.active));
    };
    window.addEventListener(DEMO_MODE_CHANGED_EVENT, handleDemoChange);
    return () => window.removeEventListener(DEMO_MODE_CHANGED_EVENT, handleDemoChange);
  }, []);

  useEffect(() => {
    async function loadMistakes() {
      try {
        setLoading(true);
        const res = await getUserMistakes(effectiveUserId);
        if (res.data) {
          setMistakes(res.data);
        }
      } catch (err) {
        console.error('Error fetching mistakes:', err);
      } finally {
        setLoading(false);
      }
    }

    void loadMistakes();

    const reload = () => void loadMistakes();
    window.addEventListener('mindmate-demo-mode-changed', reload);
    window.addEventListener('mindmate-analytics-updated', reload);
    return () => {
      window.removeEventListener('mindmate-demo-mode-changed', reload);
      window.removeEventListener('mindmate-analytics-updated', reload);
    };
  }, [effectiveUserId]);

  const handleRetrySubmit = async (item: QuestionAttempt) => {
    if (retrySelectedOption === null) return;

    const isCorrect = retrySelectedOption === item.correct_option;

    if (isCorrect) {
      showToast('Mistake resolved! Mastery analytics updated.', 'success');

      await resolveMistake(effectiveUserId, item.id);
      setMistakes((prev) =>
        prev.map((m) => (m.id === item.id ? { ...m, resolved: true } : m))
      );
      setActiveRetryId(null);
      await refresh();

      if (user && queryTaskId) {
        await completePlannerTaskActivity(queryTaskId, user.id, 'review');
        setTaskDoneNotice(true);
      }

      await recordLearningWin(effectiveUserId, {
        title: 'Mistake Conquered',
        description: `Resolved a question mistake in ${item.topic_name || item.topic_id}.`,
        category: 'mastery',
        icon: 'CheckCircle',
        metric_value: '+1 Resolved',
      });
    } else {
      showToast('Not quite right yet. Review the explanation below or open an Adaptive Lesson.', 'error');
    }
  };

  const filteredMistakes = mistakes.filter((m) => {
    if (selectedFilter === 'all') return true;
    if (selectedFilter === 'unresolved') return !m.resolved;
    if (selectedFilter === 'resolved') return m.resolved;
    return m.topic_id === selectedFilter;
  });

  const unresolvedTotal = mistakes.filter((m) => !m.resolved).length;

  return (
    <AppShell
      pageTitle="Mistake Review & Pattern Diagnosis"
      pageSubtitle="Evidence-based grouping of incorrect attempts by topic, concept, and prerequisite"
    >
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Simulated Demo Data Banner */}
        {demoActive && (
          <div
            className="bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs"
            data-testid="mistake-demo-banner"
          >
            <div className="flex gap-3 items-start">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 flex items-center justify-center shrink-0 border border-amber-300 dark:border-amber-700">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-600 animate-pulse" />
                    SIMULATED DEMO DATA ACTIVE
                  </span>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Profile: {user?.name || 'meet8kotecha'}
                  </span>
                </div>
                <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed font-medium">
                  Review items and recurring misconceptions are populated from a 14-day simulated history. <strong>Simulated results are not verified evidence of actual learning.</strong> Genuine learner records remain untouched.
                </p>
              </div>
            </div>
            <div className="flex gap-2 shrink-0 sm:self-center">
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  clearDemoProgress(user?.id);
                  setDemoActive(false);
                  const res = await getUserMistakes(effectiveUserId);
                  setMistakes(res.data || []);
                  await refresh();
                  showToast('Demo data cleared. Returned to genuine mistake review.', 'info');
                }}
                className="bg-white hover:bg-amber-100/60 dark:bg-slate-800 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-800 shadow-xs font-semibold text-xs cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Clear Demo Data
              </Button>
            </div>
          </div>
        )}

        {/* Header Stats & Filter */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-surface p-4 rounded-card border border-[#E2E8F0] shadow-soft">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#FEF2F2] text-[#B91C1C] border border-[#FECACA]">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-dark">
                {unresolvedTotal > 0
                  ? `${unresolvedTotal} Unresolved Question Mistake${unresolvedTotal > 1 ? 's' : ''}`
                  : 'All Recorded Mistakes Resolved!'}
              </h3>
              <p className="text-xs text-muted">
                MindMate groups errors by concept tag and only flags a recurring pattern when supported by multiple attempts.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setSelectedFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                selectedFilter === 'all'
                  ? 'bg-[#4F46E5] text-white shadow-2xs'
                  : 'bg-[#F8FAFC] border border-[#E2E8F0] text-muted hover:text-dark'
              }`}
            >
              All ({mistakes.length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedFilter('unresolved')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                selectedFilter === 'unresolved'
                  ? 'bg-[#4F46E5] text-white shadow-2xs'
                  : 'bg-[#F8FAFC] border border-[#E2E8F0] text-muted hover:text-dark'
              }`}
            >
              Unresolved ({unresolvedTotal})
            </button>
            <button
              type="button"
              onClick={() => setSelectedFilter('resolved')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                selectedFilter === 'resolved'
                  ? 'bg-[#4F46E5] text-white shadow-2xs'
                  : 'bg-[#F8FAFC] border border-[#E2E8F0] text-muted hover:text-dark'
              }`}
            >
              Resolved ({mistakes.length - unresolvedTotal})
            </button>
          </div>
        </div>

        {/* Recurring Mistake Pattern Analysis (Part A4) */}
        {snapshot.mistakePatterns.length > 0 && (
          <Card className="p-5 border border-border space-y-3">
            <h3 className="text-sm font-bold text-dark uppercase tracking-wider">
              Topic & Concept Mistake Patterns
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {snapshot.mistakePatterns.map((pattern) => (
                <div
                  key={pattern.id}
                  className="p-3.5 rounded-xl border border-border bg-gray-50/50 dark:bg-slate-800/40 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-dark">
                      {pattern.topicName}
                    </span>
                    <Badge
                      variant={pattern.isConfirmedPattern ? 'warning' : 'default'}
                      className="text-[10px]"
                    >
                      {pattern.isConfirmedPattern
                        ? `Confirmed Pattern (${pattern.occurrences} misses)`
                        : 'Single Observation'}
                    </Badge>
                  </div>
                  <p className="text-xs font-semibold text-dark/90">
                    {pattern.summary}
                  </p>
                  <p className="text-[11px] text-muted">{pattern.evidenceDetail}</p>
                  <div className="pt-1 flex items-center justify-between text-[11px]">
                    <span className="text-primary font-medium">
                      Strategy: {STRATEGY_LABELS[pattern.suggestedStrategy]}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        navigate(
                          `/learn?topic=${encodeURIComponent(pattern.topicId)}&strategy=${encodeURIComponent(pattern.suggestedStrategy)}`
                        )
                      }
                      className="font-semibold text-primary hover:underline"
                    >
                      Open Adaptive Lesson →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {taskDoneNotice && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-sm font-semibold flex items-center justify-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Linked Planner Task has been marked Completed!
          </div>
        )}

        {loading && (
          <div className="p-12 text-center text-muted">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm">Loading your mistake history...</p>
          </div>
        )}

        {!loading && filteredMistakes.length === 0 && (
          <Card className="p-12 text-center space-y-4 border border-border">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-600 mx-auto flex items-center justify-center">
              <CheckCircle className="h-8 w-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-bold text-dark">
                {mistakes.length === 0
                  ? 'No Recorded Mistakes!'
                  : 'No Mistakes in This Filter'}
              </h3>
              <p className="text-sm text-muted max-w-md mx-auto">
                {mistakes.length === 0
                  ? 'Whenever you answer an assessment question incorrectly, it is logged here with its concept tag and explanation for targeted recovery.'
                  : 'Switch your filter or take another adaptive quiz.'}
              </p>
            </div>
            <Button
              onClick={() => navigate('/practice/adaptive-quiz')}
              className="mx-auto flex items-center gap-2 font-bold"
            >
              <Sparkles className="h-4 w-4" /> Start Adaptive Practice
            </Button>
          </Card>
        )}

        {!loading && filteredMistakes.length > 0 && (
          <div className="space-y-4">
            {filteredMistakes.map((item) => {
              const isRetrying = activeRetryId === item.id;

              return (
                <Card
                  key={item.id}
                  className={`p-6 space-y-5 border transition-all ${
                    item.resolved
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : 'border-border bg-surface'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="default" className="text-xs">
                        {item.topic_name || 'General'}
                      </Badge>
                      <Badge variant="default" className="text-xs">
                        Difficulty {item.difficulty}/5
                      </Badge>
                      {item.concept_tag && (
                        <Badge variant="default" className="text-xs">
                          Concept: {item.concept_tag}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {item.resolved ? (
                        <span className="text-xs font-semibold text-[#047857] flex items-center gap-1 bg-[#ECFDF5] border border-[#A7F3D0] px-2.5 py-1 rounded-full">
                          <Check className="h-3.5 w-3.5" /> Resolved
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-[#92400E] flex items-center gap-1 bg-[#FFFBEB] border border-[#FDE68A] px-2.5 py-1 rounded-full">
                          Needs Review
                        </span>
                      )}
                      <span className="text-xs text-muted">
                        {new Date(item.attempted_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-xs font-bold text-muted uppercase tracking-wider">
                      Question:
                    </span>
                    <h4 className="text-base sm:text-lg font-semibold text-dark">
                      {item.question_text}
                    </h4>
                  </div>

                  {!isRetrying ? (
                    <div className="space-y-4">
                      {item.options && (
                        <div className="grid gap-2">
                          {item.options.map((opt, optIdx) => {
                            let style =
                              'bg-[#F8FAFC] border-[#E2E8F0] text-dark';
                            let statusIcon = null;

                            if (optIdx === item.correct_option) {
                              style =
                                'bg-[#ECFDF5] border-[#A7F3D0] text-[#047857] font-semibold';
                              statusIcon = (
                                <span className="text-xs text-[#047857] font-bold">
                                  Correct Answer
                                </span>
                              );
                            } else if (optIdx === item.selected_option) {
                              style =
                                'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C] font-semibold';
                              statusIcon = (
                                <span className="text-xs text-[#B91C1C] font-bold">
                                  Your Previous Choice
                                </span>
                              );
                            }

                            return (
                              <div
                                key={optIdx}
                                className={`p-3 rounded-xl border flex items-center justify-between text-sm ${style}`}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="w-5 h-5 rounded border border-[#CBD5E1] bg-surface flex items-center justify-center text-xs font-bold text-muted">
                                    {String.fromCharCode(65 + optIdx)}
                                  </span>
                                  <span>{opt}</span>
                                </div>
                                {statusIcon}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="p-4 rounded-xl bg-[#EFF6FF] border border-[#BFDBFE] space-y-1">
                        <div className="flex items-center gap-1.5 text-[#1D4ED8] text-xs font-bold">
                          <Lightbulb className="h-4 w-4" />
                          <span>Authoritative Answer Explanation</span>
                        </div>
                        <p className="text-sm text-dark leading-relaxed">
                          {item.explanation}
                        </p>
                      </div>

                      <div className="flex flex-wrap justify-end gap-2 pt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            navigate(
                              `/learn?topic=${encodeURIComponent(item.topic_id)}&strategy=worked-example`
                            )
                          }
                          className="flex items-center gap-1.5"
                        >
                          <BookOpen className="h-3.5 w-3.5" />
                          Explain with AI Tutor
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setActiveRetryId(item.id);
                            setRetrySelectedOption(null);
                          }}
                          className="flex items-center gap-1.5"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          {item.resolved
                            ? 'Practice Question Again'
                            : 'Retry This Question Now'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-5 rounded-2xl border-2 border-primary/30 bg-primary/5 space-y-4 animate-in fade-in duration-200">
                      <span className="text-xs font-bold text-primary uppercase tracking-wider block">
                        Live Recovery Attempt:
                      </span>

                      {item.options && (
                        <div className="grid gap-2">
                          {item.options.map((opt, optIdx) => (
                            <button
                              key={optIdx}
                              type="button"
                              onClick={() => setRetrySelectedOption(optIdx)}
                              className={`p-3 rounded-xl border text-left flex items-center justify-between transition-all ${
                                retrySelectedOption === optIdx
                                  ? 'border-primary bg-primary/10 text-primary font-semibold ring-2 ring-primary/30'
                                  : 'border-border bg-surface hover:border-primary/50 text-dark'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="w-6 h-6 rounded border border-border flex items-center justify-center text-xs font-bold">
                                  {String.fromCharCode(65 + optIdx)}
                                </span>
                                <span className="text-sm">{opt}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setActiveRetryId(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          disabled={retrySelectedOption === null}
                          onClick={() => handleRetrySubmit(item)}
                          className="font-bold"
                        >
                          Verify Solution
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
