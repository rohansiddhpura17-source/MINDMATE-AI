import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { ProgressBar } from '../components/ui/ProgressBar';
import {
  Brain,
  Sparkles,
  Target,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  RefreshCw,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  HelpCircle,
  ShieldCheck,
  Zap,
  BookOpen,
  Settings,
  Layers,
  Database,
  Calendar,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import {
  learnerApi,
  LearnerTwinProfile,
  TopicTwinDetail,
  TwinSynthesisResult,
} from '../services/api/learnerApi';
import { offlineLearner } from '../services/storage/offlineLearner';

export default function LearningTwin() {
  const navigate = useNavigate();
  const { user, isOnline, showToast } = useAppContext();

  const [profile, setProfile] = useState<LearnerTwinProfile | null>(null);
  const [synthesis, setSynthesis] = useState<TwinSynthesisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [isOfflineCached, setIsOfflineCached] = useState(false);
  const [activeTab, setActiveTab] = useState<'topics' | 'strengths' | 'gaps' | 'calibration'>('topics');
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Settings form state
  const [preferredStyle, setPreferredStyle] = useState('visual');
  const [sessionLength, setSessionLength] = useState(15);

  const loadTwin = async () => {
    setLoading(true);

    // 1. Load from IndexedDB cache first for instant render
    if (user?.id) {
      try {
        const cached = await offlineLearner.getCachedTwinProfile(user.id);
        if (cached) {
          setProfile(cached);
          setIsOfflineCached(true);
        }
      } catch (err) {
        console.warn('[Cached Twin Read Error]', err);
      }
    }

    // 2. Fetch fresh live profile from backend if online
    if (isOnline) {
      try {
        const res = await learnerApi.getLearnerTwin();
        if (res && res.success) {
          setProfile(res.profile);
          setIsOfflineCached(false);
          if (user?.id) {
            await offlineLearner.cacheTwinProfile(user.id, res.profile);
          }
        }
      } catch (err) {
        console.warn('[Fetch Live Twin Error]', err);
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    loadTwin();
  }, [user?.id, isOnline]);

  const handleSynthesize = async () => {
    setIsSynthesizing(true);
    try {
      const res = await learnerApi.synthesizeTwin(isOnline);
      if (res && res.success) {
        setSynthesis(res.synthesis);
        showToast('Cognitive coaching analysis updated.', 'success');
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to synthesize profile', 'error');
    } finally {
      setIsSynthesizing(false);
    }
  };

  const getConfidenceBadge = (level: string) => {
    switch (level) {
      case 'HIGH':
        return <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">High Confidence</span>;
      case 'MEDIUM':
        return <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-blue-100 text-blue-800 border border-blue-200">Medium Confidence</span>;
      case 'LOW':
        return <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-800 border border-amber-200">Preliminary Estimate</span>;
      default:
        return <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-gray-100 text-gray-700 border border-gray-200">Calibrating</span>;
    }
  };

  const getStatusBadge = (status: string, isAssessed: boolean) => {
    if (!isAssessed) {
      return <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-gray-100 text-gray-600 border border-gray-200">Not Yet Assessed</span>;
    }
    switch (status) {
      case 'MASTERED':
        return <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-purple-100 text-purple-800 border border-purple-200">Mastered</span>;
      case 'PROFICIENT':
        return <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">Proficient</span>;
      case 'DEVELOPING':
        return <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-blue-100 text-blue-800 border border-blue-200">Developing</span>;
      case 'NEEDS_PRACTICE':
        return <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-800 border border-amber-200">Needs Practice</span>;
      default:
        return <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">Calibrating</span>;
    }
  };

  const getTrendIcon = (trend: TopicTwinDetail['trend']) => {
    switch (trend.direction) {
      case 'IMPROVING':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
            <TrendingUp className="h-3 w-3" /> +{trend.deltaScore}% Trend
          </span>
        );
      case 'DECLINING':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
            <TrendingDown className="h-3 w-3" /> {trend.deltaScore}% Trend
          </span>
        );
      case 'STABLE':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 bg-gray-50 px-2 py-0.5 rounded-full">
            <Minus className="h-3 w-3" /> Stable
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400">
            <HelpCircle className="h-3 w-3" /> Needs data
          </span>
        );
    }
  };

  return (
    <AppShell pageTitle="Learning Twin" pageSubtitle="Your evidence-based cognitive model & AI synthesis">
      <div className="max-w-6xl space-y-8 pb-12">
        {/* TOP COGNITIVE BANNER */}
        <Card className="p-6 bg-gradient-to-br from-indigo-50/60 via-white to-purple-50/40 border-primary/20 shadow-sm relative overflow-hidden">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/25 blur-lg rounded-full" />
                <div className="h-16 w-16 bg-white border-2 border-primary text-primary rounded-2xl flex items-center justify-center relative z-10 shadow-md">
                  <Brain className="h-9 w-9 stroke-[2.2]" />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-dark">{profile?.learnerName || user?.name || 'Learner'}'s Cognitive Twin</h2>
                  {isOfflineCached && (
                    <span className="text-[10px] bg-amber-100 text-amber-800 font-semibold px-2 py-0.5 rounded-full border border-amber-200">
                      Offline Cached
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted mt-0.5">
                  Target Goal: <span className="font-semibold text-dark">{profile?.learningGoal || 'Master Full-Stack & Python Development'}</span>
                  {profile?.overview.lastCalibratedAt && (
                    <span> • Calibrated {new Date(profile.overview.lastCalibratedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={loadTwin} disabled={loading} className="text-xs">
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh Model
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setIsSettingsModalOpen(true)} className="text-xs text-muted hover:text-dark">
                <Settings className="h-3.5 w-3.5 mr-1.5" /> Preferences
              </Button>
            </div>
          </div>

          {/* Core Overview Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-6 border-t border-indigo-100/60">
            <div className="p-3 bg-white/80 rounded-xl border border-gray-100 shadow-2xs">
              <p className="text-[11px] font-medium text-muted">Overall Mastery</p>
              <p className="text-xl font-bold text-primary mt-0.5">{profile?.overview.overallMasteryPct ?? 0}%</p>
              <p className="text-[10px] text-muted">Bayesian posterior</p>
            </div>

            <div className="p-3 bg-white/80 rounded-xl border border-gray-100 shadow-2xs">
              <p className="text-[11px] font-medium text-muted">Empirical Accuracy</p>
              <p className="text-xl font-bold text-emerald-600 mt-0.5">{profile?.overview.overallAccuracyPct ?? 0}%</p>
              <p className="text-[10px] text-muted">{profile?.overview.totalCorrectAnswers ?? 0} / {profile?.overview.totalQuestionsAnswered ?? 0} correct</p>
            </div>

            <div className="p-3 bg-white/80 rounded-xl border border-gray-100 shadow-2xs">
              <p className="text-[11px] font-medium text-muted">Assessed Topics</p>
              <p className="text-xl font-bold text-dark mt-0.5">{profile?.overview.assessedTopicsCount ?? 0} / {profile?.overview.totalActiveTopics ?? 0}</p>
              <p className="text-[10px] text-muted">{profile?.overview.unassessedTopicsCount ?? 0} unassessed</p>
            </div>

            <div className="p-3 bg-white/80 rounded-xl border border-gray-100 shadow-2xs">
              <p className="text-[11px] font-medium text-muted">Strong Concepts</p>
              <p className="text-xl font-bold text-purple-600 mt-0.5">{profile?.overview.demonstratedStrengthsCount ?? 0}</p>
              <p className="text-[10px] text-muted">≥75% mastery</p>
            </div>

            <div className="p-3 bg-white/80 rounded-xl border border-gray-100 shadow-2xs">
              <p className="text-[11px] font-medium text-muted">Knowledge Gaps</p>
              <p className="text-xl font-bold text-amber-600 mt-0.5">{profile?.overview.knowledgeGapsCount ?? 0}</p>
              <p className="text-[10px] text-muted">&lt;50% mastery (≥3 att)</p>
            </div>

            <div className="p-3 bg-white/80 rounded-xl border border-gray-100 shadow-2xs">
              <p className="text-[11px] font-medium text-muted">Overdue Reviews</p>
              <p className={`text-xl font-bold mt-0.5 ${(profile?.overview.overdueReviewsCount ?? 0) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {profile?.overview.overdueReviewsCount ?? 0}
              </p>
              <p className="text-[10px] text-muted">SM-2 interval due</p>
            </div>
          </div>
        </Card>

        {/* AI COACH SYNTHESIS CARD */}
        <Card className="p-6 border-indigo-100 bg-white shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center flex-shrink-0">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base text-dark">AI Educational Science Coach</h3>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                    {synthesis?.source === 'AI_CLOUD' ? 'Gemini 2.5 Flash' : 'Deterministic Evidence Engine'}
                  </span>
                </div>
                <p className="text-xs text-muted">Grounded in your verified empirical attempts and spaced retention state</p>
              </div>
            </div>

            <Button
              size="sm"
              variant="secondary"
              onClick={handleSynthesize}
              disabled={isSynthesizing}
              className="text-xs whitespace-nowrap"
            >
              {isSynthesizing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Synthesizing...
                </>
              ) : (
                <>
                  <Zap className="h-3.5 w-3.5 mr-1.5 text-primary" /> Regenerate Analysis
                </>
              )}
            </Button>
          </div>

          <div className="space-y-3.5 text-xs text-dark/90 leading-relaxed bg-gray-50/70 p-4 rounded-xl border border-gray-200/60">
            <p>
              <strong className="text-dark font-semibold">Executive Assessment: </strong>
              {synthesis?.summary || profile?.deterministicSummary || 'Calibrating model...'}
            </p>

            {synthesis && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-gray-200/60 mt-3">
                <div className="p-3 bg-white rounded-lg border border-gray-100">
                  <span className="font-semibold text-emerald-700 text-[11px] block mb-1">Key Strengths</span>
                  <p className="text-muted text-[11px]">{synthesis.strengthsSummary}</p>
                </div>
                <div className="p-3 bg-white rounded-lg border border-gray-100">
                  <span className="font-semibold text-amber-700 text-[11px] block mb-1">Growth Areas</span>
                  <p className="text-muted text-[11px]">{synthesis.gapsSummary}</p>
                </div>
                <div className="p-3 bg-white rounded-lg border border-gray-100">
                  <span className="font-semibold text-indigo-700 text-[11px] block mb-1">Recommended Next Step</span>
                  <p className="text-muted text-[11px]">{synthesis.recommendedFocus}</p>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* VIEW FILTER TABS */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-3">
          <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('topics')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'topics' ? 'bg-white text-primary shadow-sm' : 'text-muted hover:text-dark'
              }`}
            >
              All Topics ({profile?.topics.length ?? 0})
            </button>
            <button
              onClick={() => setActiveTab('strengths')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'strengths' ? 'bg-white text-primary shadow-sm' : 'text-muted hover:text-dark'
              }`}
            >
              Strengths ({profile?.strengths.length ?? 0})
            </button>
            <button
              onClick={() => setActiveTab('gaps')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'gaps' ? 'bg-white text-primary shadow-sm' : 'text-muted hover:text-dark'
              }`}
            >
              Knowledge Gaps ({profile?.knowledgeGaps.length ?? 0})
            </button>
            <button
              onClick={() => setActiveTab('calibration')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'calibration' ? 'bg-white text-primary shadow-sm' : 'text-muted hover:text-dark'
              }`}
            >
              Calibration &amp; Unassessed ({((profile?.calibratingTopics.length ?? 0) + (profile?.unassessedTopics.length ?? 0))})
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span>Separating measured facts from Bayesian estimates</span>
          </div>
        </div>

        {/* TOPICS GRID */}
        {loading ? (
          <div className="p-16 text-center text-muted flex flex-col items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
            <p>Constructing cognitive twin from live learning records...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {(activeTab === 'topics'
              ? profile?.topics || []
              : activeTab === 'strengths'
              ? profile?.strengths || []
              : activeTab === 'gaps'
              ? profile?.knowledgeGaps || []
              : [...(profile?.calibratingTopics || []), ...(profile?.unassessedTopics || [])]
            ).map((topic) => (
              <Card
                key={topic.topicId}
                className="p-5 flex flex-col justify-between border-border hover:border-primary/40 transition-all shadow-2xs"
              >
                <div>
                  {/* Topic Title & Badges */}
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <h4 className="font-bold text-dark text-base">{topic.topicName}</h4>
                      <p className="text-[11px] text-muted">Topic ID: {topic.topicId}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {getStatusBadge(topic.modelEstimates.status, topic.isAssessed)}
                      {topic.isAssessed && getConfidenceBadge(topic.modelEstimates.confidenceLevel)}
                    </div>
                  </div>

                  {/* Bayesian Mastery Score & Progress Bar */}
                  <div className="my-3 space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted font-medium">Estimated Mastery (Beta-Binomial)</span>
                      <span className="font-bold text-dark">
                        {topic.isAssessed ? `${topic.modelEstimates.masteryScore}%` : 'Not Assessed (Prior 50%)'}
                      </span>
                    </div>
                    <ProgressBar
                      value={topic.isAssessed ? topic.modelEstimates.masteryScore : 50}
                      className="h-2"
                    />
                  </div>

                  {/* Measured Facts vs Model Estimates Box */}
                  <div className="grid grid-cols-2 gap-2 p-3 bg-gray-50/70 rounded-xl text-xs my-3 border border-gray-100">
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted block mb-0.5">
                        Measured Facts
                      </span>
                      <p className="text-dark font-medium">
                        {topic.measuredObservations.correctCount} / {topic.measuredObservations.totalAttempts} correct
                        {topic.measuredObservations.totalAttempts > 0 && ` (${topic.measuredObservations.accuracyPct}%)`}
                      </p>
                      <p className="text-[11px] text-muted mt-0.5">
                        {topic.measuredObservations.lastPracticed
                          ? `Last: ${new Date(topic.measuredObservations.lastPracticed).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                          : 'No attempts'}
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted block mb-0.5">
                        Memory Retention
                      </span>
                      <p className="text-dark font-medium">
                        {topic.modelEstimates.spacedIntervalDays
                          ? `Interval: ${topic.modelEstimates.spacedIntervalDays}d (EF ${topic.modelEstimates.spacedEaseFactor})`
                          : 'No review scheduled'}
                      </p>
                      {topic.modelEstimates.isSpacedRepetitionDue && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded mt-0.5">
                          <AlertTriangle className="h-3 w-3" /> Overdue by {topic.modelEstimates.daysOverdue}d
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Trend Indicator */}
                  <div className="flex items-center justify-between text-xs py-1">
                    <span className="text-muted">Recent Performance Trend:</span>
                    {getTrendIcon(topic.trend)}
                  </div>

                  {/* Pedagogical Rationale */}
                  <div className="text-[11px] text-muted italic bg-indigo-50/40 p-2.5 rounded-lg border border-indigo-100/50 my-2">
                    {topic.recommendedAction.rationale}
                  </div>
                </div>

                {/* Action Button */}
                <div className="pt-3 border-t border-gray-100 mt-2 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted">
                    {topic.materials.length > 0 ? `${topic.materials.length} linked document${topic.materials.length === 1 ? '' : 's'}` : 'Core curriculum'}
                  </span>
                  <Button
                    size="sm"
                    onClick={() => navigate(topic.recommendedAction.actionUrl)}
                    className="text-xs"
                  >
                    {topic.recommendedAction.title.split(':')[0]} <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* SETTINGS / PREFERENCES MODAL */}
        <Modal
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          title="Cognitive Model Preferences"
        >
          <div className="space-y-5 text-sm">
            <div>
              <label className="block text-xs font-semibold text-dark mb-1.5">Primary Learning Style</label>
              <select
                value={preferredStyle}
                onChange={(e) => setPreferredStyle(e.target.value)}
                className="w-full rounded-btn border border-border p-2 text-xs focus:ring-2 focus:ring-primary outline-none"
              >
                <option value="visual">Visual &amp; Conceptual (Diagrams &amp; Structural overviews)</option>
                <option value="interactive">Interactive / Code-First (Practice problems &amp; drills)</option>
                <option value="theory">Theory-First (Formal definitions &amp; proofs)</option>
                <option value="examples">Example-Driven (Real-world walkthroughs)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-dark mb-1.5">Preferred Session Duration</label>
              <select
                value={sessionLength}
                onChange={(e) => setSessionLength(Number(e.target.value))}
                className="w-full rounded-btn border border-border p-2 text-xs focus:ring-2 focus:ring-primary outline-none"
              >
                <option value={10}>10 minutes (Micro-learning)</option>
                <option value={15}>15 minutes (Standard pomodoro)</option>
                <option value={20}>20 minutes (Focused deep dive)</option>
                <option value={30}>30 minutes (Comprehensive session)</option>
              </select>
            </div>

            <div className="pt-4 border-t border-gray-100 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setIsSettingsModalOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setIsSettingsModalOpen(false);
                  showToast('Cognitive preferences updated.', 'success');
                }}
              >
                Save Preferences
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </AppShell>
  );
}
