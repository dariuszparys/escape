import { describe, expect, test } from 'vitest';
import {
  PROFILE_STORAGE_KEY,
  createDefaultProfileState,
  discoverRelic,
  levelForXp,
  loadProfileState,
  markProfileRunAwarded,
  normalizeProfileState,
  saveProfileState,
  updatePersonalBestRoom,
  xpForLevel,
  xpForRun,
} from './profile';
import { CHRONICLE_STORAGE_KEY, DAILY_STORAGE_KEY, META_STORAGE_KEY } from './storageKeys';

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

describe('profile state', () => {
  test('defaults to a fresh level-1 profile', () => {
    expect(createDefaultProfileState()).toEqual({
      xp: 0,
      discoveredRelicIds: [],
      personalBestRoom: 0,
      lastAwardedRunId: null,
    });
    expect(levelForXp(0)).toBe(1);
  });

  test('levelForXp is monotonic and matches level thresholds at boundaries', () => {
    for (let level = 2; level <= 12; level++) {
      const threshold = xpForLevel(level);
      expect(levelForXp(threshold - 1)).toBe(level - 1);
      expect(levelForXp(threshold)).toBe(level);
      expect(levelForXp(threshold + 1)).toBe(level);
    }
  });

  test('xpForRun scales by rooms, boss kills, and escape bonus', () => {
    const death = xpForRun(47, 4, false);
    const escape = xpForRun(100, 10, true);

    expect(death.roomsXp).toBeGreaterThan(0);
    expect(death.bossXp).toBeGreaterThan(0);
    expect(death.escapeXp).toBe(0);
    expect(death.total).toBe(death.roomsXp + death.bossXp);
    expect(escape.escapeXp).toBeGreaterThan(0);
    expect(escape.total).toBe(escape.roomsXp + escape.bossXp + escape.escapeXp);
    expect(escape.total).toBeGreaterThan(death.total);
  });

  test('normalizes malformed saves to safe defaults and valid discoveries', () => {
    expect(
      normalizeProfileState({
        xp: 42.8,
        discoveredRelicIds: ['spark_coil', 'bad-relic', 'spark_coil', 'swift_boots'],
        personalBestRoom: -10,
        lastAwardedRunId: 123,
      }),
    ).toEqual({
      xp: 42,
      discoveredRelicIds: ['spark_coil', 'swift_boots'],
      personalBestRoom: 0,
      lastAwardedRunId: null,
    });
  });

  test('discovery dedupes and never shrinks', () => {
    const discovered = discoverRelic(
      { ...createDefaultProfileState(), discoveredRelicIds: ['swift_boots'] },
      'spark_coil',
    );
    expect(discovered.discoveredRelicIds).toEqual(['swift_boots', 'spark_coil']);
    expect(discoverRelic(discovered, 'spark_coil').discoveredRelicIds).toEqual([
      'swift_boots',
      'spark_coil',
    ]);
  });

  test('personal best and run-award guard only move forward', () => {
    const profile = updatePersonalBestRoom(
      { ...createDefaultProfileState(), personalBestRoom: 47 },
      30,
    );
    expect(profile.personalBestRoom).toBe(47);
    expect(updatePersonalBestRoom(profile, 62).personalBestRoom).toBe(62);
    expect(markProfileRunAwarded(profile, 'run-1').lastAwardedRunId).toBe('run-1');
  });

  test('loads and saves through storage', () => {
    const storage = new MemoryStorage();
    const profile = {
      ...createDefaultProfileState(),
      xp: 123,
      discoveredRelicIds: ['spark_coil' as const],
      personalBestRoom: 12,
      lastAwardedRunId: 'run-1',
    };

    saveProfileState(profile, storage);

    expect(JSON.parse(storage.getItem(PROFILE_STORAGE_KEY) ?? '{}')).toEqual(profile);
    expect(loadProfileState(storage)).toEqual(profile);
  });

  test('first profile boot clears legacy meta, chronicle, and daily saves', () => {
    const storage = new MemoryStorage();
    storage.setItem(META_STORAGE_KEY, JSON.stringify({ oldWallet: 99 }));
    storage.setItem(CHRONICLE_STORAGE_KEY, JSON.stringify({ runsCompleted: 3 }));
    storage.setItem(DAILY_STORAGE_KEY, JSON.stringify({ attempts: 2 }));

    expect(loadProfileState(storage)).toEqual(createDefaultProfileState());

    expect(storage.getItem(PROFILE_STORAGE_KEY)).not.toBeNull();
    expect(storage.getItem(META_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(CHRONICLE_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(DAILY_STORAGE_KEY)).toBeNull();
  });
});
