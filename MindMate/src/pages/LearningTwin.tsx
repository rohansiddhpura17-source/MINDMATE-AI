import React, { useEffect, useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { LearningTwinCard } from '../components/shared/LearningTwinCard';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Brain, BookOpen, Target, Sparkles, Settings, LineChart, Zap, Clock, RotateCcw } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { getProfile, updateProfile } from '../lib/db';
import { useMastery } from '../hooks/useMastery';
import { STRATEGY_LABELS } from '../services/adaptive/adaptiveLearningEngine';
import { clearDemoProgress } from '../services/demo/demoLearnerService';

export default function LearningTwin() {
  const { user } = useAppContext();
  const { snapshot, refresh } = useMastery();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [profile, setProfile] = useState<any>(null);
  const [formStyle, setFormStyle] = useState('Examples first');
  const [formSession, setFormSession] = useState('30-45 min');

  useEffect(() => {
    if (!user) return;
    async function loadData() {
      try {
        const profRes = await getProfile(user!.id);
        if (profRes.data) {
          setProfile(profRes.data);
          setFormStyle(profRes.data.learning_style || 'Examples first');
          setFormSession(profRes.data.preferred_session || '30-45 min');
        }
      } catch (err) {
        console.error(err);
      }
    }
    loadData();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    try {
      await updateProfile(user.id, {
        learning_style: formStyle,
        preferred_session: formSession
      });
      setProfile({ ...profile, learning_style: formStyle, preferred_session: formSession });
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const assessedMetrics = snapshot
    ? [...snapshot.topics].filter((t) => t.totalAttempts > 0).sort((a, b) => b.masteryScore - a.masteryScore)
    : [];
  const masteredCount = assessedMetrics.filter((t) => t.status === 'mastered' || t.status === 'strong').length;
  const developingCount = assessedMetrics.filter((t) => t.status === 'developing').length;
  const mastery = snapshot ? snapshot.averageMastery : (profile?.overall_mastery ?? 0);
  const learningStyle = profile?.learning_style ?? 'Examples first';
  const preferredSession = profile?.preferred_session ?? '30-45 min';

  const strongestMetric = assessedMetrics.length > 0 ? assessedMetrics[0] : null;
  const weakestMetric = assessedMetrics.length > 0 ? assessedMetrics[assessedMetrics.length - 1] : null;
  const activeStrategyLabel = snapshot?.nextLearningAction
    ? STRATEGY_LABELS[snapshot.nextLearningAction.explanationStrategy]
    : 'Step-by-Step Breakdown';

  const knowledgeGraphItems = assessedMetrics.length > 0
    ? [
        `Average Mastery: ${mastery}% (${snapshot?.assessedTopicsCount ?? 0} topic(s) assessed)`,
        strongestMetric
          ? `Strongest foundation: ${strongestMetric.topicName} (${strongestMetric.masteryScore}%, ${strongestMetric.confidenceLevel} confidence)`
          : 'No strongest topic recorded yet',
        `Strong/Mastered: ${masteredCount} · Developing: ${developingCount}`,
        weakestMetric
          ? `Primary focus: ${weakestMetric.topicName} (${weakestMetric.masteryScore}%)`
          : 'No focus gaps recorded yet',
      ]
    : [
        'Average Mastery: 0% (No quiz attempts recorded yet)',
        'Complete a diagnostic quiz to map topic foundations',
        'Topic mastery uses recency + difficulty weighting',
        'No gaps identified until assessment evidence exists',
      ];

  const strengthItems = snapshot && snapshot.totalAttempts > 0
    ? [
        `Overall Accuracy: ${snapshot.overallAccuracy}% (${snapshot.totalCorrect}/${snapshot.totalAttempts} correct)`,
        `Recent Window Accuracy: ${snapshot.recentAccuracy}%`,
        strongestMetric
          ? `Highest topic score: ${strongestMetric.topicName} (${strongestMetric.masteryScore}%)`
          : 'Building initial topic baseline',
        `Active Teaching Strategy: ${activeStrategyLabel}`,
      ]
    : [
        'No accuracy baseline recorded yet',
        'Take a quiz to measure recent vs overall accuracy',
        'Tracks performance across Easy, Medium, and Hard difficulty',
        `Default Teaching Strategy: ${activeStrategyLabel}`,
      ];

  const struggleItems = snapshot && snapshot.mistakePatterns.length > 0
    ? snapshot.mistakePatterns.slice(0, 4).map((m) => m.summary)
    : snapshot && snapshot.totalAttempts > 0
    ? [
        'Zero wrong answers recorded across your completed attempts',
        'Continue practicing higher difficulty levels to test edge cases',
      ]
    : [
        'No mistake patterns recorded yet',
        'Wrong answers are grouped by topic, concept tag, and prerequisite',
        'Never diagnoses a misconception from a single isolated error',
      ];

  return (
    <AppShell pageTitle="Learning Twin" pageSubtitle="Your personalized cognitive model">
      <div className="max-w-5xl space-y-12">
        {/* Simulated Demo Data Banner */}
        {snapshot.isDemoMode && (
          <div
            className="bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs"
            data-testid="twin-demo-banner"
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
                  Learning Twin estimates and recommendations are computed from a 14-day simulated history. <strong>Simulated results are not verified evidence of actual learning.</strong> Genuine learner records remain untouched.
                </p>
              </div>
            </div>
            <div className="flex gap-2 shrink-0 sm:self-center">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  clearDemoProgress(user?.id);
                  void refresh();
                }}
                className="bg-white hover:bg-amber-100/60 dark:bg-slate-800 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-800 shadow-xs font-semibold text-xs cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Clear Demo Data
              </Button>
            </div>
          </div>
        )}

        {/* Core Layout */}
        <div className="relative">
          {/* Center Brain Icon */}
          <div className="flex flex-col items-center justify-center mb-8">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
              <div className="h-24 w-24 bg-surface border-4 border-primary text-primary rounded-full flex items-center justify-center relative z-10 shadow-lg">
                <Brain className="h-12 w-12" />
              </div>
            </div>
            <h2 className="text-xl font-bold mt-4">{user?.name || 'Learner'}'s Cognitive Model</h2>
            <p className="text-muted text-sm">
              {snapshot && snapshot.totalAttempts > 0
                ? `Computed from ${snapshot.totalAttempts} verified question attempt(s)`
                : 'Awaiting your first diagnostic or practice quiz attempt'}
            </p>
          </div>

          {/* 2x2 Grid of Aspects */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
            <LearningTwinCard
              title="Knowledge Graph"
              icon={Target}
              items={knowledgeGraphItems}
              colorClass="text-blue-500"
            />
            <LearningTwinCard
              title="Evidence & Strengths"
              icon={Sparkles}
              items={strengthItems}
              colorClass="text-green-500"
            />
            <LearningTwinCard
              title="Observed Mistake Patterns"
              icon={LineChart}
              items={struggleItems}
              colorClass="text-red-500"
            />
            <LearningTwinCard
              title="Preferences & Strategy"
              icon={BookOpen}
              items={[
                `Style: ${learningStyle}`,
                `Session: ${preferredSession}`,
                `Adaptive Tutor Strategy: ${activeStrategyLabel}`,
                snapshot?.nextLearningAction
                  ? `Recommended Difficulty: ${snapshot.nextLearningAction.suggestedDifficulty.toUpperCase()} (L${snapshot.nextLearningAction.suggestedDifficultyLevel})`
                  : 'Recommended Difficulty: EASY (L2)',
              ]}
              colorClass="text-purple-500"
            />
          </div>
        </div>

        {/* How MindMate uses this */}
        <div className="pt-8 border-t border-border">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold">How MindMate Uses Your Twin</h3>
            <Button variant="secondary" onClick={() => setIsModalOpen(true)}>
              <Settings className="h-4 w-4 mr-2" /> Update Preferences
            </Button>
          </div>

          <p className="text-muted mb-8 max-w-3xl leading-relaxed">
            Your Adaptive Learning Twin is a real-time model of how you learn. MindMate constantly updates this model based on your interactions, performance, and behavior to personalize every aspect of your learning journey.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="p-6 border border-[#C7D2FE] bg-[#EEF2FF]">
              <Zap className="h-6 w-6 text-[#4F46E5] mb-3" />
              <h4 className="font-semibold text-dark mb-2">Explanations</h4>
              <p className="text-sm text-dark leading-relaxed">Tailors content delivery (e.g., more examples vs. theory) based on what resonates with you.</p>
            </Card>
            <Card className="p-6 border border-[#A7F3D0] bg-[#ECFDF5]">
              <Target className="h-6 w-6 text-[#047857] mb-3" />
              <h4 className="font-semibold text-dark mb-2">Practice Generation</h4>
              <p className="text-sm text-dark leading-relaxed">Creates custom quizzes targeting exactly the edge cases you've struggled with.</p>
            </Card>
            <Card className="p-6 border border-[#FDE68A] bg-[#FFFBEB]">
              <Clock className="h-6 w-6 text-[#92400E] mb-3" />
              <h4 className="font-semibold text-dark mb-2">Pacing & Scheduling</h4>
              <p className="text-sm text-dark leading-relaxed">Recommends breaks and schedules reviews right before you're likely to forget.</p>
            </Card>
          </div>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Update Preferences">
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2 text-dark">Primary Learning Style</label>
            <select
              value={formStyle}
              onChange={e => setFormStyle(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface text-dark p-2.5 focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-sm"
            >
              <option value="Examples first" className="bg-surface text-dark">Examples first</option>
              <option value="Theory first" className="bg-surface text-dark">Theory first</option>
              <option value="Visual/Diagrams" className="bg-surface text-dark">Visual/Diagrams</option>
              <option value="Interactive/Doing" className="bg-surface text-dark">Interactive/Doing</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 text-dark">Preferred Session Length</label>
            <select
              value={formSession}
              onChange={e => setFormSession(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface text-dark p-2.5 focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-sm"
            >
              <option value="15-30 min" className="bg-surface text-dark">15–30 min (Pomodoro)</option>
              <option value="30-45 min" className="bg-surface text-dark">30–45 min (Focused)</option>
              <option value="60+ min" className="bg-surface text-dark">60+ min (Deep Work)</option>
            </select>
          </div>
          <div className="pt-4 border-t flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>Save Changes</Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
