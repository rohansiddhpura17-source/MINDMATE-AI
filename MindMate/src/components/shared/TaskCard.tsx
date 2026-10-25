import React, { useState, useEffect } from 'react';
import { Check, Clock, Edit2, Trash2, Calendar, AlertCircle, Play, Sparkles } from 'lucide-react';
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
        return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300';
      case 'recovery':
        return 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300';
      case 'review':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300';
      case 'quiz':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300';
      case 'assessment':
        return 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300';
    }
  };

  const getPriorityBadge = (p: string) => {
    switch (p.toLowerCase()) {
      case 'high':
        return <span className="text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-1.5 py-0.5 rounded">High</span>;
      case 'low':
        return <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded">Low</span>;
      default:
        return <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded">Med</span>;
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
      className={cn(
        "group relative flex items-center p-3 rounded-xl border transition-all duration-200 select-none",
        isDone
          ? "bg-gray-50/80 dark:bg-slate-900/60 border-gray-200 dark:border-slate-800 opacity-75"
          : "bg-surface border-border hover:border-primary/50 shadow-sm hover:shadow"
      )}
    >
      {/* Checkbox */}
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          "h-6 w-6 rounded-full border flex items-center justify-center mr-3 flex-shrink-0 transition-colors focus:outline-none",
          isDone
            ? "bg-success border-success text-white"
            : "border-gray-300 dark:border-slate-600 hover:border-primary text-transparent"
        )}
        title={isDone ? "Mark incomplete" : "Mark complete"}
      >
        <Check className="h-3.5 w-3.5 stroke-[3]" />
      </button>

      {/* Task Content */}
      <div className="flex-1 min-w-0 pr-2">
        <p className={cn("font-medium text-sm text-dark truncate", isDone && "line-through text-muted")}>
          {name}
        </p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider", getTypeStyle(type))}>
            {type}
          </span>
          {getPriorityBadge(priority)}
          {dueDate && (
            <span className="flex items-center text-[10px] text-muted">
              <Calendar className="h-2.5 w-2.5 mr-0.5" />
              {dueDate}
            </span>
          )}
        </div>
      </div>

      {/* Duration */}
      <div className="flex items-center text-xs text-muted whitespace-nowrap mr-1">
        <Clock className="h-3 w-3 mr-1" />
        {duration}
      </div>

      {/* Action Buttons (Show on hover or always on touch) */}
      <div className="flex items-center gap-1 opacity-90 group-hover:opacity-100 transition-opacity">
        {onStartPractice && id && !isDone && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onStartPractice(id); }}
            className="p-1 px-1.5 rounded-lg text-primary bg-primary/10 hover:bg-primary/20 transition-colors flex items-center gap-1 text-[11px] font-bold"
            title="Start Practice Session"
          >
            <Play className="h-3 w-3 fill-primary" />
            <span className="hidden sm:inline">Practice</span>
          </button>
        )}
        {activityCompleted && (
          <span className="text-emerald-500 p-1" title="Activity Verified">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
        )}
        {onEdit && id && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit(id); }}
            className="p-1 rounded text-muted hover:text-primary hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
            title="Edit task"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </button>
        )}
        {onDelete && id && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(id); }}
            className="p-1 rounded text-muted hover:text-danger hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
            title="Delete task"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
