import * as webllm from '@mlc-ai/web-llm';
import { COMPACT_FORMATTING_GUIDELINES } from './responseFormatting';
import {
  IAITutorAdapter,
  SendMessageOptions,
  AIStreamCallbacks,
  AIResponse,
  ModelProgress
} from './types';
import { parseCodeAndExplanation } from './cloudAdapter';
import { contentModerationService } from '../safety/contentModerationService';

export const DEFAULT_LOCAL_MODEL = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';

export interface LocalModelOption {
  id: string;
  name: string;
  size: string;
  description: string;
  recommendedVRAM: string;
  universal?: boolean;
}

export const SUPPORTED_LOCAL_MODELS: LocalModelOption[] = [
  {
    id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 (0.5B Instruct) - Recommended',
    size: '~390 MB',
    description: 'Universal educational tutor. Runs reliably on all WebGPU systems without FP16 shader requirements.',
    recommendedVRAM: '500 MB',
    universal: true
  },
  {
    id: 'SmolLM2-360M-Instruct-q4f32_1-MLC',
    name: 'SmolLM2 (360M FP32 Universal)',
    size: '~230 MB',
    description: 'Ultra-compact universal model. Fast download and compatible with all WebGPU devices.',
    recommendedVRAM: '350 MB',
    universal: true
  },
  {
    id: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
    name: 'SmolLM2 (360M FP16 High-Speed)',
    size: '~230 MB',
    description: 'Maximum speed on GPUs with shader-f16 support (Apple Silicon, modern NVIDIA/AMD).',
    recommendedVRAM: '350 MB'
  },
  {
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 (1.5B Instruct)',
    size: '~950 MB',
    description: 'Higher reasoning depth for advanced explanations and coding examples.',
    recommendedVRAM: '1.2 GB'
  }
];

export class LocalWebLLMAdapter implements IAITutorAdapter {
  private engine: webllm.MLCEngineInterface | null = null;
  private currentModelId: string = DEFAULT_LOCAL_MODEL;
  private isInitializing: boolean = false;
  private initCancelled: boolean = false;
  private isLoaded: boolean = false;
  private lastError: string | null = null;
  private lastProgress: ModelProgress | null = null;
  private progressListeners: Set<(progress: ModelProgress) => void> = new Set();

