import { DAILY_STORAGE_KEY } from './storageKeys';

export { DAILY_STORAGE_KEY } from './storageKeys';

export interface DailyRecord {
  date: string; // 'YYYY-MM-DD' (UTC) this record is for
  seed: string;
  bestDepth: number;
  escaped: boolean;
  attempts: number;
}

export function dailyKey(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dailySeed(date: Date = new Date()): string {
  return `daily-${dailyKey(date)}`;
}

export function createDefaultDailyRecord(date: Date = new Date()): DailyRecord {
  return createDefaultDailyRecordForKey(dailyKey(date));
}

export function createDefaultDailyRecordForKey(key: string): DailyRecord {
  return {
    date: key,
    seed: `daily-${key}`,
    bestDepth: 0,
    escaped: false,
    attempts: 0,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function normalizeDailyRecord(value: unknown, date: Date = new Date()): DailyRecord {
  return normalizeDailyRecordForKey(value, dailyKey(date));
}

export function normalizeDailyRecordForKey(value: unknown, key: string): DailyRecord {
  const current = createDefaultDailyRecordForKey(key);

  if (!isRecord(value) || value.date !== current.date) {
    return current;
  }

  const bestDepth =
    typeof value.bestDepth === 'number' && Number.isFinite(value.bestDepth)
      ? Math.max(0, Math.floor(value.bestDepth))
      : current.bestDepth;
  const escaped = value.escaped === true;
  const attempts =
    typeof value.attempts === 'number' && Number.isFinite(value.attempts)
      ? Math.max(0, Math.floor(value.attempts))
      : current.attempts;

  return {
    date: current.date,
    seed: current.seed,
    bestDepth,
    escaped,
    attempts,
  };
}

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadDailyRecord(storage: Storage | null = browserStorage()): DailyRecord {
  return loadDailyRecordForKey(dailyKey(), storage);
}

export function loadDailyRecordForKey(
  key: string,
  storage: Storage | null = browserStorage(),
): DailyRecord {
  if (!storage) return createDefaultDailyRecordForKey(key);

  try {
    const raw = storage.getItem(DAILY_STORAGE_KEY);
    return raw
      ? normalizeDailyRecordForKey(JSON.parse(raw), key)
      : createDefaultDailyRecordForKey(key);
  } catch {
    return createDefaultDailyRecordForKey(key);
  }
}

export function saveDailyRecord(
  record: DailyRecord,
  storage: Storage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(
      DAILY_STORAGE_KEY,
      JSON.stringify(normalizeDailyRecordForKey(record, record.date)),
    );
  } catch {
    // Keep runtime state alive when browser storage is unavailable.
  }
}

export function recordDailyAttempt(
  record: DailyRecord,
  run: { depth: number; escaped: boolean },
): DailyRecord {
  return {
    ...record,
    bestDepth: Math.max(record.bestDepth, Math.max(0, Math.floor(run.depth))),
    escaped: record.escaped || run.escaped,
    attempts: record.attempts + 1,
  };
}
