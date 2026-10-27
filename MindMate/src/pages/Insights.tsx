import { useState, useEffect } from 'react';
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
import { useAppContext } from '../context/AppContext';
import { useMastery } from '../hooks/useMastery';
import { STRATEGY_LABELS } from '../services/adaptive/adaptiveLearningEngine';
import {
  isDemoModeActive,
  loadDemoProgress,
  clearDemoProgress,
  DEMO_MODE_CHANGED_EVENT,
} from '../services/demo/demoLearnerService';

export default function Insights() {
  const navigate = useNavigate();
  const { user, showToast } = useAppContext();
  const { snapshot, refresh } = useMastery();

  const [demoActive, setDemoActive] = useState(() => isDemoModeActive(user?.id));

  useEffect(() => {
    const handleDemoChange = (e: any) => {
      setDemoActive(Boolean(e.detail?.active));
    };
    window.addEventListener(DEMO_MODE_CHANGED_EVENT, handleDemoChange);
    return () => window.removeEventListener(DEMO_MODE_CHANGED_EVENT, handleDemoChange);
  }, []);

  const handleLoadDemo = () => {
    const res = loadDemoProgress(user?.id);
    setDemoActive(true);
    void refresh();
    showToast(`Loaded ${res.attemptsCount} demo question attempts across 8 topics.`, 'success');
  };

  const handleClearDemo = () => {
    clearDemoProgress(user?.id);
    setDemoActive(false);
    void refresh();
    showToast('Demo data cleared. Returned to your genuine learning records.', 'info');
  };

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

        {/* Demo Mode Banner (When Active) */}
        {demoActive && (
          <div className="bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
            <div className="flex gap-3 items-start">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 flex items-center justify-center shrink-0 border border-amber-200 dark:border-amber-700">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-600 animate-pulse" />
                    SIMULATED DEMO DATA ACTIVE
                  </span>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Profile: {user?.name || user?.email?.split('@')[0] || 'meet8kotecha'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
                  Displaying an isolated 14-day demo learning dataset (41 attempts across 8 topics). <strong>Simulated results are not verified evidence of actual learning.</strong> Real learner records are untouched and safe.
                </p>
              </div>
            </div>
            <div className="flex gap-2 shrink-0 sm:self-center">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleClearDemo}
                className="bg-white hover:bg-amber-100/60 dark:bg-slate-800 text-amber-900 dark:text-amber-200 border-amber-200 dark:border-amber-800/60 shadow-xs font-semibold text-xs cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Clear Demo Data
              </Button>
            </div>
          </div>
        )}

        {/* Empty State Banner (When Inactive and 0 Attempts) */}
        {!demoActive && snapshot.totalAttempts === 0 && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 text-center space-y-4 shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto border border-indigo-100 dark:border-indigo-900/50">
              <Sparkles className="h-6 w-6" />
            </div>
            <div className="max-w-xl mx-auto space-y-1.5">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Welcome to Learning Insights, {user?.name || 'meet8kotecha'}!
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                You currently have 0 question attempts recorded. Take an adaptive quiz to build your authentic assessment baseline, or load a realistic 14-day demo learner dataset to explore the topic mastery curves, recurring mistake detection, and evidence-backed recommendations.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button
                onClick={handleLoadDemo}
                className="shadow-sm font-semibold cursor-pointer"
              >
                <Sparkles className="h-4 w-4 mr-2" /> Load Demo Progress
              </Button>
              <Button
                variant="secondary"
                onClick={() => navigate('/practice/adaptive-quiz')}
                className="cursor-pointer"
              >
                Start Diagnostic Quiz
              </Button>
            </div>
          </div>
        )}

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
