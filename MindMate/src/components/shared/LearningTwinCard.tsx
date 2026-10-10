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
  return (
    <Card className={cn("p-5 overflow-hidden relative group", className)}>
      <div className={cn("absolute top-0 right-0 w-24 h-24 rounded-bl-full opacity-10 transition-transform group-hover:scale-110", colorClass.replace('text-', 'bg-'))} />
      <div className="flex items-center gap-3 mb-4">
        <div className={cn("p-2 rounded-lg bg-opacity-15", colorClass.replace('text-', 'bg-'), colorClass)}>
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="font-semibold text-lg">{title}</h3>
      </div>
      <ul className="space-y-2 z-10 relative">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-dark/80">
            <span className={cn("mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0", colorClass.replace('text-', 'bg-'))} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
