import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  createDefaultDailyRecord,
  createDefaultDailyRecordForKey,
  dailyKey,
  dailySeed,
  loadDailyRecord,
  loadDailyRecordForKey,
  normalizeDailyRecord,
  normalizeDailyRecordForKey,
  recordDailyAttempt,
  saveDailyRecord,
} from './daily';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  length = 0;

  clear(): void {
    this.values.clear();
    this.length = this.values.size;
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

describe('daily challenge records', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('derives daily key from UTC date', () => {
    expect(dailyKey(new Date('2026-06-27T12:00:00Z'))).toBe('2026-06-27');
    expect(dailyKey(new Date('2026-06-27T00:00:00.010Z'))).toBe('2026-06-27');
    expect(dailyKey(new Date('2026-06-27T23:59:59.999Z'))).toBe('2026-06-27');
  });

  test('derives daily seed from key', () => {
    expect(dailySeed(new Date('2026-06-27T00:00:00Z'))).toBe('daily-2026-06-27');
  });

  test('normalizes a record for today and rejects stale records', () => {
    const today = new Date('2026-06-27T00:00:00Z');
    const stale = new Date('2026-06-26T00:00:00Z');
    const raw = {
      date: '2026-06-27',
      seed: 'daily-2026-06-27',
      bestDepth: 6,
      escaped: true,
      attempts: 2,
    };

    expect(normalizeDailyRecord(raw, today)).toEqual(raw);
    expect(normalizeDailyRecord({ ...raw, date: dailyKey(stale) }, today)).toEqual(
      createDefaultDailyRecord(today),
    );
  });

  test('coerces bad depth/escaped/attempt values when normalizing', () => {
    expect(
      normalizeDailyRecord(
        {
          date: '2026-06-27',
          seed: 'daily-2026-06-27',
          bestDepth: -2.4,
          escaped: 'yes',
          attempts: 'five',
        },
        new Date('2026-06-27T00:00:00Z'),
      ),
    ).toEqual({
      date: '2026-06-27',
      seed: 'daily-2026-06-27',
      bestDepth: 0,
      escaped: false,
      attempts: 0,
    });
  });

  test('normalizes records for an explicit key independent of the current date', () => {
    expect(
      normalizeDailyRecordForKey(
        {
          date: '2026-07-05',
          seed: 'daily-2026-07-05',
          bestDepth: 30,
          escaped: false,
          attempts: 1,
        },
        '2026-07-05',
      ),
    ).toEqual({
      date: '2026-07-05',
      seed: 'daily-2026-07-05',
      bestDepth: 30,
      escaped: false,
      attempts: 1,
    });
  });

  test('falls back to default when storage unavailable', () => {
    expect(loadDailyRecord(null)).toEqual(createDefaultDailyRecord());
  });

  test('round-trips via in-memory storage', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-27T12:00:00Z'));

    const storage = new MemoryStorage();
    const record = {
      date: '2026-06-27',
      seed: 'daily-2026-06-27',
      bestDepth: 7,
      escaped: false,
      attempts: 3,
    };

    saveDailyRecord(record, storage);
    expect(loadDailyRecord(storage)).toEqual(record);
  });

  test('loads and saves a suspended daily against its start key after midnight', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-06T12:00:00Z'));

    const storage = new MemoryStorage();
    const startedYesterday = createDefaultDailyRecordForKey('2026-07-05');
    const recorded = recordDailyAttempt(startedYesterday, { depth: 30, escaped: false });

    saveDailyRecord(recorded, storage);

    expect(loadDailyRecordForKey('2026-07-05', storage)).toEqual(recorded);
    expect(loadDailyRecord(storage)).toEqual(createDefaultDailyRecord(new Date()));
  });

  test('records room depth past 10 as the comparable metric', () => {
    const record = createDefaultDailyRecord(new Date('2026-06-27T00:00:00Z'));
    const recorded = recordDailyAttempt(record, { depth: 24, escaped: true });

    // Depth climbs past 10 unchanged, giving room-level leaderboard resolution.
    expect(recorded.bestDepth).toBe(24);
    expect(recorded.attempts).toBe(1);
  });

  test('records attempt stats without mutating the input record', () => {
    const record = createDefaultDailyRecord(new Date('2026-06-27T00:00:00Z'));
    const recorded = recordDailyAttempt(record, { depth: 7, escaped: true });
    expect(record).toEqual(createDefaultDailyRecord(new Date('2026-06-27T00:00:00Z')));
    expect(recorded).toEqual({
      date: '2026-06-27',
      seed: 'daily-2026-06-27',
      bestDepth: 7,
      escaped: true,
      attempts: 1,
    });
  });
});
