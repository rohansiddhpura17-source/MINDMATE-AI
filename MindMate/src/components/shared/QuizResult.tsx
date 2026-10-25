import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Trophy, ArrowRight, Zap, BookOpen, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { NextLearningAction, PersistenceStatus } from '../../services/assessment/types';
import { STRATEGY_LABELS } from '../../services/adaptive/adaptiveLearningEngine';

interface QuizResultProps {
  score: number;
  total: number;
  topic: string;
  nextAction?: NextLearningAction;
  persistenceStatus?: PersistenceStatus;
  persistenceMessage?: string;
}

export function QuizResult({
  score,
  total,
  topic,
  nextAction,
  persistenceStatus,
  persistenceMessage,
}: QuizResultProps) {
  const navigate = useNavigate();
  const percentage = total > 0 ? Math.round((score / total) * 100) : 0;

  let message = 'Diagnostic Baseline Recorded!';
  if (percentage >= 80) message = 'Strong Diagnostic Baseline!';
  if (percentage === 100) message = 'Perfect Diagnostic Score!';

  return (
    <Card className="p-8 text-center max-w-lg mx-auto">
      <div className="inline-flex p-4 rounded-full bg-yellow-100 dark:bg-amber-950/40 text-yellow-600 dark:text-amber-400 mb-6">
        <Trophy className="h-12 w-12" />
      </div>

      <h2 className="text-3xl font-bold mb-2 text-dark">{message}</h2>
      <p className="text-muted mb-4">
        You scored {score} out of {total} ({percentage}%) in {topic}.
      </p>

      {persistenceMessage && (
        <div
          role="status"
          className={`text-xs font-medium px-3 py-2 rounded-xl border mb-6 ${
            persistenceStatus === 'saved_cloud'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : persistenceStatus === 'failed'
                ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300'
          }`}
        >
          {persistenceMessage}
        </div>
      )}

      <div className="flex justify-center mb-8">
        <div className="relative h-32 w-32">
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="64"
              cy="64"
              r="60"
              className="stroke-gray-200 dark:stroke-slate-800"
              strokeWidth="8"
              fill="none"
            />
            <circle
              cx="64"
              cy="64"
              r="60"
              className="stroke-primary"
              strokeWidth="8"
              fill="none"
              strokeDasharray={`${2 * Math.PI * 60}`}
              strokeDashoffset={`${2 * Math.PI * 60 * (1 - percentage / 100)}`}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center flex-col">
            <span className="text-2xl font-bold text-dark">{percentage}%</span>
          </div>
        </div>
      </div>

      <div className="bg-indigo-50/70 dark:bg-slate-800/80 border border-indigo-100 dark:border-indigo-950/60 rounded-xl p-4 mb-8 text-left flex gap-4">
        <div className="mt-1 text-primary shrink-0">
          <Zap className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <h4 className="font-semibold text-dark text-sm">
            Adaptive Recommendation ({nextAction ? nextAction.nextTopicName : topic})
          </h4>
          <p className="text-xs text-dark/80 leading-relaxed">
            {nextAction
              ? nextAction.reason
              : `Completed ${total} diagnostic questions at ${percentage}% accuracy. Continue with a targeted follow-up quiz to increase mastery confidence.`}
          </p>
          {nextAction && (
            <p className="text-[11px] text-primary font-medium pt-1">
              Strategy: {STRATEGY_LABELS[nextAction.explanationStrategy]} • Suggested Difficulty:{' '}
              {nextAction.suggestedDifficulty.toUpperCase()} (Lvl {nextAction.suggestedDifficultyLevel})
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {nextAction && (
          <Button
            className="w-full"
            onClick={() =>
              navigate(
                `/practice/adaptive-quiz?topic=${encodeURIComponent(nextAction.nextTopicId)}&type=follow_up&difficulty=${nextAction.suggestedDifficultyLevel}`
              )
            }
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Start Recommended Follow-Up Quiz ({nextAction.nextTopicName})
          </Button>
        )}
        {nextAction && (
          <Button
            variant="secondary"
            className="w-full"
            onClick={() =>
              navigate(
                `/learn?topic=${encodeURIComponent(nextAction.nextTopicId)}&strategy=${encodeURIComponent(nextAction.explanationStrategy)}`
              )
            }
          >
            <BookOpen className="mr-2 h-4 w-4" />
            Open Adaptive Lesson ({STRATEGY_LABELS[nextAction.explanationStrategy]})
          </Button>
        )}
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => navigate('/progress')}
        >
          View Updated Analytics <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
