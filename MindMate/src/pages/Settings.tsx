import React, { useEffect, useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useAppContext } from '../context/AppContext';
import {
  Palette,
  ShieldCheck,
  ShieldAlert,
  Check,
  Sun,
  Moon,
  Sparkles,
  Trash2,
  BrainCircuit,
  Cloud,
  LockKeyhole,
  SlidersHorizontal,
  MessageSquare,
  Database,
  HardDrive,
  Server,
  Globe,
  Cpu,
  RefreshCw,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SUPPORTED_LANGUAGES } from '../data/learningContent';
import { syncManager, SyncStatusState } from '../services/storage/syncManager';
import { aiTutorService, AIMode, DEFAULT_OLLAMA_MODEL } from '../services/ai';
import { localWebLLMAdapter } from '../services/ai/localWebLLMAdapter';

type ThemeName = 'light' | 'dark' | 'aurora';

function applyTheme(theme: ThemeName) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('mindmate_theme', theme);
}

const DEFAULT_SETTINGS = {
  adaptiveDifficulty: true,
  personalizedRecs: true,
  proactiveAI: true,
  learningInsights: true,
  cloudAI: false,
  collectLearningData: true,
  saveChatHistory: true,
  profilePublic: false,
  progressPublic: false,
  allowFriendRequests: true,
  showOnlineStatus: true,
};

