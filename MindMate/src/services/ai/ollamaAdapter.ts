import { resolveTopicMetadata, type AdaptiveQuestionItem } from '../../data/learningContent';
import { STRATEGY_LABELS } from '../adaptive/adaptiveLearningEngine';
import type {
  AdaptiveTeachingContext,
  AIMessage,
  AIResponse,
  AIStreamCallbacks,
  IAITutorAdapter,
  OllamaHealthState,
  OllamaStatusKind,
  SendMessageOptions,
} from './types';

function getEnvVar(key: string): string | undefined {
  try {
    const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> })?.env;
    if (metaEnv && metaEnv[key] && String(metaEnv[key]).trim().length > 0) {
      return String(metaEnv[key]).trim();
    }
  } catch {
    // Ignore when running outside Vite
  }
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      const val = String(process.env[key]).trim();
      if (val.length > 0) return val;
    }
  } catch {
    // Ignore
  }
  return undefined;
}

export const DEFAULT_OLLAMA_MODEL =
  getEnvVar('VITE_OLLAMA_MODEL') || 'gemma4:e2b-it-qat';
export const DEFAULT_OLLAMA_DIRECT_URL = 'http://127.0.0.1:11434';
export const DEFAULT_OLLAMA_PROXY_URL = '/ollama';
const HEALTH_CACHE_TTL_MS = 15_000;

export class OllamaError extends Error {
  public readonly kind: OllamaStatusKind;
  public readonly recoveryGuidance?: string;

  constructor(kind: OllamaStatusKind, message: string, recoveryGuidance?: string) {
    super(message);
    this.name = 'OllamaError';
    this.kind = kind;
    this.recoveryGuidance = recoveryGuidance;
  }
}

/**
 * Strip accidental personal identifiers (emails, bearer tokens, JWTs) before sending
 * any pedagogical prompt to the LLM.
 */
export function sanitizePromptText(input: string): string {
  if (!input) return '';
  return input
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[redacted-email]')
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, '[redacted-token]')
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[redacted-jwt]');
}

/**
 * Build an adaptive system prompt tailored to the learner's topic mastery,
 * recurring mistakes, chosen explanation strategy, and optional uploaded study material.
 */
