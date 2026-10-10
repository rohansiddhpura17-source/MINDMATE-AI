/**
 * Types for MindMate Visual Learning Engine
 */

export type VisualFormatType =
  | 'image_gallery'
  | 'diagram'
  | 'flowchart'
  | 'chart'
  | 'algorithm_steps'
  | 'comparison_table'
  | 'moderation_refusal';

export interface VisualImageItem {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  description: string;
  author: string;
  license: string;
  licenseUrl?: string;
  sourceUrl: string;
  width?: number;
  height?: number;
}

export interface VisualChartSeries {
  key: string;
  name?: string;
  color?: string;
}

export interface VisualChartData {
  chartType: 'bar' | 'line' | 'pie';
  title: string;
  description?: string;
  data: Array<Record<string, any>>;
  xKey: string;
  series: VisualChartSeries[];
}

export interface VisualAlgorithmStepItem {
  value: any;
  status?: 'default' | 'active' | 'success' | 'eliminated' | 'found';
}

export interface VisualAlgorithmStep {
  step: number;
  title: string;
  description: string;
  highlightIndices?: number[];
  pointerLabels?: Record<number, string>; // e.g. { 0: 'L (0)', 3: 'M (3)', 6: 'R (6)' }
  items?: VisualAlgorithmStepItem[];
  stateSummary?: string;
}

export interface VisualAlgorithmData {
  algorithmName: string;
  description: string;
  complexity?: {
    time: string;
    space: string;
  };
  steps: VisualAlgorithmStep[];
  currentStepIndex?: number;
}

export interface VisualComparisonData {
  title: string;
  description?: string;
  headers: string[]; // e.g. ['Criterion / Feature', 'Python', 'JavaScript']
  rows: Array<{
    feature: string;
    values: string[];
    highlight?: boolean;
  }>;
}

export interface VisualDiagramData {
  diagramType: 'mermaid' | 'svg';
  code: string; // Mermaid diagram source or safe SVG markup
  title?: string;
  description?: string;
  nodes?: Array<{ id: string; label: string; group?: string }>;
}

export interface VisualPayload {
  format: VisualFormatType;
  title: string;
  summary: string;
  topic: string;
  availableFormats?: VisualFormatType[];
  images?: VisualImageItem[];
  diagram?: VisualDiagramData;
  chart?: VisualChartData;
  algorithm?: VisualAlgorithmData;
  comparison?: VisualComparisonData;
  offlineFallback?: boolean;
  blocked?: boolean;
  moderationExplanation?: string;
}

export interface VisualGenerationContext {
  question: string;
  answer: string;
  subject: string;
  mode: 'online' | 'offline' | 'auto';
  isOnline: boolean;
  previousQuestion?: string;
  previousAnswer?: string;
}
