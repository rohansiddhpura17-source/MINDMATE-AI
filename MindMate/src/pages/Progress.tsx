import React, { useState, useEffect } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ProgressBar } from '../components/ui/ProgressBar';
import { ChartCard } from '../components/shared/ChartCard';
import { InsightCard } from '../components/shared/InsightCard';
import { learner, topics, weeklyData } from '../data/mockData';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { Target, TrendingUp, AlertTriangle } from 'lucide-react';
import { learnerApi } from '../services/api/learnerApi';
import { useAppContext } from '../context/AppContext';

import { offlineLearner } from '../services/storage/offlineLearner';

export default function Progress() {
  const navigate = useNavigate();
  const { isAuthenticated, user, isOnline } = useAppContext();
  const [overallMastery, setOverallMastery] = useState(learner.overallMastery);
  const [topicList, setTopicList] = useState(topics);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    // 1. Immediately read from offline IndexedDB storage
    offlineLearner.getAllProgressOffline(user.id).then((offlineTopics) => {
      if (offlineTopics && offlineTopics.length > 0) {
        const total = offlineTopics.reduce((acc, t) => acc + t.masteryScore, 0);
        setOverallMastery(Math.round(total / offlineTopics.length));
        setTopicList(offlineTopics.map((t) => ({
          topicId: t.topicId,
          name: t.topicName,
          mastery: Math.round(t.masteryScore),
          attemptCount: t.attemptCount,
          correctCount: t.correctCount,
          confidenceLevel: t.confidenceLevel,
          currentDifficulty: t.currentDifficulty,
          streak: t.streakDays,
          status: t.masteryScore >= 80 ? 'mastered' : t.masteryScore >= 60 ? 'strong' : t.masteryScore >= 40 ? 'developing' : 'needs-work',
        })));
      }
    });

    // 2. If online, fetch fresh server data and cache to IndexedDB
    if (isOnline) {
      learnerApi.getProgress()
        .then((data) => {
          if (data.success && data.topics.length > 0) {
            setOverallMastery(data.overallMastery);
            setTopicList(data.topics.map((t) => ({
              topicId: t.topicId,
              name: t.name,
              mastery: t.mastery,
              attemptCount: t.attemptCount,
              correctCount: t.correctCount,
              confidenceLevel: t.confidenceLevel,
              currentDifficulty: t.currentDifficulty,
              streak: t.streak,
              status: t.mastery >= 80 ? 'mastered' : t.mastery >= 60 ? 'strong' : t.mastery >= 40 ? 'developing' : 'needs-work',
            })));
            if (user?.id) {
              offlineLearner.cacheServerProgress(user.id, data.topics);
            }
          }
        })
        .catch((err) => console.warn('[Progress Load Error]', err));
    }
  }, [isAuthenticated, user?.id, isOnline]);

  return (
    <AppShell pageTitle="Progress" pageSubtitle="Track your mastery over time">
      <div className="max-w-6xl space-y-8">
        
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Left Col - Mastery & Topics */}
          <div className="lg:col-span-3 space-y-8">
            <Card className="p-8 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-white">
              <div>
                <h3 className="text-lg font-semibold text-dark mb-1">Overall Mastery</h3>
                <p className="text-muted text-sm max-w-sm mb-4">You're making steady progress towards your goal. Keep it up!</p>
                <div className="flex items-center gap-2 text-success font-medium text-sm">
                  <TrendingUp className="h-4 w-4" /> +5% this week
                </div>
              </div>
              
              <div className="relative h-32 w-32 flex-shrink-0">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="64" cy="64" r="60" className="stroke-indigo-100" strokeWidth="8" fill="none" />
                  <circle 
                    cx="64" cy="64" r="60" 
                    className="stroke-primary transition-all duration-1000 ease-out" 
                    strokeWidth="8" 
                    fill="none" 
                    strokeDasharray={`${2 * Math.PI * 60}`}
                    strokeDashoffset={`${2 * Math.PI * 60 * (1 - overallMastery / 100)}`}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center flex-col">
                  <span className="text-3xl font-bold text-dark">{overallMastery}%</span>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg">Bayesian Topic Mastery</h3>
                <span className="text-xs text-muted font-medium bg-gray-100 px-2.5 py-1 rounded-full">
                  Prior: Beta(2, 2)
                </span>
              </div>
              <p className="text-xs text-muted mb-6">
                Mastery is calibrated with empirical evidence. Low attempt counts indicate early calibration rather than fixed ability.
              </p>
              <div className="space-y-6">
                {topicList.map((topic: any, i: number) => {
                  const conf = topic.confidenceLevel || 'INSUFFICIENT_EVIDENCE';
                  const confBadgeClass =
                    conf === 'HIGH'
                      ? 'bg-green-100 text-green-800 border-green-200'
                      : conf === 'MEDIUM'
                      ? 'bg-blue-100 text-blue-800 border-blue-200'
                      : conf === 'LOW'
                      ? 'bg-amber-100 text-amber-800 border-amber-200'
                      : 'bg-yellow-100 text-yellow-800 border-yellow-200';

                  const confLabel =
                    conf === 'HIGH'
                      ? 'High Confidence'
                      : conf === 'MEDIUM'
                      ? 'Medium Confidence'
                      : conf === 'LOW'
                      ? 'Low Evidence'
                      : 'Calibrating Baseline';

                  return (
                    <div key={i} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                      <div className="flex justify-between items-center mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-dark">{topic.name}</span>
                          {topic.currentDifficulty && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 capitalize font-medium">
                              {topic.currentDifficulty}
                            </span>
                          )}
                          <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${confBadgeClass}`}>
                            {confLabel}
                          </span>
                        </div>
                        <span className="text-sm text-muted font-semibold">{topic.mastery}%</span>
                      </div>
                      <ProgressBar
                        value={topic.mastery}
                        colorClass={topic.mastery < 50 ? 'bg-danger' : topic.mastery < 80 ? 'bg-warning' : 'bg-success'}
                      />
                      {(topic.attemptCount !== undefined && topic.attemptCount > 0) && (
                        <div className="flex items-center justify-between text-[11px] text-muted mt-1.5">
                          <span>Evidence: {topic.correctCount || 0} / {topic.attemptCount} correct</span>
                          <span>Streak: {topic.streak || 0} days</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* Right Col - Focus & Chart */}
          <div className="lg:col-span-2 space-y-8">
            {(() => {
              const lowestTopic = [...topicList].sort((a: any, b: any) => a.mastery - b.mastery)[0];
              const oppName = lowestTopic?.name || 'Object-Oriented Programming';
              const oppScore = lowestTopic?.mastery ?? 31;
              const oppId = (lowestTopic as any)?.topicId || 'oop-basics';

              return (
                <Card className="p-6 border-red-200 bg-red-50/30">
                  <div className="flex items-center gap-2 text-danger font-semibold mb-3">
                    <AlertTriangle className="h-5 w-5" /> Recommended Adaptive Focus
                  </div>
                  <h3 className="text-xl font-bold text-dark mb-2">{oppName}</h3>
                  <p className="text-muted text-sm mb-4">
                    Bayesian mastery stands at {oppScore}%. Adaptive engine has configured targeted questions with appropriate scaffolding to build mastery efficiently.
                  </p>
                  <ProgressBar value={oppScore} colorClass={oppScore < 50 ? 'bg-danger' : 'bg-warning'} className="mb-6" />
                  <Button variant="danger" className="w-full" onClick={() => navigate(`/practice/quiz?topic=${oppId}`)}>
                    Start Adaptive Practice
                  </Button>
                </Card>
              );
            })()}

            <ChartCard title="Learning Time (Last 7 Days)">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e0f0" />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <Tooltip 
                    cursor={{ fill: '#f8f7ff' }} 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                  />
                  <Bar dataKey="minutes" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </div>

        <InsightCard 
          type="behavior"
          title="Optimal Learning Schedule"
          description="You learn most efficiently during 30–45 minute sessions. Your accuracy drops by 23% after 45+ minutes. Try shorter, focused sessions."
          className="w-full"
        />
      </div>
    </AppShell>
  );
}
