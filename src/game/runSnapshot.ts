import type { Dir } from '../config';
import { DIRS } from '../config';
import type { RoomData } from '../dungeon/rooms';
import type { SerializedRunState } from '../state';
import { RunState } from '../state';
import { RUN_SNAPSHOT_STORAGE_KEY } from '../storageKeys';

export { RUN_SNAPSHOT_STORAGE_KEY } from '../storageKeys';

export interface RunSnapshot {
  version: 1;
  run: SerializedRunState;
  room: RoomData;
  origin: { x: number; y: number };
  player: { x: number; y: number };
  facing: Dir;
  rngState: string;
  roomBuildRngState: string;
  nextRoomOptions: Partial<Record<Dir, { room: RoomData; rngState: string }>>;
}

export interface HydratedRunSnapshot extends Omit<RunSnapshot, 'run'> {
  run: RunState;
}

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizePoint(value: unknown): { x: number; y: number } | null {
  if (!isRecord(value)) return null;
  if (typeof value.x !== 'number' || !Number.isFinite(value.x)) return null;
  if (typeof value.y !== 'number' || !Number.isFinite(value.y)) return null;
  return { x: value.x, y: value.y };
}

function normalizeDir(value: unknown): Dir | null {
  return typeof value === 'string' && DIRS.includes(value as Dir) ? (value as Dir) : null;
}

function normalizeRoom(value: unknown): RoomData | null {
  if (!isRecord(value)) return null;
  if (typeof value.depth !== 'number' || !Number.isFinite(value.depth)) return null;
  if (
    value.event !== 'start' &&
    value.event !== 'encounter' &&
    value.event !== 'chest' &&
    value.event !== 'potion' &&
    value.event !== 'rest' &&
    value.event !== 'trap' &&
    value.event !== 'boss' &&
    value.event !== 'elite'
  ) {
    return null;
  }
  if (!Array.isArray(value.openDoors)) return null;
  const openDoors: Dir[] = [];
  for (const dir of value.openDoors) {
    const normalized = normalizeDir(dir);
    if (!normalized || openDoors.includes(normalized)) return null;
    openDoors.push(normalized);
  }
  const blockedDoor = value.blockedDoor === null ? null : normalizeDir(value.blockedDoor);
  if (value.blockedDoor !== null && !blockedDoor) return null;
  if (!Array.isArray(value.spikes)) return null;
  const spikes: RoomData['spikes'] = [];
  for (const spike of value.spikes) {
    if (!isRecord(spike)) return null;
    if (typeof spike.col !== 'number' || !Number.isFinite(spike.col)) return null;
    if (typeof spike.row !== 'number' || !Number.isFinite(spike.row)) return null;
    spikes.push({ col: Math.floor(spike.col), row: Math.floor(spike.row) });
  }
  return {
    depth: Math.max(1, Math.floor(value.depth)),
    event: value.event,
    openDoors,
    blockedDoor,
    spikes,
    cleared: value.cleared === true,
  };
}

function normalizeNextRoomOptions(
  value: unknown,
): Partial<Record<Dir, { room: RoomData; rngState: string }>> | null {
  if (!isRecord(value)) return null;
  const options: Partial<Record<Dir, { room: RoomData; rngState: string }>> = {};
  for (const dir of DIRS) {
    const raw = value[dir];
    if (raw === undefined) continue;
    if (!isRecord(raw) || typeof raw.rngState !== 'string') return null;
    const room = normalizeRoom(raw.room);
    if (!room) return null;
    options[dir] = { room, rngState: raw.rngState };
  }
  return options;
}

export function normalizeRunSnapshot(value: unknown): HydratedRunSnapshot | null {
  if (!isRecord(value) || value.version !== 1) return null;
  if (typeof value.rngState !== 'string' || typeof value.roomBuildRngState !== 'string') {
    return null;
  }
  const run = RunState.fromJSON(value.run);
  const room = normalizeRoom(value.room);
  const origin = normalizePoint(value.origin);
  const player = normalizePoint(value.player);
  const facing = normalizeDir(value.facing);
  const nextRoomOptions = normalizeNextRoomOptions(value.nextRoomOptions);
  if (!run || !room || !origin || !player || !facing || !nextRoomOptions) return null;

  return {
    version: 1,
    run,
    room,
    origin,
    player,
    facing,
    rngState: value.rngState,
    roomBuildRngState: value.roomBuildRngState,
    nextRoomOptions,
  };
}

export function serializeRunSnapshot(snapshot: HydratedRunSnapshot): RunSnapshot {
  return {
    ...snapshot,
    run: snapshot.run.toJSON(),
  };
}

export function loadRunSnapshot(
  storage: Storage | null = browserStorage(),
): HydratedRunSnapshot | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(RUN_SNAPSHOT_STORAGE_KEY);
    if (!raw) return null;
    return normalizeRunSnapshot(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveRunSnapshot(
  snapshot: HydratedRunSnapshot,
  storage: Storage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(RUN_SNAPSHOT_STORAGE_KEY, JSON.stringify(serializeRunSnapshot(snapshot)));
  } catch {
    // Runtime state remains authoritative when browser storage is unavailable.
  }
}

export function clearRunSnapshot(storage: Storage | null = browserStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(RUN_SNAPSHOT_STORAGE_KEY);
  } catch {
    // Best effort cleanup only.
  }
}
