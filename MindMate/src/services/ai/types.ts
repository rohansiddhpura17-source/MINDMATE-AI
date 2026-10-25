import type { ExplanationStrategy } from '../assessment/types';

export type AIMode = 'online' | 'offline' | 'ollama' | 'auto';
export type ExecutionSource = 'cloud' | 'local' | 'ollama' | 'mock-fallback';

export type GenerationPhase =
  | 'idle'
  | 'preparing'
  | 'loading_model'
  | 'generating'
  | 'streaming'
  | 'completed'
  | 'cancelled'
  | 'switching'
  | 'failed';

export type OllamaStatusKind =
  | 'available'
  | 'model_loading'
  | 'not_running'
  | 'model_missing'
  | 'timeout'
  | 'invalid_output'
  | 'error';

export interface OllamaHealthState {
  status: OllamaStatusKind;
  available: boolean;
  configuredModel: string;
  availableModels: string[];
  endpoint: string;
  message: string;
  recoveryGuidance?: string;
  checkedAt?: number;
}

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
  localInitializing?: boolean;
  localLoadingProgress?: ModelProgress;
  localError?: string;
  webGpuSupported: boolean;
  ollamaAvailable: boolean;
  ollamaModel: string;
  ollamaStatus: OllamaStatusKind;
  ollamaMessage?: string;
  ollamaRecoveryGuidance?: string;
  ollamaInstalledModels?: string[];
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
  loadDurationMs?: number;
  promptEvalDurationMs?: number;
  evalDurationMs?: number;
  groundedInMaterial?: boolean;
  groundedMaterialTitle?: string;
}

export interface AIStreamCallbacks {
  onChunk?: (chunk: string) => void;
  onPhaseChange?: (phase: GenerationPhase, detail?: string) => void;
  onComplete?: (response: AIResponse) => void;
  onError?: (error: Error) => void;
}

export interface AdaptiveTeachingContext {
  topicId?: string;
  topicName?: string;
  masteryScore?: number;
  confidenceLevel?: string;
  recentAccuracy?: number;
  targetDifficulty?: string;
  explanationStrategy?: ExplanationStrategy;
  strategyReason?: string;
  recentMistakesSummary?: string[];
  studyMaterialTitle?: string;
  studyMaterialExcerpt?: string;
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
  adaptiveContext?: AdaptiveTeachingContext;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  initialTimeoutMs?: number;
  streamIdleTimeoutMs?: number;
  signal?: AbortSignal;
}

export interface IAITutorAdapter {
  isAvailable(): Promise<boolean>;
  sendChatStream(
    options: SendMessageOptions,
    callbacks: AIStreamCallbacks
  ): Promise<AIResponse>;
}
