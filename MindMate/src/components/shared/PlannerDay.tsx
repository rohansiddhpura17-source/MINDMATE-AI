import React from 'react';
import { PlannerDayData } from '../../types';
import { TaskCard } from './TaskCard';
import { Plus } from 'lucide-react';

interface PlannerDayProps {
  data: PlannerDayData;
  isToday?: boolean;
  onToggleTask?: (id: string, done: boolean) => void;
  onEditTask?: (id: string) => void;
  onDeleteTask?: (id: string) => void;
  onAddTask?: (day: string) => void;
  onStartPractice?: (id: string) => void;
}

export function PlannerDay({
  data,
  isToday = false,
  onToggleTask,
  onEditTask,
  onDeleteTask,
  onAddTask,
  onStartPractice,
}: PlannerDayProps) {
  const completedCount = data.tasks.filter((t: any) => t.completed).length;
  const totalCount = data.tasks.length;

  return (
    <div className="flex flex-col flex-1 min-w-[210px] bg-gray-50/50 dark:bg-slate-900/40 rounded-2xl p-3 border border-border">
      {/* Day Header */}
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className={`font-bold text-sm ${isToday ? 'text-primary' : 'text-dark'}`}>
            {data.day}
          </span>
          {isToday && (
            <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
              Today
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {totalCount > 0 && (
            <span className="text-xs font-semibold text-muted bg-surface px-1.5 py-0.5 rounded border border-border">
              {completedCount}/{totalCount}
            </span>
          )}
          {onAddTask && (
            <button
              type="button"
              onClick={() => onAddTask(data.day)}
              className="p-1 rounded-md text-muted hover:text-primary hover:bg-surface border border-transparent hover:border-border transition-colors"
              title={`Add task for ${data.day}`}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Task List */}
      <div className="flex flex-col gap-2.5 flex-1">
        {data.tasks.map((task: any, i) => (
          <TaskCard
            key={task.id || `task-${data.day}-${i}`}
            id={task.id}
            name={task.name}
            duration={task.duration}
            type={task.type}
            priority={task.priority}
            dueDate={task.due_date}
            isDone={task.completed}
            activityCompleted={task.activity_completed}
            onToggle={onToggleTask}
            onEdit={onEditTask}
            onDelete={onDeleteTask}
            onStartPractice={onStartPractice}
          />
        ))}

        {data.tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-6 px-3 border border-dashed rounded-xl border-border text-center flex-1">
            <p className="text-xs text-muted mb-2 font-medium">Rest day</p>
            {onAddTask && (
              <button
                type="button"
                onClick={() => onAddTask(data.day)}
                className="text-xs text-primary font-medium hover:underline inline-flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Add task
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
