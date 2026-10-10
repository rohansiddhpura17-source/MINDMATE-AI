export type AIMode = 'online' | 'offline' | 'auto';
export type ExecutionSource = 'cloud' | 'local' | 'mock-fallback';

export type GenerationPhase =
  | 'idle'
  | 'preparing'
  | 'generating'
  | 'streaming'
  | 'switching'
  | 'failed';

export interface AIMessage {
  id?: number | string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  promptContent?: string;
  code?: string;
  explanation?: string;
  source?: ExecutionSource;
  model?: string;
  timestamp?: number;
  elapsedMs?: number;
}

export interface ModelProgress {
  text: string;
  progress: number; // 0 to 1
  timeElapsed?: number;
}

export interface AIEngineStatus {
  mode: AIMode;
  cloudAvailable: boolean;
  cloudModel: string;
  cloudMessage?: string;
  localAvailable: boolean;
  localModelId: string;
  localModelLoaded: boolean;
  localModelCached: boolean;
  localLoadingProgress?: ModelProgress;
  localError?: string;
  webGpuSupported: boolean;
  isGenerating: boolean;
  activePhase?: GenerationPhase;
}

export interface AIResponse {
  content: string;
  code?: string;
  explanation?: string;
  source: ExecutionSource;
  model: string;
  elapsedMs?: number;
}

export interface AIStreamCallbacks {
  onChunk?: (chunk: string) => void;
  onPhaseChange?: (phase: GenerationPhase, detail?: string) => void;
  onComplete?: (response: AIResponse) => void;
  onError?: (error: Error) => void;
}

export interface SendMessageOptions {
  messages: AIMessage[];
  systemPrompt?: string;
  learnerProfile?: {
    name?: string;
    learningStyle?: string;
    goal?: string;
    level?: string;
  };
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface IAITutorAdapter {
  isAvailable(): Promise<boolean>;
  sendChatStream(
    options: SendMessageOptions,
    callbacks: AIStreamCallbacks
  ): Promise<AIResponse>;
}
