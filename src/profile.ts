import { BOSS_ROOM_INTERVAL, RUN_LENGTH } from './config';
import { RELIC_DEFS, type RelicId } from './data/relics';
import {
  CHRONICLE_STORAGE_KEY,
  DAILY_STORAGE_KEY,
  META_STORAGE_KEY,
  PROFILE_STORAGE_KEY,
} from './storageKeys';

export { PROFILE_STORAGE_KEY } from './storageKeys';

export interface ProfileState {
  xp: number;
  discoveredRelicIds: RelicId[];
  personalBestRoom: number;
  lastAwardedRunId: string | null;
}

export interface RunXpBreakdown {
  roomsXp: number;
  bossXp: number;
  escapeXp: number;
  total: number;
}

const XP_PER_ROOM = 10;
const XP_PER_BOSS = 50;
const ESCAPE_XP = 500;

const LEVEL_XP_THRESHOLDS = [
  0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4000, 5000, 6200, 7600, 9200, 11000, 13200,
  15600, 18200, 21000,
] as const;

const RELIC_IDS = new Set<string>(RELIC_DEFS.map((relic) => relic.id));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function clampNonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function clampRoom(value: unknown): number {
  return Math.min(RUN_LENGTH, clampNonNegativeInteger(value));
}

function normalizeDiscoveredRelicIds(value: unknown): RelicId[] {
  if (!Array.isArray(value)) return [];
  const ids: RelicId[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !RELIC_IDS.has(item)) continue;
    const relicId = item as RelicId;
    if (!ids.includes(relicId)) ids.push(relicId);
  }
  return ids;
}

export function createDefaultProfileState(): ProfileState {
  return {
    xp: 0,
    discoveredRelicIds: [],
    personalBestRoom: 0,
    lastAwardedRunId: null,
  };
}

export function normalizeProfileState(value: unknown): ProfileState {
  if (!isRecord(value)) return createDefaultProfileState();

  return {
    xp: clampNonNegativeInteger(value.xp),
    discoveredRelicIds: normalizeDiscoveredRelicIds(value.discoveredRelicIds),
    personalBestRoom: clampRoom(value.personalBestRoom),
    lastAwardedRunId: typeof value.lastAwardedRunId === 'string' ? value.lastAwardedRunId : null,
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

function resetLegacyStorageForNewProfile(storage: Storage): ProfileState {
  storage.removeItem(META_STORAGE_KEY);
  storage.removeItem(CHRONICLE_STORAGE_KEY);
  storage.removeItem(DAILY_STORAGE_KEY);
  const profile = createDefaultProfileState();
  storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  return profile;
}

export function loadProfileState(storage: Storage | null = browserStorage()): ProfileState {
  if (!storage) return createDefaultProfileState();

  try {
    const raw = storage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return resetLegacyStorageForNewProfile(storage);
    return normalizeProfileState(JSON.parse(raw));
  } catch {
    return createDefaultProfileState();
  }
}

export function saveProfileState(
  profile: ProfileState,
  storage: Storage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(normalizeProfileState(profile)));
  } catch {
    // Profile progress is non-critical for runtime viability; keep the session playable.
  }
}

let current = loadProfileState();

export function getProfile(): ProfileState {
  return current;
}

export function setProfile(next: ProfileState): ProfileState {
  current = normalizeProfileState(next);
  saveProfileState(current);
  return current;
}

export function xpForLevel(level: number): number {
  const normalizedLevel =
    typeof level === 'number' && Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
  return LEVEL_XP_THRESHOLDS[Math.min(normalizedLevel, LEVEL_XP_THRESHOLDS.length) - 1];
}

export function levelForXp(xp: number): number {
  const normalizedXp = clampNonNegativeInteger(xp);
  let level = 1;
  for (let index = 1; index < LEVEL_XP_THRESHOLDS.length; index++) {
    if (normalizedXp < LEVEL_XP_THRESHOLDS[index]) break;
    level = index + 1;
  }
  return level;
}

export function xpForRun(
  roomsReached: number,
  bossesKilled: number,
  escaped: boolean,
): RunXpBreakdown {
  const rooms = clampRoom(roomsReached);
  const bossCap = Math.floor(RUN_LENGTH / BOSS_ROOM_INTERVAL);
  const bosses = Math.min(bossCap, clampNonNegativeInteger(bossesKilled));
  const roomsXp = rooms * XP_PER_ROOM;
  const bossXp = bosses * XP_PER_BOSS;
  const escapeXp = escaped ? ESCAPE_XP : 0;

  return {
    roomsXp,
    bossXp,
    escapeXp,
    total: roomsXp + bossXp + escapeXp,
  };
}

export function addProfileXp(profile: ProfileState, amount: number): ProfileState {
  return normalizeProfileState({
    ...profile,
    xp: profile.xp + clampNonNegativeInteger(amount),
  });
}

export function discoverRelic(profile: ProfileState, relicId: RelicId): ProfileState {
  if (profile.discoveredRelicIds.includes(relicId)) return normalizeProfileState(profile);
  return normalizeProfileState({
    ...profile,
    discoveredRelicIds: [...profile.discoveredRelicIds, relicId],
  });
}

export function updatePersonalBestRoom(profile: ProfileState, room: number): ProfileState {
  return normalizeProfileState({
    ...profile,
    personalBestRoom: Math.max(profile.personalBestRoom, clampRoom(room)),
  });
}

export function markProfileRunAwarded(profile: ProfileState, runId: string): ProfileState {
  return normalizeProfileState({
    ...profile,
    lastAwardedRunId: runId,
  });
}
