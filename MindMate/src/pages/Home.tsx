import React, { useEffect, useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatCard } from '../components/shared/StatCard';
import { TaskCard } from '../components/shared/TaskCard';
import { InsightCard } from '../components/shared/InsightCard';
import { Flame, Target, Zap, ArrowRight, Brain, Check, Calendar, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useStudyStreak } from '../hooks/useStudyStreak';
import { useAppContext } from '../context/AppContext';
import { apiClient } from '../services/api/client';

interface LearnerTwinOverview {
  totalActiveTopics: number;
  assessedTopicsCount: number;
  unassessedTopicsCount: number;
  overallMasteryPct: number;
  totalQuestionsAnswered: number;
  totalCorrectAnswers: number;
  overallAccuracyPct: number;
  demonstratedStrengthsCount: number;
  knowledgeGapsCount: number;
}

interface TopicDetail {
  topicId: string;
  topicName: string;
  isAssessed: boolean;
  modelEstimates: {
    masteryScore: number;
    isSpacedRepetitionDue: boolean;
  };
}

interface LearnerTwinProfile {
  learnerName: string;
  learningGoal: string;
  overview: LearnerTwinOverview;
  topics: TopicDetail[];
  strengths: TopicDetail[];
  knowledgeGaps: TopicDetail[];
  deterministicSummary: string;
}

interface StudyTask {
  id: string;
  title: string;
  durationMinutes: number;
  type: string;
  isCompleted: boolean;
  actionUrl?: string;
  recommendationReason?: string;
}