  public isWebGPUSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      'gpu' in navigator &&
      Boolean((navigator as any).gpu)
    );
  }

  public isModelInitializing(): boolean {
    return this.isInitializing;
  }

  public getLastError(): string | null {
    return this.lastError;
  }

  public cancelInitialization(): void {
    if (this.isInitializing) {
      this.initCancelled = true;
      this.isInitializing = false;
    }
    if (!this.isLoaded) {
      this.lastProgress = null;
    }
  }

  public async detectGPUCapabilities(): Promise<{
    supported: boolean;
    adapterName: string;
    hasShaderF16: boolean;
    recommendedModel: string;
    reason?: string;
  }> {
    if (typeof navigator === 'undefined' || !('gpu' in navigator) || !Boolean((navigator as any).gpu)) {
      return {
        supported: false,
        adapterName: 'None',
        hasShaderF16: false,
        recommendedModel: DEFAULT_LOCAL_MODEL,
        reason: 'WebGPU is not supported by your current browser. Please use Chrome 113+, Edge 113+, or Safari 18+.'
      };
    }

    try {
      const adapter = await (navigator as any).gpu.requestAdapter();
      if (!adapter) {
        return {
          supported: false,
          adapterName: 'Adapter unavailable',
          hasShaderF16: false,
          recommendedModel: DEFAULT_LOCAL_MODEL,
          reason: 'No compatible WebGPU hardware adapter found. Ensure hardware acceleration is enabled in your browser settings (e.g. Settings > System > Use graphics acceleration).'
        };
      }

      const hasF16 = adapter.features?.has('shader-f16') || false;
      const info = (await adapter.requestAdapterInfo?.()) || {};
      const adapterName = info.description || info.device || info.vendor || 'Standard WebGPU Device';

      return {
        supported: true,
        adapterName,
        hasShaderF16: hasF16,
        recommendedModel: hasF16 ? 'SmolLM2-360M-Instruct-q4f16_1-MLC' : 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC'
      };
    } catch (e: any) {
      return {
        supported: false,
        adapterName: 'Error querying adapter',
        hasShaderF16: false,
        recommendedModel: DEFAULT_LOCAL_MODEL,
        reason: e.message || 'Error occurred while querying WebGPU hardware.'
      };
    }
  }

  public getModelId(): string {
    return this.currentModelId;
  }

  public isModelLoaded(): boolean {
    return this.isLoaded && this.engine !== null;
  }

  public getLoadingProgress(): ModelProgress | null {
    return this.lastProgress;
  }

  public onProgress(listener: (progress: ModelProgress) => void): () => void {
    this.progressListeners.add(listener);
    return () => this.progressListeners.delete(listener);
  }

  private notifyProgress(report: webllm.InitProgressReport) {
    const progress: ModelProgress = {
      text: report.text,
      progress: report.progress,
      timeElapsed: report.timeElapsed
    };
    this.lastProgress = progress;
    this.progressListeners.forEach((fn) => {
      try {
        fn(progress);
      } catch (err) {
        console.error('Progress listener error:', err);
      }
    });
  }

  public async isModelCached(modelId = this.currentModelId): Promise<boolean> {
    try {
      if (typeof webllm.hasModelInCache === 'function') {
        return await webllm.hasModelInCache(modelId);
      }
      return false;
    } catch {
      return false;
    }
  }

  public async clearModelCache(modelId = this.currentModelId): Promise<void> {
    try {
      if (typeof (webllm as any).deleteModelAllInfoInCache === 'function') {
        await (webllm as any).deleteModelAllInfoInCache(modelId);
      }
      this.lastProgress = null;
    } catch (e) {
      console.warn('Failed to clear model cache:', e);
    }
  }

  public async isAvailable(): Promise<boolean> {
    if (!this.isWebGPUSupported()) {
      return false;
    }
    return this.isModelLoaded();
  }

  public async initialize(
    modelId = DEFAULT_LOCAL_MODEL,
    onProgress?: (progress: ModelProgress) => void
  ): Promise<void> {
    if (this.isLoaded && this.engine && this.currentModelId === modelId) {
      return;
    }

    if (this.isInitializing) {
      throw new Error('Local model initialization is already in progress.');
    }

    this.isInitializing = true;
    this.initCancelled = false;
    this.lastError = null;
    const unsub = onProgress ? this.onProgress(onProgress) : null;

    try {
      this.notifyProgress({
        text: 'Inspecting WebGPU hardware capabilities...',
        progress: 0.02,
        timeElapsed: 0
      });

      const caps = await this.detectGPUCapabilities();
      if (this.initCancelled) {
        throw new Error('WebGPU initialization was cancelled.');
      }
      if (!caps.supported) {
        throw new Error(caps.reason || 'WebGPU is not supported in this browser. Please use Chrome 113+, Edge 113+, Safari 18+, or enable WebGPU in your browser flags.');
      }

      let activeModelId = modelId;
      // Auto-fallback away from shader-f16 model if hardware does not support it
      if (!caps.hasShaderF16 && activeModelId.includes('q4f16_1') && activeModelId.startsWith('SmolLM2')) {
        console.warn(`[LocalWebLLMAdapter] Device does not support shader-f16 for ${activeModelId}. Automatically selecting universal FP32 model.`);
        activeModelId = 'SmolLM2-360M-Instruct-q4f32_1-MLC';
      }

      this.currentModelId = activeModelId;

      this.notifyProgress({
        text: `Initializing WebGPU engine for ${activeModelId} on ${caps.adapterName}...`,
        progress: 0.05,
        timeElapsed: 0
      });

      // Initialize MLCEngine
      const engine = await webllm.CreateMLCEngine(activeModelId, {
        initProgressCallback: (report) => {
          if (!this.initCancelled) {
            this.notifyProgress(report);
          }
        }
      });

      if (this.initCancelled) {
        try {
          await engine.unload();
        } catch {}
        throw new Error('WebGPU initialization was cancelled.');
      }

      this.engine = engine;
      this.isLoaded = true;
      this.lastError = null;

      this.notifyProgress({
        text: `Model ${activeModelId} ready for local inference.`,
        progress: 1.0,
        timeElapsed: 0
      });
    } catch (err: any) {
      this.isLoaded = false;
      this.engine = null;
      this.lastProgress = null;
      const msg = err?.message || String(err);
      if (msg.includes('shader-f16')) {
        this.lastError = 'This local model requires 16-bit floating point shaders (shader-f16), which are not supported by your GPU. Please select a universal model like Qwen 2.5 or SmolLM2 FP32.';
        throw new Error(this.lastError);
      }
      if (msg.includes('quota') || msg.includes('QuotaExceededError')) {
        this.lastError = 'Browser storage quota exceeded. Please clear browser site data or free up local disk space.';
        throw new Error(this.lastError);
      }
      this.lastError = `Failed to initialize local WebLLM model: ${msg}`;
      throw new Error(this.lastError);
    } finally {
      this.isInitializing = false;
      if (unsub) unsub();
    }
  }

  public async testInference(testPrompt = 'Explain the difference between a variable and a constant in one concise sentence.'): Promise<{
    success: boolean;
    output: string;
    elapsedMs: number;
    tokensPerSecond: number;
  }> {
    if (!this.engine || !this.isLoaded) {
      throw new Error('Local model is not loaded. Please initialize the local model first.');
    }
    const t0 = performance.now();
    const reply = await this.engine.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are MindMate educational AI. Be concise.' },
        { role: 'user', content: testPrompt }
      ],
      max_tokens: 60,
      temperature: 0.2
    });
    const elapsedMs = Math.round(performance.now() - t0);
    const content = reply.choices[0]?.message?.content || '';
    const tokenEst = Math.ceil(content.length / 4);
    const tokPerSec = elapsedMs > 0 ? Math.round((tokenEst / (elapsedMs / 1000)) * 10) / 10 : 0;
    return {
      success: true,
      output: content,
      elapsedMs,
      tokensPerSecond: tokPerSec
    };
  }

  public async unload(): Promise<void> {
    if (this.engine) {
      try {
        await this.engine.unload();
      } catch (e) {
        console.warn('Error unloading engine:', e);
      }
      this.engine = null;
    }
    this.isLoaded = false;
    this.lastProgress = null;
  }

  public async sendChatStream(
    options: SendMessageOptions,
    callbacks: AIStreamCallbacks
  ): Promise<AIResponse> {
    if (!this.isLoaded || !this.engine) {
      throw new Error(
        'Local AI model is not loaded. Please click "Load Local Model" to initialize or switch to Online mode.'
      );
    }

    const startTime = Date.now();
    callbacks.onPhaseChange?.('preparing', 'Preparing local WebGPU AI...');

    const { messages, systemPrompt, learnerProfile, temperature, maxTokens, signal } = options;

    let enrichedSystemPrompt =
      systemPrompt ||
      'You are MindMate, a concise and encouraging educational AI tutor running locally on the user device.';
    enrichedSystemPrompt += `\n\nCore Subject & Context Rules:
1. Directly and factually answer the user's active subject of inquiry. Never force programming or code into questions that are not about computer science or code.
2. For biographical, historical, or real-person inquiries, provide neutral, objective, and factual information without graphic details or unsolicited code metaphors.
3. When answering follow-up requests (such as "Explain differently", "Simplify", "Give example", "Quiz me", or "Show visually"), strictly preserve the subject of the immediately preceding question and answer. Never switch subjects or revert to previous syllabus topics on follow-up requests.
4. If the required context to answer or re-explain is missing or ambiguous, ask the user to clarify instead of inventing context.
5. Content safety & educational focus: MindMate is strictly an educational learning platform. Decline requests for adult entertainment, pornography, sexually explicit content, or explicit performers politely and redirect to academic subjects.
6. Scientific biology & health exception: Legitimate questions about human reproduction, anatomy, puberty, STI prevention, and relationship consent must be answered factually, clinically, and age-appropriately without explicit depictions.`;
    enrichedSystemPrompt += `\n${COMPACT_FORMATTING_GUIDELINES}`;

    // Local pre-flight content moderation (strictly 0 network calls)
    const userMessages = messages.filter((m) => m.role === 'user');
    const lastUserMsg = userMessages[userMessages.length - 1];
    const prevUserMsg = userMessages.length > 1 ? userMessages[userMessages.length - 2] : undefined;
    const prevAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant');

    const modResult = contentModerationService.evaluate(
      lastUserMsg?.promptContent || lastUserMsg?.content || '',
      {
        previousQuestion: prevUserMsg?.content,
        previousAnswer: prevAssistantMsg?.content
      }
    );

    if (modResult.decision !== 'ALLOW') {
      callbacks.onChunk?.(modResult.userExplanation);
      const refusalResponse: AIResponse = {
        content: modResult.userExplanation,
        source: 'local',
        model: 'content-safety-guard',
        elapsedMs: Date.now() - startTime
      };
      callbacks.onComplete?.(refusalResponse);
      return refusalResponse;
    }

    if (learnerProfile) {
      enrichedSystemPrompt += `\nLearner: ${learnerProfile.name || 'Alex'} (${
        learnerProfile.learningStyle || 'Examples first'
      }). Keep explanations focused on the user's question.`;
    }

    // Optimization: Feed system prompt + recent conversation turns
    // to minimize prompt prefill latency on lightweight WebGPU local models.
    let recentHistory = messages.filter((m) => m.role === 'user' || m.role === 'assistant');
    if (recentHistory.length > 4) {
      recentHistory = recentHistory.slice(-4);
      // Ensure history slice begins with a user message for coherent dialogue
      if (recentHistory[0]?.role === 'assistant') {
        recentHistory = recentHistory.slice(1);
      }
    }

    const chatMessages: webllm.ChatCompletionMessageParam[] = [
      { role: 'system', content: enrichedSystemPrompt },
      ...recentHistory.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.promptContent || m.content
      }))
    ];

    let accumulatedContent = '';
    let hasEmittedFirstToken = false;

    // Immediately interrupt generation when signal fires, even during prefill
    const abortHandler = () => {
      try {
        this.engine?.interruptGenerate();
      } catch (_) {}
    };
    if (signal) {
      if (signal.aborted) {
        abortHandler();
        throw new Error('Local inference was stopped by user.');
      }
      signal.addEventListener('abort', abortHandler, { once: true });
    }

    try {
      callbacks.onPhaseChange?.('generating', 'Generating answer...');

      const asyncChunkGenerator = await this.engine.chat.completions.create({
        messages: chatMessages,
        stream: true,
        temperature: temperature ?? 0.6,
        max_tokens: maxTokens ?? 384
      });

      for await (const chunk of asyncChunkGenerator) {
        if (signal?.aborted) {
          abortHandler();
          break;
        }

        const delta = chunk.choices[0]?.delta?.content || '';
        if (delta) {
          if (!hasEmittedFirstToken) {
            hasEmittedFirstToken = true;
            callbacks.onPhaseChange?.('streaming', 'Streaming response...');
          }
          accumulatedContent += delta;
          callbacks.onChunk?.(delta);
        }
      }
    } catch (err: any) {
      if (signal?.aborted) {
        throw new Error('Local inference was stopped by user.');
      }
      throw new Error(`Local inference error: ${err.message}`);
    } finally {
      if (signal) {
        signal.removeEventListener('abort', abortHandler);
      }
    }

    const elapsedMs = Date.now() - startTime;
    const parsed = parseCodeAndExplanation(accumulatedContent);

    const result: AIResponse = {
      content: parsed.cleanContent,
      code: parsed.code,
      explanation: parsed.explanation,
      source: 'local',
      model: this.currentModelId,
      elapsedMs
    };

    callbacks.onComplete?.(result);
    return result;
  }
}

export const localWebLLMAdapter = new LocalWebLLMAdapter();
