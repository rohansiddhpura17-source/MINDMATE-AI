import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Badge } from '../components/ui/Badge';
import {
  CopyX,
  RotateCw,
  Check,
  ChevronLeft,
  ChevronRight,
  Shuffle,
  RotateCcw,
  Sparkles,
  BookOpen,
  CheckCircle2,
  Code
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import {
  getFlashcardsByTopicAndLanguage,
  TOPICS,
  LanguageCode,
  FlashcardItem
} from '../data/learningContent';
import {
  saveFlashcardProgress,
  getUserFlashcardProgress,
  completePlannerTaskActivity,
  recordLearningWin
} from '../lib/db';

export default function Flashcards() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, language, showToast } = useAppContext();

  const queryTopicId = searchParams.get('topic') || 'python-functions';
  const queryTaskId = searchParams.get('taskId');

  const [selectedTopic, setSelectedTopic] = useState<string>(queryTopicId);
  const [deck, setDeck] = useState<FlashcardItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [masteredMap, setMasteredMap] = useState<Record<string, 'learning' | 'mastered'>>({});
  const [taskDoneNotice, setTaskDoneNotice] = useState<boolean>(false);

  useEffect(() => {
    const { flashcards } = getFlashcardsByTopicAndLanguage(
      selectedTopic,
      language as LanguageCode
    );
    setDeck(flashcards);
    setCurrentIndex(0);
    setIsFlipped(false);
    setTaskDoneNotice(false);

    if (user) {
      getUserFlashcardProgress(user.id, selectedTopic).then((res) => {
        if (res.data) {
          const map: Record<string, 'learning' | 'mastered'> = {};
          res.data.forEach((p: any) => {
            map[p.card_id] = p.status;
          });
          setMasteredMap(map);
        }
      });
    }
  }, [selectedTopic, language, user]);

  const currentCard = deck[currentIndex];

  const handleFlip = () => {
    setIsFlipped((prev) => !prev);
  };

  const handleMarkStatus = async (status: 'learning' | 'mastered') => {
    if (!currentCard) return;

    setMasteredMap((prev) => ({ ...prev, [currentCard.id]: status }));

    if (user) {
      try {
        await saveFlashcardProgress(user.id, {
          card_id: currentCard.id,
          topic_id: currentCard.topicId,
          status,
        });
      } catch (err) {
        console.warn('Failed to save flashcard progress:', err);
      }
    }

    // Move to next card
    if (currentIndex + 1 < deck.length) {
      setIsFlipped(false);
      setCurrentIndex((prev) => prev + 1);
    } else {
      // Completed the deck
      if (user && queryTaskId) {
        await completePlannerTaskActivity(queryTaskId, user.id, 'flashcards');
        setTaskDoneNotice(true);
        showToast('Planner activity verified and marked complete!', 'success');
      }
      showToast('Deck review complete!', 'success');
    }
  };

  const handleShuffle = () => {
    const shuffled = [...deck].sort(() => Math.random() - 0.5);
    setDeck(shuffled);
    setCurrentIndex(0);
    setIsFlipped(false);
    showToast('Deck shuffled', 'success');
  };

  const masteredCount = deck.filter((c) => masteredMap[c.id] === 'mastered').length;

  return (
    <AppShell
      pageTitle="Flashcards"
      pageSubtitle="Spaced repetition active recall with code examples and mastery tracking"
    >
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Top Control Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-surface p-4 rounded-card border border-border">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <CopyX className="h-5 w-5" />
            </div>
            <div>
              <span className="text-xs text-muted font-medium">Topic Focus:</span>
              <select
                value={selectedTopic}
                onChange={(e) => setSelectedTopic(e.target.value)}
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

          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleShuffle}
              className="flex items-center gap-1.5 text-xs"
            >
              <Shuffle className="h-3.5 w-3.5" /> Shuffle Deck
            </Button>
            <div className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-600">
              {masteredCount}/{deck.length} Mastered
            </div>
          </div>
        </div>

        {currentCard ? (
          <div className="space-y-6">
            {/* Progress Bar */}
            <div className="flex items-center justify-between text-xs font-semibold text-muted">
              <span>
                Card {currentIndex + 1} of {deck.length}
              </span>
              <span>
                {Math.round(((currentIndex + 1) / deck.length) * 100)}% Complete
              </span>
            </div>
            <ProgressBar
              value={Math.round(((currentIndex + 1) / deck.length) * 100)}
              className="h-2"
            />

            {/* Flashcard 3D Card */}
            <div
              className="relative cursor-pointer min-h-[360px] sm:min-h-[420px] transition-all duration-300"
              onClick={handleFlip}
            >
              <Card
                className={`w-full min-h-[360px] sm:min-h-[420px] p-8 sm:p-12 flex flex-col justify-between border border-border shadow-md transition-all duration-300 hover:shadow-lg ${
                  isFlipped ? 'bg-primary/5 border-primary/30' : 'bg-surface'
                }`}
              >
                {/* Top Card Bar */}
                <div className="flex items-center justify-between">
                  <Badge variant="default" className="text-xs">
                    {isFlipped ? 'Answer & Explanation' : 'Concept / Question'}
                  </Badge>
                  <div className="flex items-center gap-2 text-xs font-medium text-muted">
                    <RotateCw className="h-3.5 w-3.5 animate-pulse" />
                    <span>Click to flip</span>
                  </div>
                </div>

                {/* Center Content */}
                <div className="my-auto py-6 space-y-4">
                  {!isFlipped ? (
                    <div className="text-center space-y-3">
                      <span className="text-xs font-bold uppercase tracking-wider text-primary">
                        Prompt
                      </span>
                      <h2 className="text-2xl sm:text-3xl font-bold text-dark leading-tight">
                        {currentCard.front}
                      </h2>
                    </div>
                  ) : (
                    <div className="space-y-4 text-left">
                      <div className="space-y-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-primary">
                          Definition
                        </span>
                        <p className="text-lg sm:text-xl font-semibold text-dark leading-relaxed">
                          {currentCard.back}
                        </p>
                      </div>

                      {currentCard.codeSnippet && (
                        <div className="rounded-xl bg-slate-900 text-slate-100 p-4 font-mono text-xs sm:text-sm overflow-x-auto shadow-inner">
                          <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mb-2">
                            <Code className="h-3.5 w-3.5" />
                            <span>Code Example</span>
                          </div>
                          <pre>{currentCard.codeSnippet}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Bottom Card Bar */}
                <div className="flex items-center justify-between pt-4 border-t border-border/70 text-xs text-muted">
                  <span>Topic: {TOPICS.find((t) => t.id === currentCard.topicId)?.name}</span>
                  {masteredMap[currentCard.id] === 'mastered' && (
                    <span className="text-emerald-600 font-semibold flex items-center gap-1">
                      <Check className="h-3.5 w-3.5" /> Marked as Mastered
                    </span>
                  )}
                </div>
              </Card>
            </div>

            {/* Bottom Actions: Navigation & Spaced Repetition Rating */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={currentIndex === 0}
                  onClick={() => {
                    setIsFlipped(false);
                    setCurrentIndex((prev) => Math.max(0, prev - 1));
                  }}
                  className="flex items-center gap-1"
                >
                  <ChevronLeft className="h-4 w-4" /> Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={currentIndex === deck.length - 1}
                  onClick={() => {
                    setIsFlipped(false);
                    setCurrentIndex((prev) => Math.min(deck.length - 1, prev + 1));
                  }}
                  className="flex items-center gap-1"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Mastered / Learning buttons */}
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <Button
                  variant="secondary"
                  onClick={() => handleMarkStatus('learning')}
                  className="flex-1 sm:flex-none border-amber-500/30 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20"
                >
                  Still Learning
                </Button>
                <Button
                  onClick={() => handleMarkStatus('mastered')}
                  className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 font-bold"
                >
                  <Check className="h-4 w-4" /> Mastered Card
                </Button>
              </div>
            </div>

            {taskDoneNotice && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-sm font-semibold text-center flex items-center justify-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Linked Planner Task has been completed!
              </div>
            )}
          </div>
        ) : (
          <Card className="p-12 text-center space-y-4">
            <BookOpen className="h-10 w-10 text-muted mx-auto" />
            <h3 className="text-lg font-bold text-dark">No flashcards found</h3>
            <p className="text-sm text-muted">
              Select another topic or switch your learning language in Settings.
            </p>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
