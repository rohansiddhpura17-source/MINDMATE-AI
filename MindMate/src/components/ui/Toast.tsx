import React from 'react';
import { useAppContext } from '../../context/AppContext';
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { cn } from '../../utils';

export function ToastContainer() {
  const { toasts, removeToast } = useAppContext();

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 pointer-events-none max-w-sm sm:max-w-md w-full px-3 sm:px-0"
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.type === 'error' ? 'alert' : 'status'}
          className={cn(
            'pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 shadow-md transition-all duration-200 animate-in slide-in-from-bottom-3',
            {
              'border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]': toast.type === 'success',
              'border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]': toast.type === 'error',
              'border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]': toast.type === 'info',
            }
          )}
        >
          <div className="shrink-0 mt-0.5">
            {toast.type === 'success' && <CheckCircle2 className="h-4 w-4 text-[#047857]" />}
            {toast.type === 'error' && <AlertCircle className="h-4 w-4 text-[#B91C1C]" />}
            {toast.type === 'info' && <Info className="h-4 w-4 text-[#1D4ED8]" />}
          </div>

          <p className="flex-1 text-xs font-semibold text-[#0F172A] leading-snug break-words">
            {toast.message}
          </p>

          <button
            type="button"
            onClick={() => removeToast(toast.id)}
            className="shrink-0 p-1 rounded-md text-[#64748B] hover:text-[#0F172A] hover:bg-black/5 transition-colors"
            aria-label="Dismiss notification"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
