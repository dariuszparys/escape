import {
  Dir,
  DIR_VEC,
  DIRS,
  MAX_DEPTH,
  OPPOSITE,
  ROOM_COLS,
  ROOM_ROWS,
  STRATUM_SIZE,
} from '../config';
import { GameRng } from '../game/rng';
import { depthWithinStratum, isStratumBoundary, stratumForDepth } from '../game/strata';

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
  /** Spike tile positions (room grid coords), for trap rooms. */
  spikes: { col: number; row: number }[];
  cleared: boolean;
}

export function rollRoomEvent(rng: GameRng, depth: number): RoomEvent {
  // The chest-heavy pre-boss table fires on the last room of every stratum.
  // The standard table leans toward encounters and away from potion/rest (R6) so
  // attrition accumulates across a stratum, tuned against the roguelike-hard
  // band (U12). Past the first stratum (`deep`), the encounter roster stops
  // escalating in tier (every depth beyond MAX_DEPTH still draws 'strong') but
  // per-fight risk doesn't relent either — stacking stratum 1's own gauntlet on
  // top of itself for every subsequent stratum made "bank at gate 1" a dominant
  // line (R14) even after softening the HP/damage depth-slopes, because the
  // danger is per-fight, not cumulative attrition a bigger heal can fix. The
  // deep table leans back toward recovery rooms instead, so push-your-luck
  // stays a real (if still risky) choice deeper in, without touching stratum
  // 1's own tuning. 'elite' is never rolled here — it only ever enters via the
  // forced placement guarantee in makeNextRoom (KTD3), so a stratum never gets
  // more than one.
  const preBoss = depthWithinStratum(depth) === STRATUM_SIZE - 1;
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
 * The mid-stratum window eligible for the forced elite offer (KTD3): excludes a
 * stratum's first room (kept simple/safe) and the chest-heavy pre-boss room. The
 * boss depth itself never reaches here — `makeNextRoom` short-circuits to 'boss'.
 */
export function isEliteEligibleDepth(depth: number): boolean {
  const within = depthWithinStratum(depth);
  return within > 1 && within < STRATUM_SIZE - 1;
}

/**
 * KTD3, scene side: pick which door (if any) gets the forced elite room when
 * priming next-room options. Returns null when no elite is due — outside the
 * eligible window, or one was already offered for this stratum. Pure so the
 * Dungeon scene stays rules-free; the caller owns writing the offered flag.
 */
export function chooseForcedEliteDoor(
  rng: GameRng,
  nextDepth: number,
  openDoors: readonly Dir[],
  eliteOfferedForStratum: number | null,
): Dir | null {
  if (openDoors.length === 0) return null;
  if (!isEliteEligibleDepth(nextDepth)) return null;
  if (eliteOfferedForStratum === stratumForDepth(nextDepth)) return null;
  return openDoors[rng.between(0, openDoors.length - 1)] ?? null;
}

/** Cells directly inside each door, kept trap-free for fairness. */
const DOOR_ENTRY_CELL: Record<Dir, { col: number; row: number }> = {
  N: { col: 7, row: 1 },
  S: { col: 7, row: ROOM_ROWS - 2 },
  W: { col: 1, row: 5 },
  E: { col: ROOM_COLS - 2, row: 5 },
};

function rollSpikes(rng: GameRng, entry: Dir): { col: number; row: number }[] {
  const spikes: { col: number; row: number }[] = [];
  const midCol = Math.floor(ROOM_COLS / 2);
  const midRow = Math.floor(ROOM_ROWS / 2);

  // Cells that must stay trap-free: just inside every door, plus one
  // extra tile of breathing room behind the player's spawn point.
  const fair = new Set<string>();
  for (const dir of DIRS) {
    const c = DOOR_ENTRY_CELL[dir];
    fair.add(`${c.col},${c.row}`);
  }
  const spawn = DOOR_ENTRY_CELL[entry];
  fair.add(`${spawn.col - DIR_VEC[entry].x},${spawn.row - DIR_VEC[entry].y}`);

  const has = (col: number, row: number) => spikes.some((s) => s.col === col && s.row === row);

  // Eligible interior cells (existing wall buffer, minus fair cells).
  const eligible: { col: number; row: number }[] = [];
  for (let row = 2; row <= ROOM_ROWS - 3; row++) {
    for (let col = 2; col <= ROOM_COLS - 3; col++) {
      if (fair.has(`${col},${row}`)) continue;
      eligible.push({ col, row });
    }
  }

  // Seed at least one mandatory blocker on the center column.
  const centerColCells = eligible.filter((c) => c.col === midCol);
  if (centerColCells.length > 0) {
    spikes.push(rng.pick(centerColCells));
  }

  // Add 1-2 middle-band blockers to pressure the center lane.
  const midBand = eligible.filter(
    (c) => c.row >= midRow - 1 && c.row <= midRow + 1 && !has(c.col, c.row),
  );
  const extraBlockers = Math.min(midBand.length, rng.between(1, 2));
  for (let i = 0; i < extraBlockers; i++) {
    const remaining = midBand.filter((c) => !has(c.col, c.row));
    if (remaining.length === 0) break;
    spikes.push(rng.pick(remaining));
  }

  // Fill remaining spikes up to the target count.
  const count = rng.between(5, 8);
  while (spikes.length < count) {
    const remaining = eligible.filter((c) => !has(c.col, c.row));
    if (remaining.length === 0) break;
    spikes.push(rng.pick(remaining));
  }

  return spikes;
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
 * which single door (if any) to force and owns the per-stratum "offered" flag —
 * this stays a pure, stateless roll so it remains deterministic in (seed, path).
 */
export function makeNextRoom(
  rng: GameRng,
  depth: number,
  travelDir: Dir,
  forceElite = false,
): RoomData {
  const entry = OPPOSITE[travelDir];
  if (isStratumBoundary(depth)) {
    return { depth, event: 'boss', openDoors: [], blockedDoor: entry, spikes: [], cleared: false };
  }
  const event = forceElite && isEliteEligibleDepth(depth) ? 'elite' : rollRoomEvent(rng, depth);
  return {
    depth,
    event,
    openDoors: DIRS.filter((d) => d !== entry),
    blockedDoor: entry,
    spikes: event === 'trap' ? rollSpikes(rng, entry) : [],
    cleared: false,
  };
}
