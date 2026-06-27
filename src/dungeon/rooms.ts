import { Dir, DIRS, DIR_VEC, MAX_DEPTH, OPPOSITE, ROOM_COLS, ROOM_ROWS } from '../config';
import { GameRng } from '../game/rng';

export type RoomEvent = 'start' | 'encounter' | 'chest' | 'potion' | 'trap' | 'boss';

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
  const table: [RoomEvent, number][] =
    depth === MAX_DEPTH - 1
      ? [
          ['encounter', 25],
          ['chest', 40],
          ['potion', 30],
          ['trap', 5],
        ]
      : [
          ['encounter', 35],
          ['chest', 30],
          ['potion', 25],
          ['trap', 10],
        ];

  let r = rng.frac() * 100;
  for (const [event, w] of table) {
    if (r < w) return event;
    r -= w;
  }
  return 'trap';
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

/** Build the room behind a door. Entered moving `travelDir`, so the door at OPPOSITE(travelDir) is blocked. */
export function makeNextRoom(rng: GameRng, depth: number, travelDir: Dir): RoomData {
  const entry = OPPOSITE[travelDir];
  if (depth >= MAX_DEPTH) {
    return { depth, event: 'boss', openDoors: [], blockedDoor: entry, spikes: [], cleared: false };
  }
  const event = rollRoomEvent(rng, depth);
  return {
    depth,
    event,
    openDoors: DIRS.filter((d) => d !== entry),
    blockedDoor: entry,
    spikes: event === 'trap' ? rollSpikes(rng, entry) : [],
    cleared: false,
  };
}
