import { afterEach, describe, expect, test } from 'vitest';
import { MAX_INVENTORY } from './config';
import {
  META_ECONOMY_VERSION,
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

  test('migrates old positive ember balances into the starter card unlock bonus', () => {
    expect(
      normalizeMetaState({
        embers: 23,
        pendingPrep: {
          itemIds: [],
          extraStartingChoice: false,
          scoutFlame: false,
          curseIds: [],
        },
        lastAwardedRunId: 'old-run',
      }),
    ).toEqual({
      economyVersion: META_ECONOMY_VERSION,
      embers: 0,
      progression: {
        starterCardVarietyUnlocked: true,
        migrationBonusGranted: true,
        unlockedStarterKitIds: [],
        activeStarterKitId: null,
        activeArchetypeId: null,
        relicPathUnlocked: false,
        unlockedRelicIds: [],
        activeStartingRelicId: null,
        completedContractIds: [],
      },
      pendingPrep: {
        itemIds: [],
        extraStartingChoice: false,
        scoutFlame: false,
        curseIds: [],
        pendingRelicRoll: false,
      },
      lastAwardedRunId: 'old-run',
    });
  });

  test('preserves pending prep once while migrating old saved data', () => {
    expect(
      normalizeMetaState({
        embers: 3,
        pendingPrep: {
          itemIds: ['small_potion'],
          extraStartingChoice: true,
          scoutFlame: true,
          curseIds: ['narrow_opening'],
        },
        lastAwardedRunId: null,
      }),
    ).toEqual({
      economyVersion: META_ECONOMY_VERSION,
      embers: 0,
      progression: {
        starterCardVarietyUnlocked: true,
        migrationBonusGranted: true,
        unlockedStarterKitIds: [],
        activeStarterKitId: null,
        activeArchetypeId: null,
        relicPathUnlocked: false,
        unlockedRelicIds: [],
        activeStartingRelicId: null,
        completedContractIds: [],
      },
      pendingPrep: {
        itemIds: ['small_potion'],
        extraStartingChoice: true,
        scoutFlame: true,
        curseIds: ['narrow_opening'],
        pendingRelicRoll: false,
      },
      lastAwardedRunId: null,
    });
  });

  test('does not grant the migration bonus for malformed versioned data', () => {
    expect(
      normalizeMetaState({
        economyVersion: 'bad',
        embers: 11,
        pendingPrep: {
          itemIds: ['small_potion'],
          extraStartingChoice: true,
          scoutFlame: true,
          curseIds: ['narrow_opening'],
        },
        lastAwardedRunId: 'run-1',
      }),
    ).toEqual(createDefaultMetaState());
  });

  test('normalizes old versioned progression without starter-kit fields', () => {
    expect(
      normalizeMetaState({
        economyVersion: META_ECONOMY_VERSION,
        embers: 7,
        progression: {
          starterCardVarietyUnlocked: true,
          migrationBonusGranted: false,
        },
        pendingPrep: {
          itemIds: [],
          extraStartingChoice: false,
          scoutFlame: false,
          curseIds: [],
        },
        lastAwardedRunId: null,
      }).progression,
    ).toEqual({
      starterCardVarietyUnlocked: true,
      migrationBonusGranted: false,
      unlockedStarterKitIds: [],
      activeStarterKitId: null,
      activeArchetypeId: null,
      relicPathUnlocked: false,
      unlockedRelicIds: [],
      activeStartingRelicId: null,
      completedContractIds: [],
    });
  });

  test('deduplicates unlocked starter kits and clears stale active ids', () => {
    expect(
      normalizeMetaState({
        economyVersion: META_ECONOMY_VERSION,
        embers: 7,
        progression: {
          starterCardVarietyUnlocked: true,
          migrationBonusGranted: false,
          unlockedStarterKitIds: ['duelist', 'bad-kit', 'warden', 'duelist'],
          activeStarterKitId: 'hexbinder',
        },
        pendingPrep: {
          itemIds: [],
          extraStartingChoice: false,
          scoutFlame: false,
          curseIds: [],
        },
        lastAwardedRunId: null,
      }).progression,
    ).toEqual({
      starterCardVarietyUnlocked: true,
      migrationBonusGranted: false,
      unlockedStarterKitIds: ['duelist', 'warden'],
      activeStarterKitId: null,
      activeArchetypeId: null,
      relicPathUnlocked: false,
      unlockedRelicIds: [],
      activeStartingRelicId: null,
      completedContractIds: [],
    });
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
          curseIds: [],
        },
        lastAwardedRunId: null,
      }).pendingPrep.itemIds,
    ).toEqual(expectedItemIds);
  });

  test('keeps only the first valid saved curse id', () => {
    expect(
      normalizeMetaState({
        embers: 7,
        pendingPrep: {
          itemIds: [],
          extraStartingChoice: false,
          scoutFlame: false,
          curseIds: ['blood_oath', 'bad'],
        },
        lastAwardedRunId: null,
      }).pendingPrep.curseIds,
    ).toEqual(['blood_oath']);
  });

  test('loads saved embers and pending prep', () => {
    const storage = new MemoryStorage();
    saveMetaState(
      {
        economyVersion: META_ECONOMY_VERSION,
        embers: 12,
        progression: {
          starterCardVarietyUnlocked: true,
          migrationBonusGranted: false,
          unlockedStarterKitIds: ['duelist'],
          activeStarterKitId: 'duelist',
        },
        pendingPrep: {
          itemIds: ['small_potion'],
          extraStartingChoice: true,
          scoutFlame: false,
          curseIds: [],
        },
        lastAwardedRunId: 'run-1',
      },
      storage,
    );

    expect(loadMetaState(storage)).toEqual({
      economyVersion: META_ECONOMY_VERSION,
      embers: 12,
      progression: {
        starterCardVarietyUnlocked: true,
        migrationBonusGranted: false,
        unlockedStarterKitIds: ['duelist'],
        activeStarterKitId: 'duelist',
        activeArchetypeId: null,
        relicPathUnlocked: false,
        unlockedRelicIds: [],
        activeStartingRelicId: null,
        completedContractIds: [],
      },
      pendingPrep: {
        itemIds: ['small_potion'],
        extraStartingChoice: true,
        scoutFlame: false,
        curseIds: [],
        pendingRelicRoll: false,
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
        economyVersion: META_ECONOMY_VERSION,
        embers: 4.8,
        progression: {
          starterCardVarietyUnlocked: true,
          migrationBonusGranted: false,
          unlockedStarterKitIds: ['warden', 'warden'],
          activeStarterKitId: 'duelist',
        },
        pendingPrep: {
          itemIds: ['large_potion', 'bomb'],
          extraStartingChoice: true,
          scoutFlame: false,
          curseIds: [],
        },
        lastAwardedRunId: null,
      }),
    ).toEqual({
      economyVersion: META_ECONOMY_VERSION,
      embers: 4,
      progression: {
        starterCardVarietyUnlocked: true,
        migrationBonusGranted: false,
        unlockedStarterKitIds: ['warden'],
        activeStarterKitId: null,
        activeArchetypeId: null,
        relicPathUnlocked: false,
        unlockedRelicIds: [],
        activeStartingRelicId: null,
        completedContractIds: [],
      },
      pendingPrep: {
        itemIds: ['bomb'],
        extraStartingChoice: true,
        scoutFlame: false,
        curseIds: [],
        pendingRelicRoll: false,
      },
      lastAwardedRunId: null,
    });

    expect(
      setMeta({
        economyVersion: META_ECONOMY_VERSION,
        embers: 7,
        progression: {
          starterCardVarietyUnlocked: false,
          migrationBonusGranted: false,
          unlockedStarterKitIds: [],
          activeStarterKitId: null,
        },
        pendingPrep: {
          itemIds: ['bomb'],
          extraStartingChoice: true,
          scoutFlame: true,
          curseIds: [],
        },
        lastAwardedRunId: 'run-2',
      }),
    ).toEqual({
      economyVersion: META_ECONOMY_VERSION,
      embers: 7,
      progression: {
        starterCardVarietyUnlocked: false,
        migrationBonusGranted: false,
        unlockedStarterKitIds: [],
        activeStarterKitId: null,
        activeArchetypeId: null,
        relicPathUnlocked: false,
        unlockedRelicIds: [],
        activeStartingRelicId: null,
        completedContractIds: [],
      },
      pendingPrep: {
        itemIds: ['bomb'],
        extraStartingChoice: true,
        scoutFlame: true,
        curseIds: [],
        pendingRelicRoll: false,
      },
      lastAwardedRunId: 'run-2',
    });

    expect(getMeta()).toEqual({
      economyVersion: META_ECONOMY_VERSION,
      embers: 7,
      progression: {
        starterCardVarietyUnlocked: false,
        migrationBonusGranted: false,
        unlockedStarterKitIds: [],
        activeStarterKitId: null,
        activeArchetypeId: null,
        relicPathUnlocked: false,
        unlockedRelicIds: [],
        activeStartingRelicId: null,
        completedContractIds: [],
      },
      pendingPrep: {
        itemIds: ['bomb'],
        extraStartingChoice: true,
        scoutFlame: true,
        curseIds: [],
        pendingRelicRoll: false,
      },
      lastAwardedRunId: 'run-2',
    });
  });

  // Regression coverage for a bug found in review: `normalizeProgression` used to reset
  // `unlockedRelicIds` to `[]` whenever `relicPathUnlocked` was false, so a contract-granted
  // relic unlock (earned before the path purchase) was silently discarded on the very next
  // `setMeta` call — permanent, since the completed contract could never re-fire.
  test('keeps a contract-granted relic unlock even before the relic path is purchased', () => {
    const meta = setMeta({
      ...createDefaultMetaState(),
      progression: {
        ...createDefaultMetaState().progression,
        relicPathUnlocked: false,
        unlockedRelicIds: ['merchants_seal'],
        completedContractIds: ['first_elite_kill'],
      },
    });

    expect(meta.progression.relicPathUnlocked).toBe(false);
    expect(meta.progression.unlockedRelicIds).toEqual(['merchants_seal']);
    expect(meta.progression.completedContractIds).toEqual(['first_elite_kill']);

    // Buying the path afterward must see the relic still unlocked, not lost.
    const afterPathBuy = setMeta({
      ...meta,
      progression: { ...meta.progression, relicPathUnlocked: true },
    });
    expect(afterPathBuy.progression.unlockedRelicIds).toEqual(['merchants_seal']);
  });

  // Regression coverage: `normalizeActiveStartingRelicId` used to accept a cost-0 starter relic
  // as the active starting relic regardless of `relicPathUnlocked`, letting a save (or a manually
  // edited one) carry a starting relic that bypassed the Ember-gated relic path.
  test('drops an active starting relic on load if the relic path is not unlocked', () => {
    const meta = setMeta({
      ...createDefaultMetaState(),
      progression: {
        ...createDefaultMetaState().progression,
        relicPathUnlocked: false,
        activeStartingRelicId: 'swift_boots',
      },
    });

    expect(meta.progression.activeStartingRelicId).toBeNull();
  });
});
