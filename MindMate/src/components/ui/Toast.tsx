import React from 'react';
import { useAppContext } from '../../context/AppContext';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { cn } from '../../utils';

export function ToastContainer() {
  const { toasts, removeToast } = useAppContext();

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "flex items-center gap-3 bg-surface border rounded-card shadow-soft p-4 min-w-[300px] animate-in slide-in-from-bottom-5",
            {
              'border-green-200 bg-green-50': toast.type === 'success',
              'border-red-200 bg-red-50': toast.type === 'error',
              'border-blue-200 bg-blue-50': toast.type === 'info',
            }
          )}
        >
          {toast.type === 'success' && <CheckCircle className="h-5 w-5 text-success" />}
          {toast.type === 'error' && <AlertCircle className="h-5 w-5 text-danger" />}
          {toast.type === 'info' && <Info className="h-5 w-5 text-primary" />}
          
          <p className="flex-1 text-sm font-medium text-dark">{toast.message}</p>
          
          <button
            onClick={() => removeToast(toast.id)}
            className="text-muted hover:text-dark transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