export function buildAdaptiveTeachingSystemPrompt(
  baseSystemPrompt?: string,
  learnerProfile?: SendMessageOptions['learnerProfile'],
  adaptiveContext?: AdaptiveTeachingContext
): string {
  const parts: string[] = [];

  parts.push(
    baseSystemPrompt ||
      'You are MindMate Local AI Tutor powered by Gemma 4. Provide clear, accurate, encouraging computer science instruction.'
  );

  if (learnerProfile) {
    const style = learnerProfile.learningStyle || 'step-by-step';
    const level = learnerProfile.level || 'undergraduate CS';
    const goal = learnerProfile.goal ? sanitizePromptText(learnerProfile.goal) : 'Concept Mastery';
    parts.push(`Learner preferences: style=${style}, level=${level}, goal=${goal}.`);
  }

  if (adaptiveContext) {
    const strategyKey = adaptiveContext.explanationStrategy || 'step-by-step';
    const strategyName = STRATEGY_LABELS[strategyKey] || strategyKey;

    parts.push('--- ADAPTIVE PEDAGOGICAL DIRECTIVES ---');
    if (adaptiveContext.topicName) {
      parts.push(`Target Topic: ${adaptiveContext.topicName}`);
    }
    if (adaptiveContext.masteryScore !== undefined) {
      parts.push(
        `Current Topic Mastery: ${adaptiveContext.masteryScore}% (confidence: ${adaptiveContext.confidenceLevel || 'low'})`
      );
    }
    if (adaptiveContext.targetDifficulty) {
      parts.push(`Target Difficulty Band: ${adaptiveContext.targetDifficulty}`);
    }
    parts.push(`Required Explanation Strategy: ${strategyName} (${strategyKey})`);
    if (adaptiveContext.strategyReason) {
      parts.push(`Why this strategy was selected: ${adaptiveContext.strategyReason}`);
    }

    switch (strategyKey) {
      case 'simple-analogy':
        parts.push(
          'Instruction: Start with a concrete everyday analogy before introducing formal syntax, then walk through one minimal worked code example.'
        );
        break;
      case 'worked-example':
        parts.push(
          'Instruction: Provide an annotated, line-by-line worked code/SQL example showing input, state transitions, and final output.'
        );
        break;
      case 'prerequisite-review':
        parts.push(
          'Instruction: Briefly bridge the foundational prerequisite concept first, then connect it directly to the current topic.'
        );
        break;
      case 'conceptual-recap':
        parts.push(
          'Instruction: Give a structured core concept summary (definition, key rule, common pitfall) with a short illustrative snippet.'
        );
        break;
      case 'guided-practice':
        parts.push(
          'Instruction: Explain concisely at an advanced level and conclude with a thought-provoking follow-up verification check.'
        );
        break;
      case 'step-by-step':
      default:
        parts.push(
          'Instruction: Break the explanation into numbered, logical steps with a clear code example.'
        );
        break;
    }

    if (
      adaptiveContext.recentMistakesSummary &&
      adaptiveContext.recentMistakesSummary.length > 0
    ) {
      const cleanedMistakes = adaptiveContext.recentMistakesSummary
        .slice(0, 3)
        .map((m) => sanitizePromptText(m));
      parts.push(
        `Recent learner mistake patterns to address gently:\n- ${cleanedMistakes.join('\n- ')}`
      );
    }

    if (
      adaptiveContext.studyMaterialExcerpt &&
      adaptiveContext.studyMaterialExcerpt.trim().length > 0
    ) {
      const title = adaptiveContext.studyMaterialTitle || 'Uploaded Study Material';
      parts.push(
        `--- GROUNDING MATERIAL (${sanitizePromptText(title)}) ---\n` +
          `${sanitizePromptText(adaptiveContext.studyMaterialExcerpt.slice(0, 1800))}\n` +
          `Ground your explanation in the excerpt above and explicitly cite "${sanitizePromptText(title)}" where relevant.`
      );
    } else {
      parts.push(
        'Grounding Rule: No uploaded learner document was provided for this request. Do NOT claim that your response is grounded in or quoting the learner’s uploaded notes.'
      );
    }
  }

  return parts.join('\n\n');
}

export interface ValidatedQuestionDraft {
  id: string;
  topicId: string;
  language: 'en';
  difficulty: number;
  question: string;
  options: [string, string, string, string];
  correct: number;
  explanation: string;
  concept?: string;
}

/**
 * Strictly validate an LLM-generated practice question draft before it can be shown
 * to a learner. Rejects malformed JSON, missing fields, invalid option counts,
 * out-of-range answer indices, or mismatched topic/difficulty.
 */
