import { useState, useRef, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
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
  SlidersHorizontal,
  Terminal,
} from 'lucide-react';
import { MarkdownMessage, CodeBlock } from '../components/markdown/MarkdownMessage';
import { chatMessages as initialMessages, learner } from '../data/mockData';
import { resolveTopicMetadata, TOPICS } from '../data/learningContent';
import { ChatMessage } from '../types';
import { cn } from '../utils';
import { useAppContext } from '../context/AppContext';
import { getChatHistory, saveChatMessage, getProfile, getMaterials } from '../lib/db';
import { useStudyStreak } from '../hooks/useStudyStreak';
import { useMastery } from '../hooks/useMastery';
import {
  aiTutorService,
  AIMode,
  AIEngineStatus,
  DEFAULT_LOCAL_MODEL,
  DEFAULT_OLLAMA_MODEL,
  SUPPORTED_LOCAL_MODELS,
  GenerationPhase,
  buildFollowUpContext,
  isFollowUpAction,
  buildDeterministicCurriculumFallback,
} from '../services/ai';
import {
  selectExplanationStrategy,
  selectAdaptiveDifficulty,
  STRATEGY_LABELS,
} from '../services/adaptive/adaptiveLearningEngine';
import type { ExplanationStrategy } from '../services/assessment/types';
import { VisualRenderer } from '../components/visual/VisualRenderer';
import { generateVisualRepresentation, VisualPayload } from '../services/visual';
import { findPrecedingTurn, normalizeAction } from '../services/ai/followUpContext';

const CHIPS = ['Explain differently', 'Simplify', 'Give example', 'Quiz me', 'Show visually'];

