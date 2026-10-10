import React from 'react';
import { Card } from '../ui/Card';

interface ChartCardProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function ChartCard({ title, children, className }: ChartCardProps) {
  return (
    <Card className={`p-5 ${className}`}>
      <h3 className="text-lg font-semibold text-dark mb-4">{title}</h3>
      <div className="w-full h-[300px]">
        {children}
      </div>
    </Card>
  );
}
