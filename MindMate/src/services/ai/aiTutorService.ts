import {
  AdaptiveTeachingContext,
  AIMode,
  AIEngineStatus,
  AIResponse,
  AIStreamCallbacks,
  SendMessageOptions,
  ModelProgress,
} from './types';
import { cloudAIAdapter, CloudAIAdapter } from './cloudAdapter';
import {
  localWebLLMAdapter,
  LocalWebLLMAdapter,
  DEFAULT_LOCAL_MODEL,
} from './localWebLLMAdapter';
import {
  ollamaAdapter,
  OllamaAdapter,
  DEFAULT_OLLAMA_MODEL,
} from './ollamaAdapter';
import { contentModerationService } from '../safety/contentModerationService';
import {
  MULTILINGUAL_FLASHCARDS,
  MULTILINGUAL_QUICK_RECALL,
  resolveTopicMetadata,
} from '../../data/learningContent';
import { STRATEGY_LABELS } from '../adaptive/adaptiveLearningEngine';

const MODE_STORAGE_KEY = 'mindmate_ai_mode';

/**
 * Build a transparent, deterministic curriculum explanation from verified local
 * study cards when neither Ollama nor Cloud AI is reachable. Explicitly labeled
 * as deterministic fallback content.
 */
export function buildDeterministicCurriculumFallback(
  userPrompt: string,
  adaptiveContext?: AdaptiveTeachingContext,
  unavailableReason?: string
): { content: string; code?: string; explanation: string } {
  const topicMeta = resolveTopicMetadata(
    adaptiveContext?.topicId || adaptiveContext?.topicName || userPrompt || 'python-functions'
  );
  const strategy = adaptiveContext?.explanationStrategy || 'step-by-step';
  const strategyLabel = STRATEGY_LABELS[strategy] || strategy;

  const recallItems = MULTILINGUAL_QUICK_RECALL.filter(
    (item) => item.topicId === topicMeta.id && item.language === 'en'
  );
  const flashcards = MULTILINGUAL_FLASHCARDS.filter(
    (fc) => fc.topicId === topicMeta.id && fc.language === 'en'
  );

  const primaryRecall = recallItems[0] || MULTILINGUAL_QUICK_RECALL[0];
  const primaryCard = flashcards[0] || MULTILINGUAL_FLASHCARDS[0];

  const lines: string[] = [];
  if (unavailableReason) {
    lines.push(`> **Local Deterministic Study Guide (Offline Fallback):** ${unavailableReason}`);
    lines.push('');
  }
  lines.push(`### ${topicMeta.name} — ${strategyLabel}`);
  if (adaptiveContext?.strategyReason) {
    lines.push(`*Adaptation reason:* ${adaptiveContext.strategyReason}`);
  }
  lines.push('');
  lines.push(`**Core Concept:** ${primaryCard.front}`);
  lines.push(primaryCard.back);
  lines.push('');
  lines.push(`**Key Rule (${primaryRecall.title}):** ${primaryRecall.keyFact}`);
  lines.push(primaryRecall.detail);

  if (
    adaptiveContext?.recentMistakesSummary &&
    adaptiveContext.recentMistakesSummary.length > 0
  ) {
    lines.push('');
    lines.push('**Targeted Focus From Your Recent Quiz Attempts:**');
    for (const m of adaptiveContext.recentMistakesSummary.slice(0, 3)) {
      lines.push(`- ${m}`);
    }
  }

  const code = primaryRecall.codeSnippet;
  const explanation = lines.join('\n');
  const fullContent = code
    ? `${explanation}\n\n\`\`\`python\n${code}\n\`\`\``
    : explanation;

  return { content: fullContent, code, explanation };
}

export class AITutorService {
  private currentMode: AIMode = 'auto';
  private currentAbortController: AbortController | null = null;
  private statusListeners: Set<(status: AIEngineStatus) => void> = new Set();
  private isGenerating: boolean = false;
  private activeRequestId: number = 0;
  private activePhase: import('./types').GenerationPhase = 'idle';

