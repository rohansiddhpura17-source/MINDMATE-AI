import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import {
  Trophy,
  Flame,
  Award,
  Sparkles,
  ArrowRight,
  CheckCircle,
  Share2,
  TrendingUp,
  BrainCircuit,
  Calendar,
  Zap,
  Target
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { getLearningWins, getProfile, getQuizHistory, LearningWin as WinType } from '../lib/db';

export default function LearningWin() {
  const navigate = useNavigate();
  const { user, showToast } = useAppContext();

  const [wins, setWins] = useState<WinType[]>([]);
  const [profileStats, setProfileStats] = useState<any>(null);
  const [quizCount, setQuizCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    async function loadData() {
      try {
        setLoading(true);
        const [winsRes, profRes, quizRes] = await Promise.all([
          getLearningWins(user!.id),
          getProfile(user!.id),
          getQuizHistory(user!.id),
        ]);

        if (winsRes.data) setWins(winsRes.data);
        if (profRes.data) setProfileStats(profRes.data);
        if (quizRes.data) setQuizCount(quizRes.data.length);
      } catch (err) {
        console.error('Failed to load learning wins data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [user]);

  const streak = profileStats?.streak ?? 12;
  const mastery = Math.round(profileStats?.overall_mastery ?? 74);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'streak':
        return <Flame className="h-5 w-5 text-amber-500" />;
      case 'mastery':
        return <Award className="h-5 w-5 text-purple-500" />;
      case 'quiz':
        return <Trophy className="h-5 w-5 text-emerald-500" />;
      default:
        return <Sparkles className="h-5 w-5 text-primary" />;
    }
  };

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(
        `🏆 Check out my study milestones on MindMate! Streak: ${streak} days, Overall Mastery: ${mastery}%.`
      );
      showToast('Milestone card copied to clipboard!', 'success');
    } else {
      showToast('Sharing copied to clipboard!', 'success');
    }
  };

  return (
    <AppShell
      pageTitle="Learning Wins & Milestones"
      pageSubtitle="Celebrate your cognitive leaps, consistent streaks, and personal breakthroughs"
    >
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Hero Celebration Banner */}
        <Card className="p-8 sm:p-10 border-primary/30 bg-gradient-to-br from-indigo-50/60 via-purple-50/30 to-transparent dark:from-indigo-950/20 dark:via-purple-950/10 dark:to-transparent relative overflow-hidden">
          <div className="absolute right-0 top-0 w-80 h-full bg-gradient-to-l from-indigo-200/20 to-transparent pointer-events-none" />

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 relative z-10">
            <div className="space-y-3 max-w-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider">
                <Sparkles className="h-3.5 w-3.5" /> Breakthrough Progress
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-dark leading-tight">
                Outstanding effort, {user?.name ?? 'Alex'}!
              </h2>
              <p className="text-sm sm:text-base text-muted leading-relaxed">
                You've consistently hit study milestones this week. MindMate has recorded each victory to reinforce long-term confidence and subject retention.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <Button onClick={handleShare} variant="secondary" className="flex items-center gap-2">
                <Share2 className="h-4 w-4" /> Share Milestones
              </Button>
              <Button onClick={() => navigate('/practice')} className="flex items-center gap-2 font-bold">
                Continue Practicing <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>

        {/* Milestone Statistics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="p-5 border border-border flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-500/10 text-amber-500">
              <Flame className="h-6 w-6" />
            </div>
            <div>
              <span className="text-xs text-muted block font-medium">Daily Streak</span>
              <span className="text-2xl font-bold text-dark">{streak} Days</span>
            </div>
          </Card>

          <Card className="p-5 border border-border flex items-center gap-4">
            <div className="p-3 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <BrainCircuit className="h-6 w-6" />
            </div>
            <div>
              <span className="text-xs text-muted block font-medium">Overall Mastery</span>
              <span className="text-2xl font-bold text-dark">{mastery}%</span>
            </div>
          </Card>

          <Card className="p-5 border border-border flex items-center gap-4">
            <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600">
              <Trophy className="h-6 w-6" />
            </div>
            <div>
              <span className="text-xs text-muted block font-medium">Quizzes Completed</span>
              <span className="text-2xl font-bold text-dark">{Math.max(quizCount, 4)}</span>
            </div>
          </Card>

          <Card className="p-5 border border-border flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-600">
              <Target className="h-6 w-6" />
            </div>
            <div>
              <span className="text-xs text-muted block font-medium">Total Wins</span>
              <span className="text-2xl font-bold text-dark">{wins.length}</span>
            </div>
          </Card>
        </div>

        {/* Timeline of Achievements */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-dark">Accomplishment Log</h3>
            <span className="text-xs text-muted font-medium">Verified by MindMate Engine</span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-muted">
              <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm">Loading achievements...</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {wins.map((win) => (
                <Card
                  key={win.id}
                  className="p-6 border border-border hover:shadow-md transition-all flex flex-col justify-between space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 rounded-xl bg-gray-100 dark:bg-slate-800">
                        {getCategoryIcon(win.category)}
                      </div>
                      <div>
                        <h4 className="font-bold text-base text-dark">{win.title}</h4>
                        <p className="text-xs sm:text-sm text-muted mt-1 leading-relaxed">
                          {win.description}
                        </p>
                      </div>
                    </div>

                    {win.metric_value && (
                      <Badge variant="default" className="text-xs font-bold shrink-0">
                        {win.metric_value}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-border/60 text-xs text-muted">
                    <span className="capitalize font-medium">{win.category} Win</span>
                    <span>{new Date(win.achieved_at).toLocaleDateString()}</span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Next Recommended Targets */}
        <Card className="p-6 border border-border bg-surface space-y-4">
          <h4 className="text-base font-bold text-dark flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" /> Upcoming Targets
          </h4>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="p-4 rounded-xl border border-border bg-gray-50/50 dark:bg-slate-800/40 space-y-2">
              <span className="text-xs font-bold text-amber-500 block uppercase tracking-wider">
                14-Day Streak
              </span>
              <p className="text-xs text-muted">
                Maintain 2 more consecutive days to unlock the Fortnight Scholar badge.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-border bg-gray-50/50 dark:bg-slate-800/40 space-y-2">
              <span className="text-xs font-bold text-purple-500 block uppercase tracking-wider">
                90% OOP Mastery
              </span>
              <p className="text-xs text-muted">
                Complete the Object-Oriented recovery session in the Planner.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-border bg-gray-50/50 dark:bg-slate-800/40 space-y-2">
              <span className="text-xs font-bold text-emerald-500 block uppercase tracking-wider">
                Zero Mistakes
              </span>
              <p className="text-xs text-muted">
                Clear all unresolved items in Mistake Review.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
