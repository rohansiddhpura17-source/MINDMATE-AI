import React from 'react';
import { Card } from '../ui/Card';
import { Check, Clock, ArrowRight, Calendar, AlertCircle } from 'lucide-react';
import { cn } from '../../utils';

export interface TaskCardProps {
  id?: string;
  name: string;
  duration: string;
  type: string;
  isDone?: boolean;
  isOverdue?: boolean;
  recommendationReason?: string;
  actionUrl?: string;
  onToggleDone?: (id?: string) => void;
  onReschedule?: (id?: string) => void;
  onStart?: (actionUrl?: string) => void;
}

export function TaskCard({
  id,
  name,
  duration,
  type,
  isDone = false,
  isOverdue = false,
  recommendationReason,
  actionUrl,
  onToggleDone,
  onReschedule,
  onStart,
}: TaskCardProps) {
  const getTypeColor = (t: string) => {
    switch (t.toUpperCase()) {
      case 'PRACTICE':
        return 'bg-indigo-100 text-indigo-700 border-indigo-200';
      case 'RECOVERY':
        return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'REVIEW':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'QUIZ':
        return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'DOCUMENT_STUDY':
        return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'RECALL':
        return 'bg-amber-100 text-amber-700 border-amber-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <div
      className={cn(
        'p-3.5 rounded-xl border transition-all flex flex-col gap-2',
        isDone
          ? 'bg-gray-50 border-gray-200 opacity-75'
          : isOverdue
          ? 'bg-amber-50/50 border-amber-200 shadow-sm'
          : 'bg-white border-border hover:border-primary/50 shadow-sm'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Checkbox */}
        <button
          type="button"
          aria-label={isDone ? 'Mark as incomplete' : 'Mark as complete'}
          onClick={(e) => {
            e.stopPropagation();
            if (onToggleDone) onToggleDone(id);
          }}
          className={cn(
            'h-5 w-5 rounded-full border flex items-center justify-center mt-0.5 flex-shrink-0 transition-colors',
            isDone
              ? 'bg-success border-success text-white'
              : 'border-gray-300 text-transparent hover:border-primary'
          )}
        >
          <Check className="h-3.5 w-3.5 stroke-[3]" />
        </button>

        {/* Task Title & Badges */}
        <div className="flex-1 min-w-0">
          <p className={cn('font-semibold text-sm leading-snug', isDone && 'line-through text-muted')}>
            {name}
          </p>

          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <span
              className={cn(
                'text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider border',
                getTypeColor(type)
              )}
            >
              {type}
            </span>

            {isOverdue && !isDone && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-red-100 text-red-800 border border-red-200">
                <AlertCircle className="h-3 w-3" /> Due Review
              </span>
            )}

            <div className="flex items-center text-xs text-muted whitespace-nowrap ml-1">
              <Clock className="h-3 w-3 mr-1" />
              {duration}
            </div>
          </div>
        </div>
      </div>

      {/* Recommendation Rationale */}
      {recommendationReason && (
        <div className="text-[11px] text-muted italic pl-8 pr-1 line-clamp-2">
          {recommendationReason}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-2 pt-1 border-t border-gray-100 mt-1">
        {onReschedule && !isDone && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onReschedule(id);
            }}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
          >
            <Calendar className="h-3 w-3" /> Reschedule
          </button>
        )}

        {actionUrl && !isDone && onStart && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStart(actionUrl);
            }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-indigo-800 px-2.5 py-1 rounded bg-indigo-50 hover:bg-indigo-100 transition-colors"
          >
            Start <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

