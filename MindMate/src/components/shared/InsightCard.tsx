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
      case 'mistake':
        return {
          card: 'border-[#FDE68A] bg-surface',
          iconWrap: 'bg-[#FFFBEB] text-[#92400E] border border-[#FDE68A]',
        };
      case 'behavior':
        return {
          card: 'border-[#FECACA] bg-surface',
          iconWrap: 'bg-[#FEF2F2] text-[#B91C1C] border border-[#FECACA]',
        };
      case 'mastery':
        return {
          card: 'border-[#A7F3D0] bg-surface',
          iconWrap: 'bg-[#ECFDF5] text-[#047857] border border-[#A7F3D0]',
        };
      default:
        return {
          card: 'border-[#BFDBFE] bg-surface',
          iconWrap: 'bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]',
        };
    }
  };

  const Icon = getIcon();
  const colorClasses = getColorClasses();

  return (
    <Card className={cn(`p-4 flex flex-col md:flex-row gap-4 border shadow-xs ${colorClasses.card}`, className)}>
      <div className={cn("p-3 rounded-xl h-fit flex-shrink-0", colorClasses.iconWrap)}>
        <Icon className="h-6 w-6" />
      </div>
      <div className="flex-1">
        <h4 className="font-semibold text-dark mb-1">{title}</h4>
        <p className="text-sm text-muted mb-3">{description}</p>
        {action && onAction && (
          <Button variant="secondary" size="sm" onClick={onAction} className="text-xs">
            {action}
          </Button>
        )}
      </div>
    </Card>
  );
}
