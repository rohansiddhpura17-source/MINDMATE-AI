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
          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          {
            'bg-gray-100 text-gray-800': variant === 'default',
            'bg-green-100 text-green-800': variant === 'success',
            'bg-yellow-100 text-yellow-800': variant === 'warning',
            'bg-red-100 text-red-800': variant === 'danger',
            'bg-blue-100 text-blue-800': variant === 'info',
            'bg-indigo-100 text-indigo-800': variant === 'primary',
          },
          className
        )}
        {...props}
      />
    );
  }
);
Badge.displayName = 'Badge';
