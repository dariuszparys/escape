export const DAILY_STORAGE_KEY = 'escape:daily-record';

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
  return {
    date: dailyKey(date),
    seed: dailySeed(date),
    bestDepth: 0,
    escaped: false,
    attempts: 0,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function normalizeDailyRecord(value: unknown, date: Date = new Date()): DailyRecord {
  const current = createDefaultDailyRecord(date);

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
  if (!storage) return createDefaultDailyRecord();

  try {
    const raw = storage.getItem(DAILY_STORAGE_KEY);
    return raw ? normalizeDailyRecord(JSON.parse(raw)) : createDefaultDailyRecord();
  } catch {
    return createDefaultDailyRecord();
  }
}

export function saveDailyRecord(
  record: DailyRecord,
  storage: Storage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(DAILY_STORAGE_KEY, JSON.stringify(normalizeDailyRecord(record)));
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
