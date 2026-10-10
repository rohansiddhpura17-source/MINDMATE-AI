import {
  AIMessage,
  AIMode,
  AIEngineStatus,
  AIResponse,
  AIStreamCallbacks,
  SendMessageOptions,
  ModelProgress
} from './types';
import { cloudAIAdapter } from './cloudAdapter';
import { localWebLLMAdapter, DEFAULT_LOCAL_MODEL } from './localWebLLMAdapter';
import { contentModerationService } from '../safety/contentModerationService';

const MODE_STORAGE_KEY = 'mindmate_ai_mode';

export class AITutorService {
  private currentMode: AIMode = 'auto';
  private currentAbortController: AbortController | null = null;
  private statusListeners: Set<(status: AIEngineStatus) => void> = new Set();
  private isGenerating: boolean = false;
  private activeRequestId: number = 0;
  private activePhase: import('./types').GenerationPhase = 'idle';

  constructor() {
    // Load persisted mode preference
    if (typeof localStorage !== 'undefined') {
      const savedMode = localStorage.getItem(MODE_STORAGE_KEY) as AIMode;
      if (savedMode === 'online' || savedMode === 'offline' || savedMode === 'auto') {
        this.currentMode = savedMode;
      }
    }

    // Subscribe to local adapter progress
    localWebLLMAdapter.onProgress(() => {
      this.notifyStatusChange();
    });
  }

  public getMode(): AIMode {
    return this.currentMode;
  }

