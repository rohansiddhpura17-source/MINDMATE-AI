import {
  SpeechRecognitionErrorEvent,
  SpeechRecognitionErrorKind,
  SpeechRecognitionService,
  SpeechTranscriptPayload,
} from './types';

// Browser global SpeechRecognition types
declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

export class WebSpeechRecognitionService implements SpeechRecognitionService {
  private recognitionInstance: any = null;
  private listening: boolean = false;
  private currentLanguage: string = 'en-IN';
  private accumulatedFinalTranscript: string = '';

  public isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  public isListening(): boolean {
    return this.listening;
  }

  public async startListening(options: {
    language?: string;
    onTranscript: (payload: SpeechTranscriptPayload) => void;
    onError: (error: SpeechRecognitionErrorEvent) => void;
    onStart?: () => void;
    onEnd?: () => void;
  }): Promise<void> {
    if (!this.isSupported()) {
      options.onError({
        kind: 'not-supported',
        message: 'Speech recognition is not supported in this browser. You can type your question directly.',
        recoverable: false,
      });
      return;
    }

    // Stop any existing active instance cleanly before starting a new one
    this.stopListening();

    const SpeechRecognitionClass =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    try {
      const recognition = new SpeechRecognitionClass();
      this.recognitionInstance = recognition;
      this.currentLanguage = options.language || 'en-IN';
      this.accumulatedFinalTranscript = '';

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = this.currentLanguage;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        this.listening = true;
        options.onStart?.();
      };

      recognition.onresult = (event: any) => {
        let interimText = '';
        let newFinalText = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const result = event.results[i];
          const transcriptChunk = result[0]?.transcript || '';
          if (result.isFinal) {
            newFinalText += transcriptChunk;
          } else {
            interimText += transcriptChunk;
          }
        }

        if (newFinalText) {
          this.accumulatedFinalTranscript = (
            this.accumulatedFinalTranscript +
            ' ' +
            newFinalText
          ).trim();
        }

        options.onTranscript({
          interimTranscript: interimText.trim(),
          finalTranscript: this.accumulatedFinalTranscript,
          isFinal: !interimText && !!newFinalText,
        });
      };

      recognition.onerror = (event: any) => {
        const errorKind: SpeechRecognitionErrorKind = this.mapErrorKind(event.error);

        // Aborted error from manual stop shouldn't present a scary error message
        if (errorKind === 'aborted') {
          return;
        }

        const message = this.getErrorMessage(errorKind, event.error);
        options.onError({
          kind: errorKind,
          message,
          recoverable: errorKind === 'no-speech' || errorKind === 'network',
          originalError: event,
        });
      };

      recognition.onend = () => {
        this.listening = false;
        options.onEnd?.();
      };

      recognition.start();
    } catch (err: any) {
      this.listening = false;
      const isPermissionErr =
        err?.name === 'NotAllowedError' || err?.message?.includes('permission');
      const kind: SpeechRecognitionErrorKind = isPermissionErr ? 'not-allowed' : 'unknown';
      options.onError({
        kind,
        message: isPermissionErr
          ? 'Microphone permission was denied. Please allow microphone access in your browser settings.'
          : err?.message || 'Failed to initialize speech recognition.',
        recoverable: true,
        originalError: err,
      });
    }
  }

  public stopListening(): void {
    if (this.recognitionInstance) {
      try {
        this.recognitionInstance.stop();
      } catch {}
      this.recognitionInstance = null;
    }
    this.listening = false;
  }

  public abortListening(): void {
    if (this.recognitionInstance) {
      try {
        this.recognitionInstance.abort();
      } catch {}
      this.recognitionInstance = null;
    }
    this.listening = false;
  }

  private mapErrorKind(rawError: string): SpeechRecognitionErrorKind {
    switch (rawError) {
      case 'not-allowed':
      case 'permission-denied':
        return 'not-allowed';
      case 'no-speech':
        return 'no-speech';
      case 'audio-capture':
        return 'audio-capture';
      case 'network':
        return 'network';
      case 'aborted':
        return 'aborted';
      default:
        return 'unknown';
    }
  }

  private getErrorMessage(kind: SpeechRecognitionErrorKind, raw?: string): string {
    switch (kind) {
      case 'not-allowed':
        return 'Microphone permission denied. Click the lock/tune icon in your browser address bar to allow microphone access.';
      case 'audio-capture':
        return 'No microphone was detected. Please ensure your microphone is plugged in and enabled.';
      case 'no-speech':
        return 'No speech was detected. Tap the microphone to try again or type your question below.';
      case 'network':
        return 'Speech recognition network connection interrupted. Please try again or type below.';
      case 'not-supported':
        return 'Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.';
      default:
        return raw ? `Speech recognition issue: ${raw}` : 'Could not recognize speech. Please try again.';
    }
  }
}

export const speechRecognitionService = new WebSpeechRecognitionService();
