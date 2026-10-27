import React, { useState, useEffect } from 'react';
import { Check, Clock, Edit2, Trash2, Calendar, Play, Sparkles } from 'lucide-react';
import { cn } from '../../utils';

interface TaskCardProps {
  id?: string;
  name: string;
  duration: string;
  type: string;
  isDone?: boolean;
  priority?: 'low' | 'medium' | 'high';
  dueDate?: string;
  activityCompleted?: boolean;
  onToggle?: (id: string, done: boolean) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onStartPractice?: (id: string) => void;
}

export function TaskCard({
  id,
  name,
  duration,
  type,
  isDone: initialIsDone = false,
  priority = 'medium',
  dueDate,
  activityCompleted = false,
  onToggle,
  onEdit,
  onDelete,
  onStartPractice,
}: TaskCardProps) {
  const [isDone, setIsDone] = useState(initialIsDone);

  useEffect(() => {
    setIsDone(initialIsDone);
  }, [initialIsDone]);

  const getTypeStyle = (t: string) => {
    switch (t.toLowerCase()) {
      case 'practice':
        return 'bg-[#EEF2FF] text-[#4338CA] border-[#C7D2FE]';
      case 'recovery':
        return 'bg-[#FFFBEB] text-[#92400E] border-[#FDE68A]';
      case 'review':
        return 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]';
      case 'quiz':
        return 'bg-[#EEF2FF] text-[#3730A3] border-[#C7D2FE]';
      case 'assessment':
        return 'bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]';
      default:
        return 'bg-[#F8FAFC] text-[#475569] border-[#E2E8F0]';
    }
  };

  const getPriorityBadge = (p: string) => {
    switch (p.toLowerCase()) {
      case 'high':
        return (
          <span className="inline-flex items-center text-[10px] font-bold text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] px-1.5 py-0.5 rounded-md">
            High
          </span>
        );
      case 'low':
        return (
          <span className="inline-flex items-center text-[10px] font-bold text-[#047857] bg-[#ECFDF5] border border-[#A7F3D0] px-1.5 py-0.5 rounded-md">
            Low
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center text-[10px] font-bold text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] px-1.5 py-0.5 rounded-md">
            Med
          </span>
        );
    }
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newDone = !isDone;
    setIsDone(newDone);
    if (onToggle && id) onToggle(id, newDone);
  };

  return (
    <div
      data-testid="planner-task-card"
      data-task-done={isDone ? 'true' : 'false'}
      className={cn(
        'group flex flex-col justify-between p-3.5 rounded-xl border transition-all duration-150 select-none gap-2.5',
        isDone
          ? 'bg-[#F8FAFC] dark:bg-slate-900/60 border-[#E2E8F0] dark:border-slate-800 opacity-75'
          : 'bg-[#FFFFFF] dark:bg-slate-900 border-[#E2E8F0] dark:border-slate-800 shadow-2xs hover:shadow-xs hover:border-[#4F46E5]/40'
      )}
    >
      {/* Top Row: Checkbox + Title */}
      <div className="flex items-start gap-2.5 min-w-0">
        <button
          type="button"
          onClick={handleToggle}
          className={cn(
            'h-5 w-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]',
            isDone
              ? 'bg-[#047857] border-[#047857] text-white shadow-2xs'
              : 'border-[#CBD5E1] bg-white hover:border-[#4F46E5] text-transparent'
          )}
          title={isDone ? 'Mark incomplete' : 'Mark complete'}
          aria-label={isDone ? `Mark "${name}" as incomplete` : `Mark "${name}" as complete`}
        >
          <Check className="h-3.5 w-3.5 stroke-[3]" />
        </button>

        <div className="flex-1 min-w-0">
          <p
            className={cn(
              'font-semibold text-xs text-[#0F172A] dark:text-white break-words leading-snug',
              isDone && 'line-through text-[#64748B] dark:text-slate-400'
            )}
          >
            {name}
          </p>

          {/* Badges Row */}
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <span
              className={cn(
                'text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider border',
                getTypeStyle(type)
              )}
            >
              {type}
            </span>
            {getPriorityBadge(priority)}
            {activityCompleted && (
              <span
                className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#047857] bg-[#ECFDF5] border border-[#A7F3D0] px-1.5 py-0.5 rounded-md"
                title="Activity Verified in Practice"
              >
                <Sparkles className="h-2.5 w-2.5 text-[#047857]" />
                Verified
              </span>
            )}
            {dueDate && (
              <span className="inline-flex items-center text-[10px] text-[#475569] dark:text-slate-400 font-medium">
                <Calendar className="h-2.5 w-2.5 mr-0.5 text-[#64748B]" />
                {dueDate}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Footer Row: Duration & Action Buttons */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#F1F5F9] dark:border-slate-800/80">
        <div className="inline-flex items-center text-[11px] font-medium text-[#475569] dark:text-slate-400 shrink-0">
          <Clock className="h-3 w-3 mr-1 text-[#4F46E5] shrink-0" />
          <span>{duration}</span>
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-auto">
          {onStartPractice && id && !isDone && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStartPractice(id);
              }}
              className="px-2 py-1 rounded-lg text-[#4F46E5] bg-[#EEF2FF] hover:bg-[#E0E7FF] border border-[#C7D2FE] transition-colors flex items-center gap-1 text-[11px] font-bold shadow-2xs"
              title="Start Practice Session"
            >
              <Play className="h-2.5 w-2.5 fill-current" />
              <span>Practice</span>
            </button>
          )}

          {onEdit && id && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(id);
              }}
              className="p-1 rounded-md text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] dark:hover:bg-slate-800 transition-colors"
              title="Edit task"
              aria-label={`Edit ${name}`}
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>
          )}

          {onDelete && id && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(id);
              }}
              className="p-1 rounded-md text-[#64748B] hover:text-[#B91C1C] hover:bg-[#FEF2F2] dark:hover:bg-red-950/40 transition-colors"
              title="Delete task"
              aria-label={`Delete ${name}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
