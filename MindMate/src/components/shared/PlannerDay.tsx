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
    <div
      className={`flex flex-col flex-1 min-w-[240px] rounded-2xl p-3.5 border transition-all ${
        isToday
          ? 'bg-slate-50/90 dark:bg-slate-900/60 border-indigo-200 dark:border-indigo-900/60 shadow-sm ring-1 ring-indigo-500/10'
          : 'bg-slate-50/60 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800'
      }`}
    >
      {/* Day Header */}
      <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <span
            className={`font-bold text-sm tracking-tight ${
              isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {data.day}
          </span>
          {isToday && (
            <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 px-2 py-0.5 rounded-full">
              Today
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {totalCount > 0 && (
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 shadow-2xs">
              {completedCount}/{totalCount}
            </span>
          )}
          {onAddTask && (
            <button
              type="button"
              onClick={() => onAddTask(data.day)}
              className="p-1 rounded-md text-slate-500 hover:text-indigo-600 hover:bg-white dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-colors cursor-pointer"
              title={`Add task for ${data.day}`}
              aria-label={`Add task for ${data.day}`}
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
          <div className="flex flex-col items-center justify-center py-7 px-3 border border-dashed rounded-xl border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-850/40 text-center flex-1">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 font-medium">Rest day</p>
            {onAddTask && (
              <button
                type="button"
                onClick={() => onAddTask(data.day)}
                className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer"
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
