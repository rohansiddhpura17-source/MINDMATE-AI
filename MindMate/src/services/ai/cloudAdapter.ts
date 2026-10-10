import { IAITutorAdapter, SendMessageOptions, AIStreamCallbacks, AIResponse } from './types';

export class CloudAIAdapter implements IAITutorAdapter {
  private apiBaseUrl: string;

  constructor(apiBaseUrl = '/api/ai') {
    this.apiBaseUrl = apiBaseUrl;
  }

  public async getStatus(): Promise<{
    configured: boolean;
    provider: string;
    model: string;
    message?: string;
  }> {
    try {
      const res = await fetch(`${this.apiBaseUrl}/status`, {
        signal: AbortSignal.timeout(4000)
      });
      if (!res.ok) {
        return {
          configured: false,
          provider: 'unknown',
          model: 'unknown',
          message: `Backend returned HTTP ${res.status}`
        };
      }
      return await res.json();
    } catch (err: any) {
      return {
        configured: false,
        provider: 'unknown',
        model: 'unknown',
        message: 'Backend AI service unreachable. Ensure backend server is running on port 4000.'
      };
    }
  }

  public async isAvailable(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return false;
    }
    const status = await this.getStatus();
    return Boolean(status.configured);
  }

  public async sendChatStream(
    options: SendMessageOptions,
    callbacks: AIStreamCallbacks
  ): Promise<AIResponse> {
    const startTime = Date.now();
    callbacks.onPhaseChange?.('preparing', 'Connecting to Gemini Cloud AI...');

    const { messages, systemPrompt, learnerProfile, temperature, maxTokens, signal } = options;

    // Construct enriched system prompt with learner context
    let enrichedSystemPrompt = systemPrompt || 'You are MindMate, an adaptive educational AI tutor.';
    if (learnerProfile) {
      enrichedSystemPrompt += `\n\nLearner Context:\n- Name: ${learnerProfile.name || 'Alex'}\n- Learning Preference: ${learnerProfile.learningStyle || 'Examples first'}\n- Current Level: ${learnerProfile.level || 'Intermediate'}\n- Goal: ${learnerProfile.goal || 'Mastery'}\nPlease adapt your explanations accordingly.`;
    }

    const payload = {
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      systemPrompt: enrichedSystemPrompt,
      temperature,
      maxTokens,
      stream: true
    };

    let response: Response;
    try {
      callbacks.onPhaseChange?.('generating', 'Generating answer with Gemini...');
      response = await fetch(`${this.apiBaseUrl}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream, application/json'
        },
        body: JSON.stringify(payload),
        signal
      });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('Cloud AI request was cancelled.');
      }
      throw new Error(`Failed to contact cloud AI backend: ${err.message}. Is backend running on port 4000?`);
    }

    if (!response.ok) {
      let errorMsg = `Server error ${response.status}`;
      try {
        const errJson = await response.json();
        errorMsg = errJson.message || errJson.error || errorMsg;
      } catch {}
      throw new Error(errorMsg);
    }

    const contentType = response.headers.get('content-type') || '';
    let accumulatedContent = '';
    let resolvedModel = 'gemini-2.5-flash';

    if (contentType.includes('text/event-stream')) {
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Streaming response body is null.');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              const dataStr = trimmed.slice(6).trim();
              if (dataStr === '[DONE]') continue;

              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.error) {
                  throw new Error(parsed.error);
                }
                if (parsed.chunk) {
                  accumulatedContent += parsed.chunk;
                  callbacks.onPhaseChange?.('streaming', 'Streaming response...');
                  callbacks.onChunk?.(parsed.chunk);
                }
                if (parsed.model) {
                  resolvedModel = parsed.model;
                }
              } catch (e: any) {
                if (e.message && !e.message.includes('JSON')) {
                  throw e;
                }
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } else {
      // Fallback JSON response
      const data = await response.json();
      accumulatedContent = data.content || '';
      resolvedModel = data.model || resolvedModel;
      callbacks.onChunk?.(accumulatedContent);
    }

    const elapsedMs = Date.now() - startTime;
    const parsed = parseCodeAndExplanation(accumulatedContent);

    const result: AIResponse = {
      content: parsed.cleanContent,
      code: parsed.code,
      explanation: parsed.explanation,
      source: 'cloud',
      model: resolvedModel,
      elapsedMs
    };

    callbacks.onComplete?.(result);
    return result;
  }
}

/** Helper to extract code blocks from markdown responses */
export function parseCodeAndExplanation(text: string): {
  cleanContent: string;
  code?: string;
  explanation?: string;
} {
  const codeBlockRegex = /```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/;
  const match = text.match(codeBlockRegex);

  if (match) {
    const code = match[1].trim();
    // Content before code
    const beforeCode = text.slice(0, match.index).trim();
    // Content after code
    const afterCode = text.slice((match.index || 0) + match[0].length).trim();

    return {
      cleanContent: beforeCode || text,
      code,
      explanation: afterCode || undefined
    };
  }

  return { cleanContent: text };
}

export const cloudAIAdapter = new CloudAIAdapter();
