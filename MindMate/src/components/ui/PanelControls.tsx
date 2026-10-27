import React from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { cn } from '../../utils';

export interface PanelControlsProps {
  /** Accessible name of the panel, e.g. "Mate AI Chat", "Ollama Status" */
  panelTitle: string;

  // Zoom controls (Content Zoom 80% - 125%)
  showZoom?: boolean;
  zoomLevel?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
  canZoomIn?: boolean;
  canZoomOut?: boolean;
  isDefaultZoom?: boolean;

  // Maximize / Restore controls (Workspace Zoom)
  showMaximize?: boolean;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;

  // Collapse / Expand controls
  showCollapse?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;

  /** Additional container classes */
  className?: string;

  /** Size variant */
  size?: 'sm' | 'md';
}

export const PanelControls: React.FC<PanelControlsProps> = ({
  panelTitle,
  showZoom = false,
  zoomLevel = 100,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  canZoomIn = true,
  canZoomOut = true,
  isDefaultZoom = true,
  showMaximize = false,
  isMaximized = false,
  onToggleMaximize,
  showCollapse = false,
  isCollapsed = false,
  onToggleCollapse,
  className,
  size = 'md',
}) => {
  const btnSizeClass = size === 'sm' ? 'h-6 w-6 text-xs' : 'h-7 w-7 text-xs';
  const iconSizeClass = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';

  return (
    <div
      className={cn('inline-flex items-center gap-1 text-muted', className)}
      role="toolbar"
      aria-label={`${panelTitle} panel controls`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Zoom in / out / reset group */}
      {showZoom && (
        <div
          className="inline-flex items-center rounded-lg border border-[#CBD5E1] bg-surface p-0.5 shadow-2xs mr-1"
          role="group"
          aria-label={`${panelTitle} content zoom controls`}
        >
          <button
            type="button"
            onClick={onZoomOut}
            disabled={!canZoomOut}
            aria-label={`Zoom out ${panelTitle} text (current ${zoomLevel}%)`}
            title={`Zoom out text (${zoomLevel}%)`}
            className={cn(
              'inline-flex items-center justify-center rounded-md transition-colors',
              btnSizeClass,
              canZoomOut
                ? 'hover:bg-[#F1F5F9] hover:text-[#4F46E5] text-muted'
                : 'opacity-40 cursor-not-allowed text-slate-300'
            )}
          >
            <ZoomOut className={iconSizeClass} />
          </button>

          <button
            type="button"
            onClick={onResetZoom}
            disabled={isDefaultZoom}
            aria-label={`Reset ${panelTitle} text zoom to 100%`}
            title={`Reset zoom to 100% (currently ${zoomLevel}%)`}
            className={cn(
              'px-1.5 h-6 text-[11px] font-mono font-semibold transition-colors rounded-md',
              isDefaultZoom
                ? 'text-muted/80 cursor-default'
                : 'text-[#4F46E5] hover:bg-[#EEF2FF]'
            )}
          >
            {zoomLevel}%
          </button>

          <button
            type="button"
            onClick={onZoomIn}
            disabled={!canZoomIn}
            aria-label={`Zoom in ${panelTitle} text (current ${zoomLevel}%)`}
            title={`Zoom in text (${zoomLevel}%)`}
            className={cn(
              'inline-flex items-center justify-center rounded-md transition-colors',
              btnSizeClass,
              canZoomIn
                ? 'hover:bg-[#F1F5F9] hover:text-[#4F46E5] text-muted'
                : 'opacity-40 cursor-not-allowed text-slate-300'
            )}
          >
            <ZoomIn className={iconSizeClass} />
          </button>
        </div>
      )}

      {/* Maximize / Restore Workspace Zoom button */}
      {showMaximize && onToggleMaximize && (
        <button
          type="button"
          onClick={onToggleMaximize}
          aria-pressed={isMaximized}
          aria-label={
            isMaximized
              ? `Restore ${panelTitle} to standard size`
              : `Expand ${panelTitle} across workspace`
          }
          title={
            isMaximized
              ? 'Restore standard view (Zoom out workspace)'
              : 'Maximize to full width (Zoom in workspace)'
          }
          className={cn(
            'inline-flex items-center justify-center rounded-lg border border-[#CBD5E1] bg-surface transition-colors shadow-2xs',
            btnSizeClass,
            isMaximized
              ? 'bg-[#EEF2FF] text-[#4F46E5] border-[#C7D2FE]'
              : 'text-muted hover:text-[#4F46E5] hover:border-[#4F46E5]'
          )}
        >
          {isMaximized ? (
            <Minimize2 className={iconSizeClass} />
          ) : (
            <Maximize2 className={iconSizeClass} />
          )}
        </button>
      )}

      {/* Collapse / Expand Toggle button */}
      {showCollapse && onToggleCollapse && (
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!isCollapsed}
          aria-label={
            isCollapsed
              ? `Expand ${panelTitle} panel`
              : `Collapse ${panelTitle} panel`
          }
          title={isCollapsed ? 'Expand panel' : 'Collapse panel'}
          className={cn(
            'inline-flex items-center justify-center rounded-lg border border-[#CBD5E1] bg-surface text-muted hover:text-[#4F46E5] hover:border-[#4F46E5] transition-colors shadow-2xs',
            btnSizeClass
          )}
        >
          {isCollapsed ? (
            <ChevronDown className={iconSizeClass} />
          ) : (
            <ChevronUp className={iconSizeClass} />
          )}
        </button>
      )}
    </div>
  );
};
