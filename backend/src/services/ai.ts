import dotenv from 'dotenv';

dotenv.config();

export interface ChatMessageInput {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatOptions {
  messages: ChatMessageInput[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ProviderStatus {
  configured: boolean;
  provider: 'gemini' | 'openai' | 'mock';
  model: string;
  hasKey: boolean;
  message?: string;
}

const DEFAULT_SYSTEM_PROMPT = `You are MindMate, an adaptive educational AI tutor designed to help learners deeply understand concepts.
Your core teaching principles:
1. Explain clearly and concisely, prioritizing conceptual intuition and concrete examples before complex theory.
2. Adapt your tone and depth to the learner's specified learning style and experience level.
3. When providing code examples, explain key lines and highlight common pitfalls or edge cases.
4. Encourage the learner and provide interactive follow-up questions to verify their understanding.`;

export class CloudAIService {
  private provider: 'gemini' | 'openai' | 'mock';
  private modelName: string;
  private apiKey: string | null;

  constructor() {
    this.provider = (process.env.AI_PROVIDER as any) || 'gemini';
    this.modelName = process.env.AI_MODEL_NAME || 'gemini-2.5-flash';

    if (this.provider === 'gemini') {
      this.apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY || null;
    } else if (this.provider === 'openai') {
      this.apiKey = process.env.OPENAI_API_KEY || process.env.AI_API_KEY || null;
    } else {
      this.apiKey = null;
    }

    // Ignore placeholder values
    if (this.apiKey && (this.apiKey.includes('your_') || this.apiKey.includes('placeholder'))) {
      this.apiKey = null;
    }
  }

  public getStatus(): ProviderStatus {
    const hasValidKey = Boolean(this.apiKey && this.apiKey.trim().length > 10);
    return {
      configured: hasValidKey || this.provider === 'mock',
      provider: this.provider,
      model: this.modelName,
      hasKey: hasValidKey,
      message: hasValidKey
        ? `Cloud AI is active using ${this.provider.toUpperCase()} (${this.modelName}).`
        : `Cloud AI key not set for ${this.provider}. Set GEMINI_API_KEY in backend/.env or use local offline AI.`
    };
  }

  public async generateText(options: ChatOptions): Promise<string> {
    let text = '';
    for await (const chunk of this.streamChat(options)) {
      text += chunk;
    }
    return text.trim();
  }

  public async *streamChat(options: ChatOptions): AsyncGenerator<string, void, unknown> {
    const status = this.getStatus();

    if (!status.hasKey && this.provider !== 'mock') {
      throw new Error(
        `Cloud AI provider '${this.provider}' requires a valid API key. Please configure GEMINI_API_KEY in backend/.env or switch to Offline mode.`
      );
    }

    if (this.provider === 'gemini') {
      yield* this.streamGemini(options);
    } else if (this.provider === 'openai') {
      yield* this.streamOpenAI(options);
    } else {
      yield* this.streamMock(options);
    }
  }

  private async *streamGemini(options: ChatOptions): AsyncGenerator<string, void, unknown> {
    const apiKey = this.apiKey!;
    const model = this.modelName;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

    const systemText = options.systemPrompt || DEFAULT_SYSTEM_PROMPT;

    // Filter and format messages for Gemini API rules (non-empty text, user-first, alternating turns)
    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
    for (const m of options.messages) {
      if (!m.content || !m.content.trim()) continue;
      const role = m.role === 'assistant' ? 'model' : 'user';
      if (contents.length === 0 && role === 'model') {
        // Conversation must start with a user message for Gemini API
        continue;
      }
      if (contents.length > 0 && contents[contents.length - 1].role === role) {
        // Combine consecutive turns to enforce strict alternation
        contents[contents.length - 1].parts[0].text += '\n\n' + m.content.trim();
      } else {
        contents.push({ role, parts: [{ text: m.content.trim() }] });
      }
    }

    if (contents.length === 0) {
      // Fallback: if only assistant message was provided, create a initial user prompt
      contents.push({ role: 'user', parts: [{ text: 'Hello MindMate!' }] });
    }

    const payload = {
      contents,
      systemInstruction: {
        parts: [{ text: systemText }]
      },
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 1024
      }
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        throw new Error('Cloud AI request timed out after 45 seconds.');
      }
      throw new Error(`Failed to connect to Google Gemini API: ${err.message}`);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const errorBody = await response.text();
      let errorMsg = `Gemini API returned HTTP ${response.status}`;
      try {
        const parsed = JSON.parse(errorBody);
        if (parsed.error?.message) {
          errorMsg = `Gemini API error: ${parsed.error.message}`;
        }
      } catch {}

      // If rate limited on the primary model (429 RESOURCE_EXHAUSTED) and not already on flash-lite, retry on gemini-3.1-flash-lite
      if (response.status === 429 && model !== 'gemini-3.1-flash-lite') {
        console.warn(`Primary model ${model} exceeded quota, falling back to gemini-3.1-flash-lite...`);
        const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:streamGenerateContent?alt=sse&key=${apiKey}`;
        const fallbackResponse = await fetch(fallbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (fallbackResponse.ok && fallbackResponse.body) {
          response = fallbackResponse;
        } else {
          throw new Error(errorMsg);
        }
      } else {
        throw new Error(errorMsg);
      }
    }

    if (!response.body) {
      throw new Error('Gemini API returned an empty response stream.');
    }

    const reader = response.body.getReader();
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
            const jsonStr = trimmed.slice(6).trim();
            if (jsonStr === '[DONE]') continue;
            try {
              const data = JSON.parse(jsonStr);
              const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) {
                yield text;
              }
            } catch {
              // Ignore partial JSON chunk
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private async *streamOpenAI(options: ChatOptions): AsyncGenerator<string, void, unknown> {
    const apiKey = this.apiKey!;
    const model = this.modelName || 'gpt-4o-mini';
    const url = 'https://api.openai.com/v1/chat/completions';

    const messages = [
      { role: 'system', content: options.systemPrompt || DEFAULT_SYSTEM_PROMPT },
      ...options.messages.map((m) => ({ role: m.role, content: m.content }))
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 1024
        }),
        signal: controller.signal
      });
    } catch (err: any) {
      clearTimeout(timeout);
      throw new Error(`Failed to connect to OpenAI API: ${err.message}`);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API returned HTTP ${response.status}: ${errText}`);
    }

    const reader = response.body!.getReader();
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
            const jsonStr = trimmed.slice(6).trim();
            if (jsonStr === '[DONE]') continue;
            try {
              const data = JSON.parse(jsonStr);
              const text = data.choices?.[0]?.delta?.content;
              if (text) {
                yield text;
              }
            } catch {}
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private async *streamMock(options: ChatOptions): AsyncGenerator<string, void, unknown> {
    const lastUserMsg = options.messages.filter((m) => m.role === 'user').pop()?.content || 'concept';
    const simulatedResponse = `[Mock Cloud AI] Here is an educational breakdown for "${lastUserMsg}":\n\n1. **Core Concept**: In programming, understanding this fundamental logic is essential for clean architecture.\n2. **Practical Example**:\n\`\`\`python\ndef example_solution():\n    # Adaptive demonstration\n    return "Demonstrating clear patterns"\n\`\`\`\n\n*Note: To connect genuine Gemini AI, provide GEMINI_API_KEY in backend/.env.*`;

    // Stream simulated response in chunks
    const chunks = simulatedResponse.split(' ');
    for (const chunk of chunks) {
      yield chunk + ' ';
      await new Promise((res) => setTimeout(res, 30));
    }
  }
}

export const cloudAIService = new CloudAIService();
