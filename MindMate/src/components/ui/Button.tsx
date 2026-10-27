import React, { ButtonHTMLAttributes } from 'react';
import { cn } from '../../utils';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-btn font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5] focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-55',
          {
            'bg-[#4F46E5] text-white hover:bg-[#4338CA] active:bg-[#3730A3] shadow-2xs': variant === 'primary',
            'bg-surface border border-[#CBD5E1] text-dark hover:bg-[#F8FAFC] hover:border-[#94A3B8] active:bg-[#F1F5F9] shadow-2xs': variant === 'secondary',
            'text-muted hover:text-dark hover:bg-[#F1F5F9] active:bg-[#E2E8F0]': variant === 'ghost',
            'bg-[#B91C1C] text-white hover:bg-[#991B1B] active:bg-[#7F1D1D] shadow-2xs': variant === 'danger',
            'h-9 px-3 text-sm': size === 'sm',
            'h-10 px-4 py-2': size === 'md',
            'h-11 px-8 text-lg': size === 'lg',
          },
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
