import React from 'react';
import { cn } from '../../utils';
import { RefreshCw, AlertCircle, CloudOff } from 'lucide-react';

interface StatusIndicatorProps {
  isOnline: boolean;
  label?: boolean;
  isSyncing?: boolean;
  pendingCount?: number;
  hasError?: boolean;
}

export function StatusIndicator({
  isOnline,
  label = true,
  isSyncing = false,
  pendingCount = 0,
  hasError = false,
}: StatusIndicatorProps) {
  let statusText = 'Online';
  let badgeColor = 'bg-success';

  if (!isOnline) {
    statusText = pendingCount > 0 ? `Offline (${pendingCount} pending)` : 'Offline';
    badgeColor = 'bg-muted';
  } else if (hasError) {
    statusText = 'Sync error (Retry)';
    badgeColor = 'bg-danger';
  } else if (isSyncing) {
    statusText = 'Syncing…';
    badgeColor = 'bg-primary';
  } else if (pendingCount > 0) {
    statusText = `${pendingCount} pending sync`;
    badgeColor = 'bg-warning';
  }

  return (
    <div className="flex items-center space-x-2">
      <span className="relative flex h-3 w-3 items-center justify-center">
        {isSyncing ? (
          <RefreshCw className="h-3 w-3 text-primary animate-spin" />
        ) : hasError ? (
          <AlertCircle className="h-3 w-3 text-danger" />
        ) : !isOnline ? (
          <CloudOff className="h-3 w-3 text-muted" />
        ) : (
          <>
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
            <span className={cn("relative inline-flex rounded-full h-2.5 w-2.5", badgeColor)} />
          </>
        )}
      </span>
      {label && (
        <span
          className={cn(
            "text-xs font-medium truncate",
            hasError ? "text-danger" : isSyncing ? "text-primary" : "text-muted"
          )}
        >
          {statusText}
        </span>
      )}
    </div>
  );
}
