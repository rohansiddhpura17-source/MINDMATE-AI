import React from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { LucideIcon, AlertCircle, TrendingDown, Trophy, Zap } from 'lucide-react';
import { cn } from '../../utils';

interface InsightCardProps {
  type: 'mistake' | 'behavior' | 'mastery' | 'info';
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
  className?: string;
}

export function InsightCard({ type, title, description, action, onAction, className }: InsightCardProps) {
  const getIcon = () => {
    switch (type) {
      case 'mistake': return AlertCircle;
      case 'behavior': return TrendingDown;
      case 'mastery': return Trophy;
      default: return Zap;
    }
  };

  const getColorClasses = () => {
    switch (type) {
      case 'mistake': return 'text-warning bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800/40';
      case 'behavior': return 'text-danger bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/40';
      case 'mastery': return 'text-success bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800/40';
      default: return 'text-primary bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800/40';
    }
  };

  const Icon = getIcon();
  const colorClasses = getColorClasses();

  return (
    <Card className={cn(`p-4 flex flex-col md:flex-row gap-4 border ${colorClasses.split(' ')[2]}`, className)}>
      <div className={cn("p-3 rounded-full h-fit flex-shrink-0", colorClasses.split(' ')[1], colorClasses.split(' ')[0])}>
        <Icon className="h-6 w-6" />
      </div>
      <div className="flex-1">
        <h4 className="font-semibold text-dark mb-1">{title}</h4>
        <p className="text-sm text-dark/80 mb-3">{description}</p>
        {action && onAction && (
          <Button variant="secondary" size="sm" onClick={onAction} className="bg-surface hover:bg-gray-50 dark:hover:bg-slate-800 text-dark border border-border text-xs">
            {action}
          </Button>
        )}
      </div>
    </Card>
  );
}
