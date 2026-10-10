import React from 'react';
import { cn } from '../../utils';

interface AvatarProps {
  src?: string;
  fallback: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Avatar({ src, fallback, size = 'md', className }: AvatarProps) {
  return (
    <div
      className={cn(
        "relative flex shrink-0 overflow-hidden rounded-full bg-primary/10 items-center justify-center text-primary font-medium",
        {
          "h-8 w-8 text-xs": size === 'sm',
          "h-10 w-10 text-sm": size === 'md',
          "h-12 w-12 text-base": size === 'lg',
        },
        className
      )}
    >
      {src ? (
        <img src={src} alt="Avatar" className="aspect-square h-full w-full object-cover" />
      ) : (
        <span>{fallback}</span>
      )}
    </div>
  );
}
