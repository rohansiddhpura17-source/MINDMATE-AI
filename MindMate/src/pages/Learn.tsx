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
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Eye,
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
  localWebLLMAdapter,
  formatProviderBadge,
  classifyTopicRelevance,
} from '../services/ai';
import {
  selectExplanationStrategy,
  selectAdaptiveDifficulty,
  STRATEGY_LABELS,
} from '../services/adaptive/adaptiveLearningEngine';
import type { ExplanationStrategy } from '../services/assessment/types';
import { VisualRenderer } from '../components/visual/VisualRenderer';
import { generateVisualRepresentation, VisualPayload, extractVisualSubject } from '../services/visual';
import { isDemoModeActive, DEMO_MODE_CHANGED_EVENT } from '../services/demo/demoLearnerService';
import { findPrecedingTurn, normalizeAction, resolveConversationalFollowUp } from '../services/ai/followUpContext';
import { extractEntityName } from '../services/visual/imageSearchService';
import { isImageGenerationRequest, generateExplicitImage } from '../services/visual/imageGenerationService';
import { VoiceAssistantPanel } from '../components/voice/VoiceAssistantPanel';
import { VoicePrivacyNoticeModal } from '../components/voice/VoicePrivacyNoticeModal';
import { usePanelState } from '../hooks/usePanelState';
import { PanelControls } from '../components/ui/PanelControls';
import { ActionExecutionCard } from '../components/actions/ActionExecutionCard';
import { actionExecutionService, ActionPlan } from '../services/actions';
import {
  VoiceState,
  VoiceSettings,
  loadVoiceSettings,
  saveVoiceSettings,
  isVoicePrivacyAcknowledged,
  setVoicePrivacyAcknowledged,
  VOICE_SETTINGS_EVENT,
  speechRecognitionService,
  speechSynthesisService,
  parseVoiceCommand,
} from '../services/voice';

const CHIPS = ['Explain differently', 'Simplify', 'Give example', 'Quiz me', 'Show visually'];

