import React from 'react';
import { cn } from '../../utils';

interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  showValue?: boolean;
  className?: string;
  colorClass?: string;
}

export function ProgressBar({
  value,
  max = 100,
  label,
  showValue = false,
  className,
  colorClass = 'bg-primary'
}: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={cn("w-full", className)}>
      {(label || showValue) && (
        <div className="flex justify-between items-center mb-1 text-sm font-medium">
          {label && <span className="text-dark">{label}</span>}
          {showValue && <span className="text-muted">{Math.round(percentage)}%</span>}
        </div>
      )}
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={cn("h-full transition-all duration-500 ease-in-out rounded-full", colorClass)}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
