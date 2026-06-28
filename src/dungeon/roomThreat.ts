import {
  Dir,
  DIR_VEC,
  ROOM_THREAT_CONTACT_RADIUS,
  ROOM_THREAT_MAX_X,
  ROOM_THREAT_MAX_Y,
  ROOM_THREAT_MIN_X,
  ROOM_THREAT_MIN_Y,
  ROOM_THREAT_SAFE_RADIUS,
  ROOM_W,
  TILE,
} from '../config';
import type { GameRng } from '../game/rng';

export type RoomThreatKind = 'normal' | 'boss';
export type RoomThreatIntent = 'ignore' | 'alert' | 'chase';
export type RoomThreatProfileId = 'ignore' | 'patrol' | 'alert_chase' | 'boss_pressure';

export interface Point {
  x: number;
  y: number;
}

export interface RoomThreatProfile {
  id: RoomThreatProfileId;
  awarenessRadius: number;
  commitRadius: number;
  leashRadius: number;
  alertSpeed: number;
  chaseSpeed: number;
  patrolSpeed: number;
  graceMs: number;
  contactRadius: number;
}

export interface RoomThreatState {
  kind: RoomThreatKind;
  profileId: RoomThreatProfileId;
  intent: RoomThreatIntent;
  position: Point;
  patrolA: Point;
  patrolB: Point;
  patrolTarget: Point;
  ageMs: number;
  contactRadius: number;
}

export interface CreateRoomThreatInput {
  kind: RoomThreatKind;
  profileId: RoomThreatProfileId;
  entryDoor: Dir | null;
}

export interface UpdateRoomThreatInput {
  player: Point;
  deltaMs: number;
}

export interface RoomThreatUpdate {
  state: RoomThreatState;
  contactReady: boolean;
  graceActive: boolean;
}

export interface RoomThreatEscapeResult {
  allowed: boolean;
  clearThreat: boolean;
  grantBattleReward: boolean;
}

export const ROOM_THREAT_PROFILES: Record<RoomThreatProfileId, RoomThreatProfile> = {
  ignore: {
    id: 'ignore',
    awarenessRadius: TILE * 2.4,
    commitRadius: TILE * 1.45,
    leashRadius: TILE * 3.2,
    alertSpeed: 38,
    chaseSpeed: 78,
    patrolSpeed: 0,
    graceMs: 850,
    contactRadius: ROOM_THREAT_CONTACT_RADIUS,
  },
  patrol: {
    id: 'patrol',
    awarenessRadius: TILE * 3.2,
    commitRadius: TILE * 1.85,
    leashRadius: TILE * 4,
    alertSpeed: 46,
    chaseSpeed: 96,
    patrolSpeed: 34,
    graceMs: 850,
    contactRadius: ROOM_THREAT_CONTACT_RADIUS,
  },
  alert_chase: {
    id: 'alert_chase',
    awarenessRadius: TILE * 4.8,
    commitRadius: TILE * 2.5,
    leashRadius: TILE * 5.8,
    alertSpeed: 62,
    chaseSpeed: 124,
    patrolSpeed: 22,
    graceMs: 950,
    contactRadius: ROOM_THREAT_CONTACT_RADIUS,
  },
  boss_pressure: {
    id: 'boss_pressure',
    awarenessRadius: ROOM_W,
    commitRadius: ROOM_W,
    leashRadius: ROOM_W,
    alertSpeed: 0,
    chaseSpeed: 72,
    patrolSpeed: 0,
    graceMs: 1000,
    contactRadius: ROOM_THREAT_CONTACT_RADIUS + 8,
  },
};

const ENTRY_POINT: Record<Dir, Point> = {
  N: cellCenter(7, 1),
  S: cellCenter(7, 9),
  W: cellCenter(1, 5),
  E: cellCenter(13, 5),
};

const NORMAL_SPAWN_CELLS: { col: number; row: number }[] = [
  { col: 7, row: 5 },
  { col: 4, row: 3 },
  { col: 10, row: 3 },
  { col: 4, row: 7 },
  { col: 10, row: 7 },
  { col: 7, row: 3 },
  { col: 7, row: 7 },
];

function cellCenter(col: number, row: number): Point {
  return { x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampPoint(point: Point): Point {
  return {
    x: clamp(point.x, ROOM_THREAT_MIN_X, ROOM_THREAT_MAX_X),
    y: clamp(point.y, ROOM_THREAT_MIN_Y, ROOM_THREAT_MAX_Y),
  };
}

function moveToward(from: Point, to: Point, distance: number): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0 || distance <= 0) return from;
  const step = Math.min(distance, length);
  return clampPoint({
    x: from.x + (dx / length) * step,
    y: from.y + (dy / length) * step,
  });
}