export default function Learn() {
  const { user, isOnline } = useAppContext();
  const navigate = useNavigate();
  const { recordStudyActivity } = useStudyStreak();
  const { snapshot: analyticsSnapshot } = useMastery();

  // Voice Assistant states
  const [isVoiceModeActive, setIsVoiceModeActive] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(() => loadVoiceSettings());
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);
  const [voiceConfirmation, setVoiceConfirmation] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);

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

  // Demo progress isolation state
  const [demoActive, setDemoActive] = useState(() => isDemoModeActive(user?.id));

  useEffect(() => {
    const handleDemoChange = (e: any) => {
      setDemoActive(Boolean(e.detail?.active));
    };
    window.addEventListener(DEMO_MODE_CHANGED_EVENT, handleDemoChange);
    return () => window.removeEventListener(DEMO_MODE_CHANGED_EVENT, handleDemoChange);
  }, []);

  const isDemo = demoActive || Boolean(analyticsSnapshot?.isDemoMode);

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

  // Collapsible panels state with localStorage persistence
  const [isAiModeExpanded, setIsAiModeExpanded] = useState(false);

  const chatPanel = usePanelState({
    storageKey: 'mm_panel_mate_chat',
    defaultExpanded: true,
    defaultMaximized: false,
    defaultZoom: 100,
    minZoom: 80,
    maxZoom: 125,
    zoomStep: 10,
  });
  const isChatExpanded = chatPanel.isExpanded;
  const isChatMaximized = chatPanel.isMaximized;
  const chatZoomLevel = chatPanel.zoomLevel;

  const contextPanel = usePanelState({
    storageKey: 'mm_panel_learning_context',
    defaultExpanded: true,
  });

  // Auto-minimize Modes drawer on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isAiModeExpanded) {
        setIsAiModeExpanded(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAiModeExpanded]);

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
    if (chatPanel.isExpanded && feedRef.current) {
      collapsedScrollRef.current = {
        scrollTop: feedRef.current.scrollTop,
        signature: messagesSignature,
      };
    }
    chatPanel.toggleExpanded();
  };

  const toggleChatMaximized = () => {
    if (!chatPanel.isMaximized && !chatPanel.isExpanded) {
      chatPanel.setIsExpanded(true);
    }
    chatPanel.toggleMaximized();
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
    const handleVoiceSettingsUpdate = (e: any) => {
      if (e.detail) {
        setVoiceSettings(e.detail);
      }
    };
    window.addEventListener(VOICE_SETTINGS_EVENT, handleVoiceSettingsUpdate);

    return () => {
      isMountedRef.current = false;
      stopTimer();
      window.removeEventListener(VOICE_SETTINGS_EVENT, handleVoiceSettingsUpdate);
      speechRecognitionService.stopListening();
      speechSynthesisService.stop();
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
    speechSynthesisService.stop();
    setVoiceState('idle');
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
    if (isVoiceModeActive) {
      setVoiceState('thinking');
    }
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

      const topicRelevance = classifyTopicRelevance(userText, resolvedActiveTopicMeta.id);
      const effectiveTopicMeta =
        topicRelevance.category === 'subject_switch_intent' && topicRelevance.targetTopic
          ? topicRelevance.targetTopic
          : resolvedActiveTopicMeta;
      const effectiveTopicName = effectiveTopicMeta.name;

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
            topicId: effectiveTopicMeta.id,
            topicName: effectiveTopicName,
            masteryScore: activeMastery,
            confidenceLevel: activeConfidence,
            recentAccuracy: activeTopicMetric?.recentAccuracy ?? 0,
            targetDifficulty: activeDifficultyDecision.targetBand,
            explanationStrategy: activeStrategy,
            strategyReason: activeStrategyReason,
            recentMistakesSummary: topicMistakeSummaries,
            studyMaterialTitle:
              topicRelevance.category === 'off_topic_factual'
                ? undefined
                : matchingMaterial?.name,
            studyMaterialExcerpt:
              topicRelevance.category === 'off_topic_factual'
                ? undefined
                : matchingMaterial?.raw_content || matchingMaterial?.summary,
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

            if (voiceSettings.autoSpeak && isVoiceModeActive && res.content) {
              setVoiceState('speaking');
              void speechSynthesisService.speak(res.content, {
                language: voiceSettings.speechLanguage,
                voiceURI: voiceSettings.selectedVoiceURI,
                rate: voiceSettings.speechRate,
                volume: voiceSettings.speechVolume,
                onEnd: () => {
                  if (isMountedRef.current) setVoiceState('idle');
                },
                onError: () => {
                  if (isMountedRef.current) setVoiceState('idle');
                },
              });
            } else if (isMountedRef.current) {
              setVoiceState('idle');
            }
          },
          onError: (err) => {
            if (!isMountedRef.current || seq !== currentRequestSeqRef.current) return;
            setErrorMessage(err.message);
            if (isVoiceModeActive) {
              setVoiceState('error');
              setVoiceError(err.message);
            }
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
    setIsAiModeExpanded(false); // Auto-minimize mode selection menu immediately
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

    // Check if this is an explicit image generation request (routed separately from Ollama text LLM)
    if (isImageGenerationRequest(userMessageContent)) {
      const newUserMsg: ChatMessage = {
        id: Date.now(),
        role: 'user',
        content: userMessageContent,
        status: 'completed',
        timestamp: Date.now(),
      };

      const genResult = await generateExplicitImage(userMessageContent);
      const assistantImgMsg: ChatMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: genResult.success
          ? (genResult.caption || `Synthetic AI illustration generated for "${genResult.prompt}".`)
          : (genResult.error || 'Generative image service is unconfigured.'),
        status: 'completed',
        source: 'cloud',
        model: genResult.label,
        timestamp: Date.now(),
        visual: genResult.success && genResult.imageUrl
          ? {
              format: 'image_gallery',
              title: `AI-Generated: ${genResult.prompt}`,
              summary: 'Explicit AI-generated synthetic illustration.',
              topic: genResult.prompt,
              images: [
                {
                  id: 'ai-gen-1',
                  title: genResult.prompt,
                  url: genResult.imageUrl,
                  thumbnail: genResult.imageUrl,
                  description: `Synthetic AI illustration for "${genResult.prompt}".`,
                  author: 'Configured Image Model',
                  license: 'AI Generated',
                  sourceUrl: genResult.imageUrl,
                },
              ],
            }
          : undefined,
      };

      setMessages((prev) => [...prev, newUserMsg, assistantImgMsg]);
      if (user?.id) {
        try {
          await saveChatMessage(user.id, 'user', userMessageContent, activeTopic);
          await saveChatMessage(user.id, 'assistant', assistantImgMsg.content, activeTopic);
        } catch (e) {
          console.warn('Failed to save message', e);
        }
      }
      return;
    }

    const actionType = normalizeAction(userMessageContent);
    const isExplicitShowVisually =
      options?.isVisual ||
      actionType === 'Show visually' ||
      userMessageContent.toLowerCase().startsWith('show visually') ||
      userMessageContent.toLowerCase().startsWith('visualize');

    if (isExplicitShowVisually) {
      setInputValue('');
      void handleShowVisually();
      return;
    }

    let promptToSend = options?.promptContent;
    if (!promptToSend) {
      if (isFollowUpAction(userMessageContent)) {
        const followUp = buildFollowUpContext(messages, userMessageContent);
        promptToSend = followUp.promptContent;
      } else {
        const resolved = resolveConversationalFollowUp(messages, userMessageContent);
        if (resolved.resolvedPrompt !== userMessageContent) {
          promptToSend = resolved.resolvedPrompt;
        }
      }
    }
    const effectivePrompt = promptToSend || userMessageContent;

    // Detect subject switch intent to update URL parameters and curriculum selector immediately
    const switchRelevance = classifyTopicRelevance(effectivePrompt, resolvedActiveTopicMeta.id);
    if (switchRelevance.category === 'subject_switch_intent' && switchRelevance.targetTopic) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('topic', switchRelevance.targetTopic.id);
      setSearchParams(nextParams);
    }

    // 0. Action Execution Engine Check (Navigation, Study Planner, Quiz Launch, Recommendations)
    const actionContext = {
      userId: user?.id || 'guest',
      userName: user?.name,
      activeTopic: activeTopic,
      navigate: (path: string) => navigate(path),
      openVoiceMode: () => {
        setIsVoiceModeActive(true);
        if (!isVoicePrivacyAcknowledged()) {
          setIsPrivacyModalOpen(true);
        }
      },
      stopSpeaking: () => handleStopSpeaking(),
      repeatAnswer: () => {
        const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && m.content.trim());
        if (lastAssistant) {
          void speechSynthesisService.speak(lastAssistant.content, {
            language: voiceSettings.speechLanguage,
            voiceURI: voiceSettings.selectedVoiceURI,
            rate: voiceSettings.speechRate,
            volume: voiceSettings.speechVolume,
          });
        }
      },
    };

    const actionCheck = await actionExecutionService.handleUserInput(
      userMessageContent,
      actionContext,
      activeMode,
      aiStatus?.ollamaModel || DEFAULT_OLLAMA_MODEL
    );

    if (actionCheck.isAction && actionCheck.plan) {
      const newUserMsg: ChatMessage = {
        id: Date.now(),
        role: 'user',
        content: userMessageContent,
        status: 'completed',
        timestamp: Date.now(),
      };

      const assistantActionMsg: ChatMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: actionCheck.plan.summary,
        status: 'completed',
        actionPlan: actionCheck.plan,
        source: activeMode === 'ollama' ? 'ollama' : activeMode === 'offline' ? 'local' : 'cloud',
        model: activeMode === 'ollama' ? (aiStatus?.ollamaModel || DEFAULT_OLLAMA_MODEL) : 'MindMate Action Engine',
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, newUserMsg, assistantActionMsg]);

      if (user?.id) {
        try {
          await saveChatMessage(user.id, 'user', userMessageContent, activeTopic);
          recordStudyActivity();
        } catch (e) {
          console.warn('Failed to save message to database', e);
        }
      }
      return;
    }

    const newUserMsg: ChatMessage = {
      id: Date.now(),
      role: 'user',
      content: userMessageContent,
      promptContent: effectivePrompt !== userMessageContent ? effectivePrompt : undefined,
      status: 'completed',
      timestamp: Date.now(),
    };

    const tempAssistantId = Date.now() + 1;
    const initialExpectedSource =
      activeMode === 'online'
        ? 'cloud'
        : activeMode === 'ollama'
          ? 'ollama'
          : activeMode === 'offline'
            ? 'local'
            : undefined;

    const initialExpectedModel =
      activeMode === 'ollama'
        ? aiStatus?.ollamaModel || DEFAULT_OLLAMA_MODEL
        : activeMode === 'offline'
          ? localWebLLMAdapter.getModelId() || DEFAULT_LOCAL_MODEL
          : activeMode === 'online'
            ? 'Gemini 3.5 Flash'
            : undefined;

    const initialBadge = formatProviderBadge(initialExpectedSource, initialExpectedModel);

    const initialAssistantMsg: ChatMessage = {
      id: tempAssistantId,
      role: 'assistant',
      content: '',
      status: 'preparing',
      requestPrompt: effectivePrompt,
      source: initialExpectedSource,
      model: initialBadge.modelLabel,
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

    // Trigger automatic visual learning generation if question strongly matches visual formats
    const userRelevance = classifyTopicRelevance(effectivePrompt, resolvedActiveTopicMeta.id);
    const autoVisualIntent =
      userRelevance.intent === 'person_biography' ||
      userRelevance.intent === 'visual_request' ||
      userMessageContent.toLowerCase().includes('pandas') ||
      userMessageContent.toLowerCase().includes('what is a cpu') ||
      userMessageContent.toLowerCase().includes('cpu architecture') ||
      userMessageContent.toLowerCase().includes('water cycle') ||
      (userMessageContent.toLowerCase().includes('stack') && userMessageContent.toLowerCase().includes('queue')) ||
      (userMessageContent.toLowerCase().includes('mindmate') && userMessageContent.toLowerCase().includes('architecture'));

    if (autoVisualIntent) {
      const sForVisual =
        extractEntityName(userMessageContent) ||
        extractVisualSubject(userMessageContent, activeTopic) ||
        activeTopic;

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempAssistantId
            ? { ...msg, visualLoading: true, visualLoadingSubject: sForVisual }
            : msg
        )
      );

      generateVisualRepresentation({
        question: userMessageContent,
        answer: '',
        subject: sForVisual,
        mode: activeMode,
        isOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
      })
        .then((visualPayload) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === tempAssistantId
                ? {
                    ...msg,
                    visual: visualPayload,
                    visualLoading: false,
                    visualLoadingSubject: undefined,
                    visualError: undefined,
                  }
                : msg
            )
          );
        })
        .catch((err) => {
          console.warn('[VisualEngine] Auto generation failed:', err);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === tempAssistantId
                ? {
                    ...msg,
                    visualLoading: false,
                    visualLoadingSubject: undefined,
                    visualError: err?.message || 'Failed to generate visual representation.',
                  }
                : msg
            )
          );
        });
    }

    executeAIGeneration(effectivePrompt, tempAssistantId, {
      ...options,
      promptContent: effectivePrompt,
      displayText: userMessageContent,
    });
  };

  // Dedicated Context-Aware "Show Visually" Handler
  const handleShowVisually = async (targetMessageId?: number | string, forceRegenerate = false) => {
    // 1. Locate the target assistant message to attach visual to.
    let targetAssistantMsg: ChatMessage | undefined;
    if (targetMessageId !== undefined) {
      targetAssistantMsg = messages.find((m) => m.id === targetMessageId);
    } else {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (
          messages[i].role === 'assistant' &&
          messages[i].status !== 'failed' &&
          messages[i].status !== 'cancelled' &&
          (messages[i].content.trim().length > 0 || messages[i].explanation?.trim())
        ) {
          targetAssistantMsg = messages[i];
          break;
        }
      }
    }

    // Guard: Prevent double-submitting if visual is already actively loading
    if (targetAssistantMsg?.visualLoading) {
      return;
    }

    // Guard: If a valid visual is already displayed and forceRegenerate is false, preserve it
    if (targetAssistantMsg?.visual && !forceRegenerate) {
      return;
    }

    // 2. Read the specific user question and Mate AI answer for this assistant turn
    let question = '';
    let answer = '';

    if (targetAssistantMsg) {
      answer = [
        targetAssistantMsg.content,
        targetAssistantMsg.explanation,
        targetAssistantMsg.code,
      ].filter(Boolean).join('\n\n').trim();

      const targetIdx = messages.findIndex((m) => m.id === targetAssistantMsg!.id);
      if (targetIdx > 0) {
        for (let i = targetIdx - 1; i >= 0; i--) {
          if (messages[i].role === 'user' && messages[i].content?.trim()) {
            question = messages[i].promptContent || messages[i].content.trim();
            break;
          }
        }
      }
      if (!question && targetAssistantMsg.requestPrompt) {
        question = targetAssistantMsg.requestPrompt;
      }
    }

    if (!question) {
      const precedingTurn = findPrecedingTurn(messages, undefined);
      question = precedingTurn?.question || activeTopic;
      if (!answer) {
        answer = precedingTurn?.answer || '';
      }
    }

    // Identify actual subject and best visual format
    const subject =
      extractEntityName(question) ||
      extractVisualSubject(question, activeTopic) ||
      activeTopic;

    let effectiveTargetId: number | string;

    if (targetAssistantMsg) {
      effectiveTargetId = targetAssistantMsg.id;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === effectiveTargetId
            ? {
                ...m,
                visualLoading: true,
                visualLoadingSubject: subject,
                visualError: undefined,
              }
            : m
        )
      );
    } else {
      effectiveTargetId = Date.now();
      const newAssistantMsg: ChatMessage = {
        id: effectiveTargetId,
        role: 'assistant',
        content: `Here is the visual diagram and conceptual model for **${subject}**:`,
        status: 'completed',
        source: 'local',
        model: 'Visual Learning Engine',
        timestamp: Date.now(),
        visualLoading: true,
        visualLoadingSubject: subject,
      };
      setMessages((prev) => [...prev, newAssistantMsg]);
    }

    // 3. Execute real visual-generation workflow using supported capabilities
    try {
      const visualPayload = await generateVisualRepresentation({
        question,
        answer,
        subject,
        mode: activeMode,
        isOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
        previousQuestion: question,
        previousAnswer: answer,
      });

      setMessages((prev) =>
        prev.map((m) =>
          m.id === effectiveTargetId
            ? {
                ...m,
                visual: visualPayload,
                visualLoading: false,
                visualLoadingSubject: undefined,
                visualError: undefined,
              }
            : m
        )
      );
    } catch (err: any) {
      const errMsg =
        err?.message ||
        `Could not generate visual representation for "${subject}". Please check your connection and retry.`;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === effectiveTargetId
            ? {
                ...m,
                visualLoading: false,
                visualLoadingSubject: undefined,
                visualError: errMsg,
              }
            : m
        )
      );
    }
  };

  const handleChipClick = (chip: string) => {
    if (chip === 'Show visually') {
      void handleShowVisually();
      return;
    }
    const followUp = buildFollowUpContext(messages, chip);
    handleSend(followUp.displayContent, {
      promptContent: followUp.promptContent,
      displayText: followUp.displayContent,
      startQuiz: chip === 'Quiz me',
    });
  };

  const handleStartListening = async () => {
    if (!isVoicePrivacyAcknowledged()) {
      setIsPrivacyModalOpen(true);
      return;
    }

    setVoiceError(null);
    setVoiceConfirmation(null);
    setInterimTranscript('');
    setFinalTranscript('');
    setVoiceState('listening');

    await speechRecognitionService.startListening({
      language: voiceSettings.speechLanguage,
      onTranscript: (payload) => {
        setInterimTranscript(payload.interimTranscript);
        setFinalTranscript(payload.finalTranscript);
      },
      onError: (err) => {
        setVoiceError(err.message);
        setVoiceState('error');
      },
      onEnd: () => {
        if (!isGenerating) {
          setVoiceState((prev) => (prev === 'listening' ? 'idle' : prev));
        }
      },
    });
  };

  const handleStopListening = () => {
    speechRecognitionService.stopListening();
    setVoiceState((prev) => (prev === 'listening' ? 'idle' : prev));
  };

  const handleStopSpeaking = () => {
    speechSynthesisService.stop();
    setVoiceState('idle');
  };

  const handleVoiceSubmit = async (transcriptText: string) => {
    const raw = transcriptText.trim();
    if (!raw || isGenerating) return;

    setVoiceError(null);
    setVoiceConfirmation(null);

    // 1. Evaluate deterministic voice command router
    const commandResult = parseVoiceCommand(raw, {
      activeTopic: activeTopic,
      weakTopics: analyticsSnapshot?.mistakePatterns?.slice(0, 3).map((m) => m.summary) || [],
      recommendationTopic: resolvedActiveTopicMeta.name,
      recommendationReason: activeStrategyReason,
      userId: user?.id || 'guest',
    });

    // Voice spoken confirmation check for pending plans ("yes", "confirm", "save it")
    if (/^(yes|confirm|save it|save the plan|do it|approve)$/i.test(raw)) {
      const lastPendingMsg = [...messages].reverse().find(
        (m) => m.actionPlan && m.actionPlan.status === 'awaiting_confirmation'
      );
      if (lastPendingMsg && lastPendingMsg.actionPlan) {
        const actionContext = {
          userId: user?.id || 'guest',
          userName: user?.name,
          activeTopic: activeTopic,
          navigate: (path: string) => navigate(path),
        };
        const res = await actionExecutionService.confirmPlan(
          lastPendingMsg.actionPlan.id,
          actionContext
        );
        setMessages((prev) =>
          prev.map((m) => (m.id === lastPendingMsg.id ? { ...m, actionPlan: res.plan } : m))
        );
        const doneMsg = `Confirmed! Saved study tasks to your Planner.`;
        setVoiceConfirmation(doneMsg);
        if (voiceSettings.autoSpeak) {
          setVoiceState('speaking');
          void speechSynthesisService.speak(doneMsg, {
            language: voiceSettings.speechLanguage,
            voiceURI: voiceSettings.selectedVoiceURI,
            rate: voiceSettings.speechRate,
            volume: voiceSettings.speechVolume,
            onEnd: () => {
              if (isMountedRef.current) setVoiceState('idle');
            },
            onError: () => {
              if (isMountedRef.current) setVoiceState('idle');
            },
          });
        }
        return;
      }
    }

    if (commandResult.type === 'navigation' && commandResult.route) {
      setVoiceConfirmation(commandResult.confirmationMessage || 'Navigating...');
      if (voiceSettings.autoSpeak && commandResult.confirmationMessage) {
        setVoiceState('speaking');
        void speechSynthesisService.speak(commandResult.confirmationMessage, {
          language: voiceSettings.speechLanguage,
          voiceURI: voiceSettings.selectedVoiceURI,
          rate: voiceSettings.speechRate,
          volume: voiceSettings.speechVolume,
          onEnd: () => {
            if (isMountedRef.current) setVoiceState('idle');
          },
          onError: () => {
            if (isMountedRef.current) setVoiceState('idle');
          },
        });
      }
      navigate(commandResult.route);
      return;
    }

    if (commandResult.type === 'learning') {
      if (commandResult.action === 'stop_speaking') {
        handleStopSpeaking();
        setVoiceConfirmation('Stopped speaking.');
        return;
      }

      if (commandResult.action === 'repeat_answer') {
        const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && m.content.trim());
        if (lastAssistant) {
          setVoiceConfirmation('Repeating latest response aloud...');
          setVoiceState('speaking');
          void speechSynthesisService.speak(lastAssistant.content, {
            language: voiceSettings.speechLanguage,
            voiceURI: voiceSettings.selectedVoiceURI,
            rate: voiceSettings.speechRate,
            volume: voiceSettings.speechVolume,
            onEnd: () => {
              if (isMountedRef.current) setVoiceState('idle');
            },
            onError: () => {
              if (isMountedRef.current) setVoiceState('idle');
            },
          });
        } else {
          setVoiceError('No previous assistant response to read aloud.');
        }
        return;
      }

      if (commandResult.action === 'create_study_plan' || commandResult.action === 'add_planner_task') {
        const plan = commandResult.payload?.plan;
        if (plan) {
          const confirmPrompt = `${plan.summary} Would you like me to confirm and schedule this plan?`;
          setVoiceConfirmation(confirmPrompt);
          setMessages((prev) => [
            ...prev,
            { id: Date.now(), role: 'user', content: raw, timestamp: Date.now() },
            {
              id: Date.now() + 1,
              role: 'assistant',
              content: plan.summary,
              actionPlan: plan,
              source: activeMode === 'ollama' ? 'ollama' : 'local',
              model: aiStatus?.ollamaModel || DEFAULT_OLLAMA_MODEL,
              timestamp: Date.now() + 1,
            },
          ]);
          if (voiceSettings.autoSpeak) {
            setVoiceState('speaking');
            void speechSynthesisService.speak(confirmPrompt, {
              language: voiceSettings.speechLanguage,
              voiceURI: voiceSettings.selectedVoiceURI,
              rate: voiceSettings.speechRate,
              volume: voiceSettings.speechVolume,
              onEnd: () => {
                if (isMountedRef.current) setVoiceState('idle');
              },
              onError: () => {
                if (isMountedRef.current) setVoiceState('idle');
              },
            });
          }
          return;
        }
      }

      if (commandResult.action === 'simplify') {
        handleChipClick('Simplify');
        return;
      }

      if (commandResult.action === 'give_example') {
        handleChipClick('Give example');
        return;
      }

      if (commandResult.action === 'explain_topic') {
        handleSend(`Please explain ${activeTopic} step-by-step.`);
        return;
      }

      if (commandResult.action === 'quiz_on_topic') {
        const targetTopic = commandResult.payload?.topic || activeTopic;
        navigate(`/adaptive-quiz?topic=${encodeURIComponent(targetTopic)}`);
        return;
      }

      if (commandResult.action === 'start_followup_quiz') {
        navigate(`/adaptive-quiz?topic=${encodeURIComponent(activeTopic)}`);
        return;
      }

      if (commandResult.action === 'show_weak_topics') {
        const weakList = analyticsSnapshot?.mistakePatterns?.slice(0, 3);
        const weakText =
          weakList && weakList.length > 0
            ? `Based on your quiz attempts, your key focus areas are: ${weakList.map((m) => m.summary).join(', ')}.`
            : `You have insufficient quiz attempts to identify weak topics yet. Complete a quiz on ${activeTopic} to generate mastery data.`;

        setVoiceConfirmation(weakText);
        setMessages((prev) => [
          ...prev,
          { id: Date.now(), role: 'user', content: raw, timestamp: Date.now() },
          { id: Date.now() + 1, role: 'assistant', content: weakText, source: 'mock-fallback', timestamp: Date.now() + 1 },
        ]);
        if (voiceSettings.autoSpeak) {
          setVoiceState('speaking');
          void speechSynthesisService.speak(weakText, {
            language: voiceSettings.speechLanguage,
            voiceURI: voiceSettings.selectedVoiceURI,
            rate: voiceSettings.speechRate,
            volume: voiceSettings.speechVolume,
            onEnd: () => {
              if (isMountedRef.current) setVoiceState('idle');
            },
            onError: () => {
              if (isMountedRef.current) setVoiceState('idle');
            },
          });
        }
        return;
      }
    }

    if (commandResult.type === 'progress') {
      let progressSummary = '';
      if (commandResult.action === 'how_am_i_doing') {
        const overall = analyticsSnapshot?.averageMastery ?? 0;
        const attempts = analyticsSnapshot?.totalAttempts ?? 0;
        progressSummary = `You have completed ${attempts} quiz attempt${attempts === 1 ? '' : 's'} with an average mastery score of ${overall}%. Your current active topic is ${activeTopic}.`;
      } else if (commandResult.action === 'what_should_i_study_next') {
        progressSummary = `I recommend focusing on "${activeTopic}" next because ${activeStrategyReason.toLowerCase()}.`;
      } else if (commandResult.action === 'explain_recommendation') {
        progressSummary = `This topic was recommended because ${activeStrategyReason}. Target strategy is ${activeStrategy}.`;
      }

      setVoiceConfirmation(progressSummary);
      setMessages((prev) => [
        ...prev,
        { id: Date.now(), role: 'user', content: raw, timestamp: Date.now() },
        { id: Date.now() + 1, role: 'assistant', content: progressSummary, source: 'mock-fallback', timestamp: Date.now() + 1 },
      ]);
      if (voiceSettings.autoSpeak) {
        setVoiceState('speaking');
        void speechSynthesisService.speak(progressSummary, {
          language: voiceSettings.speechLanguage,
          voiceURI: voiceSettings.selectedVoiceURI,
          rate: voiceSettings.speechRate,
          volume: voiceSettings.speechVolume,
          onEnd: () => {
            if (isMountedRef.current) setVoiceState('idle');
          },
          onError: () => {
            if (isMountedRef.current) setVoiceState('idle');
          },
        });
      }
      return;
    }

    if (commandResult.type === 'clarification') {
      const clarifyText = commandResult.clarificationQuestion || 'Could you please clarify your request?';
      setVoiceConfirmation(clarifyText);
      setMessages((prev) => [
        ...prev,
        { id: Date.now(), role: 'user', content: raw, timestamp: Date.now() },
        { id: Date.now() + 1, role: 'assistant', content: clarifyText, source: 'mock-fallback', timestamp: Date.now() + 1 },
      ]);
      if (voiceSettings.autoSpeak) {
        setVoiceState('speaking');
        void speechSynthesisService.speak(clarifyText, {
          language: voiceSettings.speechLanguage,
          voiceURI: voiceSettings.selectedVoiceURI,
          rate: voiceSettings.speechRate,
          volume: voiceSettings.speechVolume,
          onEnd: () => {
            if (isMountedRef.current) setVoiceState('idle');
          },
          onError: () => {
            if (isMountedRef.current) setVoiceState('idle');
          },
        });
      }
      return;
    }

    // Default: Normal educational prompt routed to configured AI provider
    handleSend(raw);
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
          data-chat-maximized={isChatMaximized ? 'true' : 'false'}
          className={cn(
            'flex-1 flex flex-col bg-surface rounded-card border border-[#E2E8F0] shadow-soft min-w-0 mate-chat-shell overflow-hidden transition-all duration-200',
            isChatExpanded ? 'h-[600px] lg:h-full' : 'h-auto lg:self-start',
            isChatMaximized && 'w-full max-w-full'
          )}
        >
          {/* Header Bar */}
          <div
            className={cn(
              'bg-[#F8FAFC] dark:bg-slate-900/60 text-sm transition-colors',
              isChatExpanded && 'border-b border-[#E2E8F0]'
            )}
          >
            <div
              onClick={toggleChatExpanded}
              className="w-full px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 cursor-pointer select-none hover:bg-[#F1F5F9]/80 dark:hover:bg-slate-800/60 transition-colors"
              data-testid="mate-ai-header"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-dark">
                  <Sparkles className="h-3.5 w-3.5 text-[#4F46E5]" />
                  <span>Mate AI</span>
                </h2>

                <span
                  data-testid="mate-ai-status-indicator"
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border',
                    isGenerating
                      ? 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]'
                      : (!isOnline || activeMode === 'offline')
                        ? 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]'
                        : 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]'
                  )}
                >
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full',
                      isGenerating
                        ? 'bg-[#1D4ED8] animate-pulse'
                        : 'bg-[#047857]'
                    )}
                  />
                  {isGenerating
                    ? 'Thinking'
                    : (!isOnline || activeMode === 'offline')
                      ? 'Offline mode ready'
                      : 'Ready'}
                </span>
              </div>

              <div className="flex items-center gap-2 sm:gap-3 ml-auto">
                {/* Voice Mode Toggle Pill */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsVoiceModeActive(!isVoiceModeActive);
                  }}
                  data-testid="mate-ai-voice-mode-toggle"
                  aria-pressed={isVoiceModeActive}
                  aria-label={isVoiceModeActive ? 'Switch to text chat' : 'Open Mate Voice Assistant'}
                  className={cn(
                    'inline-flex items-center gap-1.5 h-8 rounded-lg border px-2.5 text-xs font-semibold transition-colors shadow-2xs',
                    isVoiceModeActive
                      ? 'bg-primary text-white border-primary shadow-xs'
                      : 'bg-surface border-border text-dark hover:border-primary/50 hover:bg-indigo-50/50 hover:text-primary'
                  )}
                >
                  <Mic className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{isVoiceModeActive ? 'Voice Assistant' : 'Voice Mode'}</span>
                </button>

                {/* Mode Selector Toggle */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsAiModeExpanded(!isAiModeExpanded);
                  }}
                  aria-expanded={isAiModeExpanded}
                  aria-label="Toggle Mate AI settings"
                  className="inline-flex items-center gap-1 h-8 rounded-lg border border-[#CBD5E1] bg-surface px-2.5 text-xs font-medium text-muted hover:text-dark hover:border-[#4F46E5] transition-colors shadow-2xs"
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

                {/* Panel Controls (Content Zoom, Maximize Workspace, Expand/Collapse) */}
                <PanelControls
                  panelTitle="Mate AI"
                  showZoom={isChatExpanded}
                  zoomLevel={chatZoomLevel}
                  onZoomIn={chatPanel.zoomIn}
                  onZoomOut={chatPanel.zoomOut}
                  onResetZoom={chatPanel.resetZoom}
                  canZoomIn={chatPanel.canZoomIn}
                  canZoomOut={chatPanel.canZoomOut}
                  isDefaultZoom={chatPanel.isDefaultZoom}
                  showMaximize={true}
                  isMaximized={isChatMaximized}
                  onToggleMaximize={toggleChatMaximized}
                  showCollapse={true}
                  isCollapsed={!isChatExpanded}
                  onToggleCollapse={toggleChatExpanded}
                />
              </div>
            </div>

            {/* Mode Controls Drawer */}
            <div
              className={cn(
                'transition-all duration-300 ease-in-out overflow-hidden px-4 sm:px-6',
                isAiModeExpanded
                  ? 'max-h-48 opacity-100 pb-3 pt-2 border-t border-[#E2E8F0]'
                  : 'max-h-0 opacity-0 pb-0 pt-0'
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted font-semibold">Select Mode:</span>
                  <div className="inline-flex flex-wrap rounded-lg border border-[#CBD5E1] bg-surface p-0.5 shadow-2xs">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleModeChange('online');
                      }}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors',
                        activeMode === 'online'
                          ? 'bg-[#4F46E5] text-white shadow-2xs'
                          : 'text-muted hover:text-dark hover:bg-[#F8FAFC]'
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
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors',
                        activeMode === 'ollama'
                          ? 'bg-[#4F46E5] text-white shadow-2xs'
                          : 'text-muted hover:text-dark hover:bg-[#F8FAFC]'
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
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors',
                        activeMode === 'offline'
                          ? 'bg-[#4F46E5] text-white shadow-2xs'
                          : 'text-muted hover:text-dark hover:bg-[#F8FAFC]'
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
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors',
                        activeMode === 'auto'
                          ? 'bg-[#4F46E5] text-white shadow-2xs'
                          : 'text-muted hover:text-dark hover:bg-[#F8FAFC]'
                      )}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Auto
                    </button>
                  </div>
                </div>

                <div className="text-[11px] text-muted font-medium">
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
            className="mate-chat-body flex-1 flex flex-col min-h-0 overflow-hidden bg-[#F8FAFC]/50"
          >
            {/* Loading Progress Banner (Strictly for Offline WebGPU mode) */}
            {activeMode === 'offline' && progress && progress.progress < 1.0 && (
              <div className="bg-[#EFF6FF] border-b border-[#BFDBFE] p-4 animate-in fade-in">
                <div className="flex items-center justify-between text-xs font-semibold text-[#1D4ED8] mb-1.5 gap-2">
                  <span className="flex items-center gap-1.5">
                    <Download className="h-3.5 w-3.5 text-[#1D4ED8] animate-bounce" />
                    {progress.text || 'Downloading and initializing local WebGPU model...'}
                  </span>
                  <div className="flex items-center gap-2">
                    <span>{Math.round(progress.progress * 100)}%</span>
                    <button
                      type="button"
                      onClick={handleCancelLocalModelInit}
                      className="px-2.5 py-0.5 rounded-md bg-surface border border-[#BFDBFE] text-[#1D4ED8] hover:bg-[#DBEAFE] text-[11px] font-semibold"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
                <div className="w-full bg-[#DBEAFE] h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-[#4F46E5] h-full transition-all duration-300 rounded-full"
                    style={{ width: `${Math.max(5, progress.progress * 100)}%` }}
                  />
                </div>
                <p className="text-[11px] text-[#1E40AF] mt-1.5">
                  Model weights are cached locally in your browser CacheStorage and won't need to be downloaded again.
                </p>
              </div>
            )}

            {/* Error Banner */}
            {errorMessage && (
              <div className="bg-[#FEF2F2] border-b border-[#FECACA] p-4 text-xs text-[#B91C1C] flex flex-wrap items-start justify-between gap-3 animate-in fade-in">
                <div className="flex gap-2.5 max-w-xl">
                  <AlertTriangle className="h-4 w-4 text-[#B91C1C] shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold mb-0.5 text-[#991B1B]">Mate AI Assistance</p>
                    <p className="text-dark whitespace-pre-line">{errorMessage}</p>
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
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleRetry}
                    className="h-7 text-xs text-[#B91C1C] border-[#FECACA] hover:bg-[#FEE2E2]"
                  >
                    Retry
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setErrorMessage(null)}
                    className="h-7 text-xs text-[#B91C1C] hover:bg-[#FEE2E2]"
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            )}

            {isVoiceModeActive ? (
              <div className="flex-1 min-h-0 p-4 sm:p-6 flex flex-col">
                <VoiceAssistantPanel
                  voiceState={voiceState}
                  interimTranscript={interimTranscript}
                  finalTranscript={finalTranscript}
                  isGenerating={isGenerating}
                  isSpeaking={voiceState === 'speaking'}
                  autoSpeak={voiceSettings.autoSpeak}
                  aiMode={activeMode}
                  zoomLevel={chatZoomLevel}
                  speechLanguage={voiceSettings.speechLanguage}
                  onLanguageChange={(lang) => {
                    const next = saveVoiceSettings({ speechLanguage: lang });
                    setVoiceSettings(next);
                  }}
                  modelName={
                    activeMode === 'ollama'
                      ? (aiStatus?.ollamaModel || DEFAULT_OLLAMA_MODEL)
                      : activeMode === 'offline'
                        ? (aiStatus?.localModelId || DEFAULT_LOCAL_MODEL)
                        : (aiStatus?.cloudModel || 'Gemini 3.5 Flash')
                  }
                  latestAnswerText={
                    [...messages].reverse().find((m) => m.role === 'assistant' && m.content.trim())?.content
                  }
                  activeTopic={activeTopic}
                  errorMessage={voiceError}
                  confirmationMessage={voiceConfirmation}
                  onStartListening={handleStartListening}
                  onStopListening={handleStopListening}
                  onSendQuestion={(text) => handleVoiceSubmit(text)}
                  onStopGenerating={handleStopGenerating}
                  onStopSpeaking={handleStopSpeaking}
                  onRepeatAnswer={() => {
                    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && m.content.trim());
                    if (lastAssistant) {
                      setVoiceConfirmation('Repeating latest response aloud...');
                      setVoiceState('speaking');
                      void speechSynthesisService.speak(lastAssistant.content, {
                        language: voiceSettings.speechLanguage,
                        voiceURI: voiceSettings.selectedVoiceURI,
                        rate: voiceSettings.speechRate,
                        volume: voiceSettings.speechVolume,
                        onEnd: () => {
                          if (isMountedRef.current) setVoiceState('idle');
                        },
                        onError: () => {
                          if (isMountedRef.current) setVoiceState('idle');
                        },
                      });
                    }
                  }}
                  onToggleAutoSpeak={() => {
                    const next = saveVoiceSettings({ autoSpeak: !voiceSettings.autoSpeak });
                    setVoiceSettings(next);
                  }}
                  onReturnToTextChat={() => setIsVoiceModeActive(false)}
                  onClearError={() => setVoiceError(null)}
                />
              </div>
            ) : (
              <>
                {/* Messages Feed */}
                <div
                  ref={feedRef}
                  onScroll={handleFeedScroll}
                  className="flex-1 min-h-0 p-4 sm:p-6 overflow-y-auto space-y-6 transition-[font-size] duration-150 motion-reduce:transition-none"
                  style={{ fontSize: `${chatZoomLevel}%` }}
                >
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn('flex gap-3.5 max-w-3xl', msg.role === 'user' ? 'ml-auto flex-row-reverse' : '')}
                >
                  <div className="shrink-0 mt-1">
                    {msg.role === 'assistant' ? (
                      <div className="h-8 w-8 rounded-full bg-[#4F46E5] flex items-center justify-center text-white shadow-xs">
                        <Sparkles className="h-4 w-4" />
                      </div>
                    ) : (
                      <Avatar fallback={user?.name ? user.name.charAt(0) : 'A'} size="sm" />
                    )}
                  </div>

                  <div className={cn('space-y-3 min-w-0', msg.role === 'user' ? 'text-right' : 'flex-1')}>
                    {msg.role === 'assistant' && (
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted mb-1 flex-wrap">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-dark">
                          Mate AI
                        </span>
                        {msg.elapsedMs ? (
                          <span className="text-[10px] text-muted font-mono bg-[#F8FAFC] px-1.5 py-0.5 rounded border border-[#E2E8F0]">
                            {(msg.elapsedMs / 1000).toFixed(1)}s
                          </span>
                        ) : null}
                      </div>
                    )}

                    {(msg.content || !msg.code || (isGenerating && activeAssistantId === msg.id)) && (
                      <div
                        className={cn(
                          'inline-block max-w-full rounded-2xl px-5 py-3.5 text-sm leading-relaxed shadow-2xs',
                          msg.role === 'user'
                            ? 'bg-[#EEF2FF] text-[#1E1B4B] border border-[#C7D2FE] font-medium whitespace-pre-wrap'
                            : 'bg-surface text-dark border border-[#E2E8F0] text-left'
                        )}
                      >
                        {msg.content ? (
                          msg.role === 'assistant' ? (
                            <div className="space-y-2">
                              {msg.actionPlan ? (
                                <ActionExecutionCard
                                  plan={msg.actionPlan}
                                  onPlanUpdate={(updatedPlan) => {
                                    setMessages((prev) =>
                                      prev.map((m) =>
                                        m.id === msg.id ? { ...m, actionPlan: updatedPlan } : m
                                      )
                                    );
                                  }}
                                />
                              ) : (
                                <MarkdownMessage
                                  content={msg.content}
                                  streaming={isGenerating && activeAssistantId === msg.id}
                                />
                              )}
                              {isGenerating && activeAssistantId === msg.id && (
                                <span
                                  aria-hidden="true"
                                  className="inline-block w-2 h-4 mt-1 bg-[#4F46E5] animate-pulse align-middle rounded-xs"
                                />
                              )}
                              {msg.status === 'cancelled' && !(isGenerating && activeAssistantId === msg.id) && (
                                <div className="pt-2 border-t border-[#E2E8F0] flex items-center gap-2">
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
                          <div className="flex flex-col gap-1.5 py-1 px-2 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE]" role="status" aria-live="polite">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="w-2 h-2 rounded-full bg-[#1D4ED8] animate-ping" />
                              <span className="font-semibold text-[#1D4ED8]">
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
                              <span className="text-[11px] font-mono text-[#1D4ED8] bg-surface px-1.5 py-0.5 rounded border border-[#BFDBFE]">
                                {elapsedSeconds.toFixed(1)}s
                              </span>
                            </div>
                            {currentPhase === 'switching' && (
                              <p className="text-[11px] text-[#1D4ED8] italic">
                                Cancelled previous request. Re-routing through {activeMode.toUpperCase()} mode...
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-2.5 p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] max-w-xl" data-testid="failed-message-recovery">
                            <div className="flex items-start gap-2 text-[#B91C1C] text-xs">
                              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                              <div>
                                <p className="font-bold">Response did not complete</p>
                                <p className="text-dark mt-0.5 whitespace-pre-line">
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
                      <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl p-4 text-sm text-dark text-left w-full max-w-2xl shadow-2xs">
                        <MarkdownMessage content={msg.explanation} />
                      </div>
                    )}

                    {msg.visualLoading && (
                      <div
                        className="w-full max-w-2xl mt-3 rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 shadow-xs text-left"
                        role="status"
                        aria-live="polite"
                        data-testid="visual-loading-card"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-xs">
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-indigo-950 flex items-center gap-2">
                              <span>Preparing Visual Representation</span>
                              <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 animate-ping" />
                            </div>
                            <p className="text-xs text-indigo-700 mt-0.5 font-medium">
                              Generating visual diagram for {msg.visualLoadingSubject || 'the requested subject'}...
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {msg.visualError && (
                      <div
                        className="w-full max-w-2xl mt-3 rounded-2xl border border-red-200 bg-red-50/70 p-4 shadow-xs text-left"
                        role="alert"
                        data-testid="visual-error-card"
                      >
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div className="h-8 w-8 rounded-lg bg-red-100 border border-red-200 flex items-center justify-center text-red-600 shrink-0">
                              <AlertTriangle className="h-4 w-4" />
                            </div>
                            <div>
                              <div className="text-xs font-bold text-red-950">Visual Generation Failed</div>
                              <p className="text-xs text-red-800 mt-0.5 leading-relaxed">{msg.visualError}</p>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleShowVisually(msg.id, true)}
                            className="h-8 text-xs font-semibold bg-white text-red-900 border-red-200 hover:bg-red-50 shadow-xs cursor-pointer shrink-0"
                          >
                            <RefreshCw className="h-3 w-3 mr-1.5" /> Retry Visual
                          </Button>
                        </div>
                      </div>
                    )}

                    {msg.visual && (
                      <VisualRenderer
                        visual={msg.visual}
                        onRetry={() => handleShowVisually(msg.id, true)}
                      />
                    )}

                    {msg.role === 'assistant' &&
                      msg.status === 'completed' &&
                      !msg.visual &&
                      !msg.visualLoading &&
                      !msg.visualError && (
                        <div className="pt-1 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleShowVisually(msg.id)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-indigo-700 bg-indigo-50/80 hover:bg-indigo-100 border border-indigo-200/80 transition-colors cursor-pointer shadow-2xs"
                            title="Generate a context-aware visual diagram for this explanation"
                          >
                            <Eye className="h-3.5 w-3.5 text-indigo-600" />
                            <span>Show visually</span>
                          </button>
                        </div>
                      )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input & Action Chips */}
            <div className="p-4 bg-[#F8FAFC] border-t border-[#E2E8F0]">
              <div className="flex flex-wrap gap-2 mb-3.5">
                {CHIPS.map((chip, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleChipClick(chip)}
                    disabled={isGenerating}
                    className="px-3 py-1.5 bg-surface border border-[#CBD5E1] rounded-full text-xs font-medium hover:border-[#4F46E5] hover:text-[#4F46E5] hover:bg-[#EEF2FF]/60 transition-colors text-muted shadow-2xs disabled:opacity-50"
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
                  className="w-full resize-none rounded-xl border border-[#CBD5E1] bg-surface pl-4 pr-24 py-3 text-sm text-dark placeholder:text-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#4F46E5] focus:border-[#4F46E5] min-h-[56px] max-h-[120px] shadow-2xs transition-colors"
                  rows={1}
                />

                <div className="absolute right-2 bottom-2 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsVoiceModeActive(true);
                      void handleStartListening();
                    }}
                    aria-label="Start Voice Assistant"
                    title="Speak with Mate Voice Assistant"
                    className="p-2 text-muted hover:text-primary hover:bg-indigo-50 rounded-lg transition-colors border border-transparent hover:border-indigo-200"
                  >
                    <Mic className="h-4 w-4" />
                  </button>
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
                      aria-label="Send message"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
          </div>
        </section>

        {/* Right side: Your Learning Context */}
        <div
          className={cn(
            'w-full lg:w-[350px] flex-shrink-0 flex flex-col gap-4 h-auto lg:h-full lg:overflow-y-auto pr-0.5',
            isChatMaximized && 'hidden'
          )}
        >
          {/* Learning Context Card */}
          <Card
            className="shrink-0 border-[#E2E8F0] bg-surface shadow-soft overflow-hidden"
            data-testid="learning-context-card"
          >
            <div
              onClick={contextPanel.toggleExpanded}
              className="p-4 flex items-center justify-between cursor-pointer select-none hover:bg-[#F8FAFC] transition-colors"
              role="button"
              tabIndex={0}
              aria-expanded={contextPanel.isExpanded}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  contextPanel.toggleExpanded();
                }
              }}
            >
              <h3 className="font-semibold text-sm text-dark flex items-center gap-2">
                <Brain className="h-4 w-4 text-[#4F46E5]" />
                <span>Your Learning Context</span>
              </h3>
              <div className="flex items-center gap-2">
                {isDemo ? (
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1 shrink-0">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-600 animate-pulse" />
                    DEMO DATA
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-[#EEF2FF] text-[#4338CA] border border-[#C7D2FE]">
                    {activeTopicMetric && activeTopicMetric.totalAttempts > 0
                      ? `${activeMastery}% Mastery`
                      : 'Unassessed'}
                  </span>
                )}
                <PanelControls
                  panelTitle="Your Learning Context"
                  showCollapse={true}
                  isCollapsed={!contextPanel.isExpanded}
                  onToggleCollapse={contextPanel.toggleExpanded}
                  size="sm"
                />
              </div>
            </div>

            <div
              className={cn(
                'transition-all duration-300 ease-in-out overflow-hidden',
                contextPanel.isExpanded
                  ? 'max-h-[900px] opacity-100 border-t border-[#E2E8F0] p-5 pt-4'
                  : 'max-h-0 opacity-0 p-0 border-t-0'
              )}
            >
              <div className="space-y-4">
                {isDemo ? (
                  <div
                    className="rounded-xl p-3 bg-amber-50/90 border border-amber-200 text-left text-xs space-y-1 shadow-2xs"
                    data-testid="context-demo-notice"
                  >
                    <div className="flex items-center gap-1.5 font-bold text-amber-900">
                      <Sparkles className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                      <span>Simulated Demo Data Active</span>
                    </div>
                    <p className="text-[11px] text-amber-800 leading-relaxed font-medium">
                      Metrics shown here originate from a 14-day simulated demonstration history for profile <strong>{user?.name || 'meet8kotecha'}</strong>. These simulated results are <strong>not verified evidence</strong> of actual learning.
                    </p>
                  </div>
                ) : (
                  <div
                    className="rounded-xl p-2.5 bg-slate-50 border border-slate-200 text-left text-xs flex items-center justify-between"
                    data-testid="context-real-notice"
                  >
                    <span className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          activeTopicMetric && activeTopicMetric.totalAttempts > 0
                            ? 'bg-emerald-500'
                            : 'bg-slate-400'
                        }`}
                      />
                      {activeTopicMetric && activeTopicMetric.totalAttempts > 0
                        ? `Genuine Learner Data (${activeTopicMetric.totalAttempts} verified attempts)`
                        : 'Genuine Learner Data (0 verified attempts — Unassessed)'}
                    </span>
                  </div>
                )}

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
                    className="w-full rounded-lg border border-[#CBD5E1] bg-surface text-dark p-2 text-xs font-medium focus:ring-2 focus:ring-[#4F46E5] focus:border-[#4F46E5] outline-none"
                  >
                    {TOPICS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5 text-xs font-medium">
                    <span className="text-muted uppercase tracking-wider font-semibold">
                      {isDemo ? 'Simulated Mastery' : 'Verified Mastery'} ({activeConfidence} confidence)
                    </span>
                    <span className="text-[#4F46E5] font-bold">
                      {activeTopicMetric && activeTopicMetric.totalAttempts > 0
                        ? `${activeMastery}% (${activeTopicMetric.correctAnswers}/${activeTopicMetric.totalAttempts}${isDemo ? ' demo' : ''})`
                        : '0 attempts'}
                    </span>
                  </div>
                  <ProgressBar value={activeMastery} className="h-1.5" />
                </div>

                <div className="rounded-xl p-3.5 bg-[#EFF6FF] border border-[#BFDBFE] space-y-1.5">
                  <p className="font-bold text-xs flex items-center gap-1.5 text-[#1D4ED8]">
                    <GitPullRequest className="h-3.5 w-3.5" />
                    Strategy: {STRATEGY_LABELS[activeStrategy]}
                  </p>
                  <p className="text-[11px] text-dark leading-relaxed">
                    {activeStrategyReason}
                  </p>
                  {matchingMaterial && (
                    <p className="text-[11px] text-[#047857] font-semibold pt-1">
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

      <VoicePrivacyNoticeModal
        isOpen={isPrivacyModalOpen}
        onConfirm={() => {
          const updated = setVoicePrivacyAcknowledged(true);
          setVoiceSettings(updated);
          setIsPrivacyModalOpen(false);
          void handleStartListening();
        }}
        onCancel={() => {
          setIsPrivacyModalOpen(false);
        }}
      />
    </AppShell>
  );
}
