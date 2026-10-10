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
      case 'mistake': return 'text-warning bg-yellow-50 border-yellow-200';
      case 'behavior': return 'text-danger bg-red-50 border-red-200';
      case 'mastery': return 'text-success bg-green-50 border-green-200';
      default: return 'text-primary bg-indigo-50 border-indigo-200';
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
          <Button variant="secondary" size="sm" onClick={onAction} className="bg-white hover:bg-gray-50 text-xs">
            {action}
          </Button>
        )}
      </div>
    </Card>
  );
}
