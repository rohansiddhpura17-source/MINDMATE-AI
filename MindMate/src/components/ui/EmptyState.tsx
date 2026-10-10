import React from 'react';
import { cn } from '../../utils';
import { LucideIcon } from 'lucide-react';
import { Button } from './Button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center p-8 text-center bg-surface border border-dashed border-border rounded-card", className)}>
      <div className="bg-primary/10 p-4 rounded-full mb-4 text-primary">
        <Icon className="h-8 w-8" />
      </div>
      <h3 className="text-lg font-semibold text-dark mb-1">{title}</h3>
      <p className="text-muted text-sm max-w-md mb-4">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} variant="secondary">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
