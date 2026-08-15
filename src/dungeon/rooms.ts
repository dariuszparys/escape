import { BOSS_ROOM_INTERVAL, Dir, DIRS, MAX_DEPTH, OPPOSITE, RUN_LENGTH } from '../config';
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

/**
 * Player-facing chapter for each decade. HUD uses `name`; the campfire/death
 * goal uses `gateName` so the first summit reads as "the First Gate" rather
 * than "the Gate Halls gate".
 */
export interface DecadeChapter {
  name: string;
  gateName: string;
}

export const DECADE_CHAPTERS: readonly DecadeChapter[] = [
  { name: 'Gate Halls', gateName: 'the First Gate' },
  { name: 'Drowned Crypt', gateName: 'the Drowned Crypt' },
  { name: 'Ash Warrens', gateName: 'the Ash Warrens' },
  { name: 'Iron Vaults', gateName: 'the Iron Vaults' },
  { name: 'Bone Choir', gateName: 'the Bone Choir' },
  { name: 'Ember Court', gateName: 'the Ember Court' },
  { name: 'Hungering Dark', gateName: 'the Hungering Dark' },
  { name: 'False Sanctum', gateName: 'the False Sanctum' },
  { name: 'Last Descent', gateName: 'the Last Descent' },
  { name: 'Threshold', gateName: 'the Threshold' },
];

export function chapterForDepth(depth: number): DecadeChapter {
  const decade = decadeForDepth(depth);
  return (
    DECADE_CHAPTERS[Math.min(Math.max(0, decade), DECADE_CHAPTERS.length - 1)] ?? DECADE_CHAPTERS[0]
  );
}

/** Compact HUD readout: chapter name, then progress toward that decade's boss. */
export function formatHudChapterText(depth: number): string {
  const chapter = chapterForDepth(depth);
  return `${chapter.name}\n${roomWithinDecade(depth)}/${BOSS_ROOM_INTERVAL}`;
}

export const ROOM_EVENT_LABEL: Record<RoomEvent, string> = {
  start: 'camp',
  encounter: 'enemy',
  chest: 'chest',
  potion: 'potion',
  rest: 'rest',
  trap: 'trap',
  boss: 'boss',
  elite: 'elite',
};

/** Next boss room the player has not yet reached, or the escape room once they have. */
export function nextGateRoom(personalBestRoom: number): number {
  if (personalBestRoom >= RUN_LENGTH) return RUN_LENGTH;
  const reached = Math.max(0, Math.floor(personalBestRoom));
  return Math.min(RUN_LENGTH, Math.ceil((reached + 1) / BOSS_ROOM_INTERVAL) * BOSS_ROOM_INTERVAL);
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
  // against the roguelike-hard band (U12).
  //
  // Past the first decade (`deep`) the encounter roster stops escalating in tier
  // (every depth beyond MAX_DEPTH still draws 'strong'), so the deep tables carry
  // the back half's escalation themselves. They used to do the opposite: the old
  // endless-descent values ran 22% potion + 22% rest against the shallow table's
  // 10% + 8%, making rooms 11-100 a recovery lane.
  //
  // The correction here is deliberately MODEST — deep recovery 44% -> 40%, encounters
  // 24% -> 29%. Deep rooms stay clearly more generous than shallow ones because a
  // 90-room descent genuinely needs an out: the survival harness walls the mid-tier
  // loadout and the block-less Lost Left Arm scenario out of their bands well before
  // deep recovery reaches shallow levels. This is the largest cut those two survive,
  // not the cut the encounter mix would ideally want.
  //
  // 'elite' is never rolled here — it only ever enters via the forced placement
  // guarantee in makeNextRoom (KTD3), so a decade never gets more than one.
  const preBoss = roomWithinDecade(depth) === BOSS_ROOM_INTERVAL - 1;
  const deep = depth > MAX_DEPTH;
  const table: [RoomEvent, number][] = preBoss
    ? deep
      ? [
          ['encounter', 22],
          ['chest', 28],
          ['potion', 22],
          ['rest', 20],
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
          ['encounter', 29],
          ['chest', 23],
          ['potion', 21],
          ['rest', 19],
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
