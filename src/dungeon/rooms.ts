import { BOSS_ROOM_INTERVAL, Dir, DIRS, MAX_DEPTH, OPPOSITE } from '../config';
import { GameRng } from '../game/rng';
import { createTrapDescriptors, type SpikeTrap } from './traps';

/**
 * Decade geometry for the fixed 100-room run. A "decade" is a band of
 * BOSS_ROOM_INTERVAL rooms (1..10, 11..20, ...), each capped by a boss on its
 * final room. These helpers consume only `depth` and never touch RNG, so the
 * room generator, the HUD, and the harness share one definition without drift.
 */

/** Position of a depth within its decade: 1..BOSS_ROOM_INTERVAL, boss on the last. */
export function roomWithinDecade(depth: number): number {
  if (depth < 1) return 1;
  return ((depth - 1) % BOSS_ROOM_INTERVAL) + 1;
}

/** 0-based decade index for a depth: rooms 1..10 → 0, 11..20 → 1, and so on. */
export function decadeForDepth(depth: number): number {
  if (depth < 1) return 0;
  return Math.floor((depth - 1) / BOSS_ROOM_INTERVAL);
}

/** True at every boss room — depths 10, 20, 30, ..., 100. */
export function isBossRoom(depth: number): boolean {
  return depth >= 1 && depth % BOSS_ROOM_INTERVAL === 0;
}

export type RoomEvent =
  | 'start'
  | 'encounter'
  | 'chest'
  | 'potion'
  | 'rest'
  | 'trap'
  | 'boss'
  | 'elite';

export interface RoomData {
  depth: number;
  event: RoomEvent;
  /** Doors the player may leave through. Entry door is always blocked. */
  openDoors: Dir[];
  blockedDoor: Dir | null;
  /** Spike descriptors (room grid coords plus optional motion), for trap rooms. */
  spikes: SpikeTrap[];
  cleared: boolean;
}

export function rollRoomEvent(rng: GameRng, depth: number): RoomEvent {
  // The chest-heavy pre-boss table fires on the room before every boss (the 9th
  // room of each decade). The standard table leans toward encounters and away
  // from potion/rest (R6) so attrition accumulates across a decade, tuned
  // against the roguelike-hard band (U12). Past the first decade (`deep`), the
  // encounter roster stops escalating in tier (every depth beyond MAX_DEPTH
  // still draws 'strong') but per-fight risk doesn't relent either; the deep
  // table leans back toward recovery rooms so a long descent stays survivable
  // without touching decade 1's own tuning. These table VALUES are preserved
  // from the endless-descent era pending the U7 100-room curve re-tune. 'elite'
  // is never rolled here — it only ever enters via the forced placement
  // guarantee in makeNextRoom (KTD3), so a decade never gets more than one.
  const preBoss = roomWithinDecade(depth) === BOSS_ROOM_INTERVAL - 1;
  const deep = depth > MAX_DEPTH;
  const table: [RoomEvent, number][] = preBoss
    ? deep
      ? [
          ['encounter', 14],
          ['chest', 28],
          ['potion', 26],
          ['rest', 24],
          ['trap', 8],
        ]
      : [
          ['encounter', 30],
          ['chest', 34],
          ['potion', 18],
          ['rest', 6],
          ['trap', 12],
        ]
    : deep
      ? [
          ['encounter', 24],
          ['chest', 24],
          ['potion', 22],
          ['rest', 22],
          ['trap', 8],
        ]
      : [
          ['encounter', 50],
          ['chest', 24],
          ['potion', 10],
          ['rest', 8],
          ['trap', 8],
        ];

  let r = rng.frac() * 100;
  for (const [event, w] of table) {
    if (r < w) return event;
    r -= w;
  }
  return 'trap';
}

/**
 * The mid-decade window eligible for the forced elite offer (KTD3): excludes a
 * decade's first room (kept simple/safe) and the chest-heavy pre-boss room. The
 * boss depth itself never reaches here — `makeNextRoom` short-circuits to 'boss'.
 */
export function isEliteEligibleDepth(depth: number): boolean {
  const within = roomWithinDecade(depth);
  return within > 1 && within < BOSS_ROOM_INTERVAL - 1;
}

/**
 * KTD3, scene side: pick which door (if any) gets the forced elite room when
 * priming next-room options. Returns null when no elite is due — outside the
 * eligible window, or one was already offered for this decade. Pure so the
 * Dungeon scene stays rules-free; the caller owns writing the offered flag.
 */
export function chooseForcedEliteDoor(
  rng: GameRng,
  nextDepth: number,
  openDoors: readonly Dir[],
  eliteOfferedForDecade: number | null,
): Dir | null {
  if (openDoors.length === 0) return null;
  if (!isEliteEligibleDepth(nextDepth)) return null;
  if (eliteOfferedForDecade === decadeForDepth(nextDepth)) return null;
  return openDoors[rng.between(0, openDoors.length - 1)] ?? null;
}

export function makeStartRoom(): RoomData {
  return {
    depth: 1,
    event: 'start',
    openDoors: ['N', 'E', 'W'],
    blockedDoor: null,
    spikes: [],
    cleared: false,
  };
}

/**
 * Build the room behind a door. Entered moving `travelDir`, so the door at
 * OPPOSITE(travelDir) is blocked. `forceElite` (KTD3) overrides the weighted roll
 * with 'elite' when the depth is inside the eligible window; the caller decides
 * which single door (if any) to force and owns the per-decade "offered" flag —
 * this stays a pure, stateless roll so it remains deterministic in (seed, path).
 */
export function makeNextRoom(
  rng: GameRng,
  depth: number,
  travelDir: Dir,
  forceElite = false,
): RoomData {
  const entry = OPPOSITE[travelDir];
  if (isBossRoom(depth)) {
    return { depth, event: 'boss', openDoors: [], blockedDoor: entry, spikes: [], cleared: false };
  }
  const event = forceElite && isEliteEligibleDepth(depth) ? 'elite' : rollRoomEvent(rng, depth);
  return {
    depth,
    event,
    openDoors: DIRS.filter((d) => d !== entry),
    blockedDoor: entry,
    spikes: event === 'trap' ? createTrapDescriptors(rng, entry) : [],
    cleared: false,
  };
}
