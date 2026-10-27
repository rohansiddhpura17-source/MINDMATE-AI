import { SpeechSynthesisService } from './types';

/**
 * Strips raw Markdown syntax, code blocks, math formatting, and URLs
 * so that Text-to-Speech reads out clean, natural, intelligible speech.
 */
export function sanitizeTextForSpeech(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';

  let text = raw;

  // 1. Remove or summarize code blocks: ```lang ... ``` -> "Here is the code:"
  text = text.replace(/```([a-zA-Z0-9_-]+)?\s*[\s\S]*?```/g, (_match, lang) => {
    return lang ? ` Here is the ${lang} code. ` : ' Here is the code snippet. ';
  });

  // 2. Remove inline code: `code` -> code
  text = text.replace(/`([^`]+)`/g, '$1');

  // 3. Remove markdown images and links: ![alt](url) -> alt, [text](url) -> text
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

  // 4. Remove raw URLs
  text = text.replace(/https?:\/\/\S+/g, '');

  // 5. Remove KaTeX/LaTeX math blocks: $$...$$ and \(...\) and $...$
  text = text.replace(/\$\$[\s\S]*?\$\$/g, ' math expression ');
  text = text.replace(/\\\(.*?\\\)/g, ' math formula ');
  text = text.replace(/\$([^$]+)\$/g, '$1');

  // 6. Remove markdown headings, blockquotes, horizontal rules
  text = text.replace(/^#{1,6}\s+/gm, '');
  text = text.replace(/^>\s+/gm, '');
  text = text.replace(/^[*-]{3,}$/gm, '');

  // 7. Remove list bullet markers and numbering: "* item" or "1. item" -> "item"
  text = text.replace(/^\s*[-*+]\s+/gm, '');
  text = text.replace(/^\s*\d+\.\s+/gm, '');

  // 8. Remove bold and italics: **bold** or *italic*
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/\*([^*]+)\*/g, '$1');
  text = text.replace(/__([^_]+)__/g, '$1');
  text = text.replace(/_([^_]+)_/g, '$1');

  // 9. Remove HTML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // 10. Normalize whitespace and trim
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

/**
 * Splits text into sentence chunks to prevent browser SpeechSynthesis
 * timeouts on long passages (specifically Chrome's 15-second cutoff bug).
 */
export function chunkTextIntoSentences(text: string, maxChunkLength: number = 180): string[] {
  if (!text) return [];

  // Split by sentence terminators (. ! ?) while preserving flow
  const rawSentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  const chunks: string[] = [];
  let current = '';

  for (const sentence of rawSentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    if (!current) {
      current = trimmed;
    } else if (current.length + trimmed.length + 1 <= maxChunkLength) {
      current += ' ' + trimmed;
    } else {
      chunks.push(current);
      current = trimmed;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

export class WebSpeechSynthesisService implements SpeechSynthesisService {
  private activeUtterances: SpeechSynthesisUtterance[] = [];
  private speaking: boolean = false;
  private voicesCache: SpeechSynthesisVoice[] = [];

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.populateVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => this.populateVoices();
      }
    }
  }

  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  public isSpeaking(): boolean {
    if (!this.isSupported()) return false;
    return this.speaking || window.speechSynthesis.speaking;
  }

  public getVoices(): SpeechSynthesisVoice[] {
    if (!this.isSupported()) return [];
    if (this.voicesCache.length === 0) {
      this.populateVoices();
    }
    return this.voicesCache;
  }

  private populateVoices(): void {
    if (!this.isSupported()) return;
    try {
      this.voicesCache = window.speechSynthesis.getVoices();
    } catch {
      this.voicesCache = [];
    }
  }

  public async speak(
    text: string,
    options?: {
      voiceURI?: string;
      language?: string;
      rate?: number;
      volume?: number;
      onStart?: () => void;
      onEnd?: () => void;
      onError?: (err: any) => void;
    }
  ): Promise<void> {
    if (!this.isSupported()) {
      options?.onError?.(new Error('Speech synthesis is not supported in this browser.'));
      return;
    }

    // Cancel any active utterance before starting
    this.stop();

    const sanitized = sanitizeTextForSpeech(text);
    if (!sanitized) {
      options?.onEnd?.();
      return;
    }

    const sentences = chunkTextIntoSentences(sanitized);
    if (sentences.length === 0) {
      options?.onEnd?.();
      return;
    }

    const targetLang = options?.language || 'en-IN';
    const allVoices = this.getVoices();
    let selectedVoice: SpeechSynthesisVoice | undefined;

    if (options?.voiceURI) {
      selectedVoice = allVoices.find((v) => v.voiceURI === options.voiceURI);
    }

    if (!selectedVoice) {
      // Prioritize exact language match (e.g. en-IN)
      selectedVoice = allVoices.find(
        (v) => v.lang.toLowerCase().replace('_', '-') === targetLang.toLowerCase()
      );
    }

    if (!selectedVoice && targetLang.startsWith('en')) {
      // Fallback to any English voice
      selectedVoice = allVoices.find((v) => v.lang.toLowerCase().startsWith('en'));
    }

    this.speaking = true;
    let started = false;

    // Queue sentences sequentially using chained onend
    let currentIndex = 0;

    const speakNextChunk = () => {
      if (currentIndex >= sentences.length) {
        this.speaking = false;
        options?.onEnd?.();
        return;
      }

      const chunkText = sentences[currentIndex++];
      const utterance = new SpeechSynthesisUtterance(chunkText);

      if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang;
      } else {
        utterance.lang = targetLang;
      }

      utterance.rate = options?.rate ?? 1.0;
      utterance.volume = options?.volume ?? 1.0;

      utterance.onstart = () => {
        if (!started) {
          started = true;
          options?.onStart?.();
        }
      };

      utterance.onend = () => {
        speakNextChunk();
      };

      utterance.onerror = (e) => {
        // 'canceled' or 'interrupted' is expected on user cancel
        if (e.error === 'canceled' || e.error === 'interrupted') {
          this.speaking = false;
          return;
        }
        this.speaking = false;
        options?.onError?.(e);
      };

      this.activeUtterances.push(utterance);
      try {
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        this.speaking = false;
        options?.onError?.(err);
      }
    };

    speakNextChunk();
  }

  public stop(): void {
    if (!this.isSupported()) return;
    try {
      window.speechSynthesis.cancel();
    } catch {}
    this.activeUtterances = [];
    this.speaking = false;
  }
}

export const speechSynthesisService = new WebSpeechSynthesisService();
