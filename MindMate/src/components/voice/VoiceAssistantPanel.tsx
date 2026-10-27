import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Send,
  Square,
  Volume2,
  VolumeX,
  RotateCcw,
  MessageSquare,
  Sparkles,
  Command,
  Edit3,
  Check,
  AlertTriangle,
  ArrowRight,
  Globe,
  ChevronDown,
} from 'lucide-react';
import { VoiceOrb } from './VoiceOrb';
import { VoiceState } from '../../services/voice/types';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { cn } from '../../utils';

interface VoiceAssistantPanelProps {
  voiceState: VoiceState;
  interimTranscript: string;
  finalTranscript: string;
  isGenerating: boolean;
  isSpeaking: boolean;
  autoSpeak: boolean;
  aiMode: string;
  modelName: string;
  latestAnswerText?: string;
  activeTopic?: string;
  errorMessage?: string | null;
  confirmationMessage?: string | null;
  onStartListening: () => void;
  onStopListening: () => void;
  onSendQuestion: (text: string) => void;
  onStopGenerating: () => void;
  onStopSpeaking: () => void;
  onRepeatAnswer: () => void;
  onToggleAutoSpeak: () => void;
  onReturnToTextChat: () => void;
  onClearError?: () => void;
  zoomLevel?: number;
  speechLanguage?: string;
  onLanguageChange?: (lang: string) => void;
}

const SUPPORTED_LANGUAGES = [
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'es-ES', label: 'Español' },
  { code: 'fr-FR', label: 'Français' },
  { code: 'de-DE', label: 'Deutsch' },
  { code: 'hi-IN', label: 'Hindi (हिंदी)' },
];

const VOICE_COMMAND_SUGGESTIONS = [
  'Explain this topic',
  'Give me an example',
  'Quiz me on Python loops',
  'What should I study next?',
  'How am I doing?',
  'Open my progress',
];

