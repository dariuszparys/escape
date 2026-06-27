import { describe, expect, test } from 'vitest';
import {
  createDefaultAudioSettings,
  loadAudioSettings,
  normalizeAudioSettings,
  saveAudioSettings,
} from './settings';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  length = 0;

  clear(): void {
    this.values.clear();
    this.length = 0;
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
    this.length = this.values.size;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
    this.length = this.values.size;
  }
}

describe('audio settings', () => {
  test('default settings are unmuted', () => {
    expect(createDefaultAudioSettings()).toEqual({ muted: false });
  });

  test('loadAudioSettings returns defaults when storage is null', () => {
    expect(loadAudioSettings(null)).toEqual({ muted: false });
  });

  test('normalizeAudioSettings accepts a valid muted flag', () => {
    expect(normalizeAudioSettings({ muted: true })).toEqual({ muted: true });
    expect(normalizeAudioSettings({ muted: false })).toEqual({ muted: false });
  });

  test('normalizeAudioSettings rejects garbage and coerces non-boolean muted', () => {
    expect(normalizeAudioSettings(null)).toEqual({ muted: false });
    expect(normalizeAudioSettings('nope')).toEqual({ muted: false });
    expect(normalizeAudioSettings({})).toEqual({ muted: false });
    expect(normalizeAudioSettings({ muted: 'yes' })).toEqual({ muted: false });
    expect(normalizeAudioSettings({ muted: 1 })).toEqual({ muted: false });
  });

  test('save then load round-trips through an in-memory storage', () => {
    const storage = new MemoryStorage();
    saveAudioSettings({ muted: true }, storage);
    expect(loadAudioSettings(storage)).toEqual({ muted: true });

    saveAudioSettings({ muted: false }, storage);
    expect(loadAudioSettings(storage)).toEqual({ muted: false });
  });

  test('loadAudioSettings returns defaults when storage throws or is empty', () => {
    const storage = new MemoryStorage();
    expect(loadAudioSettings(storage)).toEqual({ muted: false });
  });
});