export default function Learn() {
  const { user } = useAppContext();
  const navigate = useNavigate();
  const { recordStudyActivity } = useStudyStreak();
  const { snapshot: analyticsSnapshot } = useMastery();

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    return initialMessages.map((msg) => ({
      ...msg,
      source: msg.role === 'assistant' ? 'cloud' : undefined,
      model: msg.role === 'assistant' ? 'gemini-3.5-flash' : undefined,
    }));
  });
  const [inputValue, setInputValue] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<AIEngineStatus | null>(null);
  const [selectedLocalModel, setSelectedLocalModel] = useState(DEFAULT_LOCAL_MODEL);
  const [checkingOllama, setCheckingOllama] = useState(false);

  // Progressive streaming and phase tracking states
  const [currentPhase, setCurrentPhase] = useState<GenerationPhase>('idle');
  const [phaseDetail, setPhaseDetail] = useState<string>('');
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [activeAssistantId, setActiveAssistantId] = useState<number | string | null>(null);

  // User context & uploaded study materials from Supabase
  const [profile, setProfile] = useState<any>(null);
  const [uploadedMaterials, setUploadedMaterials] = useState<any[]>([]);
  const [quizMode, setQuizMode] = useState(false);
  const [quizQuestionCount, setQuizQuestionCount] = useState(0);

  // Collapsible panels state
  const [isAiModeExpanded, setIsAiModeExpanded] = useState(true);
  const [isLocalAiExpanded, setIsLocalAiExpanded] = useState(true);
  const [isLearningContextExpanded, setIsLearningContextExpanded] = useState(true);
  const [isChatExpanded, setIsChatExpanded] = useState(true);

  const feedRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<any>(null);
  const isMountedRef = useRef<boolean>(true);
  const shouldAutoScrollRef = useRef<boolean>(true);
  const currentPendingQuestionRef = useRef<{ text: string; options?: any } | null>(null);
  const activeAssistantIdRef = useRef<number | string | null>(null);
  const currentRequestSeqRef = useRef<number>(0);
  const collapsedScrollRef = useRef<{ scrollTop: number; signature: string } | null>(null);

  const messagesSignature = `${messages.length}:${messages[messages.length - 1]?.content.length ?? 0}`;

  const handleFeedScroll = () => {
    const feed = feedRef.current;
    if (!feed) return;
    const distanceFromBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 140;
  };

  const scrollToBottom = (force = false) => {
    if (!force && !shouldAutoScrollRef.current) return;
    const feed = feedRef.current;
    if (feed && typeof feed.scrollTo === 'function') {
      feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
    } else if (feed) {
      feed.scrollTop = feed.scrollHeight;
    }
  };

  useEffect(() => {
    if (!isChatExpanded) return;
    scrollToBottom(false);
  }, [messages, isGenerating, isChatExpanded]);

  const toggleChatExpanded = () => {
    if (isChatExpanded && feedRef.current) {
      collapsedScrollRef.current = {
        scrollTop: feedRef.current.scrollTop,
        signature: messagesSignature,
      };
    }
    setIsChatExpanded(!isChatExpanded);
  };

  useEffect(() => {
    if (!isChatExpanded) return;
    const snapshot = collapsedScrollRef.current;
    if (!snapshot) return;
    collapsedScrollRef.current = null;
    requestAnimationFrame(() => {
      const feed = feedRef.current;
      if (!feed) return;
      if (snapshot.signature !== messagesSignature) {
        feed.scrollTop = feed.scrollHeight;
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

  // Load chat history, student profile & uploaded materials from Supabase
  useEffect(() => {
    if (!user) return;
    async function loadData() {
      try {
        const [chatRes, profRes, materialsRes] = await Promise.all([
          getChatHistory(user!.id),
          getProfile(user!.id),
          getMaterials(user!.id),
        ]);

        if (chatRes.data && chatRes.data.length > 0) {
          const validHistory = chatRes.data
            .filter(
              (m: any) =>
                m.role === 'user' ||
                (m.role === 'assistant' && String(m.content || '').trim().length > 0)
            )
            .map((m: any) => ({
              id: m.id,
              role: m.role as 'user' | 'assistant',
              content: m.content,
              status: 'completed' as const,
              source: m.role === 'assistant' ? ('cloud' as const) : undefined,
            }));
          if (validHistory.length > 0 && isMountedRef.current) {
            setMessages(validHistory);
          }
        }

        if (profRes.data) setProfile(profRes.data);
        if (materialsRes.data && Array.isArray(materialsRes.data)) {
          setUploadedMaterials(materialsRes.data);
        }
      } catch (err) {
        console.error('Failed to load user learn data', err);
      }
    }
    loadData();
  }, [user]);

  const [searchParams, setSearchParams] = useSearchParams();
  const urlTopic = searchParams.get('topic');
  const urlStrategy = searchParams.get('strategy') as ExplanationStrategy | null;
  const urlPrompt = searchParams.get('prompt');

  const resolvedActiveTopicMeta = resolveTopicMetadata(
    urlTopic || analyticsSnapshot.nextLearningAction.nextTopicId || 'python-functions'
  );
  const activeTopic = resolvedActiveTopicMeta.name;
  const activeTopicMetric =
    analyticsSnapshot.topics.find((t) => t.topicId === resolvedActiveTopicMeta.id) || null;
  const activeMastery = activeTopicMetric ? activeTopicMetric.masteryScore : 0;
  const activeConfidence = activeTopicMetric ? activeTopicMetric.confidenceLevel : 'none';
  const activeLearningStyle = profile?.learning_style || learner.learningStyle;

  const computedStrategyDecision = selectExplanationStrategy({
    topicMetric: activeTopicMetric,
    mistakePatterns: analyticsSnapshot.mistakePatterns,
    allTopicMetrics: analyticsSnapshot.topics,
  });
  const activeStrategy: ExplanationStrategy =
    urlStrategy && STRATEGY_LABELS[urlStrategy]
      ? urlStrategy
      : computedStrategyDecision.strategy;
  const activeStrategyReason =
    urlStrategy && urlStrategy !== computedStrategyDecision.strategy
      ? `Selected ${STRATEGY_LABELS[urlStrategy]} via direct adaptive lesson request.`
      : computedStrategyDecision.strategyReason;

  const activeDifficultyDecision = selectAdaptiveDifficulty(activeTopicMetric);

  const topicMistakeSummaries = analyticsSnapshot.mistakePatterns
    .filter((p) => p.topicId === resolvedActiveTopicMeta.id)
    .map((p) => `${p.summary}: ${p.evidenceDetail}`);

  // Match any uploaded study material that relates to the current topic or subject
  const matchingMaterial = uploadedMaterials.find((mat) => {
    const title = String(mat.name || '').toLowerCase();
    const content = String(mat.raw_content || mat.summary || '').toLowerCase();
    const topicWords = resolvedActiveTopicMeta.name.toLowerCase().split(/\s+/);
    return (
      topicWords.some((w) => w.length > 3 && (title.includes(w) || content.includes(w))) ||
      title.includes(resolvedActiveTopicMeta.subjectId)
    );
  });

  useEffect(() => {
    if (urlPrompt) {
      setInputValue(urlPrompt);
    }
  }, [urlPrompt]);

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
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopTimer();
    };
  }, []);

  const handleInitLocalModel = async () => {
    setErrorMessage(null);
    try {
      await aiTutorService.initializeLocalModel(selectedLocalModel);
    } catch (err: any) {
      if (isMountedRef.current) {
        setErrorMessage(err.message || 'Failed to initialize local model.');
      }
    }
  };

  const handleCancelLocalModelInit = () => {
    aiTutorService.cancelLocalModelInit();
    setErrorMessage(null);
  };

  const handleCheckOllama = async () => {
    setCheckingOllama(true);
    setErrorMessage(null);
    try {
      const status = await aiTutorService.getStatus(true);
      if (!isMountedRef.current) return;
      setAiStatus(status);
      if (!status.ollamaAvailable && status.ollamaMessage) {
        setErrorMessage(
          `${status.ollamaMessage}${
            status.ollamaRecoveryGuidance ? ` — ${status.ollamaRecoveryGuidance}` : ''
          }`
        );
      }
    } finally {
      if (isMountedRef.current) {
        setCheckingOllama(false);
      }
    }
  };

  const handleInsertDeterministicGuide = () => {
    const fallback = buildDeterministicCurriculumFallback(
      activeTopic,
      {
        topicId: resolvedActiveTopicMeta.id,
        topicName: activeTopic,
        masteryScore: activeMastery,
        confidenceLevel: activeConfidence,
        explanationStrategy: activeStrategy,
        strategyReason: activeStrategyReason,
        recentMistakesSummary: topicMistakeSummaries,
      },
      errorMessage || 'AI provider unavailable; serving verified local curriculum guide.'
    );
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        role: 'assistant',
        content: fallback.content,
        code: fallback.code,
        explanation: fallback.explanation,
        source: 'mock-fallback',
        model: 'deterministic-curriculum-guide',
        status: 'completed',
        timestamp: Date.now(),
      },
    ]);
    setErrorMessage(null);
  };

  const handleStopGenerating = () => {
    aiTutorService.abort();
    stopTimer();
    setIsGenerating(false);
    setCurrentPhase('cancelled');
    setPhaseDetail('Generation stopped by user');

    if (activeAssistantIdRef.current) {
      const activeId = activeAssistantIdRef.current;
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === activeId
            ? {
                ...msg,
                status: 'cancelled',
                content: msg.content.trim()
                  ? msg.content + '\n\n*(Stopped by user)*'
                  : '*(Generation stopped by user)*',
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
    targetAssistantId: number | string,
    options?: {
      startQuiz?: boolean;
      promptContent?: string;
      displayText?: string;
      visualPayload?: VisualPayload;
    }
  ) => {
    const seq = ++currentRequestSeqRef.current;
    setIsGenerating(true);
    setActiveAssistantId(targetAssistantId);
    activeAssistantIdRef.current = targetAssistantId;
    currentPendingQuestionRef.current = { text: userText, options };
    setErrorMessage(null);

    const mode = aiTutorService.getMode();
    const configuredOllamaModel = aiStatus?.ollamaModel || DEFAULT_OLLAMA_MODEL;
    setCurrentPhase('preparing');
    setPhaseDetail(
      mode === 'ollama'
        ? `Connecting to local Ollama (${configuredOllamaModel})...`
        : mode === 'offline'
          ? 'Preparing local WebGPU AI...'
          : mode === 'online'
            ? 'Connecting to Gemini Cloud AI...'
            : 'Preparing Auto Hybrid AI...'
    );
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === targetAssistantId
          ? {
              ...msg,
              status: 'preparing',
              error: undefined,
              requestPrompt: userText,
            }
          : msg
      )
    );
    startTimer();

    try {
      const historyForAI = messages.filter(
        (m) =>
          m.id !== targetAssistantId &&
          (m.role === 'user' ||
            (m.role === 'assistant' &&
              m.status !== 'failed' &&
              m.status !== 'cancelled' &&
              m.content.trim().length > 0))
      );

      await aiTutorService.sendMessageStream(
        {
          messages: [
            ...historyForAI.map((m) => ({
              role: m.role,
              content: m.promptContent || m.content,
              promptContent: m.promptContent,
            })),
            { role: 'user', content: userText, promptContent: userText },
          ],
          learnerProfile: {
            learningStyle: activeLearningStyle,
            goal: profile?.goal || learner.goal,
            level:
              activeMastery >= 75
                ? 'Advanced'
                : activeMastery >= 45
                  ? 'Intermediate'
                  : 'Foundational',
          },
          adaptiveContext: {
            topicId: resolvedActiveTopicMeta.id,
            topicName: activeTopic,
            masteryScore: activeMastery,
            confidenceLevel: activeConfidence,
            recentAccuracy: activeTopicMetric?.recentAccuracy ?? 0,
            targetDifficulty: activeDifficultyDecision.targetBand,
            explanationStrategy: activeStrategy,
            strategyReason: activeStrategyReason,
            recentMistakesSummary: topicMistakeSummaries,
            studyMaterialTitle: matchingMaterial?.name,
            studyMaterialExcerpt:
              matchingMaterial?.raw_content || matchingMaterial?.summary,
          },
        },
        {
          onPhaseChange: (phase, detail) => {
            if (!isMountedRef.current || seq !== currentRequestSeqRef.current) return;
            setCurrentPhase(phase);
            if (detail) setPhaseDetail(detail);
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === targetAssistantId
                  ? {
                      ...msg,
                      status:
                        phase === 'loading_model'
                          ? 'loading_model'
                          : phase === 'streaming'
                            ? 'streaming'
                            : phase === 'generating'
                              ? 'generating'
                              : 'preparing',
                    }
                  : msg
              )
            );
          },
          onChunk: (chunk: string) => {
            if (!isMountedRef.current || seq !== currentRequestSeqRef.current) return;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === targetAssistantId
                  ? { ...msg, content: msg.content + chunk, status: 'streaming', error: undefined }
                  : msg
              )
            );
          },
          onComplete: async (res) => {
            if (!isMountedRef.current || seq !== currentRequestSeqRef.current) return;
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
                      loadDurationMs: res.loadDurationMs,
                      status: 'completed',
                      error: undefined,
                      visual: msg.visual || options?.visualPayload,
                    }
                  : msg
              )
            );
            stopTimer();
            setIsGenerating(false);
            setCurrentPhase('completed');
            setPhaseDetail('');
            activeAssistantIdRef.current = null;
            setActiveAssistantId(null);
            currentPendingQuestionRef.current = null;

            if (user?.id) {
              try {
                await saveChatMessage(user.id, 'assistant', res.content, activeTopic);
              } catch (e) {
                console.warn('Could not persist message to Supabase', e);
              }
            }
          },
          onError: (err) => {
            if (!isMountedRef.current || seq !== currentRequestSeqRef.current) return;
            setErrorMessage(err.message);
            setCurrentPhase('failed');
            setPhaseDetail('Request failed — retry or use local study guide');
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === targetAssistantId
                  ? {
                      ...msg,
                      status: 'failed',
                      error: err.message,
                    }
                  : msg
              )
            );
          },
        }
      );
    } catch (err: any) {
      if (!isMountedRef.current || seq !== currentRequestSeqRef.current) return;
      const errMsg = err?.message || 'Error generating AI response.';
      setErrorMessage(errMsg);
      setCurrentPhase('failed');
      setPhaseDetail('Request failed — retry or use local study guide');
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === targetAssistantId
            ? {
                ...msg,
                status: 'failed',
                error: errMsg,
              }
            : msg
        )
      );
    } finally {
      if (isMountedRef.current && seq === currentRequestSeqRef.current) {
        stopTimer();
        setIsGenerating(false);
        setActiveAssistantId(null);
      }
    }
  };

  const handleModeChange = (newMode: AIMode) => {
    if (newMode === activeMode) return;
    setErrorMessage(null);

    const currentCursor = textareaRef.current?.selectionStart;

    if (isGenerating && currentPendingQuestionRef.current && activeAssistantIdRef.current) {
      setCurrentPhase('switching');
      setPhaseDetail(`Switching Mate AI mode to ${newMode.toUpperCase()}...`);

      aiTutorService.abort();
      aiTutorService.setMode(newMode);

      const pendingQuestion = currentPendingQuestionRef.current;
      const targetAssistantId = activeAssistantIdRef.current;

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === targetAssistantId
            ? {
                ...msg,
                content: '',
                status: 'preparing',
                error: undefined,
                source:
                  newMode === 'online'
                    ? 'cloud'
                    : newMode === 'ollama'
                      ? 'ollama'
                      : newMode === 'offline'
                        ? 'local'
                        : undefined,
                model: undefined,
                code: undefined,
                explanation: undefined,
                elapsedMs: undefined,
              }
            : msg
        )
      );

      executeAIGeneration(pendingQuestion.text, targetAssistantId, pendingQuestion.options);
    } else {
      aiTutorService.setMode(newMode);
    }

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        if (currentCursor !== undefined && currentCursor !== null) {
          textareaRef.current.setSelectionRange(currentCursor, currentCursor);
        }
      }
    }, 0);
  };

  const handleRetryMessage = (msgId: number | string, explicitPrompt?: string) => {
    if (isGenerating) return;
    let promptText = explicitPrompt;
    if (!promptText) {
      const idx = messages.findIndex((m) => m.id === msgId);
      if (idx > 0) {
        for (let i = idx - 1; i >= 0; i--) {
          if (messages[i].role === 'user') {
            promptText = messages[i].promptContent || messages[i].content;
            break;
          }
        }
      }
    }
    if (!promptText && currentPendingQuestionRef.current) {
      promptText = currentPendingQuestionRef.current.text;
    }
    if (!promptText) return;

    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId
          ? {
              ...m,
              content: '',
              status: 'preparing',
              error: undefined,
            }
          : m
      )
    );
    executeAIGeneration(promptText, msgId);
  };

  const handleRetry = () => {
    const failedAssistantMsg = [...messages]
      .reverse()
      .find(
        (m) =>
          m.role === 'assistant' &&
          (m.status === 'failed' || m.status === 'cancelled' || !m.content.trim())
      );
    if (failedAssistantMsg) {
      handleRetryMessage(failedAssistantMsg.id, failedAssistantMsg.requestPrompt);
      return;
    }
    if (currentPendingQuestionRef.current && activeAssistantIdRef.current) {
      const q = currentPendingQuestionRef.current;
      const id = activeAssistantIdRef.current;
      executeAIGeneration(q.text, id, q.options);
    } else {
      const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
      if (lastUserMsg) {
        handleSend(lastUserMsg.content, {
          promptContent: lastUserMsg.promptContent,
        });
      }
    }
  };

  const handleSend = async (
    text: string,
    options?: {
      startQuiz?: boolean;
      promptContent?: string;
      displayText?: string;
      isVisual?: boolean;
    }
  ) => {
    if (!text.trim() || isGenerating) return;

    setErrorMessage(null);
    shouldAutoScrollRef.current = true;
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
      status: 'completed',
      timestamp: Date.now(),
    };

    const tempAssistantId = Date.now() + 1;
    const initialAssistantMsg: ChatMessage = {
      id: tempAssistantId,
      role: 'assistant',
      content: '',
      status: 'preparing',
      requestPrompt: effectivePrompt,
      source:
        activeMode === 'online'
          ? 'cloud'
          : activeMode === 'ollama'
            ? 'ollama'
            : activeMode === 'offline'
              ? 'local'
              : undefined,
      model: activeMode === 'ollama' ? aiStatus?.ollamaModel || DEFAULT_OLLAMA_MODEL : undefined,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, newUserMsg, initialAssistantMsg]);

    // Persist user message to Supabase & record streak
    if (user?.id) {
      try {
        await saveChatMessage(user.id, 'user', userMessageContent, activeTopic);
        recordStudyActivity();
      } catch (e) {
        console.warn('Could not persist user message', e);
      }
    }

    // Trigger visual learning generation if requested
    if (isVisualRequest) {
      const precedingTurn = findPrecedingTurn(messages);
      const qForVisual = precedingTurn?.question || userMessageContent;
      const aForVisual = precedingTurn?.answer || '';
      const sForVisual = precedingTurn?.subject || activeTopic || 'Topic';

      generateVisualRepresentation({
        question: qForVisual,
        answer: aForVisual,
        subject: sForVisual,
        mode: activeMode,
        isOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
        previousQuestion: precedingTurn?.question,
        previousAnswer: precedingTurn?.answer,
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
      displayText: userMessageContent,
    });
  };

  const handleChipClick = (chip: string) => {
    const followUp = buildFollowUpContext(messages, chip);
    handleSend(followUp.displayContent, {
      promptContent: followUp.promptContent,
      displayText: followUp.displayContent,
      startQuiz: chip === 'Quiz me',
      isVisual: chip === 'Show visually',
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
        {/* Left side: Mate AI chat panel */}
        <section
          aria-label="Mate AI chat"
          data-testid="mate-ai-chat-panel"
          data-chat-expanded={isChatExpanded ? 'true' : 'false'}
          className={cn(
            'flex-1 flex flex-col bg-surface rounded-card border border-border shadow-sm min-w-0 mate-chat-shell overflow-hidden',
            isChatExpanded ? 'h-[600px] lg:h-full' : 'h-auto lg:self-start'
          )}
        >
          {/* Header Bar */}
          <div
            className={cn(
              'bg-gray-50/70 dark:bg-slate-900/60 text-sm transition-colors',
              isChatExpanded && 'border-b border-border'
            )}
          >
            <div
              onClick={toggleChatExpanded}
              className="w-full px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 cursor-pointer select-none hover:bg-gray-100/60 dark:hover:bg-slate-800/60 transition-colors"
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
                    activeMode === 'online' && 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
                    activeMode === 'ollama' && 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
                    activeMode === 'offline' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
                    activeMode === 'auto' && 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                  )}
                >
                  {activeMode === 'ollama' ? 'Ollama Local AI' : activeMode}
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
                <div className="hidden sm:flex items-center gap-2 text-xs" data-testid="mate-ai-provider-badge">
                  {activeMode === 'online' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-medium border border-indigo-100 dark:border-indigo-900">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse" />
                      Cloud AI ({aiStatus?.cloudModel || 'Gemini 3.5 Flash'})
                    </span>
                  )}

                  {activeMode === 'ollama' && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium border',
                        aiStatus?.ollamaAvailable
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                          : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                      )}
                    >
                      <span
                        className={cn(
                          'w-1.5 h-1.5 rounded-full',
                          aiStatus?.ollamaAvailable ? 'bg-emerald-600' : 'bg-amber-500'
                        )}
                      />
                      {aiStatus?.ollamaAvailable
                        ? `Ollama Ready (${aiStatus.ollamaModel})`
                        : `Ollama (${aiStatus?.ollamaModel || DEFAULT_OLLAMA_MODEL}) — ${
                            aiStatus?.ollamaStatus === 'model_missing'
                              ? 'Model Missing'
                              : 'Not Running'
                          }`}
                    </span>
                  )}

                  {activeMode === 'offline' && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium border',
                        isLocalReady
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                          : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
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
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-medium border border-purple-100 dark:border-purple-900">
                      <Sparkles className="h-3.5 w-3.5 text-purple-600" />
                      Auto Hybrid ({aiStatus?.ollamaAvailable ? 'Cloud + Ollama Ready' : isLocalReady ? 'Cloud + WebGPU Ready' : 'Cloud Preferred'})
                    </span>
                  )}
                </div>

                {/* Mode Selector Toggle */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsAiModeExpanded(!isAiModeExpanded);
                  }}
                  aria-expanded={isAiModeExpanded}
                  aria-label="Toggle Mate AI settings"
                  className="inline-flex items-center gap-1 h-8 rounded-lg border border-border bg-surface px-2 text-xs font-medium text-muted hover:text-dark hover:border-primary/40 transition-colors"
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

                {/* Chat Expand/Collapse */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleChatExpanded();
                  }}
                  aria-expanded={isChatExpanded}
                  aria-label={isChatExpanded ? 'Collapse Mate AI chat' : 'Expand Mate AI chat'}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-dark/70 hover:text-primary hover:border-primary/40 transition-colors"
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

            {/* Mode Controls Drawer */}
            <div
              className={cn(
                'transition-all duration-300 ease-in-out overflow-hidden px-4 sm:px-6',
                isAiModeExpanded
                  ? 'max-h-48 opacity-100 pb-3 pt-1 border-t border-border/40'
                  : 'max-h-0 opacity-0 pb-0 pt-0'
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted font-medium">Select Mode:</span>
                  <div className="inline-flex flex-wrap rounded-lg border border-border bg-surface p-0.5 shadow-sm">
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
                          : 'text-muted hover:text-dark hover:bg-gray-100 dark:hover:bg-slate-800'
                      )}
                    >
                      <Cloud className="h-3.5 w-3.5" />
                      Online
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleModeChange('ollama');
                      }}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors',
                        activeMode === 'ollama'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-muted hover:text-dark hover:bg-gray-100 dark:hover:bg-slate-800'
                      )}
                    >
                      <Terminal className="h-3.5 w-3.5" />
                      Ollama — Local AI
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
                          : 'text-muted hover:text-dark hover:bg-gray-100 dark:hover:bg-slate-800'
                      )}
                    >
                      <HardDrive className="h-3.5 w-3.5" />
                      Offline (WebGPU)
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
                          : 'text-muted hover:text-dark hover:bg-gray-100 dark:hover:bg-slate-800'
                      )}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Auto
                    </button>
                  </div>
                </div>

                <div className="text-[11px] text-muted">
                  {activeMode === 'online' && 'Online: Streams from Google Gemini Cloud API.'}
                  {activeMode === 'ollama' && `Ollama — Local AI: Runs local ${aiStatus?.ollamaModel || DEFAULT_OLLAMA_MODEL} via http://127.0.0.1:11434 with zero cloud calls.`}
                  {activeMode === 'offline' && 'Offline: Uses SmolLM2 WebGPU in-browser with zero cloud calls.'}
                  {activeMode === 'auto' && 'Auto: Prefers Cloud when available, falling back to Local Ollama (Gemma 4) or WebGPU.'}
                </div>
              </div>
            </div>
          </div>

          {/* Chat Body */}
          <div
            data-collapsed={isChatExpanded ? 'false' : 'true'}
            className="mate-chat-body flex-1 flex flex-col min-h-0 overflow-hidden"
          >
            {/* Loading Progress Banner (Strictly for Offline WebGPU mode) */}
            {activeMode === 'offline' && progress && progress.progress < 1.0 && (
              <div className="bg-indigo-50 dark:bg-indigo-950/50 border-b border-indigo-100 dark:border-indigo-900 p-4 animate-in fade-in">
                <div className="flex items-center justify-between text-xs font-semibold text-indigo-900 dark:text-indigo-200 mb-1.5 gap-2">
                  <span className="flex items-center gap-1.5">
                    <Download className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 animate-bounce" />
                    {progress.text || 'Downloading and initializing local WebGPU model...'}
                  </span>
                  <div className="flex items-center gap-2">
                    <span>{Math.round(progress.progress * 100)}%</span>
                    <button
                      type="button"
                      onClick={handleCancelLocalModelInit}
                      className="px-2 py-0.5 rounded bg-indigo-200/80 dark:bg-indigo-800/80 text-indigo-900 dark:text-indigo-100 hover:bg-indigo-300 text-[11px] font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
                <div className="w-full bg-indigo-200 dark:bg-indigo-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-indigo-600 dark:bg-indigo-400 h-full transition-all duration-300 rounded-full"
                    style={{ width: `${Math.max(5, progress.progress * 100)}%` }}
                  />
                </div>
                <p className="text-[11px] text-indigo-700/80 dark:text-indigo-300/80 mt-1.5">
                  Model weights are cached locally in your browser CacheStorage and won't need to be downloaded again.
                </p>
              </div>
            )}

            {/* Error Banner */}
            {errorMessage && (
              <div className="bg-red-50 dark:bg-red-950/50 border-b border-red-200 dark:border-red-900 p-4 text-xs text-red-800 dark:text-red-200 flex flex-wrap items-start justify-between gap-3 animate-in fade-in">
                <div className="flex gap-2 max-w-xl">
                  <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold mb-0.5">AI Engine Notice</p>
                    <p className="opacity-90 whitespace-pre-line">{errorMessage}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleInsertDeterministicGuide}
                    className="h-7 text-xs"
                  >
                    Use Local Study Guide
                  </Button>
                  {activeMode === 'offline' && !isLocalReady && (
                    <Button
                      size="sm"
                      onClick={handleInitLocalModel}
                      className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white"
                    >
                      Load Local Model
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRetry}
                    className="h-7 text-xs text-red-700 dark:text-red-300"
                  >
                    Retry
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setErrorMessage(null)}
                    className="h-7 text-xs text-red-700 dark:text-red-300"
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            )}

            {/* Messages Feed */}
            <div
              ref={feedRef}
              onScroll={handleFeedScroll}
              className="flex-1 min-h-0 p-4 sm:p-6 overflow-y-auto space-y-6"
            >
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
                      <Avatar fallback={user?.name ? user.name.charAt(0) : 'A'} size="sm" />
                    )}
                  </div>

                  <div className={cn('space-y-3 min-w-0', msg.role === 'user' ? 'text-right' : 'flex-1')}>
                    {msg.role === 'assistant' && (
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted mb-1 flex-wrap">
                        {msg.source === 'cloud' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900">
                            <Cloud className="h-3 w-3" />
                            Cloud AI ({msg.model || 'Gemini 3.5 Flash'})
                          </span>
                        )}
                        {msg.source === 'ollama' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            <Terminal className="h-3 w-3" />
                            Ollama Local AI ({msg.model || DEFAULT_OLLAMA_MODEL})
                          </span>
                        )}
                        {msg.source === 'local' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            <HardDrive className="h-3 w-3" />
                            Mate AI (Offline) ({msg.model ? msg.model.split('-')[0] : 'SmolLM2'})
                          </span>
                        )}
                        {msg.source === 'mock-fallback' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            <Brain className="h-3 w-3" />
                            Local Curriculum Guide
                          </span>
                        )}
                        {msg.elapsedMs ? (
                          <span className="text-[10px] text-muted font-mono bg-gray-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-border">
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
                            : 'bg-gray-100 dark:bg-slate-800 text-dark border border-border text-left'
                        )}
                      >
                        {msg.content ? (
                          msg.role === 'assistant' ? (
                            <div className="space-y-2">
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
                              {msg.status === 'cancelled' && !(isGenerating && activeAssistantId === msg.id) && (
                                <div className="pt-2 border-t border-border/60 flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => handleRetryMessage(msg.id, msg.requestPrompt)}
                                    disabled={isGenerating}
                                    className="h-7 text-xs gap-1"
                                  >
                                    <RefreshCw className="h-3 w-3" /> Retry Generation
                                  </Button>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span>{msg.content}</span>
                          )
                        ) : isGenerating && activeAssistantId === msg.id ? (
                          <div className="flex flex-col gap-1.5 py-1" role="status" aria-live="polite">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
                              <span className="font-semibold text-dark/90">
                                {phaseDetail ||
                                  (currentPhase === 'preparing'
                                    ? 'Preparing AI engine...'
                                    : currentPhase === 'loading_model'
                                      ? `Loading ${aiStatus?.ollamaModel || DEFAULT_OLLAMA_MODEL} into memory...`
                                      : currentPhase === 'generating'
                                        ? 'Generating answer...'
                                        : currentPhase === 'switching'
                                          ? 'Switching AI mode...'
                                          : 'Generating response...')}
                              </span>
                              <span className="text-[11px] font-mono text-muted bg-surface px-1.5 py-0.5 rounded border border-border">
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
                          <div className="space-y-2.5 py-1 max-w-xl" data-testid="failed-message-recovery">
                            <div className="flex items-start gap-2 text-red-700 dark:text-red-300 text-xs">
                              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                              <div>
                                <p className="font-semibold">Response did not complete</p>
                                <p className="text-dark/80 mt-0.5 whitespace-pre-line">
                                  {msg.error || errorMessage || 'The selected AI provider did not return a response.'}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <Button
                                size="sm"
                                onClick={() => handleRetryMessage(msg.id, msg.requestPrompt)}
                                disabled={isGenerating}
                                className="h-7 text-xs gap-1"
                              >
                                <RefreshCw className="h-3 w-3" /> Retry
                              </Button>
                              {activeMode !== 'ollama' && aiStatus?.ollamaAvailable && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => {
                                    aiTutorService.setMode('ollama');
                                    handleRetryMessage(msg.id, msg.requestPrompt);
                                  }}
                                  disabled={isGenerating}
                                  className="h-7 text-xs gap-1"
                                >
                                  <Terminal className="h-3 w-3" /> Retry with Local Ollama
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={handleInsertDeterministicGuide}
                                className="h-7 text-xs"
                              >
                                Use Local Study Guide
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {msg.code && (
                      <div className="w-full max-w-2xl">
                        <CodeBlock code={msg.code} />
                      </div>
                    )}

                    {msg.explanation && (
                      <div className="bg-indigo-50/70 dark:bg-slate-800/80 border border-indigo-100 dark:border-indigo-950/60 rounded-xl p-4 text-sm text-dark/90 text-left w-full max-w-2xl">
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

            {/* Input & Action Chips */}
            <div className="p-4 bg-gray-50/70 dark:bg-slate-900/60 border-t border-border">
              <div className="flex flex-wrap gap-2 mb-4">
                {CHIPS.map((chip, i) => (
                  <button
                    key={i}
                    onClick={() => handleChipClick(chip)}
                    disabled={isGenerating}
                    className="px-3 py-1.5 bg-surface border border-border rounded-full text-xs font-medium hover:border-primary hover:text-primary transition-colors text-muted shadow-sm disabled:opacity-50"
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
                      ? 'AI is generating... You can draft your next prompt or switch modes above.'
                      : activeMode === 'offline' && !isLocalReady
                      ? 'Initialize Mate AI (Offline) on the right panel to begin local tutoring...'
                      : 'Ask MindMate to explain, quiz you, or solve a problem...'
                  }
                  className="w-full resize-none rounded-xl border border-border bg-surface pl-4 pr-24 py-3 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent min-h-[56px] max-h-[120px] shadow-sm"
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
        </section>

        {/* Right side: Ollama Gemma 4 Status, Offline Hardware Manager & Adaptive Learning Context */}
        <div className="w-full lg:w-[340px] flex-shrink-0 flex flex-col gap-6 h-auto lg:h-full lg:overflow-y-auto">
          {/* Ollama Local Gemma 4 Status Card */}
          {(activeMode === 'ollama' || activeMode === 'auto') && (
            <Card className="border-border bg-surface shadow-sm overflow-hidden p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-amber-600" />
                  <span>Ollama Local AI (Gemma 4)</span>
                </h3>
                <span
                  className={cn(
                    'text-[10px] uppercase font-bold px-2 py-0.5 rounded-full',
                    aiStatus?.ollamaAvailable
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200'
                  )}
                >
                  {aiStatus?.ollamaAvailable
                    ? 'Connected'
                    : aiStatus?.ollamaStatus === 'model_missing'
                      ? 'Model Missing'
                      : 'Not Running'}
                </span>
              </div>

              <div className="text-xs space-y-2">
                <div className="flex items-center justify-between text-muted">
                  <span>Configured Model:</span>
                  <code className="font-mono font-bold text-dark">
                    {aiStatus?.ollamaModel || DEFAULT_OLLAMA_MODEL}
                  </code>
                </div>
                <p className="text-[11px] text-muted leading-relaxed">
                  {aiStatus?.ollamaMessage ||
                    'Connects to local Ollama at http://127.0.0.1:11434 with zero cloud API traffic.'}
                </p>
                {!aiStatus?.ollamaAvailable && aiStatus?.ollamaRecoveryGuidance && (
                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-900 dark:text-amber-200 whitespace-pre-line font-mono">
                    {aiStatus.ollamaRecoveryGuidance}
                  </div>
                )}
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleCheckOllama}
                    disabled={checkingOllama}
                    className="w-full text-xs h-8 flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5', checkingOllama && 'animate-spin')} />
                    {checkingOllama ? 'Checking 127.0.0.1:11434...' : 'Verify Ollama Status'}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Offline Hardware Manager (Available in Offline & Auto modes) */}
          {(activeMode === 'offline' || activeMode === 'auto') && (
            <Card className="border-border bg-surface shadow-sm overflow-hidden">
              <div
                onClick={() => setIsLocalAiExpanded(!isLocalAiExpanded)}
                className="p-4 flex items-center justify-between cursor-pointer select-none hover:bg-gray-50/80 dark:hover:bg-slate-800/80 transition-colors"
                role="button"
                tabIndex={0}
                aria-expanded={isLocalAiExpanded}
              >
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-emerald-600" />
                  <span>Mate AI (Offline Engine)</span>
                </h3>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'text-[10px] uppercase font-bold px-2 py-0.5 rounded-full',
                      isLocalReady
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200'
                        : 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300'
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
                      className="w-full rounded-lg border border-border bg-surface text-dark p-2 text-xs focus:ring-2 focus:ring-primary outline-none"
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
                    <span
                      className={cn(
                        'font-semibold flex items-center gap-1',
                        isWebGpu ? 'text-emerald-600' : 'text-amber-600'
                      )}
                    >
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
                        Requires a one-time download while online. Once cached, runs 100% on device with zero internet.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-800 rounded-lg p-3 text-emerald-900 dark:text-emerald-200 space-y-1">
                      <p className="font-semibold flex items-center gap-1.5 text-xs">
                        <CheckCircle className="h-4 w-4 text-emerald-600" /> Mate AI (Offline) Available
                      </p>
                      <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80 leading-relaxed">
                        Model is loaded into device memory. You can disconnect your network and continue learning without cloud connectivity.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* Learning Context Card */}
          <Card className="border-border bg-surface shadow-sm overflow-hidden">
            <div
              onClick={() => setIsLearningContextExpanded(!isLearningContextExpanded)}
              className="p-4 flex items-center justify-between cursor-pointer select-none hover:bg-gray-50/80 dark:hover:bg-slate-800/80 transition-colors"
              role="button"
              tabIndex={0}
              aria-expanded={isLearningContextExpanded}
            >
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                <span>Adaptive Learning Context</span>
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                  {activeTopicMetric && activeTopicMetric.totalAttempts > 0
                    ? `${activeMastery}% Mastery`
                    : 'Unassessed'}
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
                  ? 'max-h-[900px] opacity-100 border-t border-border p-5 pt-4'
                  : 'max-h-0 opacity-0 p-0 border-t-0'
              )}
            >
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-muted mb-1 uppercase tracking-wider font-semibold block">
                    Current Topic
                  </label>
                  <select
                    value={resolvedActiveTopicMeta.id}
                    onChange={(e) => {
                      const nextParams = new URLSearchParams(searchParams);
                      nextParams.set('topic', e.target.value);
                      setSearchParams(nextParams);
                    }}
                    className="w-full rounded-lg border border-border bg-surface text-dark p-2 text-xs font-medium"
                  >
                    {TOPICS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1 text-xs font-medium">
                    <span className="text-muted uppercase tracking-wider font-semibold">
                      Mastery ({activeConfidence} confidence)
                    </span>
                    <span className="text-primary font-semibold">
                      {activeTopicMetric && activeTopicMetric.totalAttempts > 0
                        ? `${activeMastery}% (${activeTopicMetric.correctAnswers}/${activeTopicMetric.totalAttempts})`
                        : '0 attempts'}
                    </span>
                  </div>
                  <ProgressBar value={activeMastery} className="h-1.5" />
                </div>

                <div className="rounded-lg p-3.5 bg-indigo-50/70 dark:bg-slate-800/80 border border-indigo-100 dark:border-indigo-950/60 space-y-1.5">
                  <p className="font-semibold text-xs flex items-center gap-1.5 text-primary">
                    <GitPullRequest className="h-3.5 w-3.5" />
                    Strategy: {STRATEGY_LABELS[activeStrategy]}
                  </p>
                  <p className="text-[11px] text-dark/80 leading-relaxed">
                    {activeStrategyReason}
                  </p>
                  {matchingMaterial && (
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium pt-1">
                      Grounded in uploaded note: {matchingMaterial.name}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={() =>
                      handleSend(
                        `Teach me ${activeTopic} using a ${STRATEGY_LABELS[activeStrategy].toLowerCase()} tailored to my current mastery (${activeMastery}%).`
                      )
                    }
                    disabled={isGenerating}
                    className="w-full text-xs flex items-center justify-center gap-1.5"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Explain with {STRATEGY_LABELS[activeStrategy]}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      navigate(
                        `/practice/adaptive-quiz?topic=${encodeURIComponent(resolvedActiveTopicMeta.id)}&type=follow_up`
                      )
                    }
                    className="w-full text-xs flex items-center justify-center gap-1.5"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    Take Follow-Up Quiz on {activeTopic}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
