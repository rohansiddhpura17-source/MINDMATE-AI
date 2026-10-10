import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { Copy, Check, ZoomIn, ZoomOut, RotateCcw, AlertCircle, Code } from 'lucide-react';
import { VisualDiagramData } from '../../services/visual/types';

interface DiagramVisualProps {
  diagram: VisualDiagramData;
  topic: string;
}

// Initialize mermaid once with safe settings
mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'loose', // allow styling classes
  theme: 'neutral',
  themeVariables: {
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: '13px',
    primaryColor: '#e0e7ff',
    primaryTextColor: '#1e1b4b',
    primaryBorderColor: '#6366f1',
    lineColor: '#4f46e5',
    secondaryColor: '#f1f5f9',
    tertiaryColor: '#f8fafc'
  }
});

export function DiagramVisual({ diagram, topic }: DiagramVisualProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string>('');
  const [renderError, setRenderError] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [copied, setCopied] = useState<boolean>(false);
  const [showCode, setShowCode] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    const diagramId = `mermaid-${Math.random().toString(36).substring(2, 9)}`;

    async function renderDiagram() {
      setRenderError(null);
      try {
        const { svg } = await mermaid.render(diagramId, diagram.code);
        if (isMounted) {
          setSvgContent(svg);
        }
      } catch (err: any) {
        if (isMounted) {
          console.warn('[DiagramVisual] Mermaid render failed:', err);
          setRenderError(err?.message || 'Failed to render diagram syntax.');
        }
      }
    }

    renderDiagram();

    return () => {
      isMounted = false;
      // Clean up any stray error elements inserted by mermaid into body
      const stray = document.getElementById(diagramId);
      if (stray) stray.remove();
    };
  }, [diagram.code]);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(diagram.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {}
  };

  const handleZoom = (delta: number) => {
    setZoomLevel((prev) => Math.min(Math.max(prev + delta, 0.6), 2.0));
  };

  return (
    <div className="space-y-3">
      {/* Header and Controls */}
      <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
        <div>
          <h4 className="font-semibold text-dark">{diagram.title || `${topic} Diagram`}</h4>
          {diagram.description && (
            <p className="text-muted text-[11px] mt-0.5">{diagram.description}</p>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 bg-white border border-border rounded-lg p-1 shadow-2xs">
          <button
            onClick={() => handleZoom(0.15)}
            className="p-1 rounded text-muted hover:text-dark hover:bg-gray-100 transition-colors"
            title="Zoom In"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => handleZoom(-0.15)}
            className="p-1 rounded text-muted hover:text-dark hover:bg-gray-100 transition-colors"
            title="Zoom Out"
            aria-label="Zoom out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setZoomLevel(1)}
            className="p-1 rounded text-muted hover:text-dark hover:bg-gray-100 transition-colors"
            title="Reset Zoom"
            aria-label="Reset zoom"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <div className="w-px h-3.5 bg-gray-200 mx-0.5" />
          <button
            onClick={() => setShowCode(!showCode)}
            className="p-1 rounded text-muted hover:text-dark hover:bg-gray-100 transition-colors"
            title="Toggle Diagram Source"
            aria-label="Toggle diagram source"
          >
            <Code className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleCopyCode}
            className="p-1 rounded text-muted hover:text-dark hover:bg-gray-100 transition-colors"
            title="Copy Diagram Code"
            aria-label="Copy diagram code"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Diagram Canvas */}
      <div className="relative rounded-xl border border-border bg-slate-50/70 p-4 overflow-auto min-h-[220px] max-h-[460px] flex items-center justify-center">
        {renderError ? (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 max-w-md w-full">
            <div className="flex items-center gap-2 font-semibold mb-1">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              Diagram Display Fallback
            </div>
            <p className="text-[11px] opacity-90 mb-2">
              Viewing raw structural layout for this subject:
            </p>
            <pre className="p-2 bg-white rounded border border-amber-100 font-mono text-[10px] overflow-x-auto">
              {diagram.code}
            </pre>
          </div>
        ) : svgContent ? (
          <div
            ref={containerRef}
            style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center center' }}
            className="transition-transform duration-200 ease-out flex items-center justify-center w-full"
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        ) : (
          <div className="text-xs text-muted italic flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary animate-ping" />
            Rendering architecture diagram...
          </div>
        )}
      </div>

      {/* Optional Source Code Preview Drawer */}
      {showCode && (
        <div className="p-3 bg-slate-900 text-slate-100 rounded-xl font-mono text-xs overflow-x-auto border border-slate-800">
          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5 pb-1 border-b border-slate-800">
            <span>Mermaid Definition</span>
            <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded">flowchart</span>
          </div>
          <pre>
            <code>{diagram.code}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