function safePointsForEntry(entryDoor: Dir | null): Point[] {
  if (!entryDoor) return NORMAL_SPAWN_CELLS.map((cell) => cellCenter(cell.col, cell.row));

  const spawn = ENTRY_POINT[entryDoor];
  const vec = DIR_VEC[entryDoor];
  const breathing = { x: spawn.x - vec.x * TILE, y: spawn.y - vec.y * TILE };

  return NORMAL_SPAWN_CELLS.map((cell) => cellCenter(cell.col, cell.row)).filter(
    (point) =>
      dist(point, spawn) >= ROOM_THREAT_SAFE_RADIUS &&
      dist(point, breathing) >= ROOM_THREAT_SAFE_RADIUS,
  );
}

function choosePatrolTarget(rng: GameRng, anchor: Point, entryDoor: Dir | null): Point {
  const options = safePointsForEntry(entryDoor).filter((point) => dist(point, anchor) >= TILE * 2);
  return options.length > 0 ? rng.pick(options) : anchor;
}

function chooseSpawn(rng: GameRng, input: CreateRoomThreatInput): Point {
  if (input.kind === 'boss') return cellCenter(7, 5);
  const safe = safePointsForEntry(input.entryDoor);
  return rng.pick(
    safe.length > 0 ? safe : NORMAL_SPAWN_CELLS.map((cell) => cellCenter(cell.col, cell.row)),
  );
}

function nextIntent(
  state: RoomThreatState,
  profile: RoomThreatProfile,
  player: Point,
  graceActive: boolean,
): RoomThreatIntent {
  if (state.kind === 'boss') return graceActive ? 'alert' : 'chase';

  const distance = dist(state.position, player);
  if (state.intent === 'chase' && distance <= profile.leashRadius) return 'chase';
  if (distance <= profile.commitRadius) return 'chase';
  if (distance <= profile.awarenessRadius) return 'alert';
  return 'ignore';
}

function nextPosition(
  state: RoomThreatState,
  profile: RoomThreatProfile,
  intent: RoomThreatIntent,
  player: Point,
  deltaMs: number,
): { position: Point; patrolTarget: Point } {
  const seconds = Math.max(0, deltaMs) / 1000;
  if (intent === 'chase') {
    return {
      position: moveToward(state.position, player, profile.chaseSpeed * seconds),
      patrolTarget: state.patrolTarget,
    };
  }
  if (intent === 'alert') {
    return {
      position: moveToward(state.position, player, profile.alertSpeed * seconds),
      patrolTarget: state.patrolTarget,
    };
  }
  if (profile.patrolSpeed <= 0) {
    return { position: state.position, patrolTarget: state.patrolTarget };
  }

  let target = state.patrolTarget;
  if (dist(state.position, target) < 4) {
    target = dist(target, state.patrolA) < 4 ? state.patrolB : state.patrolA;
  }

  return {
    position: moveToward(state.position, target, profile.patrolSpeed * seconds),
    patrolTarget: target,
  };
}

export function getRoomThreatProfile(id: RoomThreatProfileId): RoomThreatProfile {
  return ROOM_THREAT_PROFILES[id];
}

export function createRoomThreatState(rng: GameRng, input: CreateRoomThreatInput): RoomThreatState {
  const profile = getRoomThreatProfile(input.profileId);
  const position = chooseSpawn(rng, input);
  const patrolTarget =
    profile.patrolSpeed > 0 ? choosePatrolTarget(rng, position, input.entryDoor) : position;
  return {
    kind: input.kind,
    profileId: profile.id,
    intent: input.kind === 'boss' ? 'alert' : 'ignore',
    position,
    patrolA: position,
    patrolB: patrolTarget,
    patrolTarget,
    ageMs: 0,
    contactRadius: profile.contactRadius,
  };
}

export function updateRoomThreatState(
  state: RoomThreatState,
  input: UpdateRoomThreatInput,
): RoomThreatUpdate {
  const profile = getRoomThreatProfile(state.profileId);
  const ageMs = state.ageMs + Math.max(0, input.deltaMs);
  const graceActive = ageMs < profile.graceMs;
  const intent = nextIntent(state, profile, input.player, graceActive);
  const movement = nextPosition(state, profile, intent, input.player, input.deltaMs);
  const nextState = {
    ...state,
    intent,
    ageMs,
    position: movement.position,
    patrolTarget: movement.patrolTarget,
  };

  return {
    state: nextState,
    contactReady: !graceActive && dist(nextState.position, input.player) <= profile.contactRadius,
    graceActive,
  };
}

export function evaluateRoomThreatEscape(
  kind: RoomThreatKind,
  cleared: boolean,
): RoomThreatEscapeResult {
  if (kind === 'boss' && !cleared) {
    return { allowed: false, clearThreat: false, grantBattleReward: false };
  }
  if (kind === 'normal' && !cleared) {
    return { allowed: true, clearThreat: false, grantBattleReward: false };
  }
  return { allowed: true, clearThreat: false, grantBattleReward: false };
}

export function isInsideRoomThreatBounds(point: Point): boolean {
  return (
    point.x >= ROOM_THREAT_MIN_X &&
    point.x <= ROOM_THREAT_MAX_X &&
    point.y >= ROOM_THREAT_MIN_Y &&
    point.y <= ROOM_THREAT_MAX_Y
  );
}
