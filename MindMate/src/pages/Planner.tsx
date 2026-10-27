import React, { useEffect, useState, useMemo } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ProgressBar } from '../components/ui/ProgressBar';
import { PlannerDay } from '../components/shared/PlannerDay';
import { Target, Sparkles, RefreshCw, Plus, Filter, Calendar as CalendarIcon, CheckCircle2, Clock, AlertTriangle, X, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import {
  getPlannerTasks,
  createPlannerTask,
  updatePlannerTask,
  updatePlannerTaskDetails,
  deletePlannerTask,
  batchCreatePlannerTasks,
  getProfile,
  getTopics,
  PlannerTaskData
} from '../lib/db';
import { isDemoModeActive, clearDemoProgress, DEMO_MODE_CHANGED_EVENT } from '../services/demo/demoLearnerService';

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TASK_TYPES = ['practice', 'recovery', 'review', 'quiz', 'assessment'] as const;
const DURATIONS = ['15 min', '25 min', '30 min', '45 min', '60 min', '90 min'];

export default function Planner() {
  const navigate = useNavigate();
  const { user, showToast } = useAppContext();
  const currentDay = new Date().toLocaleDateString('en-US', { weekday: 'short' });

  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<PlannerTaskData[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [verificationTask, setVerificationTask] = useState<PlannerTaskData | null>(null);
  const [demoActive, setDemoActive] = useState(() => isDemoModeActive(user?.id));

  useEffect(() => {
    const handleDemoChange = (e: any) => {
      setDemoActive(Boolean(e.detail?.active));
    };
    window.addEventListener(DEMO_MODE_CHANGED_EVENT, handleDemoChange);
    return () => window.removeEventListener(DEMO_MODE_CHANGED_EVENT, handleDemoChange);
  }, []);

  // Filters
  const [selectedDay, setSelectedDay] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'pending' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Task Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<PlannerTaskData | null>(null);
  const [formName, setFormName] = useState('');
  const [formDay, setFormDay] = useState('Mon');
  const [formDuration, setFormDuration] = useState('30 min');
  const [formType, setFormType] = useState<string>('practice');
  const [formPriority, setFormPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [formDueDate, setFormDueDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Load data
  useEffect(() => {
    if (!user) return;
    async function loadData() {
      try {
        setLoading(true);
        const [tasksRes, profRes] = await Promise.all([
          getPlannerTasks(user!.id),
          getProfile(user!.id)
        ]);

        if (profRes.data) setProfile(profRes.data);

        if (tasksRes.data && tasksRes.data.length > 0) {
          setTasks(tasksRes.data);
        } else {
          // Default initial tasks if user has none
          const defaultInitialTasks: Omit<PlannerTaskData, 'user_id'>[] = [
            { day: 'Mon', name: 'Python Functions', duration: '25 min', type: 'practice', priority: 'medium' },
            { day: 'Tue', name: 'OOP Recovery Session', duration: '30 min', type: 'recovery', priority: 'high' },
            { day: 'Wed', name: 'DBMS Review & SQL', duration: '25 min', type: 'review', priority: 'medium' },
            { day: 'Thu', name: 'Variable Scope Quiz', duration: '20 min', type: 'quiz', priority: 'low' },
            { day: 'Fri', name: 'Mock Assessment', duration: '40 min', type: 'assessment', priority: 'high' },
          ];
          const created = await batchCreatePlannerTasks(user!.id, defaultInitialTasks);
          if (created.data) setTasks(created.data);
        }
      } catch (err) {
        console.error('Error loading planner:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();

    const reload = () => void loadData();
    window.addEventListener('mindmate-demo-mode-changed', reload);
    return () => window.removeEventListener('mindmate-demo-mode-changed', reload);
  }, [user]);

  // Open modal for Create
  const handleOpenCreateModal = (defaultDay?: string) => {
    setEditingTask(null);
    setFormName('');
    setFormDay(defaultDay || (DAYS_OF_WEEK.includes(currentDay) ? currentDay : 'Mon'));
    setFormDuration('30 min');
    setFormType('practice');
    setFormPriority('medium');
    setFormDueDate('');
    setIsModalOpen(true);
  };

  // Open modal for Edit
  const handleOpenEditModal = (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    setEditingTask(task);
    setFormName(task.name);
    setFormDay(task.day);
    setFormDuration(task.duration);
    setFormType(task.type);
    setFormPriority(task.priority || 'medium');
    setFormDueDate(task.due_date || '');
    setIsModalOpen(true);
  };

  // Save Task (Create or Update)
  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      showToast('Please enter a task name.', 'error');
      return;
    }
    if (!user) return;

    setIsSubmitting(true);
    try {
      if (editingTask && editingTask.id) {
        // Update existing task
        const updates: Partial<PlannerTaskData> = {
          name: formName.trim(),
          day: formDay,
          duration: formDuration,
          type: formType,
          priority: formPriority,
          due_date: formDueDate || undefined
        };

        // Optimistic UI update
        setTasks(prev => prev.map(t => t.id === editingTask.id ? { ...t, ...updates } : t));
        await updatePlannerTaskDetails(editingTask.id, updates, user.id);
        showToast('Study task updated successfully.', 'success');
      } else {
        // Create new task
        const newTaskData: PlannerTaskData = {
          user_id: user.id,
          name: formName.trim(),
          day: formDay,
          duration: formDuration,
          type: formType,
          priority: formPriority,
          due_date: formDueDate || undefined,
          completed: false
        };

        const res = await createPlannerTask(newTaskData);
        if (res.data) {
          setTasks(prev => [...prev, res.data]);
        }
        showToast('New study session scheduled.', 'success');
      }

      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      showToast('Failed to save study task.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Task
  const handleDeleteTask = async (id: string) => {
    if (!user) return;
    setTasks(prev => prev.filter(t => t.id !== id));
    try {
      await deletePlannerTask(id, user.id);
      showToast('Task removed from planner.', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to delete task.', 'error');
    }
  };

  const getPracticeRouteForTask = (task: PlannerTaskData) => {
    const t = task.type.toLowerCase();
    const name = task.name.toLowerCase();
    let topicParam = 'python-functions';
    if (name.includes('dbms') || name.includes('sql') || name.includes('database')) {
      topicParam = 'dbms-normalization';
    } else if (name.includes('oop') || name.includes('class')) {
      topicParam = 'python-oop';
    } else if (name.includes('dsa') || name.includes('search') || name.includes('algorithm')) {
      topicParam = 'dsa-binary-search';
    }

    if (t === 'quiz' || t === 'assessment') {
      return `/practice/adaptive-quiz?taskId=${task.id}&topic=${topicParam}`;
    }
    if (t === 'recovery' || t === 'review' || name.includes('recovery') || name.includes('mistake')) {
      return `/practice/mistake-review?taskId=${task.id}`;
    }
    if (name.includes('flashcard')) {
      return `/practice/flashcards?taskId=${task.id}&topic=${topicParam}`;
    }
    if (name.includes('recall')) {
      return `/practice/quick-recall?taskId=${task.id}&topic=${topicParam}`;
    }
    return `/practice/adaptive-quiz?taskId=${task.id}&topic=${topicParam}`;
  };

  const handleStartPractice = (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    navigate(getPracticeRouteForTask(task));
  };

  // Toggle Task Completion (Validates Activity)
  const handleToggleTask = async (id: string, done: boolean) => {
    if (!user) return;
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    // Disallow premature completion without completing the activity
    if (done && !task.activity_completed) {
      setVerificationTask(task);
      return;
    }

    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed: done } : t)));
    try {
      await updatePlannerTask(id, done, user.id);
      showToast(done ? 'Great job! Session completed.' : 'Session marked incomplete.', 'success');
    } catch (err) {
      console.error(err);
    }
  };

  const handleForceComplete = async () => {
    if (!verificationTask || !user || !verificationTask.id) return;
    const id = verificationTask.id;
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: true, activity_completed: true } : t))
    );
    setVerificationTask(null);
    try {
      await updatePlannerTask(id, true, user.id);
      showToast('Session manually marked as completed.', 'success');
    } catch (err) {
      console.error(err);
    }
  };

  // AI-Assisted Plan Regeneration
  const handleRegeneratePlan = async () => {
    if (!user) return;
    setIsRegenerating(true);
    showToast('MindMate is analyzing your learning profile to generate a balanced plan...', 'info');

    try {
      // Find weak topics to emphasize
      let weakTopicName = 'OOP Concepts';
      let secondaryTopic = 'Python Functions';
      try {
        const topicsRes = await getTopics(user.id);
        if (topicsRes.data && topicsRes.data.length > 0) {
          const sorted = [...topicsRes.data].sort((a: any, b: any) => (a.mastery || 0) - (b.mastery || 0));
          if (sorted[0]?.name) weakTopicName = sorted[0].name;
          if (sorted[1]?.name) secondaryTopic = sorted[1].name;
        }
      } catch {}

      const adaptiveSchedule: Omit<PlannerTaskData, 'user_id'>[] = [
        { day: 'Mon', name: `${weakTopicName} Deep Dive`, duration: '30 min', type: 'recovery', priority: 'high' },
        { day: 'Tue', name: `${secondaryTopic} Hands-on Practice`, duration: '25 min', type: 'practice', priority: 'medium' },
        { day: 'Wed', name: `${weakTopicName} Targeted Review`, duration: '20 min', type: 'review', priority: 'high' },
        { day: 'Thu', name: 'Comprehensive Knowledge Quiz', duration: '25 min', type: 'quiz', priority: 'medium' },
        { day: 'Fri', name: 'Mock Exam Assessment', duration: '45 min', type: 'assessment', priority: 'high' },
        { day: 'Sat', name: 'Spaced Repetition Flashcards', duration: '15 min', type: 'practice', priority: 'low' },
      ];

      const res = await batchCreatePlannerTasks(user.id, adaptiveSchedule);
      if (res.data) {
        setTasks(res.data);
      }
      showToast('Personalized learning plan generated!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to regenerate plan.', 'error');
    } finally {
      setIsRegenerating(false);
    }
  };

  // Filtered Tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      // Day filter
      if (selectedDay !== 'all' && task.day !== selectedDay) return false;
      // Type filter
      if (selectedType !== 'all' && task.type.toLowerCase() !== selectedType.toLowerCase()) return false;
      // Status filter
      if (selectedStatus === 'completed' && !task.completed) return false;
      if (selectedStatus === 'pending' && task.completed) return false;
      // Search
      if (searchQuery.trim() && !task.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [tasks, selectedDay, selectedType, selectedStatus, searchQuery]);

  // Group by day for the grid
  const daysData = useMemo(() => {
    const daysToShow = selectedDay === 'all' ? DAYS_OF_WEEK : [selectedDay];
    return daysToShow.map(day => ({
      day,
      tasks: filteredTasks.filter(t => t.day === day)
    }));
  }, [filteredTasks, selectedDay]);

  // Stats calculation
  const totalTasks = tasks.length;
  const completedTasksCount = tasks.filter(t => t.completed).length;
  const completionPercent = totalTasks > 0 ? Math.round((completedTasksCount / totalTasks) * 100) : 0;
  const goalTitle = profile?.goal || user?.goal || 'Computer Science Final Exam';

  return (
    <AppShell pageTitle="Weekly Planner" pageSubtitle="Your personalized path to mastering study goals">
      <div className="w-full max-w-6xl space-y-6 min-w-0">
        {/* Simulated Demo Data Banner */}
        {demoActive && (
          <div
            className="bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs"
            data-testid="planner-demo-banner"
          >
            <div className="flex gap-3 items-start">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 flex items-center justify-center shrink-0 border border-amber-300 dark:border-amber-700">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-600 animate-pulse" />
                    SIMULATED DEMO DATA ACTIVE
                  </span>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Profile: {user?.name || 'meet8kotecha'}
                  </span>
                </div>
                <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed font-medium">
                  Planner tasks are generated from an isolated 14-day simulated history. <strong>Simulated results are not verified evidence of actual learning.</strong> Genuine learner tasks remain untouched.
                </p>
              </div>
            </div>
            <div className="flex gap-2 shrink-0 sm:self-center">
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  clearDemoProgress(user?.id);
                  setDemoActive(false);
                  const res = await getPlannerTasks(user?.id || 'meet8kotecha');
                  setTasks(res.data || []);
                  showToast('Demo data cleared. Returned to genuine planner schedule.', 'info');
                }}
                className="bg-white hover:bg-amber-100/60 dark:bg-slate-800 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-800 shadow-xs font-semibold text-xs cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Clear Demo Data
              </Button>
            </div>
          </div>
        )}

        {/* Goal & Progress Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 mb-2.5">
                <Target className="h-3.5 w-3.5" /> Current Learning Goal
              </div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1 tracking-tight">{goalTitle}</h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                Target date approaching. Stay consistent to build long-term retention.
              </p>
            </div>

            <div className="w-full md:w-1/3 flex flex-col justify-center">
              <div className="flex justify-between text-sm font-medium mb-2">
                <span className="text-slate-800 dark:text-slate-200 font-semibold">Weekly Goal Progress</span>
                <span className="text-indigo-600 dark:text-indigo-400 font-bold">{completionPercent}%</span>
              </div>
              <ProgressBar value={completionPercent} className="h-2.5" />
              <div className="flex justify-between items-center mt-2 text-xs text-slate-500 dark:text-slate-400">
                <span>{completedTasksCount} of {totalTasks} study sessions completed</span>
                {totalTasks > 0 && completedTasksCount === totalTasks && (
                  <span className="text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> All Done!
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button onClick={() => handleOpenCreateModal()} className="shadow-xs cursor-pointer">
                <Plus className="h-4 w-4 mr-2" /> Add Task
              </Button>
            </div>
          </div>
        </div>

        {/* AI Learning Twin Recommendation Banner */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex gap-3 items-start">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm mb-0.5">
                Adaptive Plan Recommendation
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
                MindMate continuously tunes your schedule to bridge conceptual gaps and balance retrieval practice. Click Regenerate to automatically re-balance your study sessions.
              </p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0 sm:self-center">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRegeneratePlan}
              disabled={isRegenerating}
              className="bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 cursor-pointer shadow-xs font-semibold"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-2 text-indigo-600 dark:text-indigo-400 ${isRegenerating ? 'animate-spin' : ''}`} />
              {isRegenerating ? 'Analyzing...' : 'Regenerate Plan'}
            </Button>
          </div>
        </div>

        {/* Filters and Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Day selection pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
            <button
              onClick={() => setSelectedDay('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                selectedDay === 'all'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 hover:bg-slate-50 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700'
              }`}
            >
              All Days ({tasks.length})
            </button>
            {DAYS_OF_WEEK.map(d => {
              const count = tasks.filter(t => t.day === d).length;
              const isToday = d === currentDay;
              return (
                <button
                  key={d}
                  onClick={() => setSelectedDay(d)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer ${
                    selectedDay === d
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 hover:bg-slate-50 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <span>{d}</span>
                  {isToday && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                  {count > 0 && <span className={`text-[10px] ${selectedDay === d ? 'text-indigo-100' : 'text-slate-400'}`}>({count})</span>}
                </button>
              );
            })}
          </div>

          {/* Type & Status Filters */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 cursor-pointer shadow-2xs"
            >
              <option value="all">All Types</option>
              {TASK_TYPES.map(t => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>

            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as any)}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 cursor-pointer shadow-2xs"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
            </select>

            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks..."
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 w-36 sm:w-44 shadow-2xs"
            />
          </div>
        </div>

        {/* Planner Day Grid */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-slate-500 flex flex-col items-center justify-center">
              <RefreshCw className="h-8 w-8 animate-spin text-indigo-600 mb-3" />
              <p className="text-sm font-medium">Loading your weekly study plan...</p>
            </div>
          ) : selectedDay === 'all' ? (
            <div className="overflow-x-auto pb-2 overscroll-x-contain">
              <div className="flex gap-3.5 min-w-[1050px] w-full">
                {daysData.map((dayData) => (
                  <PlannerDay
                    key={dayData.day}
                    data={dayData}
                    isToday={dayData.day === currentDay}
                    onToggleTask={handleToggleTask}
                    onEditTask={handleOpenEditModal}
                    onDeleteTask={handleDeleteTask}
                    onAddTask={handleOpenCreateModal}
                    onStartPractice={handleStartPractice}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-md mx-auto w-full py-2 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 dark:text-slate-100 text-base">
                    Viewing {selectedDay}
                  </span>
                  {selectedDay === currentDay && (
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 px-2 py-0.5 rounded-full">
                      Today
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDay('all')}
                  className="text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
                >
                  Show all days
                </button>
              </div>
              {daysData.map((dayData) => (
                <PlannerDay
                  key={dayData.day}
                  data={dayData}
                  isToday={dayData.day === currentDay}
                  onToggleTask={handleToggleTask}
                  onEditTask={handleOpenEditModal}
                  onDeleteTask={handleDeleteTask}
                  onAddTask={handleOpenCreateModal}
                  onStartPractice={handleStartPractice}
                />
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Add / Edit Task Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl w-full max-w-md p-6 overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {editingTask ? 'Edit Study Task' : 'Schedule New Study Task'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTask} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
                  Task / Topic Title *
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Python Function Scope & Closures"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
                    Day of Week
                  </label>
                  <select
                    value={formDay}
                    onChange={(e) => setFormDay(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    {DAYS_OF_WEEK.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
                    Duration
                  </label>
                  <select
                    value={formDuration}
                    onChange={(e) => setFormDuration(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    {DURATIONS.map(dur => (
                      <option key={dur} value={dur}>{dur}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
                    Session Type
                  </label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    {TASK_TYPES.map(t => (
                      <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
                    Priority
                  </label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
                  Target Due Date (Optional)
                </label>
                <input
                  type="date"
                  value={formDueDate}
                  onChange={(e) => setFormDueDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800 mt-6">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsModalOpen(false)}
                  className="cursor-pointer"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting} className="cursor-pointer">
                  {isSubmitting ? 'Saving...' : editingTask ? 'Update Task' : 'Schedule Task'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Activity Verification Modal */}
      {verificationTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto shadow-2xs">
              <AlertTriangle className="h-6 w-6" />
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Activity Practice Required
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                To guarantee mastery retention, <span className="font-semibold text-slate-900 dark:text-slate-100">"{verificationTask.name}"</span> must be verified through practice.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 space-y-1">
              <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider block">
                Recommended Practice Mode:
              </span>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                {verificationTask.type === 'quiz' || verificationTask.type === 'assessment'
                  ? 'Adaptive Quiz Session (Levels 1-5)'
                  : verificationTask.type === 'recovery' || verificationTask.type === 'review'
                  ? 'Mistake Review & Recovery'
                  : 'Interactive Retrieval Practice'}
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <Button
                onClick={() => {
                  const route = getPracticeRouteForTask(verificationTask);
                  setVerificationTask(null);
                  navigate(route);
                }}
                className="w-full font-bold flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <Play className="h-4 w-4 fill-white" /> Launch Practice Session Now
              </Button>
              <Button
                variant="ghost"
                onClick={handleForceComplete}
                className="w-full text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
              >
                Mark Complete Without Practice
              </Button>
              <Button
                variant="secondary"
                onClick={() => setVerificationTask(null)}
                className="w-full cursor-pointer"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
