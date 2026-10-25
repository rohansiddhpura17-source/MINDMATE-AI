import React from 'react';
import { Material } from '../../types';
import { FileText, File, CheckCircle, Clock } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';

interface MaterialCardProps {
  material: Material;
  onClick: (material: Material) => void;
}

export function MaterialCard({ material, onClick }: MaterialCardProps) {
  const isProcessed = material.status === 'processed';

  return (
    <Card
      className="p-4 flex items-center gap-4 cursor-pointer hover:border-primary/50 transition-colors group"
      onClick={() => onClick(material)}
    >
      <div className={`p-3 rounded-lg ${isProcessed ? 'bg-indigo-50 text-primary' : 'bg-gray-100 text-muted'}`}>
        {material.type === 'PDF' ? <FileText className="h-6 w-6" /> : <File className="h-6 w-6" />}
      </div>

      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-dark truncate group-hover:text-primary transition-colors">
          {material.name}
        </h4>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted">
          <span>{material.type}</span>
          <span>•</span>
          <span>{material.pages} pages</span>
          <span>•</span>
          <span>{material.date}</span>
        </div>
      </div>

      <div className="flex flex-col items-end gap-2 shrink-0">
        <Badge variant={isProcessed ? 'success' : 'warning'} className="flex items-center gap-1">
          {isProcessed ? <CheckCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
          {isProcessed ? 'Processed' : 'Ready to process'}
        </Badge>
      </div>
    </Card>
  );
}
