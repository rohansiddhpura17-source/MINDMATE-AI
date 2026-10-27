import React, { HTMLAttributes } from 'react';
import { cn } from '../../utils';

interface BadgeProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'primary';
}

export const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1',
          {
            'bg-[#F8FAFC] text-[#475569] border-[#E2E8F0] dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700': variant === 'default',
            'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0] dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800': variant === 'success',
            'bg-[#FFFBEB] text-[#92400E] border-[#FDE68A] dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800': variant === 'warning',
            'bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA] dark:bg-red-950/60 dark:text-red-300 dark:border-red-800': variant === 'danger',
            'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE] dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800': variant === 'info',
            'bg-[#EEF2FF] text-[#4338CA] border-[#C7D2FE] dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800': variant === 'primary',
          },
          className
        )}
        {...props}
      />
    );
  }
);
Badge.displayName = 'Badge';
