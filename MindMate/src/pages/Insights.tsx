import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import {
  AlertCircle,
  TrendingDown,
  TrendingUp,
  Trophy,
  Zap,
  Clock,
  ArrowRight,
  Calendar,
  CheckCircle2,
  RefreshCw,
  Loader2,
  ShieldAlert,
  Info,
  BookOpen,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import {
  learnerApi,
  LearnerInsight,
  InsightsResponse,
} from '../services/api/learnerApi';
import { offlineLearner } from '../services/storage/offlineLearner';

export default function Insights() {
  const navigate = useNavigate();
  const { user, isOnline, showToast } = useAppContext();

  const [insightsData, setInsightsData] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOfflineCached, setIsOfflineCached] = useState(false);
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'URGENT' | 'GAPS' | 'GROWTH' | 'CALIBRATION'>('ALL');

  const loadInsights = async () => {
    setLoading(true);

    // 1. IndexedDB cache for instant offline render
    if (user?.id) {
      try {
        const cached = await offlineLearner.getCachedInsights(user.id);
        if (cached) {
          setInsightsData(cached);
          setIsOfflineCached(true);
        }
      } catch (err) {
        console.warn('[Cached Insights Error]', err);
      }
    }

    // 2. Fresh live insights from backend if online
    if (isOnline) {
      try {
        const res = await learnerApi.getLearnerInsights();
        if (res && res.success) {
          setInsightsData(res);
          setIsOfflineCached(false);
          if (user?.id) {
            await offlineLearner.cacheInsights(user.id, res);
          }
        }
      } catch (err) {
        console.warn('[Fetch Insights Error]', err);
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    loadInsights();
  }, [user?.id, isOnline]);

  const handleScheduleTask = async (insightId: string) => {
    setSchedulingId(insightId);
    try {
      const res = await learnerApi.scheduleInsightTask(insightId);
      if (res && res.success) {
        showToast(res.message || 'Activity scheduled in study planner.', 'success');
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to schedule activity', 'error');
    } finally {
      setSchedulingId(null);
    }
  };

  const getCertaintyBadge = (level: string) => {
    switch (level) {
      case 'HIGH_CERTAINTY':
        return <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">High Certainty</span>;
      case 'MODERATE':
        return <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-blue-100 text-blue-800 border border-blue-200">Moderate Certainty</span>;
      case 'PRELIMINARY_EVIDENCE':
        return <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-800 border border-amber-200">Preliminary Evidence</span>;
      default:
        return <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-gray-100 text-gray-700 border border-gray-200">Insufficient Data</span>;
    }
  };

  const getPatternIcon = (pattern: string) => {
    switch (pattern) {
      case 'OVERDUE_REVIEW':
        return <Clock className="h-5 w-5 text-red-600" />;
      case 'REPEATED_MISTAKES':
        return <AlertCircle className="h-5 w-5 text-amber-600" />;
      case 'KNOWLEDGE_GAP':
        return <ShieldAlert className="h-5 w-5 text-amber-600" />;
      case 'SUSTAINED_IMPROVEMENT':
        return <TrendingUp className="h-5 w-5 text-emerald-600" />;
      case 'STRONG_FOUNDATION':
        return <Trophy className="h-5 w-5 text-purple-600" />;
      case 'PERFORMANCE_DECLINE':
        return <TrendingDown className="h-5 w-5 text-red-500" />;
      case 'RECENCY_DECAY':
        return <Clock className="h-5 w-5 text-gray-500" />;
      default:
        return <Info className="h-5 w-5 text-indigo-600" />;
    }
  };

  const allInsights = insightsData?.insights || [];
  const filteredInsights = allInsights.filter((insight) => {
    if (activeFilter === 'URGENT') return insight.pattern === 'OVERDUE_REVIEW' || insight.pattern === 'REPEATED_MISTAKES';
    if (activeFilter === 'GAPS') return insight.pattern === 'KNOWLEDGE_GAP';
    if (activeFilter === 'GROWTH') return insight.pattern === 'SUSTAINED_IMPROVEMENT' || insight.pattern === 'STRONG_FOUNDATION';
    if (activeFilter === 'CALIBRATION') return insight.pattern === 'CALIBRATION_NEEDED' || insight.pattern === 'RECENCY_DECAY';
    return true;
  });

  return (
    <AppShell
      pageTitle="Insights"
      pageSubtitle="Evidence-based observations mined from your actual learning records"
    >
      <div className="max-w-5xl space-y-6 pb-12">
        {/* HEADER & METRIC SUMMARY */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-lg text-dark">Pedagogical Insights</h3>
              {isOfflineCached && (
                <span className="text-[10px] font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200">
                  Offline Cached
                </span>
              )}
            </div>
            <p className="text-xs text-muted">
              {allInsights.length} pattern{allInsights.length === 1 ? '' : 's'} identified across your study attempts • Deterministic empirical analysis
            </p>
          </div>

          <Button variant="secondary" size="sm" onClick={loadInsights} disabled={loading} className="text-xs">
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh Insights
          </Button>
        </div>

        {/* CATEGORY FILTER TABS */}
        <div className="flex flex-wrap items-center gap-1.5 bg-gray-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeFilter === 'ALL' ? 'bg-white text-primary shadow-sm' : 'text-muted hover:text-dark'
            }`}
          >
            All ({allInsights.length})
          </button>
          <button
            onClick={() => setActiveFilter('URGENT')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeFilter === 'URGENT' ? 'bg-white text-primary shadow-sm' : 'text-muted hover:text-dark'
            }`}
          >
            Urgent Reviews ({insightsData?.metrics.urgentCount ?? 0})
          </button>
          <button
            onClick={() => setActiveFilter('GAPS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeFilter === 'GAPS' ? 'bg-white text-primary shadow-sm' : 'text-muted hover:text-dark'
            }`}
          >
            Knowledge Gaps ({insightsData?.metrics.gapsCount ?? 0})
          </button>
          <button
            onClick={() => setActiveFilter('GROWTH')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeFilter === 'GROWTH' ? 'bg-white text-primary shadow-sm' : 'text-muted hover:text-dark'
            }`}
          >
            Growth &amp; Strengths ({insightsData?.metrics.improvementsCount ?? 0})
          </button>
          <button
            onClick={() => setActiveFilter('CALIBRATION')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeFilter === 'CALIBRATION' ? 'bg-white text-primary shadow-sm' : 'text-muted hover:text-dark'
            }`}
          >
            Calibration ({insightsData?.metrics.calibrationsCount ?? 0})
          </button>
        </div>

        {/* INSIGHT CARDS LIST */}
        {loading ? (
          <div className="p-16 text-center text-muted flex flex-col items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
            <p>Mining learning patterns from your attempt history...</p>
          </div>
        ) : filteredInsights.length === 0 ? (
          <Card className="p-12 text-center text-muted">
            <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-3" />
            <h4 className="font-bold text-dark text-base mb-1">
              {allInsights.length === 0 ? 'No Learning Patterns Detected' : 'No Insights in this Category'}
            </h4>
            <p className="text-xs max-w-md mx-auto mb-5 leading-relaxed">
              {insightsData?.emptyStateReason ||
                'Complete additional practice sessions or diagnostic quizzes to generate statistically grounded insights.'}
            </p>
            <Button size="sm" onClick={() => navigate('/practice')}>
              Start Diagnostic Quiz <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          </Card>
        ) : (
          <div className="grid gap-5">
            {filteredInsights.map((insight) => (
              <Card
                key={insight.id}
                className="p-5 border-border hover:border-primary/40 transition-all shadow-2xs space-y-4"
              >
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-100 flex-shrink-0 mt-0.5">
                      {getPatternIcon(insight.pattern)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                          {insight.topicName}
                        </span>
                        {getCertaintyBadge(insight.evidence.evidenceLevel)}
                      </div>
                      <h4 className="font-bold text-dark text-base mt-1">{insight.title}</h4>
                      <p className="text-xs text-dark/85 mt-1 leading-snug">{insight.description}</p>
                    </div>
                  </div>
                </div>

                {/* Evidence Metrics Box */}
                <div className="bg-gray-50/80 p-3.5 rounded-xl border border-gray-100/90 text-xs space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-dark text-[11px]">Empirical Evidence:</span>
                    <span className="text-muted text-[11px]">{insight.evidence.timeframe}</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2 bg-white rounded-lg border border-gray-100">
                      <span className="text-[10px] text-muted block">Attempts</span>
                      <span className="font-bold text-dark">{insight.evidence.attemptCount}</span>
                    </div>

                    <div className="p-2 bg-white rounded-lg border border-gray-100">
                      <span className="text-[10px] text-muted block">Accuracy</span>
                      <span className="font-bold text-dark">{insight.evidence.accuracyPct}%</span>
                    </div>

                    {insight.evidence.scoreDelta !== undefined && (
                      <div className="p-2 bg-white rounded-lg border border-gray-100">
                        <span className="text-[10px] text-muted block">Observed Delta</span>
                        <span
                          className={`font-bold ${
                            insight.evidence.scoreDelta >= 0 ? 'text-emerald-600' : 'text-red-600'
                          }`}
                        >
                          {insight.evidence.scoreDelta >= 0 ? '+' : ''}
                          {insight.evidence.scoreDelta}%
                        </span>
                      </div>
                    )}

                    {insight.evidence.daysOverdue !== undefined && (
                      <div className="p-2 bg-white rounded-lg border border-gray-100">
                        <span className="text-[10px] text-muted block">Days Overdue</span>
                        <span className="font-bold text-red-600">{insight.evidence.daysOverdue} days</span>
                      </div>
                    )}

                    {insight.evidence.daysInactive !== undefined && (
                      <div className="p-2 bg-white rounded-lg border border-gray-100">
                        <span className="text-[10px] text-muted block">Days Inactive</span>
                        <span className="font-bold text-amber-600">{insight.evidence.daysInactive} days</span>
                      </div>
                    )}
                  </div>

                  <p className="text-[11px] text-muted italic pt-1">
                    {insight.evidence.sampleSufficiencyDescription}
                  </p>
                </div>

                {/* Pedagogical Rationale */}
                <div className="text-[11px] text-muted bg-indigo-50/40 p-3 rounded-lg border border-indigo-100/50">
                  <strong className="text-dark font-medium">Cognitive Science Rationale: </strong>
                  {insight.pedagogicalRationale}
                </div>

                {/* Actions Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-gray-100">
                  <span className="text-xs text-muted">
                    Recommendation: <strong className="text-dark">{insight.recommendation}</strong>
                  </span>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleScheduleTask(insight.id)}
                      disabled={schedulingId === insight.id}
                      className="text-xs"
                    >
                      {schedulingId === insight.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                      ) : (
                        <Calendar className="h-3.5 w-3.5 mr-1 text-primary" />
                      )}
                      Add to Study Plan
                    </Button>

                    <Button
                      size="sm"
                      onClick={() => navigate(insight.actionUrl)}
                      className="text-xs"
                    >
                      {insight.actionLabel} <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