export function validateGeneratedQuestionDraft(
  rawText: string,
  expectedTopicId: string,
  expectedDifficulty: number
): { valid: true; draft: AdaptiveQuestionItem } | { valid: false; reason: string } {
  if (!rawText || typeof rawText !== 'string') {
    return { valid: false, reason: 'Empty response from model.' };
  }

  const fencedMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidateJson = fencedMatch ? fencedMatch[1].trim() : rawText.trim();
  const firstBrace = candidateJson.indexOf('{');
  const lastBrace = candidateJson.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return { valid: false, reason: 'Response does not contain a JSON object.' };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(candidateJson.slice(firstBrace, lastBrace + 1));
  } catch (err) {
    return {
      valid: false,
      reason: `Malformed JSON: ${err instanceof Error ? err.message : 'parse error'}`,
    };
  }

  const question = typeof parsed.question === 'string' ? parsed.question.trim() : '';
  if (question.length < 10) {
    return { valid: false, reason: 'Question text is missing or too short (< 10 chars).' };
  }

  if (!Array.isArray(parsed.options) || parsed.options.length !== 4) {
    return { valid: false, reason: 'Options must be an array of exactly 4 strings.' };
  }

  const cleanedOptions = parsed.options.map((o) =>
    typeof o === 'string' ? o.trim() : ''
  );
  if (cleanedOptions.some((o) => o.length === 0)) {
    return { valid: false, reason: 'All 4 options must be non-empty strings.' };
  }
  if (new Set(cleanedOptions.map((o) => o.toLowerCase())).size < 4) {
    return { valid: false, reason: 'All 4 options must be distinct.' };
  }

  const correct = Number(parsed.correct);
  if (!Number.isInteger(correct) || correct < 0 || correct > 3) {
    return {
      valid: false,
      reason: 'Field `correct` must be an integer index between 0 and 3.',
    };
  }

  const explanation =
    typeof parsed.explanation === 'string' ? parsed.explanation.trim() : '';
  if (explanation.length < 10) {
    return {
      valid: false,
      reason: 'Explanation is missing or too short (< 10 chars).',
    };
  }

  const resolvedTopic = resolveTopicMetadata(expectedTopicId);
  const draftTopicId =
    typeof parsed.topicId === 'string' && parsed.topicId.trim().length > 0
      ? resolveTopicMetadata(parsed.topicId).id
      : resolvedTopic.id;

  if (draftTopicId !== resolvedTopic.id) {
    return {
      valid: false,
      reason: `Topic mismatch: expected "${resolvedTopic.id}", received "${draftTopicId}".`,
    };
  }

  const clampedExpectedDiff = Math.max(1, Math.min(5, Math.round(expectedDifficulty)));
  const parsedDiff =
    parsed.difficulty !== undefined ? Number(parsed.difficulty) : clampedExpectedDiff;
  if (
    !Number.isInteger(parsedDiff) ||
    parsedDiff < 1 ||
    parsedDiff > 5 ||
    Math.abs(parsedDiff - clampedExpectedDiff) > 1
  ) {
    return {
      valid: false,
      reason: `Difficulty ${String(parsed.difficulty)} is outside target difficulty ${clampedExpectedDiff}.`,
    };
  }

  return {
    valid: true,
    draft: {
      id: `ollama-draft-${resolvedTopic.id}-${Date.now()}`,
      topicId: resolvedTopic.id,
      language: 'en',
      difficulty: clampedExpectedDiff,
      question,
      options: cleanedOptions,
      correct,
      explanation,
      concept:
        typeof parsed.concept === 'string' && parsed.concept.trim().length > 0
          ? parsed.concept.trim()
          : undefined,
    },
  };
}

function extractCodeAndExplanation(rawContent: string): {
  code?: string;
  explanation?: string;
} {
  const codeBlockRegex = /```(?:python|sql|javascript|typescript|java|cpp|c|bash)?\n([\s\S]*?)```/i;
  const match = rawContent.match(codeBlockRegex);
  if (match && match[1]) {
    const code = match[1].trim();
    const explanation = rawContent.replace(codeBlockRegex, '').trim();
    return { code, explanation: explanation || rawContent };
  }
  return {};
}

/**
 * Exact model name verification against Ollama's `/api/tags` list.
 * Requires exact tag match when a tag is specified (e.g. `gemma4:e2b-it-qat` !== `gemma4:e2b`).
 * Only allows `:latest` suffix when the requested model omitted a tag altogether.
 */
export function modelMatches(installedName: string, requestedModel: string): boolean {
  const normInstalled = installedName.trim().toLowerCase();
  const normRequested = requestedModel.trim().toLowerCase();
  if (!normInstalled || !normRequested) return false;
  if (normInstalled === normRequested) return true;
  if (!normRequested.includes(':') && normInstalled === `${normRequested}:latest`) {
    return true;
  }
  return false;
}

export class OllamaAdapter implements IAITutorAdapter {
  private model: string;
  private baseUrl: string;
  private resolvedEndpoint: string | null = null;
  private fetchFn: typeof fetch;
  private lastHealthState: OllamaHealthState | null = null;
  private inflightHealthPromise: Promise<OllamaHealthState> | null = null;

