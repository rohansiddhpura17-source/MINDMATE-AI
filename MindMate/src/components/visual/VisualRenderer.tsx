import React, { useState } from 'react';
import {
  Image as ImageIcon,
  GitFork,
  Columns,
  BarChart3,
  Zap,
  RefreshCw,
  Eye,
  WifiOff,
  ShieldAlert
} from 'lucide-react';
import { VisualPayload, VisualFormatType } from '../../services/visual/types';
import { ImageGalleryVisual } from './ImageGalleryVisual';
import { DiagramVisual } from './DiagramVisual';
import { ComparisonVisual } from './ComparisonVisual';
import { ChartVisual } from './ChartVisual';
import { AlgorithmVisual } from './AlgorithmVisual';

interface VisualRendererProps {
  visual: VisualPayload;
  onRetry?: () => void;
}

export function VisualRenderer({ visual, onRetry }: VisualRendererProps) {
  // If visual is blocked or subject to moderation refusal, display safe educational notification
  if (visual.blocked || visual.format === 'moderation_refusal') {
    return (
      <div className="w-full max-w-2xl mt-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-xs text-left">
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 shrink-0">
            <ShieldAlert className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-amber-900 tracking-tight">Visual Learning Guard</span>
              <span className="text-[10px] font-semibold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-full border border-amber-300">
                Content Filter Active
              </span>
            </div>
            <p className="mt-1.5 text-xs text-amber-900 leading-relaxed font-medium">
              {visual.moderationExplanation || visual.summary || "MindMate is designed for educational learning. Visual representations are restricted for adult entertainment, explicit media, or non-academic topics."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const [activeFormat, setActiveFormat] = useState<VisualFormatType>(visual.format);

  const formatLabels: Record<VisualFormatType, { label: string; icon: React.ReactNode }> = {
    image_gallery: { label: 'Real Images', icon: <ImageIcon className="h-3.5 w-3.5" /> },
    flowchart: { label: 'Flowchart', icon: <GitFork className="h-3.5 w-3.5" /> },
    diagram: { label: 'Architecture', icon: <GitFork className="h-3.5 w-3.5" /> },
    comparison_table: { label: 'Comparison', icon: <Columns className="h-3.5 w-3.5" /> },
    chart: { label: 'Metrics Chart', icon: <BarChart3 className="h-3.5 w-3.5" /> },
    algorithm_steps: { label: 'Algorithm Steps', icon: <Zap className="h-3.5 w-3.5" /> },
    moderation_refusal: { label: 'Content Guard', icon: <ShieldAlert className="h-3.5 w-3.5" /> }
  };

  // Determine available tabs based on pre-populated payload data
  const availableTabs: VisualFormatType[] = [];
  if (visual.images && visual.images.length > 0) availableTabs.push('image_gallery');
  if (visual.diagram) availableTabs.push('flowchart');
  if (visual.comparison) availableTabs.push('comparison_table');
  if (visual.chart) availableTabs.push('chart');
  if (visual.algorithm) availableTabs.push('algorithm_steps');

  // Fallback if current activeFormat has no data
  const currentFormat =
    (activeFormat === 'image_gallery' && (!visual.images || visual.images.length === 0))
      ? (visual.diagram ? 'flowchart' : availableTabs[0] || 'diagram')
      : activeFormat;

  return (
    <div className="w-full max-w-2xl mt-3 rounded-2xl border border-indigo-100 bg-linear-to-b from-indigo-50/40 via-white to-white p-4 shadow-xs text-left">
      {/* Top Bar: Visual Engine Header & Format Switcher Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-indigo-600 flex items-center justify-center text-white shadow-2xs">
            <Eye className="h-3.5 w-3.5" />
          </div>
          <div>
            <span className="text-xs font-bold text-dark tracking-tight">Visual Learning Engine</span>
            {visual.offlineFallback && (
              <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                <WifiOff className="h-2.5 w-2.5" />
                Offline Mode
              </span>
            )}
          </div>
        </div>

        {/* Multi-Format Switcher Tabs */}
        {availableTabs.length > 1 && (
          <div className="inline-flex rounded-lg bg-gray-100/90 p-0.5 border border-gray-200/60 shadow-2xs">
            {availableTabs.map((fmt) => {
              const meta = formatLabels[fmt];
              const isActive = currentFormat === fmt;
              return (
                <button
                  key={fmt}
                  onClick={() => setActiveFormat(fmt)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-white text-primary shadow-xs font-semibold'
                      : 'text-muted hover:text-dark'
                  }`}
                >
                  {meta.icon}
                  <span>{meta.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Visual Content Display */}
      <div className="py-3">
        {currentFormat === 'image_gallery' && visual.images && (
          <ImageGalleryVisual images={visual.images} topic={visual.topic} />
        )}

        {(currentFormat === 'flowchart' || currentFormat === 'diagram') && visual.diagram && (
          <DiagramVisual diagram={visual.diagram} topic={visual.topic} />
        )}

        {currentFormat === 'comparison_table' && visual.comparison && (
          <ComparisonVisual comparison={visual.comparison} topic={visual.topic} />
        )}

        {currentFormat === 'chart' && visual.chart && (
          <ChartVisual chart={visual.chart} topic={visual.topic} />
        )}

        {currentFormat === 'algorithm_steps' && visual.algorithm && (
          <AlgorithmVisual algorithm={visual.algorithm} topic={visual.topic} />
        )}
      </div>

      {/* Footer: Summary note & Retry action */}
      <div className="pt-2.5 mt-1 border-t border-gray-100 flex items-center justify-between text-[11px] text-muted">
        <span className="truncate pr-2">{visual.summary}</span>
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1 text-primary hover:underline font-medium shrink-0"
          >
            <RefreshCw className="h-3 w-3" />
            Re-generate
          </button>
        )}
      </div>
    </div>
  );
}