  private cloud: CloudAIAdapter;
  private localWebLLM: LocalWebLLMAdapter;
  private ollama: OllamaAdapter;

  constructor(deps?: {
    cloudAdapter?: CloudAIAdapter;
    localWebLLMAdapter?: LocalWebLLMAdapter;
    ollamaAdapter?: OllamaAdapter;
    initialMode?: AIMode;
  }) {
    this.cloud = deps?.cloudAdapter || cloudAIAdapter;
    this.localWebLLM = deps?.localWebLLMAdapter || localWebLLMAdapter;
    this.ollama = deps?.ollamaAdapter || ollamaAdapter;

    if (deps?.initialMode) {
      this.currentMode = deps.initialMode;
    } else if (typeof localStorage !== 'undefined') {
      const savedMode = localStorage.getItem(MODE_STORAGE_KEY) as AIMode;
      if (
        savedMode === 'online' ||
        savedMode === 'offline' ||
        savedMode === 'ollama' ||
        savedMode === 'auto'
      ) {
        this.currentMode = savedMode;
      }
    }

    this.localWebLLM.onProgress(() => {
      if (this.currentMode === 'offline') {
        void this.notifyStatusChange();
      }
    });
  }

  public getMode(): AIMode {
    return this.currentMode;
  }

  public setMode(mode: AIMode): void {
    const previousMode = this.currentMode;
    this.currentMode = mode;
    if (previousMode === 'offline' && mode !== 'offline') {
      this.localWebLLM.cancelInitialization();
    }
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(MODE_STORAGE_KEY, mode);
      } catch {
        // Ignore quota errors
      }
    }
    void this.notifyStatusChange();
  }

  public getOllamaAdapter(): OllamaAdapter {
    return this.ollama;
  }

  public cancelLocalModelInit(): void {
    this.localWebLLM.cancelInitialization();
    void this.notifyStatusChange();
  }

  public onStatusChange(listener: (status: AIEngineStatus) => void): () => void {
    this.statusListeners.add(listener);
    void this.getStatus().then(listener);
    return () => this.statusListeners.delete(listener);
  }

  private async notifyStatusChange(forceRefresh = false): Promise<void> {
    const status = await this.getStatus(forceRefresh);
    this.statusListeners.forEach((fn) => {
      try {
        fn(status);
      } catch (err) {
        console.error('Status listener error:', err);
      }
    });
  }

  public async getStatus(forceRefresh = false): Promise<AIEngineStatus> {
    const isBrowserOnline =
      typeof navigator === 'undefined' || navigator.onLine;
    // Never contact cloud status endpoint when a strictly local mode ('offline' or 'ollama') is active
    const shouldCheckCloud =
      this.currentMode !== 'offline' &&
      this.currentMode !== 'ollama' &&
      isBrowserOnline;

    // Never touch WebLLM cache or expose WebLLM progress when Ollama Local AI is selected
    const shouldInspectWebLLM = this.currentMode !== 'ollama';

    const [cloudStatus, ollamaHealth, isLocalCached] = await Promise.all([
      shouldCheckCloud
        ? this.cloud.getStatus()
        : Promise.resolve({
            configured: false,
            provider: 'local-only',
            model: 'disabled-in-local-mode',
            message:
              this.currentMode === 'ollama'
                ? 'Local Ollama mode active (cloud disabled)'
                : 'Offline WebGPU mode active (cloud disabled)',
          }),
      this.ollama.checkHealth(2500, forceRefresh),
      shouldInspectWebLLM
        ? this.localWebLLM.isModelCached()
        : Promise.resolve(false),
    ]);

    const isWebGpu = shouldInspectWebLLM
      ? this.localWebLLM.isWebGPUSupported()
      : false;
    const isWebLLMLoaded = shouldInspectWebLLM
      ? this.localWebLLM.isModelLoaded()
      : false;

    return {
      mode: this.currentMode,
      cloudAvailable: cloudStatus.configured,
      cloudModel: cloudStatus.model,
      cloudMessage: cloudStatus.message,
      localAvailable: isWebGpu && isWebLLMLoaded,
      localModelId: this.localWebLLM.getModelId(),
      localModelLoaded: isWebLLMLoaded,
      localModelCached: isLocalCached,
      localLoadingProgress:
        this.currentMode === 'offline'
          ? this.localWebLLM.getLoadingProgress() || undefined
          : undefined,
      webGpuSupported: this.localWebLLM.isWebGPUSupported(),
      ollamaAvailable: ollamaHealth.available,
      ollamaModel: ollamaHealth.configuredModel || DEFAULT_OLLAMA_MODEL,
      ollamaStatus: ollamaHealth.status,
      ollamaMessage: ollamaHealth.message,
      ollamaRecoveryGuidance: ollamaHealth.recoveryGuidance,
      ollamaInstalledModels: ollamaHealth.availableModels,
      isGenerating: this.isGenerating,
      activePhase: this.activePhase,
    };
  }

  public async initializeLocalModel(
    modelId = DEFAULT_LOCAL_MODEL,
    onProgress?: (progress: ModelProgress) => void
  ): Promise<void> {
    if (this.currentMode === 'ollama') {
      throw new Error(
        'Cannot initialize Browser WebGPU model while Ollama — Local AI mode is active. Switch to Offline (WebGPU) mode first.'
      );
    }
    await this.localWebLLM.initialize(modelId, (p) => {
      onProgress?.(p);
      if (this.currentMode === 'offline') {
        void this.notifyStatusChange();
      }
    });
    void this.notifyStatusChange();
  }

  public abort(): void {
    this.activeRequestId++;
    if (this.currentAbortController) {
      try {
        this.currentAbortController.abort();
      } catch {
        // Ignore
      }
      this.currentAbortController = null;
    }
    this.isGenerating = false;
    this.activePhase = 'idle';
    void this.notifyStatusChange();
  }

  public async sendMessageStream(
    options: SendMessageOptions,
    callbacks: AIStreamCallbacks
  ): Promise<AIResponse> {
    this.abort();

    const requestId = ++this.activeRequestId;
    const abortController = new AbortController();
    this.currentAbortController = abortController;
    this.isGenerating = true;
    this.activePhase = 'preparing';
    void this.notifyStatusChange();

    const mergedOptions: SendMessageOptions = {
      ...options,
      signal: abortController.signal,
    };

    const guardedCallbacks: AIStreamCallbacks = {
      onChunk: (chunk: string) => {
        if (requestId === this.activeRequestId) {
          callbacks.onChunk?.(chunk);
        }
      },
      onPhaseChange: (
        phase: import('./types').GenerationPhase,
        detail?: string
      ) => {
        if (requestId === this.activeRequestId) {
          this.activePhase = phase;
          callbacks.onPhaseChange?.(phase, detail);
          void this.notifyStatusChange();
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
      },
    };

    try {
      const userMessages = mergedOptions.messages.filter(
        (m) => m.role === 'user'
      );
      const lastUserMsg = userMessages[userMessages.length - 1];
      const prevUserMsg =
        userMessages.length > 1
          ? userMessages[userMessages.length - 2]
          : undefined;
      const prevAssistantMsg = [...mergedOptions.messages]
        .reverse()
        .find((m) => m.role === 'assistant');

      const promptToEvaluate =
        lastUserMsg?.promptContent || lastUserMsg?.content || '';
      const moderationResult = contentModerationService.evaluate(
        promptToEvaluate,
        {
          previousQuestion: prevUserMsg?.content,
          previousAnswer: prevAssistantMsg?.content,
          currentSubject: mergedOptions.learnerProfile?.goal,
        }
      );

      if (moderationResult.decision !== 'ALLOW') {
        const refusalContent = moderationResult.userExplanation;
        await new Promise((r) => setTimeout(r, 40));
        guardedCallbacks.onPhaseChange?.('idle');
        guardedCallbacks.onChunk?.(refusalContent);
        const refusalResponse: AIResponse = {
          content: refusalContent,
          source:
            this.currentMode === 'ollama'
              ? 'ollama'
              : this.currentMode === 'offline'
                ? 'local'
                : 'cloud',
          model: 'content-safety-guard',
          elapsedMs: 5,
        };
        guardedCallbacks.onComplete?.(refusalResponse);
        return refusalResponse;
      }

      if (this.currentMode === 'online') {
        return await this.executeOnline(mergedOptions, guardedCallbacks);
      } else if (this.currentMode === 'ollama') {
        return await this.executeOllama(mergedOptions, guardedCallbacks);
      } else if (this.currentMode === 'offline') {
        return await this.executeOffline(mergedOptions, guardedCallbacks);
      } else {
        return await this.executeAuto(mergedOptions, guardedCallbacks);
      }
    } finally {
      if (requestId === this.activeRequestId) {
        this.isGenerating = false;
        this.currentAbortController = null;
        this.activePhase = 'idle';
        void this.notifyStatusChange();
      }
    }
  }

  private async executeOnline(
    options: SendMessageOptions,
    callbacks: AIStreamCallbacks
  ): Promise<AIResponse> {
    return await this.cloud.sendChatStream(options, callbacks);
  }

  /**
   * Strictly local Ollama execution (Gemma 4).
   * Never calls cloudAIAdapter even if Ollama is offline or fails.
   */
  private async executeOllama(
    options: SendMessageOptions,
    callbacks: AIStreamCallbacks
  ): Promise<AIResponse> {
    return await this.ollama.sendChatStream(options, callbacks);
  }

  /**
   * Strictly local WebLLM execution.
   * Never calls cloudAIAdapter even if WebLLM is unloaded or fails.
   */
  private async executeOffline(
    options: SendMessageOptions,
    callbacks: AIStreamCallbacks
  ): Promise<AIResponse> {
    if (!this.localWebLLM.isModelLoaded()) {
      throw new Error(
        'Offline WebGPU Mode Active: Local browser model is not loaded yet. Click "Load Local Model" to initialize WebGPU inference, or switch to "Ollama — Local AI" or "Online".'
      );
    }
    return await this.localWebLLM.sendChatStream(options, callbacks);
  }

  private async executeAuto(
    options: SendMessageOptions,
    callbacks: AIStreamCallbacks
  ): Promise<AIResponse> {
    const isBrowserOnline =
      typeof navigator === 'undefined' || navigator.onLine;

    // 1. Try Cloud Gemini if browser is online
    let cloudErrMsg = 'Browser is offline';
    if (isBrowserOnline) {
      try {
        return await this.cloud.sendChatStream(options, callbacks);
      } catch (cloudErr: unknown) {
        cloudErrMsg =
          cloudErr instanceof Error ? cloudErr.message : 'Cloud AI unavailable';
      }
    }

    // 2. Try Local Ollama (gemma4:e2b) if running locally
    const ollamaHealth = await this.ollama.checkHealth(2500);
    if (ollamaHealth.available) {
      callbacks.onChunk?.(
        `\n\n*(Cloud AI unavailable; routing automatically to local Ollama ${ollamaHealth.configuredModel}...)*\n\n`
      );
      return await this.ollama.sendChatStream(options, callbacks);
    }

    // 3. Try Local WebLLM if loaded in browser
    if (this.localWebLLM.isModelLoaded()) {
      callbacks.onChunk?.(
        '\n\n*(Cloud AI unavailable; falling back to local WebGPU model...)*\n\n'
      );
      return await this.localWebLLM.sendChatStream(options, callbacks);
    }

    throw new Error(
      `Auto Mode could not reach an active AI provider:\n` +
        `• Cloud Gemini: ${cloudErrMsg}\n` +
        `• Local Ollama (${ollamaHealth.configuredModel}): ${ollamaHealth.message}${
          ollamaHealth.recoveryGuidance ? ` (${ollamaHealth.recoveryGuidance})` : ''
        }\n` +
        `• Browser WebGPU: Model not loaded.`
    );
  }
}

export const aiTutorService = new AITutorService();
