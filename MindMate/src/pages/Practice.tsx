import React, { useState, useEffect } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ProgressBar } from '../components/ui/ProgressBar';
import { PracticeCard } from '../components/shared/PracticeCard';
import { Brain, Zap, CopyX, Sparkles, ArrowRight, CheckCircle, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { learnerApi, AdaptiveDiagnosticTopic } from '../services/api/learnerApi';
import { useAppContext } from '../context/AppContext';
import { offlineLearner } from '../services/storage/offlineLearner';

export default function Practice() {
  const navigate = useNavigate();
  const { user, isOnline } = useAppContext();

  const [recommendedTopic, setRecommendedTopic] = useState<AdaptiveDiagnosticTopic | null>(null);
  const [topicList, setTopicList] = useState<AdaptiveDiagnosticTopic[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadDiagnostic = async () => {
      // 1. Try local cache first
      if (user?.id) {
        const cached = await offlineLearner.getAllProgressOffline(user.id);
        if (isMounted && cached && cached.length > 0) {
          const mapped: AdaptiveDiagnosticTopic[] = cached.map((c) => ({
            topicId: c.topicId,
            topicName: c.topicName,
            masteryScore: c.masteryScore,
            attemptCount: c.attemptCount,
            correctCount: c.correctCount,
            confidenceLevel: c.confidenceLevel || 'INSUFFICIENT_EVIDENCE',
            confidenceScore: c.confidenceScore || 0.1,
            confidenceDescription: c.confidenceDescription || 'Calibrating baseline',
            currentDifficulty: (c.currentDifficulty as any) || 'medium',
            consecutiveCorrect: 0,
            consecutiveIncorrect: 0,
            status: c.masteryScore >= 80 ? 'MASTERED' : c.masteryScore >= 60 ? 'DEVELOPING' : 'NEEDS_PRACTICE',
            lastPracticed: c.lastPracticed,
          }));
          setTopicList(mapped);
          setRecommendedTopic(mapped.find((t) => t.status === 'NEEDS_PRACTICE') || mapped[0]);
        }
      }

      // 2. Fetch live diagnostic from backend if online
      if (isOnline) {
        try {
          const res = await learnerApi.getAdaptiveDiagnostic();
          if (isMounted && res.success) {
            setTopicList(res.topics);
            if (res.recommendedTopics.length > 0) {
              setRecommendedTopic(res.recommendedTopics[0]);
            } else if (res.topics.length > 0) {
              setRecommendedTopic(res.topics[0]);
            }
          }
        } catch (err) {
          console.warn('[Practice Diagnostic Error]', err);
        }
      }

      if (isMounted) setLoading(false);
    };

    loadDiagnostic();
    return () => {
      isMounted = false;
    };
  }, [user?.id, isOnline]);

  const activeRec = recommendedTopic || {
    topicId: 'python-funcs',
    topicName: 'Python Functions',
    masteryScore: 50,
    confidenceDescription: 'Calibrating baseline evidence',
    currentDifficulty: 'medium',
    attemptCount: 0,
  };

  return (
    <AppShell pageTitle="Practice" pageSubtitle="Strengthen your knowledge through targeted exercises">
      <div className="max-w-5xl space-y-8">
        {/* Recommended Card */}
        <Card className="p-8 border-primary/20 bg-indigo-50/30 overflow-hidden relative">
          <div className="absolute right-0 top-0 w-64 h-full bg-gradient-to-l from-indigo-100/50 to-transparent pointer-events-none" />
          <div className="flex items-center gap-2 text-primary font-semibold mb-2">
            <Sparkles className="h-5 w-5" /> Recommended by Adaptive Engine
          </div>
          <h2 className="text-2xl font-bold text-dark mb-2">{activeRec.topicName}</h2>
          <p className="text-muted max-w-xl mb-6">
            Based on your recent Bayesian performance ({activeRec.masteryScore}% mastery), the adaptive engine recommends targeting this topic at{' '}
            <span className="font-semibold text-primary capitalize">{activeRec.currentDifficulty}</span> difficulty to advance calibrated retention.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Button onClick={() => navigate(`/practice/quiz?topic=${activeRec.topicId}`)}>
              Start Adaptive Session <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <div className="flex flex-col justify-center text-sm text-muted">
              <span>Estimated: 5-10 mins</span>
              <span className="text-primary font-medium">{activeRec.confidenceDescription}</span>
            </div>
          </div>
        </Card>

        {/* Practice Types Grid */}
        <div>
          <h3 className="text-xl font-bold mb-4">Practice Modes</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div onClick={() => navigate('/practice/quiz')} className="cursor-pointer">
              <PracticeCard
                title="Adaptive Quiz"
                description="Dynamic multi-tier questions adjusting difficulty in real-time based on Bayesian performance."
                timeEstimate="5-10 min"
                icon={Brain}
                colorClass="text-purple-600"
              />
            </div>
            <div onClick={() => navigate('/practice/quiz?topic=python-funcs')} className="cursor-pointer">
              <PracticeCard
                title="Quick Recall"
                description="Rapid-fire questions to build automaticity and improve retention."
                timeEstimate="5 min"
                icon={Zap}
                colorClass="text-yellow-600"
              />
            </div>
            <div onClick={() => navigate('/materials')} className="cursor-pointer">
              <PracticeCard
                title="Flashcards"
                description="Review key concepts and definitions extracted from your documents."
                timeEstimate="10 min"
                icon={CopyX}
                colorClass="text-blue-600"
              />
            </div>
            <div onClick={() => navigate(`/practice/quiz?topic=${activeRec.topicId}`)} className="cursor-pointer">
              <PracticeCard
                title="Knowledge Gap Remediation"
                description="Focus directly on areas with lowest mastery or scaffolding requirements."
                timeEstimate="Varies"
                icon={CheckCircle}
                colorClass="text-red-500"
              />
            </div>
          </div>
        </div>

        {/* Topics & Mastery Status Table */}
        <div>
          <h3 className="text-xl font-bold mb-4">Topic Mastery & Evidence Status</h3>
          <Card className="overflow-hidden">
            <div className="divide-y divide-border">
              {(topicList.length > 0
                ? topicList
                : [
                    { topicId: 'python-funcs', topicName: 'Python Functions', masteryScore: 50, confidenceDescription: 'Calibrating (n < 3)', currentDifficulty: 'medium' },
                    { topicId: 'oop-basics', topicName: 'Object-Oriented Programming', masteryScore: 50, confidenceDescription: 'Calibrating (n < 3)', currentDifficulty: 'medium' },
                    { topicId: 'data-structures', topicName: 'Data Structures & Algorithms', masteryScore: 50, confidenceDescription: 'Calibrating (n < 3)', currentDifficulty: 'medium' },
                  ]
              ).map((topic, i) => (
                <div key={i} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-dark">{topic.topicName}</h4>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 capitalize">
                        {topic.currentDifficulty}
                      </span>
                    </div>
                    <p className="text-xs text-muted mt-0.5">{topic.confidenceDescription}</p>
                  </div>
                  <div className="w-32 flex-shrink-0 mr-6">
                    <ProgressBar value={topic.masteryScore} showValue className="h-1.5" />
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/practice/quiz?topic=${topic.topicId}`)}>
                    Practice
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