export default function Settings() {
  const { logout, showToast, language, setLanguage } = useAppContext();
  const navigate = useNavigate();

  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [theme, setTheme] = useState<ThemeName>(() => {
    const saved = localStorage.getItem('mindmate_theme');
    return saved === 'dark' || saved === 'aurora' ? saved : 'light';
  });

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [showClearLearningConfirm, setShowClearLearningConfirm] = useState(false);
  const [showClearChatConfirm, setShowClearChatConfirm] = useState(false);

  const [syncState, setSyncState] = useState<SyncStatusState | null>(null);
  const [currentAiMode, setCurrentAiMode] = useState<AIMode>(() => aiTutorService.getMode());
  const [isSyncingNow, setIsSyncingNow] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('mindmate_settings');
    if (saved) {
      try {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
      } catch {}
    }
    applyTheme(theme);
    const unsub = syncManager.subscribe((st) => setSyncState(st));
    return () => unsub();
  }, []);

  const handleAiModeChange = (mode: AIMode) => {
    setCurrentAiMode(mode);
    aiTutorService.setMode(mode);
    showToast(`AI engine set to ${mode.toUpperCase()} mode.`, 'success');
  };

  const handleManualSync = async () => {
    setIsSyncingNow(true);
    try {
      const res = await syncManager.syncNow();
      if (res.error) {
        showToast(`Sync notice: ${res.error}`, 'info');
      } else {
        showToast(`Successfully synchronized ${res.syncedCount} offline record(s)!`, 'success');
      }
    } catch (e: any) {
      showToast(`Sync failed: ${e.message}`, 'error');
    } finally {
      setIsSyncingNow(false);
    }
  };


  const toggle = (key: keyof typeof DEFAULT_SETTINGS) => {
    let next = { ...settings, [key]: !settings[key] };
    if (key === 'collectLearningData' && settings.collectLearningData) {
      next = {
        ...next,
        personalizedRecs: false,
        proactiveAI: false,
        learningInsights: false,
      };
    }
    setSettings(next);
    localStorage.setItem('mindmate_settings', JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('mindmate-settings-updated', { detail: next }));
    showToast('Preference saved on this browser.', 'success');
  };

  const chooseTheme = (next: ThemeName) => {
    setTheme(next);
    applyTheme(next);
    showToast(
      `${next === 'aurora' ? 'Aurora Nexus' : next === 'dark' ? 'Dark' : 'Light'} theme activated.`,
      'success'
    );
  };

  const clearMatchingData = (pattern: RegExp, message: string) => {
    const keys = Object.keys(localStorage).filter((key) => pattern.test(key.toLowerCase()));
    keys.forEach((key) => localStorage.removeItem(key));
    showToast(keys.length ? message : 'No matching saved data was found in this browser.', 'success');
  };

  const clearChatHistory = () => {
    clearMatchingData(/chat|conversation|message_history|chat_messages/, 'Chat history cleared from this browser.');
    setShowClearChatConfirm(false);
  };

  const clearLearningData = () => {
    clearMatchingData(
      /^(mindmate_)?(progress|practice|mood|learning_history|learning_data|insight_history|quiz_history|study_sessions|planner_history|streak_history|attempts|quiz_sessions)/,
      'Learning history cleared from this browser.'
    );
    window.dispatchEvent(new CustomEvent('mindmate-analytics-updated'));
    setShowClearLearningConfirm(false);
  };

  const deleteAccount = async () => {
    if (deleteText !== 'DELETE') {
      showToast('Type DELETE to confirm.', 'error');
      return;
    }
    Object.keys(localStorage)
      .filter((key) => key.toLowerCase().startsWith('mindmate_'))
      .forEach((key) => localStorage.removeItem(key));
    try {
      await logout();
    } catch {}
    showToast('Account data cleared. Please sign in again.', 'success');
    navigate('/login', { replace: true });
  };

  const Toggle = ({
    checked,
    onChange,
    label,
    desc,
  }: {
    checked: boolean;
    onChange: () => void;
    label: string;
    desc: string;
  }) => (
    <div className="flex items-center justify-between gap-5 py-4">
      <div className="flex-1">
        <p className="font-medium text-dark">{label}</p>
        <p className="mt-0.5 text-sm leading-5 text-muted">{desc}</p>
        <p className={`mt-1 text-xs font-semibold ${checked ? 'text-emerald-500' : 'text-muted'}`}>
          {checked ? 'ON · Enabled' : 'OFF · Disabled'}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onChange}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
          checked ? 'bg-primary' : 'bg-gray-200'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );

  return (
    <AppShell pageTitle="Settings & Preferences" pageSubtitle="Your space. Your rules. Your focus.">
      <div className="mx-auto max-w-4xl space-y-6 pb-8">
        {/* Intro Card */}
        <div className="settings-intro relative overflow-hidden rounded-2xl border border-border p-6 shadow-sm">
          <div className="relative z-10 max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <SlidersHorizontal className="h-3.5 w-3.5" /> CONTROL CENTER
            </div>
            <h2 className="text-2xl font-bold text-dark sm:text-3xl">Make MindMate work for you.</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Manage your visual themes, learning intelligence preferences, privacy and session data.
            </p>
          </div>
          <div className="settings-intro-orb" />
        </div>

        {/* Appearance & Themes */}
        <Card className="overflow-hidden p-0 border border-border shadow-sm">
          <div className="border-b border-border p-6 bg-gray-50/50">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                <Palette className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-dark">Appearance & Themes</h3>
                <p className="text-sm text-muted">Choose your study atmosphere. Instant switch without reloading.</p>
              </div>
            </div>
          </div>
          <div className="grid gap-4 p-6 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => chooseTheme('light')}
              aria-pressed={theme === 'light'}
              className={`theme-option rounded-2xl border p-4 text-left transition ${
                theme === 'light'
                  ? 'selected-light border-primary ring-2 ring-primary/20 shadow-md'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <div className="theme-preview preview-light mb-3 h-24 overflow-hidden rounded-xl p-2.5">
                <div className="mb-2 h-3 w-1/2 rounded bg-indigo-200" />
                <div className="grid grid-cols-2 gap-2">
                  <div className="h-11 rounded-lg bg-white shadow-sm" />
                  <div className="h-11 rounded-lg bg-indigo-100" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-dark">
                  <Sun className="mr-1 inline h-4 w-4" /> Light
                </span>
                {theme === 'light' && <Check className="h-4 w-4 text-primary" />}
              </div>
              <p className="mt-1 text-xs text-muted">Bright, clean, distraction-free</p>
            </button>

            <button
              type="button"
              onClick={() => chooseTheme('dark')}
              aria-pressed={theme === 'dark'}
              className={`theme-option rounded-2xl border p-4 text-left transition ${
                theme === 'dark'
                  ? 'selected-dark border-primary ring-2 ring-primary/20 shadow-md'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <div className="theme-preview preview-dark mb-3 h-24 overflow-hidden rounded-xl p-2.5">
                <div className="mb-2 h-3 w-1/2 rounded bg-slate-600" />
                <div className="grid grid-cols-2 gap-2">
                  <div className="h-11 rounded-lg bg-slate-800" />
                  <div className="h-11 rounded-lg bg-indigo-900" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-dark">
                  <Moon className="mr-1 inline h-4 w-4" /> Dark
                </span>
                {theme === 'dark' && <Check className="h-4 w-4 text-primary" />}
              </div>
              <p className="mt-1 text-xs text-muted">Calm, low-glare focus mode</p>
            </button>

            <button
              type="button"
              onClick={() => chooseTheme('aurora')}
              aria-pressed={theme === 'aurora'}
              className={`theme-option aurora-option rounded-2xl border p-4 text-left transition ${
                theme === 'aurora'
                  ? 'selected-aurora ring-2 ring-fuchsia-300/70 shadow-lg'
                  : 'border-violet-400/40 hover:border-fuchsia-300'
              }`}
            >
              <div className="aurora-preview mb-3 h-24 overflow-hidden rounded-xl p-2.5">
                <div className="aurora-stars">✦ · ✧ · ✦</div>
                <div className="aurora-wave aurora-wave-one" />
                <div className="aurora-wave aurora-wave-two" />
                <div className="relative z-10 mb-2 h-3 w-1/2 rounded bg-white/40" />
                <div className="relative z-10 grid grid-cols-2 gap-2">
                  <div className="h-11 rounded-lg border border-white/25 bg-white/15 backdrop-blur" />
                  <div className="h-11 rounded-lg border border-cyan-200/30 bg-cyan-300/20 backdrop-blur" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-dark">
                  <Sparkles className="mr-1 inline h-4 w-4 text-fuchsia-500" /> Aurora Nexus
                </span>
                {theme === 'aurora' && <Check className="h-4 w-4 text-fuchsia-500" />}
              </div>
              <p className="mt-1 text-xs text-muted">Living aurora • cosmic glow</p>
              <span className="mt-2 inline-flex rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400 px-2 py-0.5 text-[9px] font-bold text-white">
                SIGNATURE
              </span>
            </button>
          </div>
        </Card>

        {/* Multilingual Learning Language */}
        <Card className="overflow-hidden p-0 border border-border shadow-sm">
          <div className="border-b border-border p-6 bg-gray-50/50 dark:bg-slate-800/40">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                <Globe className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-dark">Learning Language</h3>
                <p className="text-sm text-muted">Study practice materials, flashcards, and quizzes in your preferred language.</p>
              </div>
            </div>
          </div>
          <div className="grid gap-3 p-6 sm:grid-cols-5">
            {SUPPORTED_LANGUAGES.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => {
                  setLanguage(l.code);
                  showToast(`Language set to ${l.label} (${l.flag})`, 'success');
                }}
                className={`flex flex-col items-center justify-center p-4 rounded-xl border text-center transition-all ${
                  language === l.code
                    ? 'border-primary bg-primary/5 text-primary ring-2 ring-primary/20 shadow-sm font-semibold'
                    : 'border-border bg-surface hover:border-primary/40 text-dark'
                }`}
              >
                <span className="text-3xl mb-1.5">{l.flag}</span>
                <span className="text-sm font-medium">{l.label}</span>
                <span className="text-[11px] text-muted uppercase mt-0.5 tracking-wider">{l.code}</span>
              </button>
            ))}
          </div>
        </Card>
        <Card className="overflow-hidden p-0 border border-border shadow-sm">
          <div className="border-b border-border p-6 bg-gray-50/50">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-500">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-dark">Privacy & Social Access</h3>
                <p className="text-sm text-muted">Control your visibility in study battles and peer challenges.</p>
              </div>
            </div>
          </div>
          <div className="divide-y divide-border/60 px-6">
            <Toggle
              label="Public Profile"
              desc="Allow your learner profile to be discoverable by friends."
              checked={settings.profilePublic}
              onChange={() => toggle('profilePublic')}
            />
            <Toggle
              label="Share Learning Progress"
              desc="Allow study partners to see your learning streaks and topic masteries."
              checked={settings.progressPublic}
              onChange={() => toggle('progressPublic')}
            />
            <Toggle
              label="Allow Friend Requests"
              desc="Permit other students to send you challenge duels."
              checked={settings.allowFriendRequests}
              onChange={() => toggle('allowFriendRequests')}
            />
            <Toggle
              label="Show Online Status"
              desc="Display whether you are currently active in the study space."
              checked={settings.showOnlineStatus}
              onChange={() => toggle('showOnlineStatus')}
            />
          </div>
        </Card>

        {/* Learning & AI Preferences */}
        <Card className="overflow-hidden p-0 border border-border shadow-sm">
          <div className="border-b border-border p-6 bg-gray-50/50">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                <BrainCircuit className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-dark">Learning & AI Tutor Preferences</h3>
                <p className="text-sm text-muted">Control how MindMate's adaptive model personalizes your study path.</p>
              </div>
            </div>
          </div>
          <div className="divide-y divide-border/60 px-6">
            <Toggle
              label="Adaptive Difficulty"
              desc="Automatically scale practice difficulty based on your quiz accuracy."
              checked={settings.adaptiveDifficulty}
              onChange={() => toggle('adaptiveDifficulty')}
            />
            <Toggle
              label="Personalized Recommendations"
              desc="Suggest topics and materials based on your knowledge graph."
              checked={settings.personalizedRecs}
              onChange={() => toggle('personalizedRecs')}
            />
            <Toggle
              label="Proactive AI Study Planning"
              desc="Allow MindMate to suggest schedule adjustments when struggling."
              checked={settings.proactiveAI}
              onChange={() => toggle('proactiveAI')}
            />
            <Toggle
              label="Learning Insights"
              desc="Generate behavioral insights and study session analytics."
              checked={settings.learningInsights}
              onChange={() => toggle('learningInsights')}
            />
            <Toggle
              label="Cloud AI Models (Gemini 3.5 Flash)"
              desc="Use Gemini Flash serverless AI for deeper reasoning, quizzes, and code explanations."
              checked={settings.cloudAI}
              onChange={() => toggle('cloudAI')}
            />
          </div>
        </Card>

        {/* AI Runtime & Offline Synchronization */}
        <Card className="overflow-hidden p-0 border border-border shadow-sm">
          <div className="border-b border-border p-6 bg-gray-50/50 dark:bg-slate-900/40">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-purple-500/10 p-2.5 text-purple-500">
                <Cpu className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-dark">AI Runtime & Offline Sync Engine</h3>
                <p className="text-sm text-muted">Configure online/offline AI inference, WebGPU acceleration, and sync status.</p>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-6">
            <div>
              <p className="text-sm font-semibold text-dark mb-2">Default AI Provider Route</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <button
                  type="button"
                  onClick={() => handleAiModeChange('ollama')}
                  className={`flex flex-col items-start p-4 rounded-xl border text-left transition-all ${
                    currentAiMode === 'ollama'
                      ? 'border-violet-600 bg-violet-50/50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 ring-2 ring-violet-500/20'
                      : 'border-border bg-surface text-muted hover:border-primary/40'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Server className="h-4 w-4" />
                    <span className="font-semibold text-sm">Ollama (Gemma 4)</span>
                  </div>
                  <p className="text-xs opacity-80">Runs local Gemma 4 (`{DEFAULT_OLLAMA_MODEL}`) via Ollama at 127.0.0.1:11434 with zero cloud calls.</p>
                </button>

                <button
                  type="button"
                  onClick={() => handleAiModeChange('online')}
                  className={`flex flex-col items-start p-4 rounded-xl border text-left transition-all ${
                    currentAiMode === 'online'
                      ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-500/20'
                      : 'border-border bg-surface text-muted hover:border-primary/40'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Cloud className="h-4 w-4" />
                    <span className="font-semibold text-sm">Online (Cloud)</span>
                  </div>
                  <p className="text-xs opacity-80">Streams directly from Google Gemini 3.5 Flash for high depth and speed.</p>
                </button>

                <button
                  type="button"
                  onClick={() => handleAiModeChange('offline')}
                  className={`flex flex-col items-start p-4 rounded-xl border text-left transition-all ${
                    currentAiMode === 'offline'
                      ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/20'
                      : 'border-border bg-surface text-muted hover:border-primary/40'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <HardDrive className="h-4 w-4" />
                    <span className="font-semibold text-sm">Offline (Local WebGPU)</span>
                  </div>
                  <p className="text-xs opacity-80">Runs 100% locally on your device with zero network calls and full privacy.</p>
                </button>

                <button
                  type="button"
                  onClick={() => handleAiModeChange('auto')}
                  className={`flex flex-col items-start p-4 rounded-xl border text-left transition-all ${
                    currentAiMode === 'auto'
                      ? 'border-primary bg-primary/5 text-primary ring-2 ring-primary/20'
                      : 'border-border bg-surface text-muted hover:border-primary/40'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <RefreshCw className="h-4 w-4" />
                    <span className="font-semibold text-sm">Auto Hybrid</span>
                  </div>
                  <p className="text-xs opacity-80">Prefers Cloud, automatically falling back to Local AI (Ollama/WebGPU) if offline.</p>
                </button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-border/60">
              <div className="rounded-xl border border-border p-4 bg-background">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs uppercase font-semibold text-muted">Hardware Engine</span>
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                      localWebLLMAdapter.isWebGPUSupported()
                        ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                        : 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300'
                    }`}
                  >
                    {localWebLLMAdapter.isWebGPUSupported() ? 'WebGPU Supported' : 'WebGPU Unavailable'}
                  </span>
                </div>
                <p className="text-xs text-muted leading-relaxed">
                  Local AI requires Chrome 113+, Edge 113+, or Safari 18+ with WebGPU enabled. Universal model: Qwen 2.5 (0.5B) / SmolLM2 (360M).
                </p>
              </div>

              <div className="rounded-xl border border-border p-4 bg-background">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs uppercase font-semibold text-muted">Offline Sync Queue</span>
                  <span className="text-xs font-semibold text-primary">
                    {syncState?.pendingCount || 0} Pending Event(s)
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-2">
                  <p className="text-xs text-muted">
                    {syncState?.lastSyncTime
                      ? `Last synced: ${new Date(syncState.lastSyncTime).toLocaleTimeString()}`
                      : 'Sync ready'}
                  </p>
                  <Button
                    size="sm"
                    onClick={handleManualSync}
                    disabled={isSyncingNow}
                    className="gap-1.5 text-xs h-8"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isSyncingNow ? 'animate-spin' : ''}`} />
                    {isSyncingNow ? 'Syncing...' : 'Sync Now'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Local Data Management */}
        <Card className="overflow-hidden p-0 border border-border shadow-sm">
          <div className="border-b border-border p-6 bg-gray-50/50">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-cyan-500/10 p-2.5 text-cyan-500">
                <LockKeyhole className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-dark">Data & History Controls</h3>
                <p className="text-sm text-muted">Manage conversation history and locally cached records.</p>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-border p-4 bg-background">
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  <p className="font-semibold text-dark text-sm">Chat History</p>
                </div>
                <p className="text-xs text-muted mb-3">Clear local conversation memory from this browser.</p>
                {!showClearChatConfirm ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowClearChatConfirm(true)}
                    className="gap-1.5"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Clear Chat History
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-danger font-medium">Clear all local chat history?</p>
                    <div className="flex gap-2">
                      <Button variant="danger" size="sm" onClick={clearChatHistory}>
                        Confirm Clear
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setShowClearChatConfirm(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-border p-4 bg-background">
                <div className="flex items-center gap-2 mb-1">
                  <Database className="h-4 w-4 text-primary" />
                  <p className="font-semibold text-dark text-sm">Learning Data</p>
                </div>
                <p className="text-xs text-muted mb-3">Clear locally cached practice and quiz records.</p>
                {!showClearLearningConfirm ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowClearLearningConfirm(true)}
                    className="gap-1.5"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete Learning Cache
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-danger font-medium">Delete local learning records?</p>
                    <div className="flex gap-2">
                      <Button variant="danger" size="sm" onClick={clearLearningData}>
                        Confirm Delete
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setShowClearLearningConfirm(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Danger Zone */}
        <Card className="overflow-hidden border-red-300/50 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="rounded-xl bg-red-500/10 p-2.5 text-red-500">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-dark">Danger Zone</h3>
              <p className="text-sm text-muted">Reset browser session and local data.</p>
            </div>
          </div>
          <p className="text-xs leading-5 text-muted mt-2 max-w-xl">
            This clears locally stored cache and signs you out of your current session.
          </p>
          {!showDeleteConfirm ? (
            <Button
              variant="danger"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              className="mt-4 gap-1.5"
            >
              <Trash2 className="h-4 w-4" /> Reset Local Account Data
            </Button>
          ) : (
            <div className="mt-4 space-y-3 rounded-xl border border-red-300/60 bg-red-50/50 p-4">
              <p className="text-xs font-medium text-dark">
                Type <strong className="text-red-600">DELETE</strong> to confirm session reset.
              </p>
              <input
                value={deleteText}
                onChange={(e) => setDeleteText(e.target.value)}
                placeholder="Type DELETE"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
              />
              <div className="flex gap-2">
                <Button variant="danger" size="sm" onClick={deleteAccount}>
                  Confirm Reset
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteText('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
