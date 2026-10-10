import React, { useState, useEffect } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ProgressBar } from '../components/ui/ProgressBar';
import { PlannerDay } from '../components/shared/PlannerDay';
import { TaskCard } from '../components/shared/TaskCard';
import {
  Target,
  Sparkles,
  RefreshCw,
  Settings,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Brain,
  Sliders,
  X,
  Loader2,
  CloudOff,
  TrendingUp,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import {
  learnerApi,
  FullStudyPlan,
  StudyTaskItem,
  DayPlanData,
  PlannerSettingsInput,
} from '../services/api/learnerApi';
import { offlineLearner } from '../services/storage/offlineLearner';

export default function Planner() {
  const navigate = useNavigate();
  const { user, isOnline, showToast, triggerSync } = useAppContext();

  const [plan, setPlan] = useState<FullStudyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<'today' | 'weekly' | 'priorities'>('today');

  // Settings Modal State
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsForm, setSettingsForm] = useState<PlannerSettingsInput>({
    dailyGoalMinutes: 30,
    preferredSessionMinutes: 15,
    targetDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    targetGoalName: 'Master Python Fundamentals',
    targetGoalDate: null,
    reviewStrategy: 'BALANCED',
  });

  // Reschedule Modal State
  const [reschedulingTask, setReschedulingTask] = useState<StudyTaskItem | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>('');

  const loadPlan = async () => {
    // 1. Load from IndexedDB offline storage first for immediate responsiveness
    if (user?.id) {
      try {
        const cached = await offlineLearner.getCachedStudyPlan(user.id);
        if (cached) {
          setPlan(cached);
          setSettingsForm({
            dailyGoalMinutes: cached.settings.dailyGoalMinutes,
            preferredSessionMinutes: cached.settings.preferredSessionMinutes,
            targetDays: cached.settings.targetDays,
            targetGoalName: cached.settings.targetGoalName,
            targetGoalDate: cached.settings.targetGoalDate,
            reviewStrategy: cached.settings.reviewStrategy as any,
          });
        }
      } catch (err) {
        console.warn('[Cached Plan Load Error]', err);
      }
    }

    // 2. Fetch fresh live plan from backend if online
    if (isOnline) {
      try {
        const fresh = await learnerApi.getStudyPlan();
        if (fresh && fresh.success) {
          setPlan(fresh);
          setSettingsForm({
            dailyGoalMinutes: fresh.settings.dailyGoalMinutes,
            preferredSessionMinutes: fresh.settings.preferredSessionMinutes,
            targetDays: fresh.settings.targetDays,
            targetGoalName: fresh.settings.targetGoalName,
            targetGoalDate: fresh.settings.targetGoalDate,
            reviewStrategy: fresh.settings.reviewStrategy as any,
          });
          if (user?.id) {
            await offlineLearner.cacheStudyPlan(user.id, fresh);
          }
        }
      } catch (err) {
        console.warn('[Fetch Study Plan Error]', err);
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    loadPlan();
  }, [user?.id, isOnline]);

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      const refreshed = await learnerApi.regenerateStudyPlan();
      setPlan(refreshed);
      if (user?.id) {
        await offlineLearner.cacheStudyPlan(user.id, refreshed);
      }
      showToast('Plan regenerated using your latest mastery and review schedule.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to regenerate plan', 'error');
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleToggleDone = async (taskId?: string) => {
    if (!taskId) return;

    const allTasks = plan?.days.flatMap((d) => d.tasks) || [];
    const currentTask = allTasks.find((t) => t.id === taskId);
    const nextStatus = currentTask ? !currentTask.isCompleted : true;

    if (isOnline) {
      try {
        const res = await learnerApi.completeStudyTask(taskId, nextStatus);
        if (res.replanResult) {
          setPlan(res.replanResult);
          if (user?.id) {
            await offlineLearner.cacheStudyPlan(user.id, res.replanResult);
          }
        } else {
          await loadPlan();
        }
        showToast(nextStatus ? 'Activity marked complete!' : 'Activity marked incomplete', 'success');
      } catch (err: any) {
        showToast(err?.message || 'Failed to complete task', 'error');
      }
    } else if (user?.id) {
      await offlineLearner.completeStudyTaskOffline(user.id, taskId);
      showToast('Completed offline. Will synchronize when reconnected.', 'info');
      // Update local state
      if (plan) {
        const updatedDays = plan.days.map((d) => ({
          ...d,
          tasks: d.tasks.map((t) => (t.id === taskId ? { ...t, isCompleted: nextStatus } : t)),
        }));
        setPlan({ ...plan, days: updatedDays });
      }
    }
  };

  const handleStartTask = (actionUrl?: string) => {
    if (actionUrl) {
      navigate(actionUrl);
    } else {
      navigate('/practice/quiz');
    }
  };

  const handleOpenReschedule = (taskId?: string) => {
    if (!taskId || !plan) return;
    const allTasks = plan.days.flatMap((d) => d.tasks);
    const found = allTasks.find((t) => t.id === taskId);
    if (found) {
      setReschedulingTask(found);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setRescheduleDate(tomorrow.toISOString().split('T')[0]);
    }
  };

  const handleConfirmReschedule = async () => {
    if (!reschedulingTask || !rescheduleDate) return;

    try {
      await learnerApi.rescheduleStudyTask(reschedulingTask.id, rescheduleDate);
      showToast(`Activity rescheduled to ${rescheduleDate}`, 'success');
      setReschedulingTask(null);
      await loadPlan();
    } catch (err: any) {
      showToast(err?.message || 'Failed to reschedule task', 'error');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updatedPlan = await learnerApi.updatePlannerSettings(settingsForm);
      setPlan(updatedPlan);
      if (user?.id) {
        await offlineLearner.cacheStudyPlan(user.id, updatedPlan);
      }
      setShowSettingsModal(false);
      showToast('Planner settings updated and schedule refreshed.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to update planner settings', 'error');
    }
  };

  const todayData: DayPlanData | undefined = plan?.days.find((d) => d.isToday) || plan?.days[0];
  const todayTasks: StudyTaskItem[] = todayData?.tasks || [];

  const todayCompletedMin = plan?.metrics.todayCompletedMinutes ?? 0;
  const todayTotalMin = Math.max(plan?.settings.dailyGoalMinutes ?? 30, plan?.metrics.todayTotalMinutes ?? 30);
  const dailyProgressPercent = Math.min(100, Math.round((todayCompletedMin / todayTotalMin) * 100));

  return (
    <AppShell pageTitle="Personalized Study Planner" pageSubtitle="Evidence-based scheduling & spaced repetition">
      <div className="max-w-6xl space-y-8">
        {/* Offline Warning Banner */}
        {!isOnline && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-center justify-between text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <CloudOff className="h-4 w-4 text-amber-700 flex-shrink-0" />
              <span>
                <strong>Offline Planner:</strong> Viewing cached schedule. Eligible quizzes and reviews can be completed locally and will synchronize automatically once reconnected.
              </span>
            </div>
          </div>
        )}

        {/* Goal & Daily Progress Card */}
        <Card className="p-6 bg-gradient-to-r from-surface to-indigo-50/40">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-2 text-primary font-semibold mb-1 text-xs uppercase tracking-wider">
                <Target className="h-4 w-4" /> Current Learning Objective
              </div>
              <h2 className="text-2xl font-bold text-dark mb-1">
                {plan?.settings.targetGoalName || 'Master Python Fundamentals'}
              </h2>
              <p className="text-muted text-xs">
                {plan?.settings.targetGoalDate
                  ? `Target Deadline: ${new Date(plan.settings.targetGoalDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                  : 'Balanced pacing towards full topic proficiency.'}
                {plan?.lastUpdated && ` • Plan calibrated ${new Date(plan.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
              </p>
            </div>

            <div className="w-full md:w-1/3 space-y-2">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-dark">Today's Progress</span>
                <span className="text-primary font-bold">
                  {todayCompletedMin} / {plan?.settings.dailyGoalMinutes || 30} mins ({dailyProgressPercent}%)
                </span>
              </div>
              <ProgressBar value={dailyProgressPercent} className="h-2.5" />
            </div>
          </div>
        </Card>

        {/* Navigation & Controls Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-4">
          {/* View Tabs */}
          <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('today')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'today' ? 'bg-white text-primary shadow-sm' : 'text-muted hover:text-dark'
              }`}
            >
              Today's Focus ({todayTasks.length})
            </button>
            <button
              onClick={() => setActiveTab('weekly')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'weekly' ? 'bg-white text-primary shadow-sm' : 'text-muted hover:text-dark'
              }`}
            >
              Weekly Schedule (7 Days)
            </button>
            <button
              onClick={() => setActiveTab('priorities')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'priorities' ? 'bg-white text-primary shadow-sm' : 'text-muted hover:text-dark'
              }`}
            >
              Prioritization Rationale
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={isRegenerating || !isOnline}
              onClick={handleRegenerate}
              className="text-xs"
            >
              {isRegenerating ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              Regenerate Plan
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSettingsModal(true)}
              className="text-xs text-muted hover:text-dark"
            >
              <Settings className="h-4 w-4 mr-1.5" /> Settings
            </Button>
          </div>
        </div>

        {/* TAB 1: Today's Focus */}
        {activeTab === 'today' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-dark">Today's Priority Agenda</h3>
                <p className="text-xs text-muted">
                  Activities tailored to your retention curve and current Bayesian knowledge gaps.
                </p>
              </div>
              {plan?.metrics.overdueReviewsCount ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                  {plan.metrics.overdueReviewsCount} Spaced Review{plan.metrics.overdueReviewsCount === 1 ? '' : 's'} Due
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-200">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                  Spaced Repetition on Schedule
                </span>
              )}
            </div>

            {loading ? (
              <div className="p-12 text-center text-muted flex flex-col items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
                <p>Generating personalized learning schedule...</p>
              </div>
            ) : todayTasks.length === 0 ? (
              <Card className="p-10 text-center text-muted">
                <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-3" />
                <h4 className="font-bold text-dark text-base mb-1">All Caught Up for Today!</h4>
                <p className="text-xs max-w-sm mx-auto mb-4">
                  You've fulfilled your planned study sessions. Take a break, or practice any topic to advance mastery.
                </p>
                <Button size="sm" onClick={() => navigate('/practice')}>
                  Explore Practice Modes
                </Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {todayTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    id={task.id}
                    name={task.title}
                    duration={`${task.estimatedMinutes} min`}
                    type={task.type}
                    isDone={task.isCompleted}
                    isOverdue={task.isOverdue}
                    recommendationReason={task.recommendationReason}
                    actionUrl={task.actionUrl}
                    onToggleDone={handleToggleDone}
                    onReschedule={handleOpenReschedule}
                    onStart={handleStartTask}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Weekly Schedule */}
        {activeTab === 'weekly' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-dark">7-Day Study Distribution</h3>
              <span className="text-xs text-muted">
                Weekly Volume: <strong>{plan?.metrics.weeklyPlannedMinutes || 0} mins</strong>
              </span>
            </div>

            <Card className="p-6 overflow-x-auto">
              <div className="flex min-w-[850px] gap-4">
                {plan?.days.map((dayData, i) => (
                  <PlannerDay
                    key={dayData.date || i}
                    data={dayData}
                    isToday={dayData.isToday}
                    onToggleDone={handleToggleDone}
                    onReschedule={handleOpenReschedule}
                    onStart={handleStartTask}
                  />
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* TAB 3: Explainable Prioritization Breakdown */}
        {activeTab === 'priorities' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-dark">Transparent Recommendation Weights</h3>
              <p className="text-xs text-muted">
                How MindMate determines the sequence of activities using your real performance data.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <Card className="p-4 border-l-4 border-l-blue-500 bg-blue-50/20">
                <h4 className="font-bold text-dark mb-1">Spaced Repetition (30%)</h4>
                <p className="text-muted">
                  Protects long-term retention. Overdue reviews are prioritized to prevent forgetting curve decay.
                </p>
              </Card>
              <Card className="p-4 border-l-4 border-l-red-500 bg-red-50/20">
                <h4 className="font-bold text-dark mb-1">Knowledge Gap (25%)</h4>
                <p className="text-muted">
                  Focuses on topics with weaker Bayesian estimates, providing scaffolding and targeted practice.
                </p>
              </Card>
              <Card className="p-4 border-l-4 border-l-amber-500 bg-amber-50/20">
                <h4 className="font-bold text-dark mb-1">Calibration & Recency (30%)</h4>
                <p className="text-muted">
                  Explores uncalibrated topics with low sample counts and touches subjects that have been idle.
                </p>
              </Card>
            </div>

            <Card className="overflow-hidden">
              <div className="p-4 border-b bg-gray-50 text-xs font-semibold text-gray-700 grid grid-cols-12 gap-2">
                <span className="col-span-4">Topic</span>
                <span className="col-span-2 text-center">Mastery</span>
                <span className="col-span-2 text-center">Confidence</span>
                <span className="col-span-4">Primary Rationale</span>
              </div>
              <div className="divide-y divide-gray-100 text-xs">
                {plan?.prioritizedTopics.map((pt, i) => (
                  <div key={i} className="p-4 grid grid-cols-12 gap-2 items-center hover:bg-gray-50/60 transition-colors">
                    <div className="col-span-4 font-semibold text-dark">
                      {pt.topicName}
                      {pt.isOverdue && (
                        <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-red-100 text-red-800 font-normal">
                          Overdue
                        </span>
                      )}
                    </div>
                    <div className="col-span-2 text-center font-bold text-primary">
                      {pt.masteryScore}%
                    </div>
                    <div className="col-span-2 text-center text-muted">
                      {pt.confidenceLevel}
                    </div>
                    <div className="col-span-4 text-muted italic">
                      {pt.primaryRationale}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* Reschedule Modal */}
        {reschedulingTask && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl animate-in fade-in">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base text-dark">Reschedule Activity</h3>
                <button onClick={() => setReschedulingTask(null)} className="text-muted hover:text-dark">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <p className="text-xs text-muted">
                Move <strong>{reschedulingTask.title}</strong> to another day. Your learning history will be safely preserved.
              </p>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Target Date</label>
                <input
                  type="date"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" size="sm" onClick={() => setReschedulingTask(null)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleConfirmReschedule}>
                  Confirm Reschedule
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Settings Modal */}
        {showSettingsModal && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-xl animate-in fade-in max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <Sliders className="h-5 w-5 text-primary" />
                  <h3 className="font-bold text-base text-dark">Study Planner Settings</h3>
                </div>
                <button onClick={() => setShowSettingsModal(false)} className="text-muted hover:text-dark">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Learning Objective Name</label>
                  <input
                    type="text"
                    value={settingsForm.targetGoalName || ''}
                    onChange={(e) => setSettingsForm({ ...settingsForm, targetGoalName: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary outline-none"
                    placeholder="e.g. Master Python Fundamentals"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-gray-700 mb-1">Daily Study Goal (Minutes)</label>
                    <input
                      type="number"
                      min={5}
                      max={360}
                      step={5}
                      value={settingsForm.dailyGoalMinutes || 30}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, dailyGoalMinutes: parseInt(e.target.value, 10) })
                      }
                      className="w-full p-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-gray-700 mb-1">Preferred Session Duration</label>
                    <select
                      value={settingsForm.preferredSessionMinutes || 15}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, preferredSessionMinutes: parseInt(e.target.value, 10) })
                      }
                      className="w-full p-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary outline-none"
                    >
                      <option value={10}>10 minutes</option>
                      <option value={15}>15 minutes (Standard)</option>
                      <option value={20}>20 minutes</option>
                      <option value={25}>25 minutes (Pomodoro)</option>
                      <option value={30}>30 minutes</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 mb-1.5">Target Study Days</label>
                  <div className="grid grid-cols-7 gap-1">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => {
                      const isSelected = settingsForm.targetDays?.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => {
                            const cur = settingsForm.targetDays || [];
                            const next = cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day];
                            setSettingsForm({ ...settingsForm, targetDays: next });
                          }}
                          className={`py-2 text-center rounded-lg font-semibold transition-all ${
                            isSelected ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Review Strategy</label>
                  <select
                    value={settingsForm.reviewStrategy || 'BALANCED'}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, reviewStrategy: e.target.value as any })
                    }
                    className="w-full p-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary outline-none"
                  >
                    <option value="BALANCED">Balanced Interleaving (Spaced Review + Knowledge Gaps)</option>
                    <option value="REVIEWS_FIRST">Reviews First (Prioritize Long-Term Retention)</option>
                    <option value="KNOWLEDGE_GAP_FIRST">Knowledge Gaps First (Remediate Weaknesses)</option>
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t">
                  <Button variant="ghost" size="sm" type="button" onClick={() => setShowSettingsModal(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" type="submit">
                    Save & Recalibrate Plan
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
