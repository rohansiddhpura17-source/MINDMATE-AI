import React, { HTMLAttributes } from 'react';
import { cn } from '../../utils';

interface CardProps extends HTMLAttributes<HTMLDivElement> {}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('rounded-card border border-border bg-surface shadow-soft', className)}
        {...props}
      />
    );
  }
);
Card.displayName = 'Card';
