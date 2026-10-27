import React, { useEffect, useRef } from 'react';
import { ShieldCheck, Mic, Lock, Cpu, X } from 'lucide-react';
import { Button } from '../ui/Button';

interface VoicePrivacyNoticeModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const VoicePrivacyNoticeModal: React.FC<VoicePrivacyNoticeModalProps> = ({
  isOpen,
  onConfirm,
  onCancel,
}) => {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      confirmBtnRef.current?.focus();
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onCancel();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="voice-privacy-title"
      aria-describedby="voice-privacy-description"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-xl transition-all">
        {/* Close Button */}
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close voice privacy notice"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-muted hover:bg-slate-100 hover:text-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header with Security Badge */}
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-primary border border-indigo-100">
            <Mic className="h-5 w-5" />
          </div>
          <div>
            <h2 id="voice-privacy-title" className="text-lg font-bold text-dark">
              Mate Voice Assistant Privacy Notice
            </h2>
            <p className="text-xs text-muted">Transparent disclosure before microphone activation</p>
          </div>
        </div>

        {/* Body Content */}
        <div id="voice-privacy-description" className="mt-4 space-y-3 text-xs leading-relaxed text-slate-700">
          <div className="flex items-start gap-2.5 rounded-xl border border-border bg-slate-50 p-3">
            <ShieldCheck className="h-4 w-4 shrink-0 text-primary mt-0.5" />
            <div>
              <strong className="text-dark">Browser Speech-to-Text:</strong> Speech recognition is handled by your browser's native Web Speech API. Depending on your browser vendor (Google Chrome, Apple Safari, Microsoft Edge), audio transcription may be processed by their cloud speech services. MindMate does <em>not</em> claim speech-to-text is fully offline at this stage.
            </div>
          </div>

          <div className="flex items-start gap-2.5 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-emerald-900">
            <Lock className="h-4 w-4 shrink-0 text-emerald-700 mt-0.5" />
            <div>
              <strong className="text-emerald-950">Zero Voice Recording Storage:</strong> MindMate never records, transmits, or stores your microphone audio on our servers. The microphone is active <em>only</em> while you hold or click the speak button.
            </div>
          </div>

          <div className="flex items-start gap-2.5 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-indigo-950">
            <Cpu className="h-4 w-4 shrink-0 text-indigo-700 mt-0.5" />
            <div>
              <strong className="text-indigo-950">Local Gemma 4 AI Inference:</strong> Once your voice is transcribed into text, your question is answered directly by your selected AI provider—including your local <strong>Gemma 4 (gemma4:e2b-it-qat)</strong> model through Ollama on your own machine.
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-6 flex items-center justify-end gap-3 border-t border-border pt-4">
          <Button variant="secondary" onClick={onCancel} className="text-xs">
            Cancel
          </Button>
          <Button
            ref={confirmBtnRef}
            variant="primary"
            onClick={onConfirm}
            className="text-xs bg-primary hover:bg-primary-hover text-white"
          >
            I Understand & Enable Voice
          </Button>
        </div>
      </div>
    </div>
  );
};
