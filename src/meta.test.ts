import { afterEach, describe, expect, test } from 'vitest';
import { MAX_INVENTORY } from './config';
import {
  createDefaultMetaState,
  getMeta,
  loadMetaState,
  normalizeMetaState,
  saveMetaState,
  setMeta,
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
  afterEach(() => {
    setMeta(createDefaultMetaState());
  });

  test('normalizes invalid saved data to defaults', () => {
    expect(normalizeMetaState({ embers: -10, pendingPrep: null })).toEqual(
      createDefaultMetaState(),
    );
  });

  test('filters saved item ids to campfire items and inventory capacity', () => {
    const savedItemIds = [
      'small_potion',
      'large_potion',
      'smoke_bomb',
      'bad_item',
      'bomb',
      ...Array.from({ length: MAX_INVENTORY }, () => 'small_potion'),
    ];
    const expectedItemIds = [
      'small_potion',
      'smoke_bomb',
      'bomb',
      ...Array.from({ length: MAX_INVENTORY }, () => 'small_potion'),
    ].slice(0, MAX_INVENTORY);

    expect(
      normalizeMetaState({
        embers: 7,
        pendingPrep: {
          itemIds: savedItemIds,
          extraStartingChoice: false,
          scoutFlame: true,
        },
        lastAwardedRunId: null,
      }).pendingPrep.itemIds,
    ).toEqual(expectedItemIds);
  });

  test('loads saved embers and pending prep', () => {
    const storage = new MemoryStorage();
    saveMetaState(
      {
        embers: 12,
        pendingPrep: {
          itemIds: ['small_potion'],
          extraStartingChoice: true,
          scoutFlame: false,
        },
        lastAwardedRunId: 'run-1',
      },
      storage,
    );

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

  test('normalizes set meta and applies sequential setMeta calls', () => {
    expect(
      setMeta({
        embers: 4.8,
        pendingPrep: {
          itemIds: ['large_potion', 'bomb'],
          extraStartingChoice: true,
          scoutFlame: false,
        },
        lastAwardedRunId: null,
      }),
    ).toEqual({
      embers: 4,
      pendingPrep: {
        itemIds: ['bomb'],
        extraStartingChoice: true,
        scoutFlame: false,
      },
      lastAwardedRunId: null,
    });

    expect(
      setMeta({
        embers: 7,
        pendingPrep: {
          itemIds: ['bomb'],
          extraStartingChoice: true,
          scoutFlame: true,
        },
        lastAwardedRunId: 'run-2',
      }),
    ).toEqual({
      embers: 7,
      pendingPrep: {
        itemIds: ['bomb'],
        extraStartingChoice: true,
        scoutFlame: true,
      },
      lastAwardedRunId: 'run-2',
    });

    expect(getMeta()).toEqual({
      embers: 7,
      pendingPrep: {
        itemIds: ['bomb'],
        extraStartingChoice: true,
        scoutFlame: true,
      },
      lastAwardedRunId: 'run-2',
    });
  });
});
