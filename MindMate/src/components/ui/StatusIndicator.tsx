import React from 'react';
import { cn } from '../../utils';

interface StatusIndicatorProps {
  isOnline: boolean;
  label?: boolean;
}

export function StatusIndicator({ isOnline, label = true }: StatusIndicatorProps) {
  return (
    <div className="flex items-center space-x-2">
      <span className="relative flex h-3 w-3">
        {isOnline && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
        )}
        <span
          className={cn("relative inline-flex rounded-full h-3 w-3", isOnline ? "bg-success" : "bg-muted")}
        ></span>
      </span>
      {label && (
        <span className="text-sm font-medium text-muted">
          {isOnline ? 'Online' : 'Offline'}
        </span>
      )}
    </div>
  );
}
