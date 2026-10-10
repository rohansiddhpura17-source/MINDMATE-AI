import React, { useState, useRef, useEffect } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Avatar } from '../components/ui/Avatar';
import {
  Send,
  Sparkles,
  Code2,
  BookOpen,
  Brain,
  GitPullRequest,
  Cloud,
  HardDrive,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Square,
  Cpu,
  Download,
  ChevronDown,
  SlidersHorizontal
} from 'lucide-react';
import { MarkdownMessage, CodeBlock } from '../components/markdown/MarkdownMessage';
import { chatMessages as initialMessages, learner } from '../data/mockData';
import { ChatMessage } from '../types';
import { cn } from '../utils';
import {
  aiTutorService,
  AIMode,
  AIEngineStatus,
  DEFAULT_LOCAL_MODEL,
  SUPPORTED_LOCAL_MODELS,
  GenerationPhase,
  buildFollowUpContext,
  isFollowUpAction
} from '../services/ai';
import { VisualRenderer } from '../components/visual/VisualRenderer';
import { generateVisualRepresentation, VisualPayload } from '../services/visual';
import { findPrecedingTurn, normalizeAction } from '../services/ai/followUpContext';

const CHIPS = ['Explain differently', 'Simplify', 'Give example', 'Quiz me', 'Show visually'];

