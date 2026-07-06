import { afterEach, describe, expect, test } from 'vitest';
import {
  META_STORAGE_KEY,
  META_ECONOMY_VERSION,
  createDefaultMetaState,
  getMeta,
  loadMetaState,
  normalizeMetaState,
  saveMetaState,
  setMeta,
  type MetaState,
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

  test('normalizes invalid and old unversioned saved data to defaults', () => {
    expect(normalizeMetaState(null)).toEqual(createDefaultMetaState());
    expect(normalizeMetaState({ oldWallet: 23, pendingPrep: { itemIds: ['bomb'] } })).toEqual(
      createDefaultMetaState(),
    );
  });

  test('normalizes versioned loadout selections and contract ids', () => {
    expect(
      normalizeMetaState({
        economyVersion: META_ECONOMY_VERSION,
        progression: {
          activeArchetypeId: 'barbarian',
          activeStartingRelicId: 'swift_boots',
          completedContractIds: ['reach_depth_6', 'bad-contract', 'reach_depth_6'],
        },
      }),
    ).toEqual({
      economyVersion: META_ECONOMY_VERSION,
      progression: {
        activeArchetypeId: 'barbarian',
        activeStartingRelicId: 'swift_boots',
        completedContractIds: ['reach_depth_6'],
      },
    });
  });

  test('drops invalid archetype and non-starting relic selections', () => {
    expect(
      normalizeMetaState({
        economyVersion: META_ECONOMY_VERSION,
        progression: {
          activeArchetypeId: 'bad',
          activeStartingRelicId: 'stone_heart',
          completedContractIds: [],
        },
      }),
    ).toEqual(createDefaultMetaState());
  });

  test('loads and saves selected loadout', () => {
    const storage = new MemoryStorage();
    const meta: MetaState = {
      economyVersion: META_ECONOMY_VERSION,
      progression: {
        activeArchetypeId: 'ranger' as const,
        activeStartingRelicId: 'swift_boots' as const,
        completedContractIds: ['first_elite_kill' as const],
      },
    };

    saveMetaState(meta, storage);

    expect(loadMetaState(storage)).toEqual(meta);
  });

  test('falls back to defaults when storage contains malformed JSON', () => {
    const storage = new MemoryStorage();
    storage.setItem(META_STORAGE_KEY, '{bad json');

    expect(loadMetaState(storage)).toEqual(createDefaultMetaState());
  });

  test('normalizes set meta and applies sequential setMeta calls', () => {
    expect(
      setMeta({
        economyVersion: META_ECONOMY_VERSION,
        progression: {
          activeArchetypeId: 'ranger',
          activeStartingRelicId: 'swift_boots',
          completedContractIds: [],
        },
      }),
    ).toEqual({
      economyVersion: META_ECONOMY_VERSION,
      progression: {
        activeArchetypeId: 'ranger',
        activeStartingRelicId: 'swift_boots',
        completedContractIds: [],
      },
    });

    expect(
      setMeta({
        economyVersion: META_ECONOMY_VERSION,
        progression: {
          activeArchetypeId: 'bad' as never,
          activeStartingRelicId: 'spark_coil',
          completedContractIds: ['reach_room_20'],
        },
      }),
    ).toEqual({
      economyVersion: META_ECONOMY_VERSION,
      progression: {
        activeArchetypeId: null,
        activeStartingRelicId: 'spark_coil',
        completedContractIds: ['reach_room_20'],
      },
    });

    expect(getMeta()).toEqual({
      economyVersion: META_ECONOMY_VERSION,
      progression: {
        activeArchetypeId: null,
        activeStartingRelicId: 'spark_coil',
        completedContractIds: ['reach_room_20'],
      },
    });
  });
});
