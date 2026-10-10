import React from 'react';
import { Card } from '../ui/Card';
import { LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface PracticeCardProps {
  title: string;
  description: string;
  timeEstimate: string;
  icon: LucideIcon;
  colorClass: string;
}

export function PracticeCard({ title, description, timeEstimate, icon: Icon, colorClass }: PracticeCardProps) {
  const navigate = useNavigate();

  return (
    <Card 
      className="p-5 cursor-pointer hover:shadow-md transition-shadow group flex flex-col h-full"
      onClick={() => navigate('/practice/quiz')}
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`p-3 rounded-xl bg-opacity-10 ${colorClass.replace('text-', 'bg-')} ${colorClass} group-hover:scale-110 transition-transform`}>
          <Icon className="h-6 w-6" />
        </div>
        <span className="text-xs font-medium text-muted bg-gray-100 px-2 py-1 rounded-full">
          {timeEstimate}
        </span>
      </div>
      <h3 className="font-semibold text-lg mb-2 group-hover:text-primary transition-colors">{title}</h3>
      <p className="text-sm text-muted flex-grow">{description}</p>
    </Card>
  );
}
