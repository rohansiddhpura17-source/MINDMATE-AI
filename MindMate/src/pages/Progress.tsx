import { useState, useEffect } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Badge } from '../components/ui/Badge';
import { ChartCard } from '../components/shared/ChartCard';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  AlertTriangle,
  Cloud,
  HardDrive,
  RefreshCw,
  Sparkles,
  BookOpen,
  CheckCircle2,
  Clock,
  HelpCircle,
  RotateCcw,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useMastery } from '../hooks/useMastery';
import { retryUnsyncedAttempts } from '../services/assessment/assessmentService';
import { STRATEGY_LABELS } from '../services/adaptive/adaptiveLearningEngine';
import {
  isDemoModeActive,
  loadDemoProgress,
  clearDemoProgress,
  DEMO_MODE_CHANGED_EVENT,
} from '../services/demo/demoLearnerService';

function buildSevenDayAttemptChart(
  attempts: Array<{ attempted_at: string; is_correct: boolean }>
) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const buckets: Array<{ day: string; dateKey: string; attempts: number; correct: number }> = [];
  const now = new Date();

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateKey = d.toISOString().slice(0, 10);
    buckets.push({
      day: days[d.getDay()],
      dateKey,
      attempts: 0,
      correct: 0,
    });
  }

  for (const att of attempts) {
    const dateKey = (att.attempted_at || '').slice(0, 10);
    const bucket = buckets.find((b) => b.dateKey === dateKey);
    if (bucket) {
      bucket.attempts += 1;
      if (att.is_correct) bucket.correct += 1;
    }
  }

  return buckets;
}