  constructor(options?: {
    model?: string;
    baseUrl?: string;
    fetchImpl?: typeof fetch;
  }) {
    this.model =
      options?.model || getEnvVar('VITE_OLLAMA_MODEL') || DEFAULT_OLLAMA_MODEL;
    const configuredBase =
      options?.baseUrl || getEnvVar('VITE_OLLAMA_BASE_URL');
    if (configuredBase) {
      this.baseUrl = configuredBase.replace(/\/+$/, '');
    } else if (typeof window !== 'undefined') {
      this.baseUrl = DEFAULT_OLLAMA_PROXY_URL;
    } else {
      this.baseUrl = DEFAULT_OLLAMA_DIRECT_URL;
    }
    this.fetchFn = options?.fetchImpl || globalThis.fetch.bind(globalThis);
  }

  public getModel(): string {
    return this.model;
  }

  public setModel(model: string): void {
    if (model && model.trim().length > 0 && model.trim() !== this.model) {
      this.model = model.trim();
      this.lastHealthState = null;
    }
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public getLastHealthState(): OllamaHealthState | null {
    return this.lastHealthState;
  }

  private getCandidateBaseUrls(): string[] {
    const urls: string[] = [];
    if (this.resolvedEndpoint) {
      urls.push(this.resolvedEndpoint);
    }
    if (!urls.includes(this.baseUrl)) {
      urls.push(this.baseUrl);
    }
    if (
      !urls.includes(DEFAULT_OLLAMA_DIRECT_URL) &&
      !this.baseUrl.startsWith('http')
    ) {
      urls.push(DEFAULT_OLLAMA_DIRECT_URL);
    }
    return urls;
  }

  /**
   * Perform an explicit health check against Ollama (/api/tags) and distinguish:
   * - 'available': Ollama running AND configured model (e.g. gemma4:e2b-it-qat) is installed
   * - 'model_missing': Ollama running, but the exact configured model is not installed
   * - 'not_running': Ollama daemon is unreachable
   * - 'timeout': Request timed out
   * - 'invalid_output': Response from /api/tags was not valid Ollama JSON
   */
  public async checkHealth(
    timeoutMs = 3500,
    forceRefresh = false
  ): Promise<OllamaHealthState> {
    if (
      !forceRefresh &&
      this.lastHealthState &&
      this.lastHealthState.configuredModel === this.model &&
      this.lastHealthState.checkedAt &&
      Date.now() - this.lastHealthState.checkedAt < HEALTH_CACHE_TTL_MS
    ) {
      return this.lastHealthState;
    }

    if (!forceRefresh && this.inflightHealthPromise) {
      return this.inflightHealthPromise;
    }

    const promise = this.performHealthCheck(timeoutMs);
    this.inflightHealthPromise = promise;
    try {
      return await promise;
    } finally {
      if (this.inflightHealthPromise === promise) {
        this.inflightHealthPromise = null;
      }
    }
  }

  private async performHealthCheck(timeoutMs: number): Promise<OllamaHealthState> {
    const candidates = this.getCandidateBaseUrls();
    let lastError: unknown = null;
    let sawTimeout = false;

    for (const candidateBase of candidates) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await this.fetchFn(`${candidateBase}/api/tags`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        clearTimeout(timer);

        // When Vite proxy cannot connect to 127.0.0.1:11434, Vite returns 500/502/504
        if (res.status === 502 || res.status === 503 || res.status === 504) {
          lastError = new Error(`Proxy received HTTP ${res.status}`);
          continue;
        }

        if (!res.ok) {
          lastError = new Error(`HTTP ${res.status}`);
          continue;
        }

        const rawText = await res.text();
        let data: { models?: Array<{ name?: string; model?: string }> };
        try {
          data = JSON.parse(rawText);
        } catch {
          if (rawText.trim().startsWith('<') && candidateBase !== DEFAULT_OLLAMA_DIRECT_URL) {
            continue;
          }
          const invalidState: OllamaHealthState = {
            status: 'invalid_output',
            available: false,
            configuredModel: this.model,
            availableModels: [],
            endpoint: candidateBase,
            message: 'Ollama returned malformed JSON from /api/tags.',
            recoveryGuidance:
              'Verify that port 11434 is serving Ollama (`ollama serve`) and not another service.',
            checkedAt: Date.now(),
          };
          this.lastHealthState = invalidState;
          return invalidState;
        }

        if (!data || !Array.isArray(data.models)) {
          const invalidState: OllamaHealthState = {
            status: 'invalid_output',
            available: false,
            configuredModel: this.model,
            availableModels: [],
            endpoint: candidateBase,
            message: 'Ollama /api/tags response did not include a `models` array.',
            recoveryGuidance: 'Check your Ollama version (`ollama --version`).',
            checkedAt: Date.now(),
          };
          this.lastHealthState = invalidState;
          return invalidState;
        }

        this.resolvedEndpoint = candidateBase;

        const installedModels = data.models
          .map((m) => m.name || m.model || '')
          .filter((name) => name.length > 0);

        const matchedModelName = installedModels.find((installed) =>
          modelMatches(installed, this.model)
        );

        if (!matchedModelName) {
          const missingState: OllamaHealthState = {
            status: 'model_missing',
            available: false,
            configuredModel: this.model,
            availableModels: installedModels,
            endpoint: candidateBase,
            message: `Ollama is running, but configured model "${this.model}" is not installed.${
              installedModels.length > 0
                ? ` Installed models: ${installedModels.join(', ')}.`
                : ' No models are currently pulled.'
            }`,
            recoveryGuidance: `Run \`ollama pull ${this.model}\` in your terminal to download "${this.model}".`,
            checkedAt: Date.now(),
          };
          this.lastHealthState = missingState;
          return missingState;
        }

        const availableState: OllamaHealthState = {
          status: 'available',
          available: true,
          configuredModel: matchedModelName,
          availableModels: installedModels,
          endpoint: candidateBase,
          message: `Ollama is connected and model "${matchedModelName}" is verified and ready.`,
          checkedAt: Date.now(),
        };
        this.lastHealthState = availableState;
        return availableState;
      } catch (err) {
        clearTimeout(timer);
        if (
          err instanceof Error &&
          (err.name === 'AbortError' || /timed?\s*out|aborted/i.test(err.message))
        ) {
          sawTimeout = true;
        }
        lastError = err;
      }
    }

    if (sawTimeout) {
      const timeoutState: OllamaHealthState = {
        status: 'timeout',
        available: false,
        configuredModel: this.model,
        availableModels: [],
        endpoint: this.baseUrl,
        message: `Connection to Ollama at http://127.0.0.1:11434 timed out after ${timeoutMs}ms.`,
        recoveryGuidance:
          'Ensure `ollama serve` is responsive and not blocked by another heavy process.',
        checkedAt: Date.now(),
      };
      this.lastHealthState = timeoutState;
      return timeoutState;
    }

    const notRunningState: OllamaHealthState = {
      status: 'not_running',
      available: false,
      configuredModel: this.model,
      availableModels: [],
      endpoint: this.baseUrl,
      message: `Ollama is not running at http://127.0.0.1:11434${
        lastError instanceof Error && lastError.message
          ? ` (${lastError.message})`
          : ''
      }.`,
      recoveryGuidance:
        `1. Install Ollama (if needed): \`brew install ollama\`\n` +
        `2. Start the server: \`ollama serve\`\n` +
        `3. Pull Gemma 4: \`ollama pull ${this.model}\``,
      checkedAt: Date.now(),
    };
    this.lastHealthState = notRunningState;
    return notRunningState;
  }