interface PlannerResponse {
  todayTasks?: StudyTask[];
  settings?: {
    dailyGoalMinutes?: number;
  };
}

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAppContext();

  const {
    currentStreak,
    longestStreak,
    studyDates,
    recordStudyActivity,
  } = useStudyStreak();

  const [twinProfile, setTwinProfile] = useState<LearnerTwinProfile | null>(null);
  const [plannerData, setPlannerData] = useState<PlannerResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load genuine learner twin profile and today's planner tasks from backend
  useEffect(() => {
    let isMounted = true;

    async function loadLearnerDashboardData() {
      setIsLoading(true);
      try {
        const [twinRes, plannerRes] = await Promise.allSettled([
          apiClient<{ success: boolean; profile: LearnerTwinProfile }>('/api/learner/twin'),
          apiClient<PlannerResponse>('/api/learner/planner'),
        ]);

        if (isMounted) {
          if (twinRes.status === 'fulfilled' && twinRes.value?.success) {
            setTwinProfile(twinRes.value.profile);
          }
          if (plannerRes.status === 'fulfilled') {
            setPlannerData(plannerRes.value);
          }
        }
      } catch (err) {
        console.warn('[Home] Failed to load learner dashboard data:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    if (user?.id) {
      loadLearnerDashboardData();
    } else {
      setIsLoading(false);
    }

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  const today = new Date();
  const todayKey = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');

  const studiedToday = studyDates.includes(todayKey);

  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    const dayOfWeek = date.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    date.setDate(date.getDate() + mondayOffset + index);

    const key = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');

    return {
      label: date.toLocaleDateString('en', { weekday: 'short' }),
      number: date.getDate(),
      key,
      isToday: key === todayKey,
      studied: studyDates.includes(key),
    };
  });

  // Derive authentic next best action based on the learner's actual data
  const assessedCount = twinProfile?.overview?.assessedTopicsCount ?? 0;
  const questionsCount = twinProfile?.overview?.totalQuestionsAnswered ?? 0;
  const knowledgeGaps = twinProfile?.knowledgeGaps ?? [];
  const strengths = twinProfile?.strengths ?? [];
  const overdueTopic = twinProfile?.topics?.find((t) => t.modelEstimates?.isSpacedRepetitionDue);

  let nextActionTitle = 'Start Initial Diagnostic';
  let nextActionDesc = 'Complete your first diagnostic practice session to establish baseline ability ratings and calibrate your Learning Twin.';
  let nextActionUrl = '/practice/quiz';

  if (knowledgeGaps.length > 0) {
    const gap = knowledgeGaps[0];
    nextActionTitle = `Targeted Remediation: ${gap.topicName}`;
    nextActionDesc = `Your estimated mastery is currently at ${gap.modelEstimates.masteryScore}%. Focused adaptive practice will reinforce core concepts.`;
    nextActionUrl = `/practice/quiz?topic=${gap.topicId}`;
  } else if (overdueTopic) {
    nextActionTitle = `Retention Review: ${overdueTopic.topicName}`;
    nextActionDesc = 'Spaced repetition review is due to prevent memory decay. Review now to consolidate long-term retention.';
    nextActionUrl = `/practice/quiz?topic=${overdueTopic.topicId}`;
  } else if (strengths.length > 0) {
    const strong = strengths[0];
    nextActionTitle = `Advanced Challenge: ${strong.topicName}`;
    nextActionDesc = `Strong foundation demonstrated (${strong.modelEstimates.masteryScore}% mastery). Advance to hard problems to deepen mastery.`;
    nextActionUrl = `/practice/quiz?topic=${strong.topicId}`;
  } else if (assessedCount > 0) {
    nextActionTitle = 'Continue Adaptive Practice';
    nextActionDesc = 'Engage in adaptive question practice tailored to your current proficiency.';
    nextActionUrl = '/practice/quiz';
  }

  const todayTasks = plannerData?.todayTasks || [];

  return (
    <AppShell
      pageTitle={`Welcome back, ${user?.name || 'Learner'}!`}
      pageSubtitle="Ready to continue mastering Computer Science?"
    >
      <div className="max-w-5xl space-y-8">
        {/* Next Best Action Banner */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 p-8 text-white shadow-lg">
          <div className="relative z-10 md:w-2/3">
            <div className="mb-4 inline-flex items-center rounded-full bg-white/20 px-3 py-1 text-sm font-medium backdrop-blur-sm">
              <Zap className="mr-2 h-4 w-4 text-yellow-300" />
              Next Best Action
            </div>
            <h2 className="mb-2 text-3xl font-bold">{nextActionTitle}</h2>
            <p className="mb-6 text-lg text-indigo-100">{nextActionDesc}</p>
            <div className="flex flex-wrap gap-4">
              <Button
                size="lg"
                className="bg-white text-indigo-600 hover:bg-indigo-50 font-semibold"
                onClick={() => navigate(nextActionUrl)}
              >
                Start Practice <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className="border border-white/20 text-white hover:bg-white/10 hover:text-white"
                onClick={() => navigate('/learn')}
              >
                Ask AI Tutor
              </Button>
            </div>
          </div>
          <div className="absolute -right-12 -top-12 opacity-20">
            <Brain className="h-64 w-64" />
          </div>
        </div>

        {/* Real Metrics Cards */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <StatCard
            title="Current Streak"
            value={`${currentStreak} ${currentStreak === 1 ? 'Day' : 'Days'}`}
            icon={Flame}
            colorClass="text-orange-500"
            subtitle={studiedToday ? 'Study recorded today' : 'No activity yet today'}
          />
          <StatCard
            title="Overall Mastery"
            value={assessedCount > 0 ? `${twinProfile?.overview?.overallMasteryPct}%` : '—'}
            icon={Target}
            colorClass="text-indigo-500"
            subtitle={
              assessedCount > 0
                ? `${assessedCount} assessed topic${assessedCount === 1 ? '' : 's'}`
                : 'Complete a quiz to evaluate'
            }
          />
          <StatCard
            title="Study Accuracy"
            value={questionsCount > 0 ? `${twinProfile?.overview?.overallAccuracyPct}%` : '—'}
            icon={Zap}
            colorClass="text-yellow-500"
            subtitle={
              questionsCount > 0
                ? `${twinProfile?.overview?.totalCorrectAnswers}/${questionsCount} correct answers`
                : 'No practice history'
            }
          />
        </div>

        {/* Study Streak Card */}
        <Card className="space-y-5 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-xl font-bold">
                <Flame className="h-5 w-5 text-orange-500" />
                Your Study Streak
              </h3>
              <p className="mt-1 text-sm text-muted">
                Every study day builds your long-term learning habit.
              </p>
            </div>
            <div className="rounded-xl bg-orange-50 px-4 py-2 text-right">
              <p className="text-xs font-medium text-orange-700">Personal best</p>
              <p className="text-2xl font-bold text-orange-600">
                {longestStreak} {longestStreak === 1 ? 'day' : 'days'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {weekDays.map((day) => (
              <div key={day.key} className="flex flex-col items-center gap-2">
                <span className="text-xs text-muted">{day.label}</span>
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ${
                    day.studied
                      ? 'bg-orange-500 text-white shadow-sm'
                      : day.isToday
                        ? 'border-2 border-orange-400 text-orange-600 bg-orange-50/30'
                        : 'bg-gray-100 text-gray-500'
                  }`}
                  title={day.studied ? 'Study activity completed' : 'No study activity recorded'}
                >
                  {day.studied ? <Check className="h-4 w-4" /> : day.number}
                </div>
                {day.isToday && (
                  <span className="text-xs font-medium text-orange-600">
                    Today
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-sm text-muted">
              {studiedToday
                ? "Today's study activity is recorded. Great work!"
                : 'Complete a quiz or log study to keep your streak alive.'}
            </p>
            <Button
              onClick={recordStudyActivity}
              disabled={studiedToday}
              variant={studiedToday ? 'secondary' : 'primary'}
            >
              {studiedToday ? 'Today Completed' : 'Record Today’s Study'}
            </Button>
          </div>
        </Card>

        {/* Today's Plan & Twin Snapshot */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Calendar className="h-5 w-5 text-indigo-600" />
                Today's Plan
              </h3>
              <Button
                variant="ghost"
                size="sm"
                className="text-primary hover:text-primary-hover"
                onClick={() => navigate('/planner')}
              >
                View Full Planner <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>

            <Card className="p-6">
              {todayTasks.length > 0 ? (
                <div className="space-y-3">
                  {todayTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      id={task.id}
                      name={task.title}
                      duration={`${task.durationMinutes} min`}
                      type={task.type}
                      isDone={task.isCompleted}
                      actionUrl={task.actionUrl}
                      recommendationReason={task.recommendationReason}
                      onStart={(url) => navigate(url || '/practice/quiz')}
                    />
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <BookOpen className="mx-auto h-10 w-10 text-gray-300 mb-2" />
                  <p className="font-semibold text-dark/80">No scheduled tasks for today</p>
                  <p className="mt-1 text-sm text-muted max-w-sm mx-auto">
                    Generate an adaptive study schedule in the Planner or start a practice session to build your plan.
                  </p>
                  <div className="mt-4 flex justify-center gap-3">
                    <Button size="sm" onClick={() => navigate('/planner')}>
                      Open Study Planner
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => navigate('/practice/quiz')}>
                      Start Quiz
                    </Button>
                  </div>
                </div>
              )}
            </Card>

            <InsightCard
              type="info"
              title="Personalized Pacing"
              description={
                twinProfile?.deterministicSummary ||
                'Complete diagnostic quizzes and practice sessions to receive evidence-based insights tailored to your learning profile.'
              }
              className="mt-6"
            />
          </div>

          {/* Twin Snapshot */}
          <div className="space-y-4">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Brain className="h-5 w-5 text-indigo-600" />
              Twin Snapshot
            </h3>
            <Card className="p-6">
              <div className="space-y-6">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">
                    Strongest Topic
                  </p>
                  <p className="font-medium text-dark text-base">
                    {strengths[0]?.topicName ||
                      (assessedCount > 0 ? 'Equally Balanced' : 'No assessed topics yet')}
                  </p>
                  {strengths[0] && (
                    <p className="text-xs text-emerald-600 font-medium mt-0.5">
                      {strengths[0].modelEstimates.masteryScore}% estimated mastery
                    </p>
                  )}
                </div>

                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">
                    Needs Focus
                  </p>
                  <p className={`font-medium text-base ${knowledgeGaps.length > 0 ? 'text-danger' : 'text-dark'}`}>
                    {knowledgeGaps[0]?.topicName ||
                      (assessedCount > 0 ? 'All assessed topics proficient' : 'No gaps identified yet')}
                  </p>
                  {knowledgeGaps[0] && (
                    <p className="text-xs text-rose-500 font-medium mt-0.5">
                      {knowledgeGaps[0].modelEstimates.masteryScore}% mastery (Needs practice)
                    </p>
                  )}
                </div>

                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">
                    Learning Goal
                  </p>
                  <p className="font-medium text-dark text-base">
                    {twinProfile?.learningGoal || user?.goal || 'Master Computer Science'}
                  </p>
                </div>

                <Button
                  variant="secondary"
                  className="mt-4 w-full"
                  onClick={() => navigate('/learning-twin')}
                >
                  View Full Learning Twin
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}