export default function Progress() {
  const navigate = useNavigate();
  const { user, showToast } = useAppContext();
  const { snapshot, loading, refresh } = useMastery();
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
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
    showToast('Demo data cleared. Returned to genuine learner records.', 'info');
  };

  const handleRetrySync = async () => {
    setSyncing(true);
    setSyncNotice(null);
    try {
      const res = await retryUnsyncedAttempts(user?.id || 'guest');
      setSyncNotice(res.message);
      await refresh();
    } finally {
      setSyncing(false);
    }
  };

  const assessedTopics = snapshot.topics.filter((t) => t.totalAttempts > 0);
  const weakestAssessed =
    assessedTopics.length > 0
      ? [...assessedTopics].sort((a, b) => a.masteryScore - b.masteryScore)[0]
      : null;

  const sevenDayData = buildSevenDayAttemptChart(snapshot.recentAttempts);

  return (
    <AppShell
      pageTitle="Assessment Analytics & Mastery"
      pageSubtitle="Live deterministic topic mastery, confidence intervals, recurring mistake analysis, and evidence-backed recommendations"
    >
      <div className="max-w-6xl space-y-8">
        {/* Data Source & Persistence Status Banner */}
        <div
          role="status"
          aria-live="polite"
          className={`flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border text-xs font-medium ${
            demoActive || snapshot.isDemoMode
              ? 'border-amber-200 bg-amber-50/90 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
              : snapshot.syncError
              ? 'border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]'
              : snapshot.dataSource === 'cloud_and_local'
                ? 'border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]'
                : 'border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {demoActive || snapshot.isDemoMode ? (
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
            ) : snapshot.dataSource === 'cloud_and_local' ? (
              <Cloud className="h-4 w-4 shrink-0" />
            ) : (
              <HardDrive className="h-4 w-4 shrink-0" />
            )}
            <div>
              <span className="font-bold">
                {demoActive || snapshot.isDemoMode
                  ? 'SIMULATED DEMO DATA ACTIVE: '
                  : snapshot.dataSource === 'cloud_and_local'
                  ? 'Cloud + Local Persistence Active: '
                  : !snapshot.isSupabaseConfigured
                    ? 'Local Persistence Mode (Supabase Not Configured): '
                    : 'Local Device Storage: '}
              </span>
              <span>
                {demoActive || snapshot.isDemoMode
                  ? `Displaying simulated 14-day history for ${user?.name || 'meet8kotecha'} (41 attempts across 8 topics). Simulated results are not verified evidence of actual learning. Real learner records are untouched.`
                  : snapshot.syncError
                  ? `Cloud sync encountered an error (${snapshot.syncError}). Showing verified local attempts.`
                  : !snapshot.isSupabaseConfigured
                    ? 'All quiz attempts and mastery metrics are saved in local storage on this Mac.'
                    : 'Analytics are computed directly from your recorded question attempts.'}
              </span>
              {syncNotice && <span className="block font-semibold mt-1">{syncNotice}</span>}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {demoActive || snapshot.isDemoMode ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={handleClearDemo}
                className="h-8 text-xs font-semibold bg-white dark:bg-slate-800 text-amber-900 dark:text-amber-200 border-amber-200 dark:border-amber-800/60 shadow-xs cursor-pointer"
              >
                <RotateCcw className="h-3 w-3 mr-1" /> Clear Demo Data
              </Button>
            ) : snapshot.totalAttempts === 0 ? (
              <Button
                size="sm"
                onClick={handleLoadDemo}
                className="h-8 text-xs font-semibold shadow-xs cursor-pointer"
              >
                <Sparkles className="h-3 w-3 mr-1" /> Load Demo Progress
              </Button>
            ) : null}

            {snapshot.isSupabaseConfigured && user && !demoActive && !snapshot.isDemoMode && (
              <Button
                size="sm"
                variant="secondary"
                onClick={handleRetrySync}
                disabled={syncing || loading}
                className="h-8 text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Sync Pending Attempts'}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void refresh()}
              disabled={loading}
              className="h-8 text-xs flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Top Summary Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="p-5 border border-border">
            <span className="text-xs text-muted font-medium block">Total Attempts</span>
            <span className="text-2xl font-bold text-dark mt-1 block">
              {snapshot.totalAttempts}
            </span>
            <span className="text-[11px] text-muted">
              {snapshot.totalCorrect} correct / {snapshot.totalAttempts - snapshot.totalCorrect} incorrect
            </span>
          </Card>

          <Card className="p-5 border border-border">
            <span className="text-xs text-muted font-medium block">Overall Accuracy</span>
            <span className="text-2xl font-bold text-primary mt-1 block">
              {snapshot.totalAttempts > 0 ? `${snapshot.overallAccuracy}%` : '—'}
            </span>
            <span className="text-[11px] text-muted">
              {snapshot.totalAttempts > 0
                ? `Recent window: ${snapshot.recentAccuracy}%`
                : 'No attempts recorded yet'}
            </span>
          </Card>

          <Card className="p-5 border border-[#E2E8F0]">
            <span className="text-xs text-muted font-medium block">Assessed Mastery Avg</span>
            <span className="text-2xl font-bold text-[#047857] mt-1 block">
              {snapshot.assessedTopicsCount > 0 ? `${snapshot.averageMastery}%` : '—'}
            </span>
            <span className="text-[11px] text-muted">
              {snapshot.assessedTopicsCount} of {snapshot.totalTopicsCount} topics assessed
            </span>
          </Card>

          <Card className="p-5 border border-[#E2E8F0]">
            <span className="text-xs text-muted font-medium block">Active Mistake Patterns</span>
            <span className="text-2xl font-bold text-[#92400E] mt-1 block">
              {snapshot.mistakePatterns.length}
            </span>
            <span className="text-[11px] text-muted">
              {snapshot.mistakePatterns.filter((p) => p.isConfirmedPattern).length} confirmed recurring pattern(s)
            </span>
          </Card>
        </div>

        {/* Honest Empty State when 0 attempts exist */}
        {snapshot.totalAttempts === 0 && (
          <Card className="p-8 border border-dashed border-primary/40 bg-primary/5 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary mx-auto flex items-center justify-center">
              <HelpCircle className="h-6 w-6" />
            </div>
            <div className="space-y-1 max-w-lg mx-auto">
              <h3 className="text-lg font-bold text-dark">
                No Assessment Evidence Recorded Yet
              </h3>
              <p className="text-sm text-muted">
                MindMate does not invent mastery scores before you answer questions. Take a short diagnostic or adaptive quiz to compute your baseline topic mastery and unlock personalized recommendations.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button onClick={() => navigate('/quiz')}>
                Start Diagnostic Baseline Quiz
              </Button>
              <Button
                variant="secondary"
                onClick={() => navigate('/practice/adaptive-quiz?topic=python-variables&type=diagnostic')}
              >
                Practice Python Variables & Scope
              </Button>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Left Col - Topic Mastery Breakdown */}
          <div className="lg:col-span-3 space-y-8">
            <Card className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-lg text-dark">
                    Topic Mastery & Evidence Breakdown
                  </h3>
                  <p className="text-xs text-muted">
                    Recency- and difficulty-weighted mastery with sample-size confidence damping
                  </p>
                </div>
              </div>

              <div className="space-y-6">
                {snapshot.topics.map((topic) => (
                  <div
                    key={topic.topicId}
                    className="p-4 rounded-xl border border-border bg-gray-50/40 dark:bg-slate-800/30 space-y-3"
                  >
                    <div className="flex flex-wrap justify-between items-start gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-dark text-sm">
                            {topic.topicName}
                          </span>
                          <Badge variant="default" className="text-[10px] capitalize">
                            {topic.status}
                          </Badge>
                          <Badge variant="default" className="text-[10px] capitalize">
                            Confidence: {topic.confidenceLevel}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted mt-0.5">
                          {topic.totalAttempts > 0
                            ? `${topic.correctAnswers}/${topic.totalAttempts} correct • Overall ${topic.overallAccuracy}% • Recent ${topic.recentAccuracy}%`
                            : '0 attempts recorded'}
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="text-lg font-bold text-dark">
                          {topic.totalAttempts > 0 ? `${topic.masteryScore}%` : 'Unassessed'}
                        </span>
                        {topic.lastPracticedAt && (
                          <span className="block text-[10px] text-muted flex items-center justify-end gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(topic.lastPracticedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>

                    <ProgressBar
                      value={topic.masteryScore}
                      colorClass={
                        topic.totalAttempts === 0
                          ? 'bg-gray-300'
                          : topic.masteryScore < 45
                            ? 'bg-danger'
                            : topic.masteryScore < 75
                              ? 'bg-warning'
                              : 'bg-success'
                      }
                    />

                    {topic.totalAttempts > 0 && (
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted pt-1">
                        <div className="flex flex-wrap gap-3">
                          <span>
                            Easy:{' '}
                            <strong>
                              {topic.difficultyPerformance.easy.accuracy !== null
                                ? `${topic.difficultyPerformance.easy.accuracy}% (${topic.difficultyPerformance.easy.correct}/${topic.difficultyPerformance.easy.attempts})`
                                : '—'}
                            </strong>
                          </span>
                          <span>
                            Medium:{' '}
                            <strong>
                              {topic.difficultyPerformance.medium.accuracy !== null
                                ? `${topic.difficultyPerformance.medium.accuracy}% (${topic.difficultyPerformance.medium.correct}/${topic.difficultyPerformance.medium.attempts})`
                                : '—'}
                            </strong>
                          </span>
                          <span>
                            Hard:{' '}
                            <strong>
                              {topic.difficultyPerformance.hard.accuracy !== null
                                ? `${topic.difficultyPerformance.hard.accuracy}% (${topic.difficultyPerformance.hard.correct}/${topic.difficultyPerformance.hard.attempts})`
                                : '—'}
                            </strong>
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              navigate(
                                `/practice/adaptive-quiz?topic=${encodeURIComponent(topic.topicId)}&type=${topic.totalAttempts <= 2 ? 'follow_up' : 'adaptive'}`
                              )
                            }
                            className="text-primary font-semibold hover:underline"
                          >
                            {topic.totalAttempts <= 2 ? 'Verify with Follow-Up' : 'Practice'}
                          </button>
                          <span>•</span>
                          <button
                            type="button"
                            onClick={() =>
                              navigate(`/learn?topic=${encodeURIComponent(topic.topicId)}`)
                            }
                            className="text-primary font-semibold hover:underline"
                          >
                            AI Tutor
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>

            {/* Evidence-Backed Recommendations */}
            <Card className="p-6 space-y-4">
              <div>
                <h3 className="font-bold text-lg text-dark flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Evidence-Based Recommendations
                </h3>
                <p className="text-xs text-muted">
                  Generated deterministically from your stored attempts, accuracy trends, and curriculum prerequisites
                </p>
              </div>

              <div className="space-y-3">
                {snapshot.recommendations.slice(0, 5).map((rec) => (
                  <div
                    key={rec.id}
                    className="p-4 rounded-xl border border-border bg-surface flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-dark">
                          {rec.topicName}
                        </span>
                        <Badge variant="default" className="text-[10px] uppercase">
                          {rec.action.replace(/-/g, ' ')}
                        </Badge>
                        <Badge variant="default" className="text-[10px]">
                          Difficulty: {rec.suggestedDifficulty} (Lvl {rec.suggestedDifficultyLevel})
                        </Badge>
                      </div>
                      <p className="text-xs text-dark/90 leading-relaxed">{rec.reason}</p>
                      <p className="text-[11px] text-muted">
                        <strong>Evidence:</strong> {rec.supportingEvidence.detail} •{' '}
                        <strong>Strategy:</strong> {STRATEGY_LABELS[rec.explanationStrategy]}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={() =>
                          navigate(
                            `/practice/adaptive-quiz?topic=${encodeURIComponent(rec.topicId)}&type=${rec.action === 'diagnostic-quiz' ? 'diagnostic' : 'follow_up'}&difficulty=${rec.suggestedDifficultyLevel}`
                          )
                        }
                        className="text-xs"
                      >
                        Start Quiz
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          navigate(
                            `/learn?topic=${encodeURIComponent(rec.topicId)}&strategy=${encodeURIComponent(rec.explanationStrategy)}`
                          )
                        }
                        className="text-xs"
                      >
                        <BookOpen className="h-3.5 w-3.5 mr-1" />
                        Learn
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Right Col - Priority Focus, Mistake Patterns & 7-Day Activity */}
          <div className="lg:col-span-2 space-y-8">
            {weakestAssessed && (
              <Card className="p-6 border border-[#FECACA] bg-[#FEF2F2]">
                <div className="flex items-center gap-2 text-[#B91C1C] font-semibold mb-3">
                  <AlertTriangle className="h-5 w-5" /> Priority Focus Area
                </div>
                <h3 className="text-xl font-bold text-dark mb-1">
                  {weakestAssessed.topicName}
                </h3>
                <p className="text-xs text-muted mb-4 leading-relaxed">
                  Current mastery is {weakestAssessed.masteryScore}% ({weakestAssessed.confidenceLevel} confidence) across {weakestAssessed.totalAttempts} attempt(s) ({weakestAssessed.correctAnswers} correct, {weakestAssessed.incorrectAnswers} incorrect).
                </p>
                <ProgressBar
                  value={weakestAssessed.masteryScore}
                  colorClass="bg-[#B91C1C]"
                  className="mb-5"
                />
                <div className="flex flex-col gap-2">
                  <Button
                    variant="danger"
                    className="w-full"
                    onClick={() =>
                      navigate(
                        `/practice/adaptive-quiz?topic=${encodeURIComponent(weakestAssessed.topicId)}&type=follow_up`
                      )
                    }
                  >
                    Start Adaptive Recovery Quiz
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() =>
                      navigate(
                        `/learn?topic=${encodeURIComponent(weakestAssessed.topicId)}`
                      )
                    }
                  >
                    Open Adaptive AI Explanation
                  </Button>
                </div>
              </Card>
            )}

            {/* Recurring Mistake Analysis Card (Part A4) */}
            <Card className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base text-dark">
                  Recurring Mistake Analysis
                </h3>
                {snapshot.mistakePatterns.length > 0 && (
                  <button
                    type="button"
                    onClick={() => navigate('/practice/mistake-review')}
                    className="text-xs text-primary font-semibold hover:underline"
                  >
                    Review All
                  </button>
                )}
              </div>

              {snapshot.mistakePatterns.length === 0 ? (
                <div className="p-4 rounded-xl bg-[#ECFDF5] border border-[#A7F3D0] text-xs text-[#047857] font-medium flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#047857] shrink-0" />
                  <span>
                    {snapshot.totalAttempts === 0
                      ? 'No incorrect attempts recorded yet.'
                      : 'No recurring mistake patterns detected across your recorded attempts.'}
                  </span>
                </div>
              ) : (
                <div className="space-y-3">
                  {snapshot.mistakePatterns.slice(0, 4).map((pattern) => (
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
                            ? `${pattern.occurrences} misses`
                            : 'Single miss'}
                        </Badge>
                      </div>
                      <p className="text-xs font-medium text-dark/90">
                        {pattern.summary}
                      </p>
                      <p className="text-[11px] text-muted">{pattern.evidenceDetail}</p>
                      <div className="pt-1 flex items-center justify-between text-[11px]">
                        <span className="text-primary font-medium">
                          Suggested: {STRATEGY_LABELS[pattern.suggestedStrategy]}
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
                          Practice Concept →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <ChartCard title="Completed Question Attempts (Last 7 Days)">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={sevenDayData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                  <XAxis
                    dataKey="day"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    dy={10}
                  />
                  <YAxis
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#64748b' }}
                  />
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
                    dataKey="attempts"
                    name="Total Attempts"
                    fill="#6366f1"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={36}
                  />
                  <Bar
                    dataKey="correct"
                    name="Correct"
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={36}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </div>

        {/* Recent Attempt Log Table */}
        {snapshot.recentAttempts.length > 0 && (
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-dark flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Recent Question Attempt Audit Log
              </h3>
              <span className="text-xs text-muted">
                Showing latest {Math.min(10, snapshot.recentAttempts.length)} of{' '}
                {snapshot.totalAttempts} recorded attempts
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border text-muted uppercase">
                    <th className="py-2.5 pr-4">Topic</th>
                    <th className="py-2.5 pr-4">Question</th>
                    <th className="py-2.5 pr-4">Type</th>
                    <th className="py-2.5 pr-4">Difficulty</th>
                    <th className="py-2.5 pr-4">Result</th>
                    <th className="py-2.5 pr-4">Storage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {snapshot.recentAttempts.slice(0, 10).map((att) => (
                    <tr key={att.client_attempt_id || att.id}>
                      <td className="py-2.5 pr-4 font-semibold text-dark">
                        {att.topic_name}
                      </td>
                      <td className="py-2.5 pr-4 text-muted max-w-xs truncate">
                        {att.question_text}
                      </td>
                      <td className="py-2.5 pr-4 capitalize">
                        {(att.attempt_type || 'adaptive').replace('_', ' ')}
                      </td>
                      <td className="py-2.5 pr-4">Lvl {att.difficulty}/5</td>
                      <td className="py-2.5 pr-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-semibold border ${
                            att.is_correct
                              ? 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]'
                              : 'bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]'
                          }`}
                        >
                          {att.is_correct ? 'Correct' : 'Incorrect'}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 capitalize text-muted">
                        {att.persistence_source === 'cloud' ? 'Cloud + Local' : 'Local'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
