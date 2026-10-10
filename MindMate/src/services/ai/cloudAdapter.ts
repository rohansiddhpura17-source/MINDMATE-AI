import { IAITutorAdapter, SendMessageOptions, AIStreamCallbacks, AIResponse } from './types';
import { RESPONSE_FORMATTING_GUIDELINES } from './responseFormatting';
import { contentModerationService } from '../safety/contentModerationService';

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

    // Construct enriched system prompt with learner context and subject preservation rules
    let enrichedSystemPrompt = systemPrompt || 'You are MindMate, an adaptive educational AI tutor.';
    enrichedSystemPrompt += `\n\nCore Subject & Context Rules:
1. Directly and factually answer the user's active subject of inquiry. Never force programming or code into questions that are not about computer science or code.
2. For biographical, historical, or real-person inquiries, provide neutral, objective, and factual information without graphic details or unsolicited code metaphors.
3. When answering follow-up requests (such as "Explain differently", "Simplify", "Give example", "Quiz me", or "Show visually"), strictly preserve the subject of the immediately preceding question and answer. Never switch subjects or revert to previous syllabus topics on follow-up requests.
4. If the required context to answer or re-explain is missing or ambiguous, ask the user to clarify instead of inventing context.
5. Content safety & educational focus: MindMate is strictly an educational learning platform. Decline requests for adult entertainment, pornography, sexually explicit content, or explicit performers politely and redirect to academic subjects.
6. Scientific biology & health exception: Legitimate questions about human reproduction, anatomy, puberty, STI prevention, and relationship consent must be answered factually, clinically, and age-appropriately without explicit depictions.`;
    enrichedSystemPrompt += `\n\n${RESPONSE_FORMATTING_GUIDELINES}`;

    // Defense-in-depth pre-flight moderation
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
        source: 'cloud',
        model: 'content-safety-guard',
        elapsedMs: Date.now() - startTime
      };
      callbacks.onComplete?.(refusalResponse);
      return refusalResponse;
    }

    if (learnerProfile) {
      enrichedSystemPrompt += `\n\nLearner Context (for pedagogical style and depth, not subject matter):\n- Name: ${learnerProfile.name || 'Alex'}\n- Learning Preference: ${learnerProfile.learningStyle || 'Examples first'}\n- Current Level: ${learnerProfile.level || 'Intermediate'}\n- Goal: ${learnerProfile.goal || 'Mastery'}\nPlease adapt your explanations accordingly, but never override the subject of the user's inquiry.`;
    }

    const payload = {
      messages: messages.map((m) => ({
        role: m.role,
        content: m.promptContent || m.content
      })),
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
