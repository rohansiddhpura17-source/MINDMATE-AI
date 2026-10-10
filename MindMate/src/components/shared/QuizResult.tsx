import React from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Trophy, Target, ArrowRight, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useAppContext } from '../../context/AppContext';
import { Cloud, CloudOff } from 'lucide-react';

interface QuizResultProps {
  score: number;
  total: number;
  topic: string;
}

export function QuizResult({ score, total, topic }: QuizResultProps) {
  const navigate = useNavigate();
  const { isOnline, syncState } = useAppContext();
  const percentage = Math.round((score / total) * 100);
  
  let message = "Good effort!";
  if (percentage >= 80) message = "Excellent work!";
  if (percentage === 100) message = "Perfect score!";

  const isLocallyPending = !isOnline || syncState.pendingCount > 0;

  return (
    <Card className="p-8 text-center max-w-md mx-auto">
      <div className="inline-flex p-4 rounded-full bg-yellow-100 text-yellow-600 mb-6">
        <Trophy className="h-12 w-12" />
      </div>
      
      <h2 className="text-3xl font-bold mb-2">{message}</h2>
      <p className="text-muted mb-4">You scored {score} out of {total} in {topic}.</p>

      {/* Sync Status Badge */}
      <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium mb-6 ${
        isLocallyPending ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-green-50 text-green-800 border border-green-200'
      }`}>
        {isLocallyPending ? (
          <>
            <CloudOff className="h-3.5 w-3.5 text-amber-600" />
            <span>Saved locally (Queued for server sync)</span>
          </>
        ) : (
          <>
            <Cloud className="h-3.5 w-3.5 text-green-600" />
            <span>Synchronized with cloud</span>
          </>
        )}
      </div>
      
      <div className="flex justify-center mb-8">
        <div className="relative h-32 w-32">
          <svg className="w-full h-full transform -rotate-90">
            <circle cx="64" cy="64" r="60" className="stroke-gray-200" strokeWidth="8" fill="none" />
            <circle 
              cx="64" cy="64" r="60" 
              className="stroke-primary" 
              strokeWidth="8" 
              fill="none" 
              strokeDasharray={`${2 * Math.PI * 60}`}
              strokeDashoffset={`${2 * Math.PI * 60 * (1 - percentage / 100)}`}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center flex-col">
            <span className="text-2xl font-bold">{percentage}%</span>
          </div>
        </div>
      </div>

      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-8 text-left flex gap-4">
        <div className="mt-1 text-primary">
          <Zap className="h-5 w-5" />
        </div>
        <div>
          <h4 className="font-semibold text-dark mb-1">MindMate Insight</h4>
          <p className="text-sm text-dark/80">
            You show strong understanding of basic syntax, but need more practice with variable scope.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Button className="w-full" onClick={() => navigate('/practice')}>
          Continue Practice <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        <Button variant="secondary" className="w-full" onClick={() => navigate('/home')}>
          Back to Home
        </Button>
      </div>
    </Card>
  );
}
