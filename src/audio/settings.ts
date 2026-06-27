const AUDIO_STORAGE_KEY = 'escape:audio-settings';

export interface AudioSettings {
  muted: boolean;
}

export function createDefaultAudioSettings(): AudioSettings {
  return { muted: false };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function normalizeAudioSettings(value: unknown): AudioSettings {
  if (isRecord(value) && typeof value.muted === 'boolean') {
    return { muted: value.muted };
  }
  return createDefaultAudioSettings();
}

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadAudioSettings(storage: Storage | null = browserStorage()): AudioSettings {
  if (!storage) return createDefaultAudioSettings();
  try {
    const raw = storage.getItem(AUDIO_STORAGE_KEY);
    return raw ? normalizeAudioSettings(JSON.parse(raw)) : createDefaultAudioSettings();
  } catch {
    return createDefaultAudioSettings();
  }
}

export function saveAudioSettings(
  settings: AudioSettings,
  storage: Storage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(normalizeAudioSettings(settings)));
  } catch {
    // In-memory state remains usable when browser storage is unavailable.
  }
}