  public async isAvailable(): Promise<boolean> {
    const health = await this.checkHealth();
    return health.available;
  }

  /**
   * Send a chat request to Ollama's `/api/chat` endpoint with streaming NDJSON support,
   * AbortController cancellation, separate first-load vs stream-idle timeouts,
   * and strict output validation.
   *
   * Never sends requests to any cloud API.
   */
  public async sendChatStream(
    options: SendMessageOptions,
    callbacks: AIStreamCallbacks
  ): Promise<AIResponse> {
    const startTime = Date.now();
    callbacks.onPhaseChange?.('preparing', `Verifying local Ollama (${this.model})...`);

    const healthCheckTimeout = options.timeoutMs
      ? Math.min(options.timeoutMs, 4000)
      : 3500;
    const health = await this.checkHealth(healthCheckTimeout, false);
    if (!health.available) {
      const err = new OllamaError(
        health.status,
        `${health.message}${health.recoveryGuidance ? ` — ${health.recoveryGuidance}` : ''}`,
        health.recoveryGuidance
      );
      callbacks.onPhaseChange?.('failed', err.message);
      callbacks.onError?.(err);
      throw err;
    }

    const activeModel = health.configuredModel || this.model;

    const systemContent = buildAdaptiveTeachingSystemPrompt(
      options.systemPrompt,
      options.learnerProfile,
      options.adaptiveContext
    );

    // Keep recent conversation turns concise to avoid unnecessary prompt prefill delay on local hardware
    const nonEmptyMessages = options.messages.filter(
      (m: AIMessage) => (m.promptContent || m.content || '').trim().length > 0
    );
    const trimmedHistory =
      nonEmptyMessages.length > 8 ? nonEmptyMessages.slice(-8) : nonEmptyMessages;

    const formattedMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemContent },
      ...trimmedHistory.map((m: AIMessage) => ({
        role: m.role,
        content: sanitizePromptText(m.promptContent || m.content),
      })),
    ];

    // Separate initial cold-load timeout (default 90s for MacBook Air M2 first load)
    // and stream idle timeout (default 30s between chunks once streaming starts)
    const initialTimeoutMs =
      options.initialTimeoutMs ?? options.timeoutMs ?? 90_000;
    const streamIdleTimeoutMs =
      options.streamIdleTimeoutMs ?? options.timeoutMs ?? 30_000;

    const timeoutController = new AbortController();
    let timedOut = false;
    let activeTimeoutMs = initialTimeoutMs;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const resetTimer = (ms: number) => {
      activeTimeoutMs = ms;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timedOut = true;
        timeoutController.abort();
      }, ms);
    };

    resetTimer(initialTimeoutMs);

    const onCallerAbort = () => timeoutController.abort();
    if (options.signal) {
      if (options.signal.aborted) {
        if (timer) clearTimeout(timer);
        throw new OllamaError('error', 'Generation cancelled by user.');
      }
      options.signal.addEventListener('abort', onCallerAbort, { once: true });
    }

    callbacks.onPhaseChange?.(
      'loading_model',
      `Loading ${activeModel} on local Ollama (first request may take a moment)...`
    );

    try {
      const endpoint = `${health.endpoint}/api/chat`;
      const res = await this.fetchFn(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: activeModel,
          messages: formattedMessages,
          stream: true,
          think: false,
          options: {
            temperature: options.temperature ?? 0.4,
            num_predict: options.maxTokens ?? 1024,
          },
        }),
        signal: timeoutController.signal,
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        if (res.status === 404 || /model .* not found/i.test(errBody)) {
          this.lastHealthState = null;
          throw new OllamaError(
            'model_missing',
            `Model "${activeModel}" was not found in Ollama.`,
            `Run \`ollama pull ${activeModel}\` in your terminal.`
          );
        }
        throw new OllamaError(
          'error',
          `Ollama generation failed with HTTP ${res.status}${errBody ? `: ${errBody.slice(0, 180)}` : ''}`
        );
      }

      callbacks.onPhaseChange?.('generating', `Generating with local ${activeModel}...`);

      let fullContent = '';
      let firstContentChunk = true;
      let loadDurationMs: number | undefined;
      let promptEvalDurationMs: number | undefined;
      let evalDurationMs: number | undefined;

      const processParsedLine = (parsedLine: {
        message?: { content?: string; thinking?: string };
        response?: string;
        done?: boolean;
        error?: string;
        load_duration?: number;
        prompt_eval_duration?: number;
        eval_duration?: number;
      }) => {
        if (parsedLine.error) {
          throw new OllamaError('error', `Ollama error: ${parsedLine.error}`);
        }

        if (typeof parsedLine.load_duration === 'number') {
          loadDurationMs = Math.round(parsedLine.load_duration / 1_000_000);
        }
        if (typeof parsedLine.prompt_eval_duration === 'number') {
          promptEvalDurationMs = Math.round(parsedLine.prompt_eval_duration / 1_000_000);
        }
        if (typeof parsedLine.eval_duration === 'number') {
          evalDurationMs = Math.round(parsedLine.eval_duration / 1_000_000);
        }

        // If the model emits thinking tokens before content, keep the stream alive
        if (parsedLine.message?.thinking && firstContentChunk) {
          resetTimer(streamIdleTimeoutMs);
          callbacks.onPhaseChange?.('generating', `Reasoning with ${activeModel}...`);
        }

        const token = parsedLine.message?.content ?? parsedLine.response ?? '';
        if (token) {
          resetTimer(streamIdleTimeoutMs);
          if (firstContentChunk) {
            firstContentChunk = false;
            callbacks.onPhaseChange?.('streaming', `Streaming from ${activeModel}...`);
          }
          fullContent += token;
          callbacks.onChunk?.(token);
        }
      };

      if (res.body && typeof res.body.getReader === 'function') {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          resetTimer(streamIdleTimeoutMs);
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) continue;
            let parsedLine: Record<string, unknown>;
            try {
              parsedLine = JSON.parse(line);
            } catch {
              throw new OllamaError(
                'invalid_output',
                'Received malformed JSON chunk from Ollama /api/chat stream.'
              );
            }
            processParsedLine(parsedLine as any);
          }
        }

        // Flush any remaining multi-byte sequence in TextDecoder
        buffer += decoder.decode();
        if (buffer.trim().length > 0) {
          const remainingLines = buffer.split('\n');
          for (const rawTail of remainingLines) {
            const tail = rawTail.trim();
            if (!tail) continue;
            let parsedTail: Record<string, unknown>;
            try {
              parsedTail = JSON.parse(tail);
            } catch {
              throw new OllamaError(
                'invalid_output',
                'Received malformed trailing JSON from Ollama /api/chat.'
              );
            }
            processParsedLine(parsedTail as any);
          }
        }
      } else {
        const rawText = await res.text();
        const lines = rawText
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.length > 0);
        if (lines.length === 0) {
          throw new OllamaError(
            'invalid_output',
            'Ollama returned empty output from /api/chat.'
          );
        }
        for (const line of lines) {
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(line);
          } catch {
            throw new OllamaError(
              'invalid_output',
              'Ollama returned non-JSON output from /api/chat.'
            );
          }
          processParsedLine(parsed as any);
        }
      }

      if (!fullContent || fullContent.trim().length === 0) {
        throw new OllamaError(
          'invalid_output',
          `Ollama model "${activeModel}" returned an empty response.`
        );
      }

      const elapsedMs = Date.now() - startTime;
      const { code, explanation } = extractCodeAndExplanation(fullContent);
      const response: AIResponse = {
        content: fullContent,
        code,
        explanation,
        source: 'ollama',
        model: activeModel,
        elapsedMs,
        loadDurationMs,
        promptEvalDurationMs,
        evalDurationMs,
        groundedInMaterial: Boolean(
          options.adaptiveContext?.studyMaterialExcerpt &&
            options.adaptiveContext.studyMaterialExcerpt.trim().length > 0
        ),
        groundedMaterialTitle: options.adaptiveContext?.studyMaterialTitle,
      };

      callbacks.onPhaseChange?.('completed', `Completed in ${(elapsedMs / 1000).toFixed(1)}s`);
      callbacks.onComplete?.(response);
      return response;
    } catch (err) {
      if (err instanceof OllamaError) {
        callbacks.onPhaseChange?.('failed', err.message);
        callbacks.onError?.(err);
        throw err;
      }
      if (options.signal?.aborted) {
        const cancelErr = new OllamaError('error', 'Generation cancelled by user.');
        callbacks.onPhaseChange?.('cancelled', cancelErr.message);
        throw cancelErr;
      }
      if (
        timedOut ||
        (err instanceof Error &&
          (err.name === 'AbortError' || /timed?\s*out/i.test(err.message)))
      ) {
        const timeoutErr = new OllamaError(
          'timeout',
          `Local Ollama (${activeModel}) request timed out after ${activeTimeoutMs}ms.`,
          'Wait a moment if the model is still loading into memory, or click Retry.'
        );
        callbacks.onPhaseChange?.('failed', timeoutErr.message);
        callbacks.onError?.(timeoutErr);
        throw timeoutErr;
      }
      const wrapped = new OllamaError(
        'error',
        err instanceof Error ? err.message : 'Ollama generation failed.'
      );
      callbacks.onPhaseChange?.('failed', wrapped.message);
      callbacks.onError?.(wrapped);
      throw wrapped;
    } finally {
      if (timer) clearTimeout(timer);
      if (options.signal) {
        options.signal.removeEventListener('abort', onCallerAbort);
      }
    }
  }

  /**
   * Generate a schema-validated practice question draft using Gemma 4 (`gemma4:e2b-it-qat`),
   * retrying up to `maxRetries` times with a stricter repair prompt if the model
   * returns invalid JSON or fails validation.
   */
  public async generateValidatedPracticeQuestion(params: {
    topicId: string;
    difficulty: number;
    focusConcept?: string;
    recentMistakeSummary?: string;
    maxRetries?: number;
    timeoutMs?: number;
  }): Promise<AdaptiveQuestionItem> {
    const {
      topicId,
      difficulty,
      focusConcept,
      recentMistakeSummary,
      maxRetries = 2,
      timeoutMs = 45000,
    } = params;

    const topicMeta = resolveTopicMetadata(topicId);
    const clampedDiff = Math.max(1, Math.min(5, Math.round(difficulty)));
    let lastValidationReason = 'No output generated';

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const repairHint =
        attempt > 0
          ? `\nIMPORTANT: Your previous output failed validation because: ${lastValidationReason}. Output ONLY a raw JSON object with no markdown prose.`
          : '';

      const prompt =
        `Create one multiple-choice computer science question for topic "${topicMeta.name}" (topicId: "${topicMeta.id}") at difficulty ${clampedDiff} (scale 1=easy to 5=hard).` +
        (focusConcept ? ` Focus on concept: ${sanitizePromptText(focusConcept)}.` : '') +
        (recentMistakeSummary
          ? ` Address this learner difficulty: ${sanitizePromptText(recentMistakeSummary)}.`
          : '') +
        `\nReturn ONLY valid JSON matching this exact schema:\n` +
        `{\n` +
        `  "topicId": "${topicMeta.id}",\n` +
        `  "difficulty": ${clampedDiff},\n` +
        `  "concept": "${focusConcept || topicMeta.conceptTags?.[0] || 'core-concept'}",\n` +
        `  "question": "Clear question text?",\n` +
        `  "options": ["Option A", "Option B", "Option C", "Option D"],\n` +
        `  "correct": 1,\n` +
        `  "explanation": "Clear explanation of why the correct option is right."\n` +
        `}` +
        repairHint;

      const response = await this.sendChatStream(
        {
          messages: [{ role: 'user', content: prompt }],
          systemPrompt:
            'You are a strict JSON assessment generator. Output only valid JSON matching the requested schema.',
          temperature: 0.2,
          maxTokens: 512,
          timeoutMs,
        },
        {}
      );

      const validation = validateGeneratedQuestionDraft(
        response.content,
        topicMeta.id,
        clampedDiff
      );
      if (validation.valid) {
        return validation.draft;
      }
      lastValidationReason = validation.reason;
    }

    throw new OllamaError(
      'invalid_output',
      `Gemma 4 question draft failed schema validation after ${maxRetries + 1} attempts: ${lastValidationReason}`
    );
  }
}

export const ollamaAdapter = new OllamaAdapter();
