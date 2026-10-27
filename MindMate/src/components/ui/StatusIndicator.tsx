import React from 'react';
import { cn } from '../../utils';

interface StatusIndicatorProps {
  isOnline: boolean;
  label?: boolean;
}

export function StatusIndicator({ isOnline, label = true }: StatusIndicatorProps) {
  return (
    <div className="flex items-center space-x-2">
      <span className="relative flex h-2.5 w-2.5">
        {isOnline && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10B981] opacity-60"></span>
        )}
        <span
          className={cn("relative inline-flex rounded-full h-2.5 w-2.5", isOnline ? "bg-[#047857]" : "bg-[#92400E]")}
        ></span>
      </span>
      {label && (
        <span className={cn("text-xs font-semibold", isOnline ? "text-[#047857]" : "text-[#92400E]")}>
          {isOnline ? 'Online' : 'Offline'}
        </span>
      )}
    </div>
  );
}