export default function Learn() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    return initialMessages.map((msg) => ({
      ...msg,
      source: msg.role === 'assistant' ? 'cloud' : undefined,
      model: msg.role === 'assistant' ? 'gemini-3.8-flash' : undefined
    }));
  });
  const [inputValue, setInputValue] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<AIEngineStatus | null>(null);
  const [selectedLocalModel, setSelectedLocalModel] = useState(DEFAULT_LOCAL_MODEL);
  const [showModelDetails, setShowModelDetails] = useState(false);

  // Progressive streaming and phase tracking states
  const [currentPhase, setCurrentPhase] = useState<GenerationPhase>('idle');
  const [phaseDetail, setPhaseDetail] = useState<string>('');
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [activeAssistantId, setActiveAssistantId] = useState<number | null>(null);

  // Friend's study streak & quiz mode features
  const [quizMode, setQuizMode] = useState(false);
  const [currentTopic, setCurrentTopic] = useState('Python Functions');
  const [quizQuestionCount, setQuizQuestionCount] = useState(0);

  // Collapsible panels state
  const [isAiModeExpanded, setIsAiModeExpanded] = useState(true);
  const [isLocalAiExpanded, setIsLocalAiExpanded] = useState(true);
  const [isLearningContextExpanded, setIsLearningContextExpanded] = useState(true);
  // Main Mate AI chat panel (conversation, quick actions, composer)
  const [isChatExpanded, setIsChatExpanded] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<any>(null);
  const currentPendingQuestionRef = useRef<{ text: string; options?: any } | null>(null);
  const activeAssistantIdRef = useRef<number | null>(null);
  const currentRequestSeqRef = useRef<number>(0);
  // Scroll snapshot taken when the chat collapses, so expanding restores the reading position
  const collapsedScrollRef = useRef<{ scrollTop: number; signature: string } | null>(null);

  const messagesSignature = `${messages.length}:${messages[messages.length - 1]?.content.length ?? 0}`;

  const scrollToBottom = () => {
    const feed = feedRef.current;
    if (feed && typeof feed.scrollTo === 'function') {
      // Scroll only the chat feed, never the whole page
      feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
    } else if (feed) {
      feed.scrollTop = feed.scrollHeight;
    }
  };

  useEffect(() => {
    if (!isChatExpanded) return; // Don't auto-scroll a hidden feed
    scrollToBottom();
  }, [messages, isGenerating]);

  const toggleChatExpanded = () => {
    if (isChatExpanded && feedRef.current) {
      collapsedScrollRef.current = {
        scrollTop: feedRef.current.scrollTop,
        signature: messagesSignature
      };
    }
    setIsChatExpanded(!isChatExpanded);
  };

  // Restore the reading position (or jump to new content) when the chat is expanded again
  useEffect(() => {
    if (!isChatExpanded) return;
    const snapshot = collapsedScrollRef.current;
    if (!snapshot) return;
    collapsedScrollRef.current = null;
    requestAnimationFrame(() => {
      const feed = feedRef.current;
      if (!feed) return;
      if (snapshot.signature !== messagesSignature) {
        feed.scrollTop = feed.scrollHeight; // New tokens arrived while collapsed
      } else {
        feed.scrollTop = snapshot.scrollTop;
      }
    });
  }, [isChatExpanded]);

  // Subscribe to AI status updates
  useEffect(() => {
    const unsubscribe = aiTutorService.onStatusChange((status) => {
      setAiStatus(status);
      setIsGenerating(status.isGenerating);
    });
    return () => unsubscribe();
  }, []);

  // Timer management for generation duration
  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const start = Date.now();
    setElapsedSeconds(0);
    timerRef.current = setInterval(() => {
      setElapsedSeconds((Date.now() - start) / 1000);
    }, 100);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopTimer();
  }, []);

  const handleInitLocalModel = async () => {
    setErrorMessage(null);
    try {
      await aiTutorService.initializeLocalModel(selectedLocalModel);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to initialize local model.');
    }
  };

  const handleStopGenerating = () => {
    aiTutorService.abort();
    stopTimer();
    setIsGenerating(false);
    setCurrentPhase('idle');
    setPhaseDetail('');

    // Mark active assistant message as stopped
    if (activeAssistantIdRef.current) {
      const activeId = activeAssistantIdRef.current;
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === activeId
            ? {
                ...msg,
                content: msg.content.trim() ? msg.content + '\n\n*(Stopped by user)*' : '*(Generation stopped by user)*'
              }
            : msg
        )
      );
    }
    activeAssistantIdRef.current = null;
    setActiveAssistantId(null);
    currentPendingQuestionRef.current = null;
  };

  // Reusable core generation runner with sequence isolation
  const executeAIGeneration = async (
    userText: string,
    targetAssistantId: number,
    options?: { startQuiz?: boolean; promptContent?: string; displayText?: string; visualPayload?: VisualPayload }
  ) => {
    const seq = ++currentRequestSeqRef.current;
    setIsGenerating(true);
    setActiveAssistantId(targetAssistantId);
    activeAssistantIdRef.current = targetAssistantId;
    currentPendingQuestionRef.current = { text: userText, options };
    setErrorMessage(null);

    const mode = aiTutorService.getMode();
    setCurrentPhase('preparing');
    setPhaseDetail(
      mode === 'offline'
        ? 'Preparing local WebGPU AI...'
        : mode === 'online'
        ? 'Connecting to Gemini Cloud AI...'
        : 'Preparing Auto Hybrid AI...'
    );
    startTimer();

    try {
      // Build history excluding current incomplete assistant message
      const historyForAI = messages.filter((m) => m.id !== targetAssistantId);

      await aiTutorService.sendMessageStream(
        {
          messages: [
            ...historyForAI.map((m) => ({
              role: m.role,
              content: m.promptContent || m.content,
              promptContent: m.promptContent
            })),
            { role: 'user', content: userText, promptContent: userText }
          ],
          learnerProfile: {
            name: learner.name,
            learningStyle: learner.learningStyle,
            goal: learner.goal,
            level: 'Intermediate'
          }
        },
        {
          onPhaseChange: (phase, detail) => {
            if (seq === currentRequestSeqRef.current) {
              setCurrentPhase(phase);
              if (detail) setPhaseDetail(detail);
            }
          },
          onChunk: (chunk: string) => {
            if (seq === currentRequestSeqRef.current) {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === targetAssistantId ? { ...msg, content: msg.content + chunk } : msg
                )
              );
            }
          },
          onComplete: (res) => {
            if (seq === currentRequestSeqRef.current) {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === targetAssistantId
                    ? {
                        ...msg,
                        content: res.content,
                        code: res.code,
                        explanation: res.explanation,
                        source: res.source,
                        model: res.model,
                        elapsedMs: res.elapsedMs,
                        visual: msg.visual || options?.visualPayload
                      }
                    : msg
                )
              );
              stopTimer();
              setIsGenerating(false);
              setCurrentPhase('idle');
              setPhaseDetail('');
              activeAssistantIdRef.current = null;
              setActiveAssistantId(null);
              currentPendingQuestionRef.current = null;
            }
          },
          onError: (err) => {
            if (seq === currentRequestSeqRef.current) {
              setErrorMessage(err.message);
              setCurrentPhase('failed');
              setPhaseDetail('Request failed — retry available');
              stopTimer();
              setIsGenerating(false);
            }
          }
        }
      );
    } catch (err: any) {
      if (seq === currentRequestSeqRef.current) {
        setErrorMessage(err.message || 'Error generating AI response.');
        setCurrentPhase('failed');
        setPhaseDetail('Request failed — retry available');
        stopTimer();
        setIsGenerating(false);
      }
    }
  };

  // Seamless mode switching at ANY time (while typing OR while running)
  const handleModeChange = (newMode: AIMode) => {
    if (newMode === activeMode) return;
    setErrorMessage(null);

    const currentCursor = textareaRef.current?.selectionStart;

    if (isGenerating && currentPendingQuestionRef.current && activeAssistantIdRef.current) {
      // Seamlessly cancel active in-flight request and re-route the SAME question through new mode
      setCurrentPhase('switching');
      setPhaseDetail(`Switching Mate AI mode to ${newMode.toUpperCase()}...`);

      // Immediately abort existing generation
      aiTutorService.abort();
      aiTutorService.setMode(newMode);

      const pendingQuestion = currentPendingQuestionRef.current;
      const targetAssistantId = activeAssistantIdRef.current;

      // Reset target assistant placeholder
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === targetAssistantId
            ? {
                ...msg,
                content: '',
                source: newMode === 'online' ? 'cloud' : newMode === 'offline' ? 'local' : undefined,
                model: undefined,
                code: undefined,
                explanation: undefined,
                elapsedMs: undefined
              }
            : msg
        )
      );

      // Immediately re-route without duplicating user question or clearing composer draft
      executeAIGeneration(pendingQuestion.text, targetAssistantId, pendingQuestion.options);
    } else {
      // Switch mode while typing or idle without losing draft
      aiTutorService.setMode(newMode);
    }

    // Preserve textarea cursor and focus
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        if (currentCursor !== undefined && currentCursor !== null) {
          textareaRef.current.setSelectionRange(currentCursor, currentCursor);
        }
      }
    }, 0);
  };

  const handleRetry = () => {
    if (currentPendingQuestionRef.current && activeAssistantIdRef.current) {
      const q = currentPendingQuestionRef.current;
      const id = activeAssistantIdRef.current;
      executeAIGeneration(q.text, id, q.options);
    } else {
      const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
      if (lastUserMsg) {
        handleSend(lastUserMsg.content, {
          promptContent: lastUserMsg.promptContent
        });
      }
    }
  };

  const handleSend = async (
    text: string,
    options?: { startQuiz?: boolean; promptContent?: string; displayText?: string; isVisual?: boolean }
  ) => {
    if (!text.trim() || isGenerating) return;

    setErrorMessage(null);
    const userMessageContent = (options?.displayText || text).trim();
    setInputValue('');

    if (options?.startQuiz) {
      setQuizMode(true);
      setQuizQuestionCount(0);
    } else if (quizMode) {
      setQuizQuestionCount((c) => c + 1);
    }

    const actionType = normalizeAction(userMessageContent);
    const isVisualRequest =
      options?.isVisual ||
      actionType === 'Show visually' ||
      userMessageContent.toLowerCase().startsWith('show visually') ||
      userMessageContent.toLowerCase().startsWith('visualize');

    // Determine prompt to send to AI: use options.promptContent if provided,
    // or if the typed text is a follow-up action ("explain differently", "simplify", etc.),
    // construct the grounded prompt using buildFollowUpContext
    let promptToSend = options?.promptContent;
    if (!promptToSend && isFollowUpAction(userMessageContent)) {
      const followUp = buildFollowUpContext(messages, userMessageContent);
      promptToSend = followUp.promptContent;
    }
    const effectivePrompt = promptToSend || userMessageContent;

    const newUserMsg: ChatMessage = {
      id: Date.now(),
      role: 'user',
      content: userMessageContent,
      promptContent: effectivePrompt !== userMessageContent ? effectivePrompt : undefined,
      timestamp: Date.now()
    };

    const tempAssistantId = Date.now() + 1;
    const initialAssistantMsg: ChatMessage = {
      id: tempAssistantId,
      role: 'assistant',
      content: '',
      source: activeMode === 'online' ? 'cloud' : activeMode === 'offline' ? 'local' : undefined,
      timestamp: Date.now()
    };

    setMessages((prev) => [...prev, newUserMsg, initialAssistantMsg]);

    // If this is a visual request, trigger Visual Learning Engine in parallel
    if (isVisualRequest) {
      const precedingTurn = findPrecedingTurn(messages);
      const qForVisual = precedingTurn?.question || userMessageContent;
      const aForVisual = precedingTurn?.answer || '';
      const sForVisual = precedingTurn?.subject || currentTopic || 'Topic';

      generateVisualRepresentation({
        question: qForVisual,
        answer: aForVisual,
        subject: sForVisual,
        mode: activeMode,
        isOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
        previousQuestion: precedingTurn?.question,
        previousAnswer: precedingTurn?.answer
      })
        .then((visualPayload) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === tempAssistantId ? { ...msg, visual: visualPayload } : msg
            )
          );
        })
        .catch((err) => {
          console.warn('[VisualEngine] Generation failed:', err);
        });
    }

    executeAIGeneration(effectivePrompt, tempAssistantId, {
      ...options,
      promptContent: effectivePrompt,
      displayText: userMessageContent
    });
  };

  const handleChipClick = (chip: string) => {
    const followUp = buildFollowUpContext(messages, chip);
    handleSend(followUp.displayContent, {
      promptContent: followUp.promptContent,
      displayText: followUp.displayContent,
      startQuiz: chip === 'Quiz me',
      isVisual: chip === 'Show visually'
    });
  };

  const activeMode = aiStatus?.mode || 'auto';
  const isLocalReady = aiStatus?.localModelLoaded;
  const isWebGpu = aiStatus?.webGpuSupported;
  const progress = aiStatus?.localLoadingProgress;
  const isInitializingModel = Boolean(progress && progress.progress < 1.0);

  return (
    <AppShell pageTitle="Learn" pageSubtitle="Chat with your adaptive AI tutor (Online + Offline)">
      <div
        className={cn(
          'flex flex-col lg:flex-row gap-6 h-auto lg:h-[calc(100vh-160px)]',
          isChatExpanded && 'min-h-[600px]'
        )}
      >
        
        {/* Left side: Mate AI chat panel (collapsible) */}
        <section
          aria-label="Mate AI chat"
          data-testid="mate-ai-chat-panel"
          data-chat-expanded={isChatExpanded ? 'true' : 'false'}
          className={cn(
            'flex-1 flex flex-col bg-surface rounded-card border border-border shadow-sm min-w-0 mate-chat-shell overflow-hidden',
            isChatExpanded ? 'h-[600px] lg:h-full' : 'h-auto lg:self-start'
          )}
        >
          
          {/* Mate AI Header Bar */}
          <div
            className={cn(
              'bg-gray-50/70 text-sm transition-colors',
              isChatExpanded && 'border-b border-border'
            )}
          >
            {/* Header Row — clicking anywhere on the row toggles the chat; buttons provide keyboard access */}
            <div
              onClick={toggleChatExpanded}
              className="w-full px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 cursor-pointer select-none hover:bg-gray-100/60 transition-colors"
              data-testid="mate-ai-header"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-dark/70">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span>Mate AI</span>
                </h2>
                
                <span
                  data-testid="mate-ai-mode-badge"
                  className={cn(
                    'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize',
                    activeMode === 'online' && 'bg-indigo-100 text-indigo-700',
                    activeMode === 'offline' && 'bg-emerald-100 text-emerald-700',
                    activeMode === 'auto' && 'bg-purple-100 text-purple-700'
                  )}
                >
                  {activeMode}
                </span>

                {!isChatExpanded && isGenerating && (
                  <span
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold"
                    role="status"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    Generating…
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 sm:gap-3 ml-auto">
                {/* Active Provider Badge */}
                <div className="hidden sm:flex items-center gap-2 text-xs" data-testid="mate-ai-provider-badge">
                  {activeMode === 'online' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 font-medium border border-indigo-100">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse" />
                      Cloud AI ({aiStatus?.cloudModel || 'gemini-3.8-flash'})
                    </span>
                  )}

                  {activeMode === 'offline' && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium border',
                        isLocalReady
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      )}
                    >
                      <span
                        className={cn(
                          'w-1.5 h-1.5 rounded-full',
                          isLocalReady ? 'bg-emerald-600' : 'bg-amber-500'
                        )}
                      />
                      {isLocalReady ? 'Mate AI (Offline) Ready' : 'Mate AI Model Required'}
                    </span>
                  )}

                  {activeMode === 'auto' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 font-medium border border-purple-100">
                      <Sparkles className="h-3.5 w-3.5 text-purple-600" />
                      Auto Hybrid ({isLocalReady ? 'Cloud + Mate AI Ready' : 'Cloud Preferred'})
                    </span>
                  )}
                </div>

                {/* Mode selector drawer toggle (independent of the chat collapse) */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsAiModeExpanded(!isAiModeExpanded);
                  }}
                  aria-expanded={isAiModeExpanded}
                  aria-controls="mate-ai-mode-drawer"
                  aria-label="Toggle Mate AI settings"
                  title={isAiModeExpanded ? 'Hide mode selector' : 'Show mode selector'}
                  className="inline-flex items-center gap-1 h-8 rounded-lg border border-border bg-white px-2 text-xs font-medium text-muted hover:text-dark hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Modes</span>
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 transition-transform duration-300 ease-in-out',
                      isAiModeExpanded ? 'rotate-180' : 'rotate-0'
                    )}
                  />
                </button>

                {/* Main chat expand/collapse control */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleChatExpanded();
                  }}
                  aria-expanded={isChatExpanded}
                  aria-controls="mate-ai-chat-body"
                  aria-label={isChatExpanded ? 'Collapse Mate AI chat' : 'Expand Mate AI chat'}
                  title={isChatExpanded ? 'Collapse Mate AI chat' : 'Expand Mate AI chat'}
                  data-testid="mate-ai-chat-toggle"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-dark/70 hover:text-primary hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors"
                >
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 transition-transform duration-300 ease-in-out',
                      isChatExpanded ? 'rotate-180' : 'rotate-0'
                    )}
                  />
                </button>
              </div>
            </div>

            {/* Expandable Mode Controls Drawer */}
            <div
              id="mate-ai-mode-drawer"
              {...(!isAiModeExpanded ? { inert: '' } : {})}
              aria-hidden={!isAiModeExpanded}
              className={cn(
                'transition-all duration-300 ease-in-out overflow-hidden px-4 sm:px-6',
                isAiModeExpanded
                  ? 'max-h-40 opacity-100 pb-3 pt-1 border-t border-border/40'
                  : 'max-h-0 opacity-0 pb-0 pt-0'
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted font-medium">Select Mode:</span>
                  <div className="inline-flex rounded-lg border border-border bg-white p-0.5 shadow-sm">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleModeChange('online');
                      }}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors',
                        activeMode === 'online'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-muted hover:text-dark hover:bg-gray-100'
                      )}
                    >
                      <Cloud className="h-3.5 w-3.5" />
                      Online
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleModeChange('offline');
                      }}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors',
                        activeMode === 'offline'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-muted hover:text-dark hover:bg-gray-100'
                      )}
                    >
                      <HardDrive className="h-3.5 w-3.5" />
                      Offline
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleModeChange('auto');
                      }}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors',
                        activeMode === 'auto'
                          ? 'bg-primary text-white shadow-xs'
                          : 'text-muted hover:text-dark hover:bg-gray-100'
                      )}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Auto
                    </button>
                  </div>
                </div>

                <div className="text-[11px] text-muted">
                  {activeMode === 'online' && 'Online: Streams directly from Google Gemini 3.8 Flash for maximum intelligence.'}
                  {activeMode === 'offline' && 'Offline: Uses SmolLM2 Mate AI (Offline) running locally in your browser with zero cloud connectivity.'}
                  {activeMode === 'auto' && 'Auto: Dynamically selects cloud or local model based on connection availability.'}
                </div>
              </div>
            </div>
          </div>

          {/* Collapsible chat body — always mounted so streaming, drafts and scroll position survive collapse */}
          <div
            id="mate-ai-chat-body"
            data-testid="mate-ai-chat-body"
            data-collapsed={isChatExpanded ? 'false' : 'true'}
            aria-hidden={!isChatExpanded}
            {...(!isChatExpanded ? { inert: '' } : {})}
            className="mate-chat-body flex flex-col"
          >

          {/* Model Loading Progress Banner (if initializing) */}
          {progress && progress.progress < 1.0 && (
            <div className="bg-indigo-50 border-b border-indigo-100 p-4 animate-in fade-in">
              <div className="flex items-center justify-between text-xs font-semibold text-indigo-900 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Download className="h-3.5 w-3.5 text-indigo-600 animate-bounce" />
                  {progress.text || 'Downloading and initializing Mate AI (Offline) model...'}
                </span>
                <span>{Math.round(progress.progress * 100)}%</span>
              </div>
              <div className="w-full bg-indigo-200 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-indigo-600 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${Math.max(5, progress.progress * 100)}%` }}
                />
              </div>
              <p className="text-[11px] text-indigo-700/80 mt-1.5">
                Model weights are cached locally in your browser CacheStorage and won't need to be downloaded again.
              </p>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="bg-red-50 border-b border-red-200 p-4 text-xs text-red-800 flex items-start justify-between gap-3 animate-in fade-in">
              <div className="flex gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold mb-0.5">AI Inference Notice</p>
                  <p className="opacity-90">{errorMessage}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {activeMode === 'offline' && !isLocalReady && (
                  <Button size="sm" onClick={handleInitLocalModel} className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white">
                    Load Mate AI (Offline)
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setErrorMessage(null)} className="h-7 text-xs text-red-700">
                  Dismiss
                </Button>
              </div>
            </div>
          )}

          {/* Messages Feed */}
          <div ref={feedRef} className="flex-1 min-h-0 p-4 sm:p-6 overflow-y-auto space-y-6" data-testid="mate-ai-message-feed">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn('flex gap-4 max-w-3xl', msg.role === 'user' ? 'ml-auto flex-row-reverse' : '')}
              >
                <div className="shrink-0 mt-1">
                  {msg.role === 'assistant' ? (
                    <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-white shadow-sm">
                      <Sparkles className="h-4 w-4" />
                    </div>
                  ) : (
                    <Avatar fallback="AL" size="sm" />
                  )}
                </div>

                <div className={cn('space-y-3 min-w-0', msg.role === 'user' ? 'text-right' : 'flex-1')}>
                  {/* Execution Source Badge and Elapsed Time for Assistant Responses */}
                  {msg.role === 'assistant' && (
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted mb-1 flex-wrap">
                      {msg.source === 'cloud' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                          <Cloud className="h-3 w-3" />
                          Cloud AI ({msg.model || 'Gemini 2.5 Flash'})
                        </span>
                      )}
                      {msg.source === 'local' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <HardDrive className="h-3 w-3" />
                          Mate AI (Offline) ({msg.model ? msg.model.split('-')[0] : 'SmolLM2'})
                        </span>
                      )}
                      {msg.source === 'mock-fallback' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                          <Brain className="h-3 w-3" />
                          Mock Mode
                        </span>
                      )}
                      {msg.elapsedMs ? (
                        <span className="text-[10px] text-muted font-mono bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                          {(msg.elapsedMs / 1000).toFixed(1)}s
                        </span>
                      ) : null}
                    </div>
                  )}

                  {(msg.content || !msg.code || (isGenerating && activeAssistantId === msg.id)) && (
                  <div
                    className={cn(
                      'inline-block max-w-full rounded-2xl px-5 py-3 text-sm leading-relaxed',
                      msg.role === 'user'
                        ? 'bg-primary text-white whitespace-pre-wrap'
                        : 'bg-gray-100 text-dark border border-gray-200/60 text-left'
                    )}
                  >
                    {msg.content ? (
                      msg.role === 'assistant' ? (
                        <div>
                          <MarkdownMessage
                            content={msg.content}
                            streaming={isGenerating && activeAssistantId === msg.id}
                          />
                          {isGenerating && activeAssistantId === msg.id && (
                            <span
                              aria-hidden="true"
                              className="inline-block w-2 h-4 mt-1 bg-primary/70 animate-pulse align-middle rounded-xs"
                            />
                          )}
                        </div>
                      ) : (
                        <span>{msg.content}</span>
                      )
                    ) : isGenerating && activeAssistantId === msg.id ? (
                      <div className="flex flex-col gap-1.5 py-1">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
                          <span className="font-semibold text-dark/90">
                            {phaseDetail || (currentPhase === 'preparing' ? 'Preparing Mate AI (Offline)...' : currentPhase === 'generating' ? 'Generating answer...' : currentPhase === 'switching' ? 'Switching Mate AI mode...' : 'Thinking...')}
                          </span>
                          <span className="text-[11px] font-mono text-muted bg-white/80 px-1.5 py-0.5 rounded border border-border/60">
                            {elapsedSeconds.toFixed(1)}s
                          </span>
                        </div>
                        {currentPhase === 'switching' && (
                          <p className="text-[11px] text-primary/80 italic">
                            Cancelled previous request. Re-routing through {activeMode.toUpperCase()} mode...
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-2 text-muted italic">
                        Thinking...
                      </span>
                    )}
                  </div>
                  )}

                  {msg.code && (
                    <div className="w-full max-w-2xl">
                      <CodeBlock code={msg.code} />
                    </div>
                  )}

                  {msg.explanation && (
                    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-sm text-dark/80 text-left w-full max-w-2xl">
                      <MarkdownMessage content={msg.explanation} />
                    </div>
                  )}

                  {msg.visual && (
                    <VisualRenderer
                      visual={msg.visual}
                      onRetry={() => handleChipClick('Show visually')}
                    />
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input & Prompt Chips */}
          <div className="p-4 bg-gray-50 border-t border-border">
            <div className="flex flex-wrap gap-2 mb-4">
              {CHIPS.map((chip, i) => (
                <button
                  key={i}
                  onClick={() => handleChipClick(chip)}
                  disabled={isGenerating}
                  className="px-3 py-1.5 bg-white border border-border rounded-full text-xs font-medium hover:border-primary hover:text-primary transition-colors text-muted shadow-sm disabled:opacity-50"
                >
                  {chip}
                </button>
              ))}
            </div>

            <div className="relative">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (!isGenerating) {
                      handleSend(inputValue);
                    }
                  }
                }}
                placeholder={
                  isGenerating
                    ? 'Mate AI is generating... You can draft your next question or switch modes anytime above.'
                    : activeMode === 'offline' && !isLocalReady
                    ? 'Initialize Mate AI (Offline) on the right panel to begin offline tutoring...'
                    : 'Ask MindMate to explain, quiz you, or solve a problem...'
                }
                className="w-full resize-none rounded-xl border border-border bg-white pl-4 pr-24 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent min-h-[56px] max-h-[120px] shadow-sm"
                rows={1}
              />

              <div className="absolute right-2 bottom-2 flex items-center gap-1.5">
                {isGenerating ? (
                  <Button
                    size="sm"
                    variant="danger"
                    className="rounded-lg h-10 px-3 text-xs flex items-center gap-1.5"
                    onClick={handleStopGenerating}
                  >
                    <Square className="h-3.5 w-3.5 fill-current" />
                    Stop
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="rounded-lg h-10 w-10 p-0"
                    onClick={() => handleSend(inputValue)}
                    disabled={!inputValue.trim()}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
          </div>
          {/* End collapsible chat body */}
        </section>

        {/* Right side: Learning Context & Offline Model Hardware Manager (Offline mode only) */}
        {activeMode === 'offline' && (
          <div className="w-full lg:w-[340px] flex-shrink-0 flex flex-col gap-6 h-auto lg:h-full lg:overflow-y-auto animate-in fade-in slide-in-from-right-4 duration-300">
            
            {/* Mate AI (Offline) Control Card (Collapsible) */}
            <Card className="border-border bg-surface shadow-sm overflow-hidden">
              <div
                onClick={() => setIsLocalAiExpanded(!isLocalAiExpanded)}
                className="p-4 flex items-center justify-between cursor-pointer select-none hover:bg-gray-50/80 transition-colors"
                role="button"
                tabIndex={0}
                aria-expanded={isLocalAiExpanded}
                aria-label="Toggle Mate AI (Offline) panel"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setIsLocalAiExpanded(!isLocalAiExpanded);
                  }
                }}
              >
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-emerald-600" />
                  <span>Mate AI (Offline)</span>
                </h3>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'text-[10px] uppercase font-bold px-2 py-0.5 rounded-full',
                      isLocalReady
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-gray-100 text-gray-600'
                    )}
                  >
                    {isLocalReady ? 'Ready' : 'Not Loaded'}
                  </span>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 text-muted transition-transform duration-300 ease-in-out',
                      isLocalAiExpanded ? 'rotate-180' : 'rotate-0'
                    )}
                  />
                </div>
              </div>

              <div
                className={cn(
                  'transition-all duration-300 ease-in-out overflow-hidden',
                  isLocalAiExpanded
                    ? 'max-h-[600px] opacity-100 border-t border-border p-5 pt-4'
                    : 'max-h-0 opacity-0 p-0 border-t-0'
                )}
              >
                <div className="space-y-4 text-xs">
                  <div>
                    <p className="text-muted font-semibold uppercase tracking-wider mb-1">Local Model</p>
                    <select
                      value={selectedLocalModel}
                      onChange={(e) => setSelectedLocalModel(e.target.value)}
                      disabled={isGenerating || isInitializingModel}
                      className="w-full rounded-lg border border-border bg-white p-2 text-xs focus:ring-2 focus:ring-primary outline-none"
                    >
                      {SUPPORTED_LOCAL_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.size})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center justify-between py-1 border-y border-border/50 text-muted">
                    <span>Hardware Acceleration</span>
                    <span className={cn('font-semibold flex items-center gap-1', isWebGpu ? 'text-emerald-600' : 'text-amber-600')}>
                      {isWebGpu ? <CheckCircle className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                      {isWebGpu ? 'WebGPU Active' : 'No WebGPU'}
                    </span>
                  </div>

                  {!isLocalReady ? (
                    <div className="space-y-2">
                      <Button
                        onClick={handleInitLocalModel}
                        disabled={!isWebGpu || isInitializingModel}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 flex items-center justify-center gap-1.5 shadow-xs"
                      >
                        <Download className="h-3.5 w-3.5" />
                        {aiStatus?.localModelCached ? 'Load Cached Model' : 'Download & Load Model'}
                      </Button>
                      <p className="text-[11px] text-muted leading-relaxed text-center">
                        Requires a one-time download while online. Once cached, runs 100% locally with zero internet.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-emerald-900 space-y-1">
                      <p className="font-semibold flex items-center gap-1.5 text-xs">
                        <CheckCircle className="h-4 w-4 text-emerald-600" /> Mate AI (Offline) Available
                      </p>
                      <p className="text-[11px] text-emerald-800/80 leading-relaxed">
                        Model is loaded into device memory. You can disconnect your network and continue learning without cloud connectivity.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </Card>

            {/* Learning Context Card (Collapsible) */}
            <Card className="border-border bg-surface shadow-sm overflow-hidden">
              <div
                onClick={() => setIsLearningContextExpanded(!isLearningContextExpanded)}
                className="p-4 flex items-center justify-between cursor-pointer select-none hover:bg-gray-50/80 transition-colors"
                role="button"
                tabIndex={0}
                aria-expanded={isLearningContextExpanded}
                aria-label="Toggle Learning Context panel"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setIsLearningContextExpanded(!isLearningContextExpanded);
                  }
                }}
              >
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Brain className="h-4 w-4 text-primary" />
                  <span>Learning Context</span>
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                    48% Mastery
                  </span>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 text-muted transition-transform duration-300 ease-in-out',
                      isLearningContextExpanded ? 'rotate-180' : 'rotate-0'
                    )}
                  />
                </div>
              </div>

              <div
                className={cn(
                  'transition-all duration-300 ease-in-out overflow-hidden',
                  isLearningContextExpanded
                    ? 'max-h-[700px] opacity-100 border-t border-border p-5 pt-4'
                    : 'max-h-0 opacity-0 p-0 border-t-0'
                )}
              >
                <div className="space-y-5">
                  <div>
                    <p className="text-xs text-muted mb-1 uppercase tracking-wider font-semibold">Current Topic</p>
                    <p className="font-medium text-dark flex items-center gap-2 text-sm">
                      <Code2 className="h-4 w-4 text-primary" /> {currentTopic}
                    </p>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1 text-xs font-medium">
                      <span className="text-muted uppercase tracking-wider font-semibold">Mastery</span>
                      <span className="text-primary font-semibold">48%</span>
                    </div>
                    <ProgressBar value={48} className="h-1.5" />
                  </div>

                  <div>
                    <p className="text-xs text-muted mb-1 uppercase tracking-wider font-semibold">Level</p>
                    <div className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
                      Intermediate
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-muted mb-1 uppercase tracking-wider font-semibold">Preferred Style</p>
                    <p className="text-xs flex items-center gap-2 text-dark/80">
                      <BookOpen className="h-4 w-4 text-muted" /> Examples first
                    </p>
                  </div>

                  {quizMode && (
                    <div className="text-xs text-muted border-t pt-2">
                      Quiz questions answered: {quizQuestionCount}
                    </div>
                  )}

                  {/* Adaptive Guidance section inside Learning Context */}
                  <div className="rounded-lg p-3.5 bg-indigo-50/70 border border-indigo-100 space-y-1 mt-2">
                    <p className="font-semibold text-xs flex items-center gap-1.5 text-primary">
                      <GitPullRequest className="h-3.5 w-3.5" /> Adaptive Guidance
                    </p>
                    <p className="text-[11px] text-dark/80 leading-relaxed">
                      MindMate dynamically tailors explanations to your "Examples first" preference. In Offline mode, all personalization logic executes locally on your GPU.
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

      </div>
    </AppShell>
  );
}
