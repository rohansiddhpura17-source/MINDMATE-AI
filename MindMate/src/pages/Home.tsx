import { useEffect, useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatCard } from '../components/shared/StatCard';
import { TaskCard } from '../components/shared/TaskCard';
import { InsightCard } from '../components/shared/InsightCard';
import { learner as mockLearner } from '../data/mockData';
import { useMastery } from '../hooks/useMastery';
import { useStudyStreak } from '../hooks/useStudyStreak';
import { Flame, Target, Zap, ArrowRight, Brain, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { getProfile, getPlannerTasks } from '../lib/db';
import { STRATEGY_LABELS } from '../services/adaptive/adaptiveLearningEngine';

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAppContext();

  const { snapshot } = useMastery();
  const { currentStreak, longestStreak, studyDates } = useStudyStreak();

  const [profile, setProfile] = useState<any>(null);
  const [todayTasks, setTodayTasks] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    async function loadData() {
      try {
        const [profRes, tasksRes] = await Promise.all([
          getProfile(user!.id),
          getPlannerTasks(user!.id),
        ]);

        if (profRes.data) setProfile(profRes.data);

        if (tasksRes.data && tasksRes.data.length > 0) {
          const todayWeekday = new Date().toLocaleDateString('en-US', {
            weekday: 'short',
          });
          setTodayTasks(tasksRes.data.filter((t) => t.day === todayWeekday));
        }
      } catch (err) {
        console.error('Failed to load home data', err);
      }
    }
    loadData();
  }, [user]);

  const nextAction = snapshot.nextLearningAction;
  const assessedTopics = snapshot.topics.filter((t) => t.totalAttempts > 0);
  const strongestMetric =
    assessedTopics.length > 0
      ? [...assessedTopics].sort((a, b) => b.masteryScore - a.masteryScore)[0]
      : null;
  const weakestMetric =
    assessedTopics.length > 0
      ? [...assessedTopics].sort((a, b) => a.masteryScore - b.masteryScore)[0]
      : null;

  const displayStreak = currentStreak || profile?.streak || 0;
  const prefSession = profile?.preferred_session ?? mockLearner.preferredSession;

  const displayTasks =
    todayTasks.length > 0
      ? todayTasks
      : [
          {
            name: `${nextAction.nextTopicName} (${nextAction.suggestedActivity.replace(/-/g, ' ')})`,
            duration: '10 min',
            type: 'practice',
          },
          { name: 'Quick Recall Review', duration: '5 min', type: 'review' },
          { name: 'Mistake Recovery Check', duration: '10 min', type: 'quiz' },
        ];

  const today = new Date();
  const todayKey = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');

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

  return (
    <AppShell
      pageTitle={`Welcome back, ${user?.name || 'Learner'}!`}
      pageSubtitle="Adaptive learning engine and live assessment analytics"
    >
      <div className="space-y-8 max-w-5xl">
        {/* Next Best Action Hero Card (Driven by AdaptiveLearningEngine) */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 text-white p-8 shadow-lg">
          <div className="relative z-10 md:w-3/4">
            <div className="inline-flex items-center rounded-full bg-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider backdrop-blur-sm mb-4">
              <Zap className="mr-2 h-4 w-4 text-yellow-300" />
              Adaptive Next Best Action • {nextAction.suggestedActivity.replace(/-/g, ' ')}
            </div>
            <h2 className="text-3xl font-bold mb-2">{nextAction.nextTopicName}</h2>
            <p className="text-indigo-100 mb-3 text-base leading-relaxed">
              {nextAction.reason}
            </p>
            <p className="text-indigo-200 text-xs mb-6">
              Strategy: <strong>{STRATEGY_LABELS[nextAction.explanationStrategy]}</strong> •{' '}
              Suggested Difficulty:{' '}
              <strong>
                {nextAction.suggestedDifficulty.toUpperCase()} (Level{' '}
                {nextAction.suggestedDifficultyLevel}/5)
              </strong>{' '}
              • Evidence: {nextAction.supportingEvidence.detail}
            </p>
            <div className="flex flex-wrap gap-4">
              <Button
                size="lg"
                className="bg-white text-indigo-600 hover:bg-indigo-50 font-medium"
                onClick={() =>
                  navigate(
                    `/practice/adaptive-quiz?topic=${encodeURIComponent(nextAction.nextTopicId)}&type=${nextAction.suggestedActivity === 'diagnostic-quiz' ? 'diagnostic' : 'follow_up'}&difficulty=${nextAction.suggestedDifficultyLevel}`
                  )
                }
              >
                Start Recommended Quiz <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className="text-white hover:bg-white/10 hover:text-white border-white/20 border"
                onClick={() =>
                  navigate(
                    `/learn?topic=${encodeURIComponent(nextAction.nextTopicId)}&strategy=${encodeURIComponent(nextAction.explanationStrategy)}`
                  )
                }
              >
                Open Adaptive Lesson
              </Button>
            </div>
          </div>
          <div className="absolute -right-12 -top-12 opacity-20">
            <Brain className="h-64 w-64" />
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard
            title="Current Streak"
            value={`${displayStreak} Day${displayStreak === 1 ? '' : 's'}`}
            icon={Flame}
            colorClass="text-orange-500"
            subtitle="Recorded study days"
          />
          <StatCard
            title="Assessed Mastery"
            value={
              snapshot.assessedTopicsCount > 0
                ? `${snapshot.averageMastery}%`
                : 'Unassessed'
            }
            icon={Target}
            colorClass="text-indigo-500"
            subtitle={`${snapshot.assessedTopicsCount}/${snapshot.totalTopicsCount} topics (${snapshot.totalAttempts} attempts)`}
          />
          <StatCard
            title="Recent Accuracy"
            value={
              snapshot.totalAttempts > 0 ? `${snapshot.recentAccuracy}%` : '—'
            }
            icon={Zap}
            colorClass="text-yellow-500"
            subtitle={
              snapshot.totalAttempts > 0
                ? `${snapshot.totalCorrect}/${snapshot.totalAttempts} overall correct`
                : 'Complete a quiz to measure accuracy'
            }
          />
        </div>

        {/* Study Streak Calendar Widget */}
        <Card className="space-y-5 p-6 border border-border shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-xl font-bold text-dark">
                <Flame className="h-5 w-5 text-orange-500" />
                Your Study Streak
              </h3>
              <p className="mt-1 text-sm text-muted">
                Every study day helps build your learning habit.
              </p>
            </div>
            <div className="rounded-xl bg-orange-50 dark:bg-orange-950/40 px-4 py-2 text-right border border-orange-100 dark:border-orange-900">
              <p className="text-xs font-medium text-orange-700 dark:text-orange-300">
                Personal best
              </p>
              <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {longestStreak || displayStreak} days
              </p>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 pt-2">
            {weekDays.map((day) => (
              <div key={day.key} className="flex flex-col items-center gap-2">
                <span className="text-xs font-medium text-muted">{day.label}</span>
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold transition-all ${
                    day.studied
                      ? 'bg-orange-500 text-white shadow-sm'
                      : day.isToday
                        ? 'border-2 border-orange-400 text-orange-600 bg-orange-50/50'
                        : 'bg-gray-100 dark:bg-slate-800 text-gray-500'
                  }`}
                  title={
                    day.studied
                      ? 'Study activity completed'
                      : 'No study activity recorded'
                  }
                >
                  {day.studied ? <Check className="h-4 w-4" /> : day.number}
                </div>
                {day.isToday && (
                  <span className="text-xs font-semibold text-orange-600">
                    Today
                  </span>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* Today's Plan and Twin Snapshot */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-xl font-bold text-dark">Today's Adaptive Plan</h3>
            <Card className="p-6">
              <div className="space-y-4">
                {displayTasks.map((t, i) => (
                  <TaskCard
                    key={t.id || i}
                    id={t.id}
                    name={t.name}
                    duration={t.duration}
                    type={t.type as any}
                    isDone={t.completed}
                    activityCompleted={t.activity_completed}
                    onStartPractice={() =>
                      navigate(
                        `/practice/adaptive-quiz?topic=${encodeURIComponent(nextAction.nextTopicId)}`
                      )
                    }
                  />
                ))}
              </div>
            </Card>

            <InsightCard
              type="info"
              title={`Selected Strategy: ${STRATEGY_LABELS[nextAction.explanationStrategy]}`}
              description={nextAction.strategyReason}
              className="mt-6"
            />
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-bold text-dark">Twin Snapshot</h3>
            <Card className="p-6">
              <div className="space-y-6">
                <div>
                  <p className="text-xs text-muted font-semibold uppercase tracking-wider mb-1">
                    Strongest Assessed Topic
                  </p>
                  <p className="font-medium text-dark">
                    {strongestMetric
                      ? `${strongestMetric.topicName} (${strongestMetric.masteryScore}%)`
                      : 'No topics assessed yet'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted font-semibold uppercase tracking-wider mb-1">
                    Needs Focus
                  </p>
                  <p className="font-medium text-danger">
                    {weakestMetric
                      ? `${weakestMetric.topicName} (${weakestMetric.masteryScore}%)`
                      : nextAction.nextTopicName}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted font-semibold uppercase tracking-wider mb-1">
                    Preferred Session
                  </p>
                  <p className="font-medium text-dark">{prefSession}</p>
                </div>

                <Button
                  variant="secondary"
                  className="w-full mt-4"
                  onClick={() => navigate('/learning-twin')}
                >
                  View Full Twin
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
