import React from 'react';
import { Mic, MicOff, Sparkles, Volume2, AlertCircle, Loader2 } from 'lucide-react';
import { VoiceState } from '../../services/voice/types';
import { cn } from '../../utils';

interface VoiceOrbProps {
  state: VoiceState;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

export const VoiceOrb: React.FC<VoiceOrbProps> = ({
  state,
  onClick,
  disabled = false,
  className,
}) => {
  const getStateConfig = () => {
    switch (state) {
      case 'listening':
        return {
          title: 'Listening...',
          description: 'Speak now — listening for your question or voice command',
          orbClass: 'voice-orb-listening',
          gradient: 'from-indigo-500 via-purple-500 to-pink-500',
          glowColor: 'rgba(99, 102, 241, 0.4)',
          icon: <Mic className="h-9 w-9 text-white animate-pulse" />,
          pillText: 'Listening',
          pillBg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        };
      case 'processing':
        return {
          title: 'Transcribing...',
          description: 'Finalizing your recognized speech',
          orbClass: 'voice-orb-processing',
          gradient: 'from-violet-600 via-indigo-600 to-blue-500',
          glowColor: 'rgba(139, 92, 246, 0.4)',
          icon: <Loader2 className="h-9 w-9 text-white animate-spin" />,
          pillText: 'Processing Speech',
          pillBg: 'bg-indigo-50 text-indigo-800 border-indigo-200',
        };
      case 'thinking':
        return {
          title: 'Mate is Thinking...',
          description: 'Gemma 4 is generating your personalized adaptive response',
          orbClass: 'voice-orb-thinking',
          gradient: 'from-indigo-600 via-sky-500 to-purple-600',
          glowColor: 'rgba(79, 70, 229, 0.4)',
          icon: <Sparkles className="h-9 w-9 text-white animate-spin" />,
          pillText: 'Thinking (Gemma 4)',
          pillBg: 'bg-indigo-50 text-indigo-800 border-indigo-200',
        };
      case 'speaking':
        return {
          title: 'Mate is Speaking...',
          description: 'Reading response aloud — click Stop Speaking or tap to pause',
          orbClass: 'voice-orb-speaking',
          gradient: 'from-blue-500 via-indigo-500 to-violet-500',
          glowColor: 'rgba(59, 130, 246, 0.4)',
          icon: <Volume2 className="h-9 w-9 text-white animate-bounce" />,
          pillText: 'Speaking',
          pillBg: 'bg-blue-50 text-blue-800 border-blue-200',
        };
      case 'error':
        return {
          title: 'Notice',
          description: 'Tap to retry microphone or review status',
          orbClass: 'voice-orb-error',
          gradient: 'from-amber-500 via-rose-500 to-red-500',
          glowColor: 'rgba(239, 68, 68, 0.35)',
          icon: <AlertCircle className="h-9 w-9 text-white" />,
          pillText: 'Attention Needed',
          pillBg: 'bg-rose-50 text-rose-800 border-rose-200',
        };
      case 'idle':
      default:
        return {
          title: 'Ready to Listen',
          description: 'Tap the orb or microphone to speak naturally with Mate',
          orbClass: 'voice-orb-idle',
          gradient: 'from-indigo-600 via-purple-600 to-blue-600',
          glowColor: 'rgba(99, 102, 241, 0.25)',
          icon: <Mic className="h-9 w-9 text-white/95" />,
          pillText: 'Idle · Ready',
          pillBg: 'bg-slate-100 text-slate-800 border-slate-200',
        };
    }
  };

  const config = getStateConfig();

  return (
    <div className={cn('flex flex-col items-center justify-center p-2 text-center', className)}>
      {/* Siri-inspired central Orb container */}
      <div className="relative my-2 sm:my-3 flex items-center justify-center">
        {/* Ambient blurred backdrop glow */}
        <div
          aria-hidden="true"
          className={cn(
            'absolute h-36 w-36 sm:h-40 sm:w-40 rounded-full blur-2xl transition-all duration-700 opacity-70 pointer-events-none',
            config.orbClass
          )}
          style={{ background: config.glowColor }}
        />

        {/* Outer concentric pulsing ring */}
        <div
          aria-hidden="true"
          className={cn(
            'absolute h-32 w-32 sm:h-36 sm:w-36 rounded-full border border-indigo-200/50 transition-all duration-500 pointer-events-none',
            state === 'listening' ? 'scale-110 border-indigo-400/80 animate-ping' : 'scale-100'
          )}
        />

        {/* Central clickable Interactive Orb Button */}
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={`${config.title}. ${config.description}. Tap to ${state === 'listening' ? 'stop listening' : state === 'speaking' ? 'stop speaking' : 'start speaking'}`}
          className={cn(
            'relative z-10 flex h-28 w-28 sm:h-32 sm:w-32 items-center justify-center rounded-full shadow-lg transition-transform focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/40 active:scale-95 cursor-pointer',
            'bg-gradient-to-tr',
            config.gradient,
            config.orbClass,
            disabled && 'opacity-60 cursor-not-allowed active:scale-100'
          )}
        >
          {/* Internal glass highlight overlay */}
          <div
            aria-hidden="true"
            className="absolute inset-1.5 rounded-full bg-gradient-to-b from-white/30 via-transparent to-black/20 pointer-events-none"
          />

          {/* Icon */}
          <div className="relative z-20 flex items-center justify-center drop-shadow-md">
            {config.icon}
          </div>
        </button>
      </div>

      {/* Dynamic Status Pill */}
      <div className="mt-1 flex items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs font-semibold',
            config.pillBg
          )}
        >
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              state === 'listening'
                ? 'bg-emerald-500 animate-pulse'
                : state === 'speaking'
                  ? 'bg-blue-500 animate-pulse'
                  : state === 'thinking'
                    ? 'bg-indigo-500 animate-spin'
                    : state === 'error'
                      ? 'bg-rose-500'
                      : 'bg-slate-400'
            )}
          />
          {config.pillText}
        </span>
      </div>

      {/* Voice State Title & Description */}
      <div aria-live="polite" className="mt-2 max-w-sm">
        <h3 className="text-base font-semibold text-dark">{config.title}</h3>
        <p className="mt-0.5 text-xs text-muted leading-relaxed">{config.description}</p>
      </div>
    </div>
  );
};
