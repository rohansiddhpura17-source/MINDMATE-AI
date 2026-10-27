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
  const getIconBadgeStyle = (c: string) => {
    if (c.includes('orange') || c.includes('amber') || c.includes('yellow') || c.includes('warning')) {
      return 'bg-[#FFFBEB] text-[#92400E] border border-[#FDE68A]';
    }
    if (c.includes('emerald') || c.includes('green') || c.includes('success')) {
      return 'bg-[#ECFDF5] text-[#047857] border border-[#A7F3D0]';
    }
    if (c.includes('red') || c.includes('danger')) {
      return 'bg-[#FEF2F2] text-[#B91C1C] border border-[#FECACA]';
    }
    if (c.includes('blue') || c.includes('info')) {
      return 'bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]';
    }
    return 'bg-[#EEF2FF] text-[#4F46E5] border border-[#C7D2FE]';
  };

  return (
    <Card className="p-5 flex items-center border border-border bg-surface shadow-xs">
      <div className={`p-3 rounded-xl mr-4 shrink-0 ${getIconBadgeStyle(colorClass)}`}>
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
