import React from 'react';
import { Search as SearchIcon } from 'lucide-react';
import { cn } from '../../utils';

interface SearchProps extends React.InputHTMLAttributes<HTMLInputElement> {
  containerClassName?: string;
}

export function Search({ className, containerClassName, ...props }: SearchProps) {
  return (
    <div className={cn("relative", containerClassName)}>
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <SearchIcon className="h-4 w-4 text-muted" />
      </div>
      <input
        type="text"
        className={cn(
          "block w-full pl-10 pr-3 py-2 border border-border rounded-btn text-sm placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-background",
          className
        )}
        {...props}
      />
    </div>
  );
}
