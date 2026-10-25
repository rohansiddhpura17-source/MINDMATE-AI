import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Badge } from '../components/ui/Badge';
import { PracticeCard } from '../components/shared/PracticeCard';
import {
  Brain,
  Zap,
  CopyX,
  Sparkles,
  ArrowRight,
  CheckCircle,
  BookOpen,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMastery } from '../hooks/useMastery';
import { STRATEGY_LABELS } from '../services/adaptive/adaptiveLearningEngine';

export default function Practice() {
  const navigate = useNavigate();
  const { snapshot } = useMastery();

  const nextAction = snapshot.nextLearningAction;
  const unresolvedMistakesTotal = snapshot.topics.reduce(
    (sum, t) => sum + t.unresolvedMistakesCount,
    0
  );

  return (
    <AppShell
      pageTitle="Practice"
      pageSubtitle="Adaptive assessments, targeted mistake recovery, and spaced recall"
    >
      <div className="max-w-5xl space-y-8">
        {/* Adaptive Next Best Action Hero Card */}
        <Card className="p-8 border-primary/20 bg-indigo-50/30 dark:bg-indigo-950/20 overflow-hidden relative">
          <div className="absolute right-0 top-0 w-64 h-full bg-gradient-to-l from-indigo-100/50 dark:from-indigo-900/20 to-transparent pointer-events-none" />
          <div className="flex flex-wrap items-center gap-2 text-primary font-semibold mb-2">
            <Sparkles className="h-5 w-5" />
            <span>Adaptive Recommendation</span>
            <Badge variant="default" className="text-[11px] uppercase">
              {nextAction.suggestedActivity.replace(/-/g, ' ')}
            </Badge>
            <Badge variant="default" className="text-[11px]">
              Target: {nextAction.suggestedDifficulty.toUpperCase()} (Lvl{' '}
              {nextAction.suggestedDifficultyLevel})
            </Badge>
          </div>

          <h2 className="text-2xl font-bold text-dark mb-2">
            {nextAction.nextTopicName}
          </h2>
          <p className="text-muted max-w-2xl mb-3 leading-relaxed">
            {nextAction.reason}
          </p>
          <p className="text-xs text-dark/80 mb-6">
            <strong>Evidence:</strong> {nextAction.supportingEvidence.detail} •{' '}
            <strong>Selected Explanation Strategy:</strong>{' '}
            {STRATEGY_LABELS[nextAction.explanationStrategy]}
          </p>

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() =>
                navigate(
                  `/practice/adaptive-quiz?topic=${encodeURIComponent(nextAction.nextTopicId)}&type=${nextAction.suggestedActivity === 'diagnostic-quiz' ? 'diagnostic' : 'follow_up'}&difficulty=${nextAction.suggestedDifficultyLevel}`
                )
              }
            >
              Start Recommended Quiz <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                navigate(
                  `/learn?topic=${encodeURIComponent(nextAction.nextTopicId)}&strategy=${encodeURIComponent(nextAction.explanationStrategy)}`
                )
              }
            >
              <BookOpen className="mr-2 h-4 w-4" />
              Open Adaptive Lesson ({STRATEGY_LABELS[nextAction.explanationStrategy]})
            </Button>
          </div>
        </Card>

        {/* Practice Types Grid */}
        <div>
          <h3 className="text-xl font-bold mb-4 text-dark">Practice Modes</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <PracticeCard
              title="Adaptive Quiz"
              description="Dynamic difficulty progression (Easy → Medium → Hard) calibrated to your topic mastery and recent accuracy."
              timeEstimate="5-10 min"
              icon={Brain}
              colorClass="text-purple-600"
              path={`/practice/adaptive-quiz?topic=${encodeURIComponent(nextAction.nextTopicId)}`}
            />
            <PracticeCard
              title="Quick Recall"
              description="Rapid-fire concept rules, syntax checks, and pitfall summaries to build retention."
              timeEstimate="5 min"
              icon={Zap}
              colorClass="text-yellow-600"
              path="/practice/quick-recall"
            />
            <PracticeCard
              title="Flashcards"
              description="Review core definitions and code patterns with self-paced mastery tracking."
              timeEstimate="10 min"
              icon={CopyX}
              colorClass="text-blue-600"
              path="/practice/flashcards"
            />
            <PracticeCard
              title={`Mistake Review (${unresolvedMistakesTotal} unresolved)`}
              description="Re-practice questions you missed and inspect recurring concept patterns."
              timeEstimate={unresolvedMistakesTotal > 0 ? `${unresolvedMistakesTotal} item(s)` : 'All clear'}
              icon={CheckCircle}
              colorClass="text-red-500"
              path="/practice/mistake-review"
            />
          </div>
        </div>

        {/* All Curriculum Topics & Live Mastery Status */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-dark">
              Topic Mastery & Assessment Status
            </h3>
            <span className="text-xs text-muted">
              {snapshot.assessedTopicsCount} of {snapshot.totalTopicsCount} topics assessed
            </span>
          </div>
          <Card className="overflow-hidden">
            <div className="divide-y divide-border">
              {snapshot.topics.map((topic) => (
                <div
                  key={topic.topicId}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-dark">{topic.topicName}</h4>
                      <Badge variant="default" className="text-[10px] capitalize">
                        {topic.status}
                      </Badge>
                      <Badge variant="default" className="text-[10px] capitalize">
                        Confidence: {topic.confidenceLevel}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted">
                      {topic.totalAttempts > 0
                        ? `${topic.correctAnswers}/${topic.totalAttempts} correct (${topic.overallAccuracy}% accuracy, recent ${topic.recentAccuracy}%) • Last practiced ${
                            topic.lastPracticedAt
                              ? new Date(topic.lastPracticedAt).toLocaleDateString()
                              : 'recently'
                          }`
                        : 'No attempts recorded yet — take a diagnostic quiz to establish baseline'}
                    </p>
                  </div>
                  <div className="w-full sm:w-36 flex-shrink-0 sm:mr-4">
                    <ProgressBar
                      value={topic.masteryScore}
                      showValue
                      className="h-1.5"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        navigate(
                          `/practice/adaptive-quiz?topic=${encodeURIComponent(topic.topicId)}&type=${topic.totalAttempts === 0 ? 'diagnostic' : topic.totalAttempts <= 2 ? 'follow_up' : 'adaptive'}`
                        )
                      }
                    >
                      {topic.totalAttempts === 0
                        ? 'Diagnostic'
                        : topic.totalAttempts <= 2
                          ? 'Follow-Up'
                          : 'Practice'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
