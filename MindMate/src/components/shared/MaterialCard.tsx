import React from 'react';
import { FileText, File, CheckCircle, Clock, AlertTriangle, XCircle, Trash2, HardDriveDownload } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';

interface MaterialCardProps {
  material: any;
  onClick: (material: any) => void;
  onDelete?: (id: string | number) => void;
  onCacheOffline?: (material: any) => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MaterialCard({ material, onClick, onDelete, onCacheOffline }: MaterialCardProps) {
  const isReady = material.status === 'READY' || material.status === 'processed';
  const isOcrNeeded = material.status === 'OCR_NEEDED';
  const isProcessing = material.status === 'PROCESSING';
  const isFailed = material.status === 'FAILED';

  return (
    <Card 
      className="p-4 flex items-center gap-4 cursor-pointer hover:border-primary/50 transition-colors group relative"
      onClick={() => onClick(material)}
    >
      <div className={`p-3 rounded-lg ${
        isReady ? 'bg-indigo-50 text-primary' :
        isOcrNeeded ? 'bg-amber-50 text-amber-600' :
        isProcessing ? 'bg-blue-50 text-blue-600' :
        'bg-gray-100 text-muted'
      }`}>
        {material.type === 'PDF' ? <FileText className="h-6 w-6" /> : <File className="h-6 w-6" />}
      </div>
      
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-dark truncate group-hover:text-primary transition-colors">
          {material.name}
        </h4>
        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted">
          <span>{material.type}</span>
          <span>•</span>
          <span>{material.pages} {material.pages === 1 ? 'page' : 'pages'}</span>
          {material.fileSize ? (
            <>
              <span>•</span>
              <span>{formatBytes(material.fileSize)}</span>
            </>
          ) : null}
          {material.chunksCount ? (
            <>
              <span>•</span>
              <span>{material.chunksCount} chunks</span>
            </>
          ) : null}
          <span>•</span>
          <span>{material.date}</span>
        </div>
        {isOcrNeeded && (
          <p className="text-xs text-amber-700 mt-1 font-medium">
            Scanned/Image PDF detected. OCR is required for text extraction.
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {material.isOfflineCached && (
          <span className="flex items-center text-xs text-emerald-600 font-medium gap-1 bg-emerald-50 px-2 py-0.5 rounded-full" title="Available Offline">
            <HardDriveDownload className="h-3 w-3" /> Offline
          </span>
        )}

        {isReady && (
          <Badge variant="success" className="flex items-center gap-1">
            <CheckCircle className="h-3 w-3" /> Ready
          </Badge>
        )}
        {isOcrNeeded && (
          <Badge variant="warning" className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> OCR Needed
          </Badge>
        )}
        {isProcessing && (
          <Badge variant="info" className="flex items-center gap-1">
            <Clock className="h-3 w-3 animate-spin" /> Processing
          </Badge>
        )}
        {isFailed && (
          <Badge variant="danger" className="flex items-center gap-1">
            <XCircle className="h-3 w-3" /> Failed
          </Badge>
        )}

        {onDelete && (
          <button
            type="button"
            className="p-1.5 text-muted hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
            title="Delete material"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(material.id);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </Card>
  );
}
