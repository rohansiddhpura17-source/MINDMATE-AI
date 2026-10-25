import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { ProgressBar } from '../components/ui/ProgressBar';
import {
  Zap,
  Eye,
  Check,
  X,
  RotateCcw,
  Sparkles,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import {
  getQuickRecallByTopicAndLanguage,
  TOPICS,
  LanguageCode,
  QuickRecallItem
} from '../data/learningContent';
import { completePlannerTaskActivity, recordLearningWin } from '../lib/db';

export default function QuickRecall() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, language, showToast } = useAppContext();

  const queryTopicId = searchParams.get('topic') || 'python-functions';
  const queryTaskId = searchParams.get('taskId');

  const [selectedTopic, setSelectedTopic] = useState<string>(queryTopicId);
  const [items, setItems] = useState<QuickRecallItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [revealed, setRevealed] = useState<boolean>(false);
  const [knownCount, setKnownCount] = useState<number>(0);
  const [reviewCount, setReviewCount] = useState<number>(0);
  const [isComplete, setIsComplete] = useState<boolean>(false);
  const [taskDoneNotice, setTaskDoneNotice] = useState<boolean>(false);

  useEffect(() => {
    const { items: loaded } = getQuickRecallByTopicAndLanguage(
      selectedTopic,
      language as LanguageCode
    );
    setItems(loaded);
    setCurrentIndex(0);
    setRevealed(false);
    setKnownCount(0);
    setReviewCount(0);
    setIsComplete(false);
    setTaskDoneNotice(false);
  }, [selectedTopic, language]);

  const currentItem = items[currentIndex];

  const handleEvaluation = async (mastered: boolean) => {
    if (mastered) {
      setKnownCount((prev) => prev + 1);
    } else {
      setReviewCount((prev) => prev + 1);
    }

    const nextIndex = currentIndex + 1;
    if (nextIndex >= items.length) {
      setIsComplete(true);
      if (user && queryTaskId) {
        await completePlannerTaskActivity(queryTaskId, user.id, 'recall');
        setTaskDoneNotice(true);
        showToast('Planner task verified & completed!', 'success');
      }
      if (user && mastered) {
        await recordLearningWin(user.id, {
          title: `Rapid Recall Sprint Complete`,
          description: `Finished ${items.length} rapid-retrieval cards with high retention.`,
          category: 'quiz',
          icon: 'Zap',
          metric_value: `${Math.round(((knownCount + 1) / items.length) * 100)}%`,
        });
      }
    } else {
      setCurrentIndex(nextIndex);
      setRevealed(false);
    }
  };

  return (
    <AppShell
      pageTitle="Quick Recall"
      pageSubtitle="Rapid-fire retrieval practice designed to build automaticity and muscle memory"
    >
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Top Control Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-surface p-4 rounded-card border border-border">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <span className="text-xs text-muted font-medium">Topic Focus:</span>
              <select
                value={selectedTopic}
                onChange={(e) => setSelectedTopic(e.target.value)}
                disabled={currentIndex > 0}
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

          <div className="flex items-center gap-4 text-xs font-semibold text-muted">
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-primary" />
              <span>Target: ~30s per card</span>
            </div>
          </div>
        </div>

        {!isComplete && currentItem && (
          <Card className="p-6 sm:p-10 space-y-6 border border-border shadow-sm">
            {/* Header progress */}
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <div className="space-y-1">
                <span className="text-xs font-bold text-muted uppercase tracking-wider">
                  Card {currentIndex + 1} of {items.length}
                </span>
                <ProgressBar
                  value={Math.round(((currentIndex + 1) / items.length) * 100)}
                  className="w-48 h-2"
                />
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="default" className="text-xs">
                  {currentItem.category}
                </Badge>
              </div>
            </div>

            {/* Prompt Prompt */}
            <div className="py-6 space-y-3">
              <span className="text-xs font-bold text-primary uppercase tracking-wider">
                Retrieval Prompt:
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-dark leading-snug">
                {currentItem.title}
              </h2>
            </div>

            {/* Hidden / Revealed Solution Area */}
            {!revealed ? (
              <div className="p-8 rounded-2xl border-2 border-dashed border-border bg-gray-50/50 dark:bg-slate-800/20 text-center space-y-4">
                <p className="text-sm text-muted">
                  Recall the answer mentally before flipping. Try not to peek!
                </p>
                <Button
                  onClick={() => setRevealed(true)}
                  className="px-6 py-2.5 font-bold flex items-center gap-2 mx-auto"
                >
                  <Eye className="h-4 w-4" /> Reveal Answer & Notes
                </Button>
              </div>
            ) : (
              <div className="p-6 rounded-2xl border border-primary/20 bg-primary/5 space-y-4 animate-in fade-in zoom-in-95 duration-200">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-primary uppercase tracking-wider">
                    Core Answer:
                  </span>
                  <p className="text-base sm:text-lg font-semibold text-dark">
                    {currentItem.keyFact}
                  </p>
                </div>

                {currentItem.codeSnippet && (
                  <div className="rounded-xl bg-slate-900 text-slate-100 p-3.5 font-mono text-xs overflow-x-auto shadow-inner">
                    <pre>{currentItem.codeSnippet}</pre>
                  </div>
                )}

                <div className="pt-3 border-t border-primary/10 space-y-1">
                  <span className="text-xs font-bold text-muted uppercase tracking-wider">
                    MindMate Key Takeaway:
                  </span>
                  <p className="text-sm text-dark/80 leading-relaxed">
                    {currentItem.detail}
                  </p>
                </div>

                {/* Self evaluation actions */}
                <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <span className="text-xs font-medium text-muted">
                    How well did you recall this concept?
                  </span>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Button
                      variant="secondary"
                      onClick={() => handleEvaluation(false)}
                      className="flex-1 sm:flex-none border-red-500/30 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 flex items-center gap-2"
                    >
                      <X className="h-4 w-4" /> Review Again Later
                    </Button>
                    <Button
                      onClick={() => handleEvaluation(true)}
                      className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2"
                    >
                      <Check className="h-4 w-4" /> Recalled Instantly
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Completion Card */}
        {isComplete && (
          <Card className="p-8 sm:p-10 text-center space-y-6 border border-border">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 mx-auto flex items-center justify-center">
              <Zap className="h-8 w-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl sm:text-3xl font-bold text-dark">
                Quick Recall Session Complete!
              </h2>
              <p className="text-sm text-muted max-w-md mx-auto">
                Rapid-fire retrieval strengthens synaptic pathways and speeds up real exam problem solving.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 max-w-md mx-auto py-4">
              <div className="p-4 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-border">
                <span className="text-xs text-muted block">Recalled Instantly</span>
                <span className="text-2xl font-bold text-emerald-600">
                  {knownCount}
                </span>
              </div>
              <div className="p-4 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-border">
                <span className="text-xs text-muted block">Needs Review</span>
                <span className="text-2xl font-bold text-amber-500">
                  {reviewCount}
                </span>
              </div>
            </div>

            {taskDoneNotice && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-sm font-semibold max-w-lg mx-auto flex items-center justify-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Linked Planner Task has been marked Completed!
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
              <Button
                variant="secondary"
                onClick={() => {
                  setCurrentIndex(0);
                  setRevealed(false);
                  setKnownCount(0);
                  setReviewCount(0);
                  setIsComplete(false);
                }}
                className="flex items-center gap-2"
              >
                <RotateCcw className="h-4 w-4" /> Repeat Deck
              </Button>
              <Button
                onClick={() => navigate('/practice/flashcards')}
                className="flex items-center gap-2"
              >
                <BookOpen className="h-4 w-4" /> Study Full Flashcards
              </Button>
              <Button variant="ghost" onClick={() => navigate('/planner')}>
                Return to Planner
              </Button>
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
