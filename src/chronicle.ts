import { CHRONICLE_STORAGE_KEY } from './storageKeys';

export { CHRONICLE_STORAGE_KEY } from './storageKeys';

const MAX_RECENT_RUNS = 10;

export interface RunChronicleEntry {
  runId: string;
  completedAt: string;
  seed: string;
  dailyKey: string | null;
  /** Whether the run banked-and-escaped (true) or died (false). Bank-vs-death derives from this. */
  escaped: boolean;
  /** Deepest depth reached; climbs past 10 across strata for finer leaderboard resolution. */
  depth: number;
  enemiesDefeated: number;
  gold: number;
  emberReward: number;
  /** Embers gained from converting unbanked Gold at the bank (0 on death and in Daily). */
  convertedEmbers: number;
}

export interface RunChronicle {
  runsCompleted: number;
  escapes: number;
  bestDepth: number;
  bestGold: number;
  bestEnemiesDefeated: number;
  lastRunId: string | null;
  recent: RunChronicleEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function clampNonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function normalizeDailyKey(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function normalizeChronicleEntry(value: unknown): RunChronicleEntry {
  if (!isRecord(value)) {
    return {
      runId: '',
      completedAt: '',
      seed: '',
      dailyKey: null,
      escaped: false,
      depth: 0,
      enemiesDefeated: 0,
      gold: 0,
      emberReward: 0,
      convertedEmbers: 0,
    };
  }

  return {
    runId: typeof value.runId === 'string' ? value.runId : '',
    completedAt: typeof value.completedAt === 'string' ? value.completedAt : '',
    seed: typeof value.seed === 'string' ? value.seed : '',
    dailyKey: normalizeDailyKey(value.dailyKey),
    escaped: value.escaped === true,
    depth: clampNonNegativeInteger(value.depth),
    enemiesDefeated: clampNonNegativeInteger(value.enemiesDefeated),
    gold: clampNonNegativeInteger(value.gold),
    emberReward: clampNonNegativeInteger(value.emberReward),
    // Defaults to 0 for pre-delve saves that never recorded conversion (KTD6 migration).
    convertedEmbers: clampNonNegativeInteger(value.convertedEmbers),
  };
}

export function createDefaultRunChronicle(): RunChronicle {
  return {
    runsCompleted: 0,
    escapes: 0,
    bestDepth: 0,
    bestGold: 0,
    bestEnemiesDefeated: 0,
    lastRunId: null,
    recent: [],
  };
}

export function normalizeRunChronicle(value: unknown): RunChronicle {
  if (!isRecord(value)) return createDefaultRunChronicle();

  const defaults = createDefaultRunChronicle();
  const rawRecent = Array.isArray(value.recent) ? value.recent : [];

  return {
    runsCompleted: clampNonNegativeInteger(value.runsCompleted),
    escapes: clampNonNegativeInteger(value.escapes),
    bestDepth: clampNonNegativeInteger(value.bestDepth),
    bestGold: clampNonNegativeInteger(value.bestGold),
    bestEnemiesDefeated: clampNonNegativeInteger(value.bestEnemiesDefeated),
    lastRunId: typeof value.lastRunId === 'string' ? value.lastRunId : defaults.lastRunId,
    recent: rawRecent.map(normalizeChronicleEntry).slice(0, MAX_RECENT_RUNS),
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

export function loadRunChronicle(storage: Storage | null = browserStorage()): RunChronicle {
  if (!storage) return createDefaultRunChronicle();

  try {
    const raw = storage.getItem(CHRONICLE_STORAGE_KEY);
    return raw ? normalizeRunChronicle(JSON.parse(raw)) : createDefaultRunChronicle();
  } catch {
    return createDefaultRunChronicle();
  }
}

export function saveRunChronicle(
  record: RunChronicle,
  storage: Storage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(CHRONICLE_STORAGE_KEY, JSON.stringify(normalizeRunChronicle(record)));
  } catch {
    // local history is non-critical; keep game state usable if storage is unavailable.
  }
}

export function recordRunChronicleEntry(
  record: RunChronicle,
  entry: RunChronicleEntry,
): RunChronicle {
  const current = normalizeRunChronicle(record);

  if (current.lastRunId === entry.runId) {
    return current;
  }

  const normalizedEntry = normalizeChronicleEntry(entry);

  return {
    ...current,
    runsCompleted: current.runsCompleted + 1,
    escapes: current.escapes + (normalizedEntry.escaped ? 1 : 0),
    bestDepth: Math.max(current.bestDepth, normalizedEntry.depth),
    bestGold: Math.max(current.bestGold, normalizedEntry.gold),
    bestEnemiesDefeated: Math.max(current.bestEnemiesDefeated, normalizedEntry.enemiesDefeated),
    lastRunId: normalizedEntry.runId,
    recent: [normalizedEntry, ...current.recent].slice(0, MAX_RECENT_RUNS),
  };
}
