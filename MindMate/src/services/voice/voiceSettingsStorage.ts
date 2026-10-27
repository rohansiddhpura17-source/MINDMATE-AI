import { DEFAULT_VOICE_SETTINGS, VoiceSettings } from './types';

const VOICE_SETTINGS_STORAGE_KEY = 'mindmate_voice_settings';
export const VOICE_SETTINGS_EVENT = 'mindmate-voice-settings-updated';

export function loadVoiceSettings(): VoiceSettings {
  if (typeof localStorage === 'undefined') {
    return { ...DEFAULT_VOICE_SETTINGS };
  }
  try {
    const raw = localStorage.getItem(VOICE_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_VOICE_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_VOICE_SETTINGS,
      ...parsed,
      speechRate: typeof parsed.speechRate === 'number' ? Math.max(0.5, Math.min(2.0, parsed.speechRate)) : 1.0,
      speechVolume: typeof parsed.speechVolume === 'number' ? Math.max(0.1, Math.min(1.0, parsed.speechVolume)) : 1.0,
    };
  } catch {
    return { ...DEFAULT_VOICE_SETTINGS };
  }
}

export function saveVoiceSettings(updates: Partial<VoiceSettings>): VoiceSettings {
  const current = loadVoiceSettings();
  const next: VoiceSettings = { ...current, ...updates };
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(VOICE_SETTINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {}
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(VOICE_SETTINGS_EVENT, { detail: next }));
    }
  }
  return next;
}

export function isVoicePrivacyAcknowledged(): boolean {
  return loadVoiceSettings().privacyAcknowledged;
}

export function setVoicePrivacyAcknowledged(acknowledged: boolean = true): VoiceSettings {
  return saveVoiceSettings({ privacyAcknowledged: acknowledged });
}
