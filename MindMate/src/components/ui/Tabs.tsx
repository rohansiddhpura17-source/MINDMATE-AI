import React from 'react';
import { cn } from '../../utils';

interface Tab {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}

export function Tabs({ tabs, activeTab, onChange, className }: TabsProps) {
  return (
    <div className={cn("flex border-b border-border", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
            activeTab === tab.id
              ? "border-primary text-primary"
              : "border-transparent text-muted hover:text-dark hover:border-gray-300"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
