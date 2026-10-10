import React from 'react';
import { TaskCard } from './TaskCard';

export interface PlannerDayComponentProps {
  data: {
    day?: string;
    dayOfWeek?: string;
    date?: string;
    tasks: any[];
    allocatedMinutes?: number;
    isTargetDay?: boolean;
    isTargetStudyDay?: boolean;
  };
  isToday?: boolean;
  onToggleDone?: (id?: string) => void;
  onReschedule?: (id?: string) => void;
  onStart?: (actionUrl?: string) => void;
}

export function PlannerDay({
  data,
  isToday = false,
  onToggleDone,
  onReschedule,
  onStart,
}: PlannerDayComponentProps) {
  const dayName = data.dayOfWeek || data.day || 'Day';
  const isTarget = data.isTargetStudyDay ?? data.isTargetDay ?? true;

  return (
    <div className="flex flex-col flex-1 min-w-[170px] bg-gray-50/50 p-2.5 rounded-2xl border border-gray-100">
      <div
        className={`text-center py-2 mb-2 border-b font-semibold text-sm flex items-center justify-between ${
          isToday ? 'border-primary text-primary' : 'border-gray-200 text-gray-700'
        }`}
      >
        <span>{dayName}</span>
        {data.allocatedMinutes !== undefined && data.allocatedMinutes > 0 && (
          <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-white border text-muted">
            {data.allocatedMinutes}m
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        {data.tasks.map((task, i) => (
          <TaskCard
            key={task.id || i}
            id={task.id}
            name={task.title || task.name}
            duration={task.duration || `${task.estimatedMinutes || 15} min`}
            type={task.type}
            isDone={task.isCompleted ?? task.isDone}
            isOverdue={task.isOverdue}
            recommendationReason={task.recommendationReason}
            actionUrl={task.actionUrl}
            onToggleDone={onToggleDone}
            onReschedule={onReschedule}
            onStart={onStart}
          />
        ))}

        {data.tasks.length === 0 && (
          <div className="text-center text-xs text-muted py-6 border border-dashed rounded-xl border-gray-200 bg-white">
            {isTarget ? 'No sessions scheduled' : 'Rest day'}
          </div>
        )}
      </div>
    </div>
  );
}
