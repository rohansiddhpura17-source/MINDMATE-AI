import React from 'react';
import { Card } from '../ui/Card';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  subtitle?: string;
  colorClass?: string;
}

export function StatCard({ title, value, icon: Icon, subtitle, colorClass = "text-primary" }: StatCardProps) {
  return (
    <Card className="p-4 flex items-center">
      <div className={`p-3 rounded-xl bg-opacity-10 mr-4 ${colorClass.replace('text-', 'bg-')} ${colorClass}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm font-medium text-muted">{title}</p>
        <h3 className="text-2xl font-bold text-dark">{value}</h3>
        {subtitle && <p className="text-xs text-muted mt-1">{subtitle}</p>}
      </div>
    </Card>
  );
}
