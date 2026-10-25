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
        {/* Header Stats & Filter */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-surface p-4 rounded-card border border-border">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-red-500/10 text-red-500">
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
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-slate-800 text-muted hover:text-dark'
              }`}
            >
              All ({mistakes.length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedFilter('unresolved')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                selectedFilter === 'unresolved'
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-slate-800 text-muted hover:text-dark'
              }`}
            >
              Unresolved ({unresolvedTotal})
            </button>
            <button
              type="button"
              onClick={() => setSelectedFilter('resolved')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                selectedFilter === 'resolved'
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-slate-800 text-muted hover:text-dark'
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
                        <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1 bg-emerald-500/10 px-2.5 py-1 rounded-full">
                          <Check className="h-3.5 w-3.5" /> Resolved
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-amber-500 flex items-center gap-1 bg-amber-500/10 px-2.5 py-1 rounded-full">
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
                              'bg-gray-50 dark:bg-slate-800/40 border-border text-dark';
                            let statusIcon = null;

                            if (optIdx === item.correct_option) {
                              style =
                                'bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-semibold';
                              statusIcon = (
                                <span className="text-xs text-emerald-600 font-bold">
                                  Correct Answer
                                </span>
                              );
                            } else if (optIdx === item.selected_option) {
                              style =
                                'bg-red-500/10 border-red-500/40 text-red-700 dark:text-red-300 font-semibold';
                              statusIcon = (
                                <span className="text-xs text-red-500 font-bold">
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
                                  <span className="w-5 h-5 rounded border border-border flex items-center justify-center text-xs font-bold text-muted">
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

                      <div className="p-4 rounded-xl bg-indigo-50/40 dark:bg-slate-800/60 border border-primary/20 space-y-1">
                        <div className="flex items-center gap-1.5 text-primary text-xs font-bold">
                          <Lightbulb className="h-4 w-4" />
                          <span>Authoritative Answer Explanation</span>
                        </div>
                        <p className="text-sm text-dark/80 leading-relaxed">
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
