import { describe, expect, test } from 'vitest';
import {
  createDefaultMetaState,
  loadMetaState,
  normalizeMetaState,
  saveMetaState,
} from './meta';

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

describe('meta state', () => {
  test('normalizes invalid saved data to defaults', () => {
    expect(normalizeMetaState({ embers: -10, pendingPrep: null })).toEqual(createDefaultMetaState());
  });

  test('loads saved embers and pending prep', () => {
    const storage = new MemoryStorage();
    saveMetaState({
      embers: 12,
      pendingPrep: {
        itemIds: ['small_potion'],
        extraStartingChoice: true,
        scoutFlame: false,
      },
      lastAwardedRunId: 'run-1',
    }, storage);

    expect(loadMetaState(storage)).toEqual({
      embers: 12,
      pendingPrep: {
        itemIds: ['small_potion'],
        extraStartingChoice: true,
        scoutFlame: false,
      },
      lastAwardedRunId: 'run-1',
    });
  });

  test('falls back to defaults when storage contains malformed JSON', () => {
    const storage = new MemoryStorage();
    storage.setItem('escape.meta.v1', '{bad json');

    expect(loadMetaState(storage)).toEqual(createDefaultMetaState());
  });
});
