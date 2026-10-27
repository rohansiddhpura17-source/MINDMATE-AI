import React from 'react';
import { Card } from '../ui/Card';
import { LucideIcon } from 'lucide-react';
import { cn } from '../../utils';

interface LearningTwinCardProps {
  title: string;
  icon: LucideIcon;
  items: string[];
  colorClass: string;
  className?: string;
}

export function LearningTwinCard({ title, icon: Icon, items, colorClass, className }: LearningTwinCardProps) {
  const getToneStyle = (c: string) => {
    if (c.includes('green') || c.includes('emerald')) {
      return {
        badge: 'bg-[#ECFDF5] text-[#047857] border border-[#A7F3D0]',
        dot: 'bg-[#047857]',
        corner: 'bg-[#ECFDF5]',
      };
    }
    if (c.includes('red')) {
      return {
        badge: 'bg-[#FEF2F2] text-[#B91C1C] border border-[#FECACA]',
        dot: 'bg-[#B91C1C]',
        corner: 'bg-[#FEF2F2]',
      };
    }
    if (c.includes('blue')) {
      return {
        badge: 'bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]',
        dot: 'bg-[#1D4ED8]',
        corner: 'bg-[#EFF6FF]',
      };
    }
    return {
      badge: 'bg-[#EEF2FF] text-[#4F46E5] border border-[#C7D2FE]',
      dot: 'bg-[#4F46E5]',
      corner: 'bg-[#EEF2FF]',
    };
  };

  const tone = getToneStyle(colorClass);

  return (
    <Card className={cn("p-5 overflow-hidden relative group border border-border bg-surface shadow-xs", className)}>
      <div className={cn("absolute top-0 right-0 w-24 h-24 rounded-bl-full opacity-70 transition-transform group-hover:scale-110", tone.corner)} />
      <div className="flex items-center gap-3 mb-4 relative z-10">
        <div className={cn("p-2.5 rounded-xl", tone.badge)}>
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="font-semibold text-lg text-dark">{title}</h3>
      </div>
      <ul className="space-y-2 z-10 relative">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm text-dark">
            <span className={cn("mt-2 w-1.5 h-1.5 rounded-full flex-shrink-0", tone.dot)} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