  public setMode(mode: AIMode): void {
    this.currentMode = mode;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(MODE_STORAGE_KEY, mode);
    }
    this.notifyStatusChange();
  }

  public onStatusChange(listener: (status: AIEngineStatus) => void): () => void {
    this.statusListeners.add(listener);
    this.getStatus().then(listener);
    return () => this.statusListeners.delete(listener);
  }

  private async notifyStatusChange(): Promise<void> {
    const status = await this.getStatus();
    this.statusListeners.forEach((fn) => {
      try {
        fn(status);
      } catch (err) {
        console.error('Status listener error:', err);
      }
    });
  }

  public async getStatus(): Promise<AIEngineStatus> {
    const isBrowserOnline = typeof navigator === 'undefined' || navigator.onLine;
    const shouldCheckCloud = this.currentMode !== 'offline' && isBrowserOnline;

    const cloudStatus = shouldCheckCloud
      ? await cloudAIAdapter.getStatus()
      : {
          configured: false,
          provider: 'offline',
          model: 'offline',
          message: 'Offline mode active'
        };

    const isLocalCached = await localWebLLMAdapter.isModelCached();
    const isWebGpu = localWebLLMAdapter.isWebGPUSupported();

    return {
      mode: this.currentMode,
      cloudAvailable: cloudStatus.configured,
      cloudModel: cloudStatus.model,
      cloudMessage: cloudStatus.message,
      localAvailable: isWebGpu && localWebLLMAdapter.isModelLoaded(),
      localModelId: localWebLLMAdapter.getModelId(),
      localModelLoaded: localWebLLMAdapter.isModelLoaded(),
      localModelCached: isLocalCached,
      localLoadingProgress: localWebLLMAdapter.getLoadingProgress() || undefined,
      webGpuSupported: isWebGpu,
      isGenerating: this.isGenerating,
      activePhase: this.activePhase
    };
  }

  public async initializeLocalModel(
    modelId = DEFAULT_LOCAL_MODEL,
    onProgress?: (progress: ModelProgress) => void
  ): Promise<void> {
    await localWebLLMAdapter.initialize(modelId, (p) => {
      onProgress?.(p);
      this.notifyStatusChange();
    });
    this.notifyStatusChange();
  }

  public abort(): void {
    this.activeRequestId++; // Invalidate any in-flight streaming tokens
    if (this.currentAbortController) {
      try {
        this.currentAbortController.abort();
      } catch (_) {}
      this.currentAbortController = null;
    }
    this.isGenerating = false;
    this.activePhase = 'idle';
    this.notifyStatusChange();
  }

  public async sendMessageStream(
    options: SendMessageOptions,
    callbacks: AIStreamCallbacks
  ): Promise<AIResponse> {
    this.abort(); // Cancel any existing generation

    const requestId = ++this.activeRequestId;
    const abortController = new AbortController();
    this.currentAbortController = abortController;
    this.isGenerating = true;
    this.activePhase = 'preparing';
    this.notifyStatusChange();

    const mergedOptions: SendMessageOptions = {
      ...options,
      signal: abortController.signal
    };

    // Guard callbacks to guarantee cancelled or obsolete tokens cannot leak
    const guardedCallbacks: AIStreamCallbacks = {
      onChunk: (chunk: string) => {
        if (requestId === this.activeRequestId) {
          callbacks.onChunk?.(chunk);
        }
      },
      onPhaseChange: (phase: import('./types').GenerationPhase, detail?: string) => {
        if (requestId === this.activeRequestId) {
          this.activePhase = phase;
          callbacks.onPhaseChange?.(phase, detail);
          this.notifyStatusChange();
        }
      },
      onComplete: (res: AIResponse) => {
        if (requestId === this.activeRequestId) {
          this.activePhase = 'idle';
          callbacks.onComplete?.(res);
        }
      },
      onError: (err: Error) => {
        if (requestId === this.activeRequestId) {
          this.activePhase = 'failed';
          callbacks.onError?.(err);
        }
      }
    };

    try {
      // Content safety and learning-relevance pre-flight check
      const userMessages = mergedOptions.messages.filter((m) => m.role === 'user');
      const lastUserMsg = userMessages[userMessages.length - 1];
      const prevUserMsg = userMessages.length > 1 ? userMessages[userMessages.length - 2] : undefined;
      const prevAssistantMsg = [...mergedOptions.messages].reverse().find((m) => m.role === 'assistant');

      const promptToEvaluate = lastUserMsg?.promptContent || lastUserMsg?.content || '';
      const moderationResult = contentModerationService.evaluate(promptToEvaluate, {
        previousQuestion: prevUserMsg?.content,
        previousAnswer: prevAssistantMsg?.content,
        currentSubject: mergedOptions.learnerProfile?.goal
      });

      if (moderationResult.decision !== 'ALLOW') {
        const refusalContent = moderationResult.userExplanation;
        await new Promise((r) => setTimeout(r, 40));
        guardedCallbacks.onPhaseChange?.('idle');
        guardedCallbacks.onChunk?.(refusalContent);
        const refusalResponse: AIResponse = {
          content: refusalContent,
          source: this.currentMode === 'offline' ? 'local' : this.currentMode === 'online' ? 'cloud' : 'local',
          model: 'content-safety-guard',
          elapsedMs: 5
        };
        guardedCallbacks.onComplete?.(refusalResponse);
        return refusalResponse;
      }

      if (this.currentMode === 'online') {
        return await this.executeOnline(mergedOptions, guardedCallbacks);
      } else if (this.currentMode === 'offline') {
        return await this.executeOffline(mergedOptions, guardedCallbacks);
      } else {
        // Auto mode
        return await this.executeAuto(mergedOptions, guardedCallbacks);
      }
    } finally {
      if (requestId === this.activeRequestId) {
        this.isGenerating = false;
        this.currentAbortController = null;
        this.activePhase = 'idle';
        this.notifyStatusChange();
      }
    }
  }

  private async executeOnline(
    options: SendMessageOptions,
    callbacks: AIStreamCallbacks
  ): Promise<AIResponse> {
    return await cloudAIAdapter.sendChatStream(options, callbacks);
  }

  private async executeOffline(
    options: SendMessageOptions,
    callbacks: AIStreamCallbacks
  ): Promise<AIResponse> {
    if (!localWebLLMAdapter.isModelLoaded()) {
      throw new Error(
        'Offline Mode Active: Local model is not loaded yet. Click "Load Local Model" to initialize WebGPU inference, or switch mode to Online.'
      );
    }
    // Strictly local inference — zero network requests
    return await localWebLLMAdapter.sendChatStream(options, callbacks);
  }

  private async executeAuto(
    options: SendMessageOptions,
    callbacks: AIStreamCallbacks
  ): Promise<AIResponse> {
    const isBrowserOnline = typeof navigator === 'undefined' || navigator.onLine;

    // 1. If online, attempt Cloud first
    if (isBrowserOnline) {
      try {
        const cloudResult = await cloudAIAdapter.sendChatStream(options, callbacks);
        return cloudResult;
      } catch (cloudErr: any) {
        console.warn('Auto mode: Cloud inference failed or unreachable, checking local model...', cloudErr);

        // If local model is ready, fall back to local!
        if (localWebLLMAdapter.isModelLoaded()) {
          callbacks.onChunk?.('\n\n*(Cloud unavailable. Falling back to local WebGPU AI...)*\n\n');
          return await localWebLLMAdapter.sendChatStream(options, callbacks);
        }

        // If local model is not loaded, explain the situation clearly
        throw new Error(
          `Cloud AI unavailable (${cloudErr.message}). Local model is not initialized. To enable automatic offline fallback, click "Load Local Model" below.`
        );
      }
    }

    // 2. Browser is offline: attempt local model
    if (localWebLLMAdapter.isModelLoaded()) {
      return await localWebLLMAdapter.sendChatStream(options, callbacks);
    }

    throw new Error(
      'You are currently offline, and the local AI model is not yet loaded into browser memory. Please reconnect to download the local model or use cloud AI.'
    );
  }
}

export const aiTutorService = new AITutorService();
