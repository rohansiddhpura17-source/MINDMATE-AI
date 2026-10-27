/**
 * Core type definitions for the Mate Voice Assistant.
 */

export type VoiceState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'thinking'
  | 'speaking'
  | 'error';

export type SpeechRecognitionErrorKind =
  | 'not-allowed'
  | 'no-speech'
  | 'audio-capture'
  | 'network'
  | 'not-supported'
  | 'aborted'
  | 'unknown';

export interface SpeechRecognitionErrorEvent {
  kind: SpeechRecognitionErrorKind;
  message: string;
  recoverable: boolean;
  originalError?: any;
}

export interface SpeechTranscriptPayload {
  interimTranscript: string;
  finalTranscript: string;
  isFinal: boolean;
}

export interface VoiceSettings {
  autoSpeak: boolean;
  speechLanguage: string; // e.g. 'en-IN', 'en-US', 'en-GB'
  selectedVoiceURI?: string;
  speechRate: number; // 0.75 - 1.5 (default: 1.0)
  speechVolume: number; // 0.1 - 1.0 (default: 1.0)
  continuousMode: boolean; // default false to prevent audio feedback
  privacyAcknowledged: boolean;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  autoSpeak: true,
  speechLanguage: 'en-IN',
  speechRate: 1.0,
  speechVolume: 1.0,
  continuousMode: false,
  privacyAcknowledged: false,
};

export const SUPPORTED_SPEECH_LANGUAGES = [
  { code: 'en-IN', label: 'English (India)' },
  { code: 'en-US', label: 'English (United States)' },
  { code: 'en-GB', label: 'English (United Kingdom)' },
  { code: 'hi-IN', label: 'Hindi (India)' },
  { code: 'es-ES', label: 'Spanish (Spain)' },
  { code: 'fr-FR', label: 'French (France)' },
  { code: 'de-DE', label: 'German (Germany)' },
];

export type VoiceCommandType =
  | 'navigation'
  | 'learning'
  | 'progress'
  | 'clarification'
  | 'question';

export interface VoiceCommandResult {
  type: VoiceCommandType;
  action?: string;
  route?: string;
  confirmationMessage?: string;
  clarificationQuestion?: string;
  payload?: any;
}

export interface SpeechRecognitionService {
  isSupported(): boolean;
  startListening(options: {
    language?: string;
    onTranscript: (payload: SpeechTranscriptPayload) => void;
    onError: (error: SpeechRecognitionErrorEvent) => void;
    onStart?: () => void;
    onEnd?: () => void;
  }): Promise<void>;
  stopListening(): void;
  abortListening(): void;
  isListening(): boolean;
}

export interface SpeechSynthesisService {
  isSupported(): boolean;
  getVoices(): SpeechSynthesisVoice[];
  speak(
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
  ): Promise<void>;
  stop(): void;
  isSpeaking(): boolean;
}
