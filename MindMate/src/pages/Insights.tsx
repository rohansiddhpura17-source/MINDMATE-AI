import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { InsightCard } from '../components/shared/InsightCard';
import {
  Brain,
  TrendingUp,
  AlertTriangle,
  Sparkles,
  Zap,
  BarChart3,
  RotateCcw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { useMastery } from '../hooks/useMastery';
import { STRATEGY_LABELS } from '../services/adaptive/adaptiveLearningEngine';

export default function Insights() {
  const navigate = useNavigate();
  const { snapshot } = useMastery();

  const unresolvedMistakes = snapshot.topics.reduce(
    (sum, t) => sum + t.unresolvedMistakesCount,
    0
  );

  const topicChartData = snapshot.topics.map((t) => ({
    name: t.topicName.split(' ')[0],
    fullName: t.topicName,
    mastery: t.masteryScore,
    accuracy: t.overallAccuracy,
    attempts: t.totalAttempts,
  }));

  return (
    <AppShell
      pageTitle="Learning Insights"
      pageSubtitle="Evidence-backed recommendations, recurring mistake patterns, and topic proficiency"
    >
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Core Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="p-5 border border-border flex items-center gap-4">
            <div className="p-3 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Brain className="h-6 w-6" />
            </div>
            <div>
              <span className="text-xs text-muted block font-medium">
                Assessed Mastery
              </span>
              <span className="text-2xl font-bold text-dark">
                {snapshot.assessedTopicsCount > 0
                  ? `${snapshot.averageMastery}%`
                  : '—'}
              </span>
            </div>
          </Card>

          <Card className="p-5 border border-border flex items-center gap-4">
            <div className="p-3 rounded-xl bg-indigo-500/10 text-primary">
              <Zap className="h-6 w-6" />
            </div>
            <div>
              <span className="text-xs text-muted block font-medium">
                Overall Accuracy
              </span>
              <span className="text-2xl font-bold text-dark">
                {snapshot.totalAttempts > 0 ? `${snapshot.overallAccuracy}%` : '—'}
              </span>
            </div>
          </Card>

          <Card className="p-5 border border-border flex items-center gap-4">
            <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <span className="text-xs text-muted block font-medium">
                Recent Accuracy
              </span>
              <span className="text-2xl font-bold text-dark">
                {snapshot.totalAttempts > 0 ? `${snapshot.recentAccuracy}%` : '—'}
              </span>
            </div>
          </Card>

          <Card className="p-5 border border-border flex items-center gap-4">
            <div className="p-3 rounded-xl bg-red-500/10 text-red-500">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <span className="text-xs text-muted block font-medium">
                Unresolved Gaps
              </span>
              <span className="text-2xl font-bold text-dark">
                {unresolvedMistakes}
              </span>
            </div>
          </Card>
        </div>

        {/* Topic Mastery & Accuracy Chart */}
        <Card className="p-6 border border-border space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <div>
              <h3 className="text-base font-bold text-dark flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-purple-600" /> Topic Mastery vs
                Accuracy Distribution
              </h3>
              <p className="text-xs text-muted">
                Computed directly from your {snapshot.totalAttempts} recorded question attempt(s)
              </p>
            </div>
            <Badge variant="default" className="text-xs">
              {snapshot.assessedTopicsCount}/{snapshot.totalTopicsCount} Topics Assessed
            </Badge>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topicChartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-surface, #ffffff)',
                    borderColor: 'var(--color-border, #e2e8f0)',
                    borderRadius: '12px',
                    color: 'var(--color-dark, #0f172a)',
                    fontSize: '12px',
                  }}
                />
                <Bar
                  dataKey="mastery"
                  fill="#7c3aed"
                  radius={[6, 6, 0, 0]}
                  name="Mastery %"
                />
                <Bar
                  dataKey="accuracy"
                  fill="#6366f1"
                  radius={[6, 6, 0, 0]}
                  name="Overall Accuracy %"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Mistake Pattern Recovery Alert */}
        {unresolvedMistakes > 0 && (
          <Card className="p-6 border-red-500/30 bg-red-500/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-red-500/10 text-red-500 shrink-0">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h4 className="text-base font-bold text-dark">
                  {unresolvedMistakes} Unresolved Learning Mistake
                  {unresolvedMistakes > 1 ? 's' : ''} Recorded
                </h4>
                <p className="text-xs sm:text-sm text-muted">
                  Review your missed questions and practice with targeted explanations.
                </p>
              </div>
            </div>
            <Button
              onClick={() => navigate('/practice/mistake-review')}
              className="bg-red-600 hover:bg-red-700 text-white font-bold shrink-0 flex items-center gap-2"
            >
              <RotateCcw className="h-4 w-4" /> Open Mistake Review
            </Button>
          </Card>
        )}

        {/* Evidence-Based Recommendations */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-dark">
              Evidence-Backed Learning Insights
            </h3>
            <span className="text-xs text-muted">
              Derived from topic mastery, recency trends, and prerequisite dependencies
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {snapshot.recommendations.map((rec) => (
              <InsightCard
                key={rec.id}
                type={
                  rec.priority <= 2
                    ? 'mistake'
                    : rec.action === 'advance-difficulty'
                      ? 'mastery'
                      : 'info'
                }
                title={`${rec.topicName} — ${rec.action.replace(/-/g, ' ')}`}
                description={`${rec.reason} (Evidence: ${rec.supportingEvidence.detail} • Strategy: ${STRATEGY_LABELS[rec.explanationStrategy]})`}
                action={`Start ${rec.suggestedDifficulty.toUpperCase()} Quiz`}
                onAction={() =>
                  navigate(
                    `/practice/adaptive-quiz?topic=${encodeURIComponent(rec.topicId)}&type=${rec.action === 'diagnostic-quiz' ? 'diagnostic' : 'follow_up'}&difficulty=${rec.suggestedDifficultyLevel}`
                  )
                }
              />
            ))}
          </div>
        </div>

        {/* Deeper Insights Callout */}
        <div className="p-6 bg-surface border border-dashed border-border rounded-2xl text-center space-y-3">
          <div className="p-3 rounded-full bg-primary/10 text-primary w-fit mx-auto">
            <Sparkles className="h-5 w-5" />
          </div>
          <h4 className="text-base font-bold text-dark">
            Personalized Twin Calibration
          </h4>
          <p className="text-sm text-muted max-w-md mx-auto leading-relaxed">
            Inspect how MindMate maps your topic mastery, confidence levels, and preferred explanation strategy in your Learning Twin profile.
          </p>
          <div className="pt-2">
            <Button
              variant="secondary"
              onClick={() => navigate('/learning-twin')}
              className="font-bold text-xs"
            >
              Inspect Adaptive Twin Profile
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