export const VoiceAssistantPanel: React.FC<VoiceAssistantPanelProps> = ({
  voiceState,
  interimTranscript,
  finalTranscript,
  isGenerating,
  isSpeaking,
  autoSpeak,
  aiMode,
  modelName,
  latestAnswerText,
  activeTopic,
  errorMessage,
  confirmationMessage,
  onStartListening,
  onStopListening,
  onSendQuestion,
  onStopGenerating,
  onStopSpeaking,
  onRepeatAnswer,
  onToggleAutoSpeak,
  onReturnToTextChat,
  onClearError,
  zoomLevel = 100,
  speechLanguage = 'en-US',
  onLanguageChange,
}) => {
  const [editableText, setEditableText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const langMenuRef = useRef<HTMLDivElement>(null);

  // Close language menu on Escape or outside click
  useEffect(() => {
    if (!isLangMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsLangMenuOpen(false);
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setIsLangMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isLangMenuOpen]);

  // Sync incoming final transcript to editable text when not manually editing
  useEffect(() => {
    if (!isEditing && finalTranscript) {
      setEditableText(finalTranscript);
    }
  }, [finalTranscript, isEditing]);

  const handleOrbClick = () => {
    if (voiceState === 'listening') {
      onStopListening();
    } else if (voiceState === 'speaking') {
      onStopSpeaking();
    } else if (voiceState === 'thinking') {
      onStopGenerating();
    } else {
      onStartListening();
    }
  };

  const handleSend = () => {
    const textToSend = (editableText || finalTranscript || interimTranscript).trim();
    if (!textToSend || isGenerating) return;
    onSendQuestion(textToSend);
    setEditableText('');
    setIsEditing(false);
  };

  const handleClearTranscript = () => {
    setEditableText('');
    setIsEditing(false);
  };

  const displayText = editableText || finalTranscript;

  return (
    <div className="flex flex-col h-full rounded-2xl border border-border bg-surface shadow-xs overflow-hidden">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-slate-50/70 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 border border-indigo-100 text-primary">
            <Mic className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-dark">Mate Voice Assistant</h2>
              <Badge variant="primary" className="text-[11px] py-0 px-2 font-medium">
                Siri Mode
              </Badge>
            </div>
            <p className="text-[11px] text-muted">
              {aiMode === 'ollama' ? 'Local Gemma 4' : aiMode.toUpperCase()} · {modelName}
            </p>
          </div>
        </div>

        {/* Quick Voice Settings & Chat Switcher */}
        <div className="flex items-center gap-2">
          {/* Language Selector with Auto-Minimize */}
          <div className="relative" ref={langMenuRef}>
            <button
              type="button"
              onClick={() => setIsLangMenuOpen(!isLangMenuOpen)}
              aria-expanded={isLangMenuOpen}
              aria-label="Select voice language"
              title="Select speech language"
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium border border-border bg-white hover:bg-slate-50 text-dark transition-colors shadow-2xs"
            >
              <Globe className="h-3.5 w-3.5 text-primary" />
              <span>
                {SUPPORTED_LANGUAGES.find((l) => l.code === speechLanguage)?.label.split(' ')[0] || 'English'}
              </span>
              <ChevronDown
                className={cn(
                  'h-3 w-3 text-muted transition-transform duration-200',
                  isLangMenuOpen && 'rotate-180'
                )}
              />
            </button>

            {isLangMenuOpen && (
              <div
                className="absolute right-0 mt-1.5 w-44 rounded-xl border border-border bg-surface shadow-lg py-1 z-30 animate-in fade-in"
                role="menu"
                aria-label="Available speech languages"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onLanguageChange?.(lang.code);
                      setIsLangMenuOpen(false); // Auto-minimize menu immediately upon selection!
                    }}
                    className={cn(
                      'w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between',
                      speechLanguage === lang.code
                        ? 'bg-primary/10 text-primary font-semibold'
                        : 'text-dark hover:bg-slate-50'
                    )}
                  >
                    <span>{lang.label}</span>
                    {speechLanguage === lang.code && <Check className="h-3.5 w-3.5 text-primary" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Spoken Responses Toggle */}
          <button
            type="button"
            onClick={onToggleAutoSpeak}
            aria-pressed={autoSpeak}
            aria-label={autoSpeak ? 'Disable spoken answers' : 'Enable spoken answers'}
            title={autoSpeak ? 'Spoken responses enabled' : 'Spoken responses muted'}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-2xs',
              autoSpeak
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                : 'bg-white text-muted border-border hover:bg-slate-50'
            )}
          >
            {autoSpeak ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{autoSpeak ? 'Voice On' : 'Voice Muted'}</span>
          </button>

          {/* Switch to Text Chat */}
          <Button
            variant="secondary"
            size="sm"
            onClick={onReturnToTextChat}
            className="text-xs gap-1.5 h-8 px-3 shadow-2xs"
            title="Switch to standard text chat"
          >
            <MessageSquare className="h-3.5 w-3.5 text-muted" />
            <span>Text Chat</span>
          </Button>
        </div>
      </div>

      {/* Main Body with Content Scaling */}
      <div
        className="flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-3.5 flex flex-col items-center justify-between gap-2 transition-[font-size] duration-150 motion-reduce:transition-none"
        style={{ fontSize: `${zoomLevel}%` }}
      >
        {/* Confirmation or Error Banners */}
        <div className="w-full max-w-xl space-y-2">
          {confirmationMessage && (
            <div
              aria-live="polite"
              className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-medium text-emerald-800 animate-fadeIn"
            >
              <Check className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>{confirmationMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div
              aria-live="assertive"
              className="flex items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-800"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{errorMessage}</span>
              </div>
              {onClearError && (
                <button
                  type="button"
                  onClick={onClearError}
                  className="text-[11px] font-semibold text-rose-700 hover:underline"
                >
                  Dismiss
                </button>
              )}
            </div>
          )}
        </div>

        {/* Central Siri-Style Voice Orb */}
        <div className="my-1 py-0.5">
          <VoiceOrb
            state={voiceState}
            onClick={handleOrbClick}
            disabled={isGenerating && voiceState !== 'thinking'}
          />
        </div>

        {/* Recognized Transcript / Editable Input Area */}
        <div className="w-full max-w-xl space-y-2">
          <div className="rounded-2xl border border-border bg-slate-50/60 p-3 shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-dark flex items-center gap-1.5">
                <Mic className="h-3.5 w-3.5 text-primary" />
                {voiceState === 'listening'
                  ? 'Listening to you...'
                  : isEditing
                    ? 'Edit your voice prompt'
                    : 'Recognized Voice Prompt'}
              </span>

              {displayText && !isGenerating && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(!isEditing);
                      if (!isEditing) {
                        setTimeout(() => textareaRef.current?.focus(), 50);
                      }
                    }}
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1 font-medium"
                  >
                    <Edit3 className="h-3 w-3" />
                    {isEditing ? 'Done Editing' : 'Edit text'}
                  </button>
                  <button
                    type="button"
                    onClick={handleClearTranscript}
                    className="text-xs text-muted hover:text-dark hover:underline"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            {/* Transcript Text Container */}
            {isEditing ? (
              <textarea
                ref={textareaRef}
                value={editableText}
                onChange={(e) => setEditableText(e.target.value)}
                rows={3}
                aria-label="Editable recognized speech transcript"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-dark placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                placeholder="Edit or type your question here..."
              />
            ) : (
              <div
                aria-live="polite"
                className="min-h-[38px] text-xs leading-relaxed text-dark break-words"
              >
                {displayText ? (
                  <span>
                    {displayText}
                    {interimTranscript && (
                      <span className="text-muted italic ml-1 opacity-75">
                        {interimTranscript}
                      </span>
                    )}
                  </span>
                ) : interimTranscript ? (
                  <span className="text-muted italic">{interimTranscript}</span>
                ) : (
                  <span className="text-muted/70 italic text-xs">
                    {voiceState === 'listening'
                      ? 'Listening... say something like "Explain this topic" or ask any study question.'
                      : 'Press Start Speaking or tap the orb above to talk.'}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Primary Action Controls */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            {voiceState === 'listening' ? (
              <Button
                variant="danger"
                onClick={onStopListening}
                className="gap-2 px-6 h-10 shadow-xs"
              >
                <Square className="h-4 w-4 fill-current" />
                <span>Stop Listening</span>
              </Button>
            ) : voiceState === 'thinking' ? (
              <Button
                variant="secondary"
                onClick={onStopGenerating}
                className="gap-2 px-6 h-10 border-rose-200 text-rose-700 hover:bg-rose-50"
              >
                <Square className="h-4 w-4" />
                <span>Stop Generating</span>
              </Button>
            ) : voiceState === 'speaking' ? (
              <div className="flex items-center gap-3">
                <Button
                  variant="secondary"
                  onClick={onStopSpeaking}
                  className="gap-2 px-5 h-10 border-blue-200 text-blue-700 hover:bg-blue-50"
                >
                  <VolumeX className="h-4 w-4" />
                  <span>Stop Speaking</span>
                </Button>
                <Button
                  variant="primary"
                  onClick={onStartListening}
                  className="gap-2 px-5 h-10 bg-primary hover:bg-primary-hover text-white"
                >
                  <Mic className="h-4 w-4" />
                  <span>Next Question</span>
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Button
                  variant="primary"
                  onClick={onStartListening}
                  disabled={isGenerating}
                  className="gap-2 px-6 h-10 bg-primary hover:bg-primary-hover text-white shadow-xs"
                >
                  <Mic className="h-4 w-4" />
                  <span>Start Speaking</span>
                </Button>

                {displayText && (
                  <Button
                    variant="secondary"
                    onClick={handleSend}
                    disabled={isGenerating || !displayText.trim()}
                    className="gap-2 px-5 h-10 border-primary/30 text-primary hover:bg-indigo-50"
                  >
                    <Send className="h-4 w-4" />
                    <span>Send Question</span>
                  </Button>
                )}
              </div>
            )}

            {/* Repeat Answer Button when available */}
            {latestAnswerText && !isSpeaking && !isGenerating && voiceState !== 'listening' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRepeatAnswer}
                className="gap-1.5 text-xs text-muted hover:text-dark h-9 px-3"
                title="Hear Mate read the last response aloud again"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Repeat Answer</span>
              </Button>
            )}
          </div>
        </div>

        {/* Suggested Voice Commands Footer */}
        <div className="mt-2 sm:mt-3 w-full max-w-xl border-t border-border pt-2 sm:pt-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted mb-1.5">
            <Command className="h-3.5 w-3.5" />
            <span>Supported Voice Commands & Prompts</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {VOICE_COMMAND_SUGGESTIONS.map((cmd) => (
              <button
                key={cmd}
                type="button"
                onClick={() => {
                  setEditableText(cmd);
                  onSendQuestion(cmd);
                }}
                disabled={isGenerating || voiceState === 'listening'}
                className="rounded-lg border border-border bg-white px-2.5 py-1 text-xs text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
              >
                "{cmd}"
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
