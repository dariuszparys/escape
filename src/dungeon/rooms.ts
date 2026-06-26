import { Dir, DIRS, MAX_DEPTH, OPPOSITE, ROOM_COLS, ROOM_ROWS } from '../config';
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

function rollSpikes(rng: GameRng): { col: number; row: number }[] {
  const spikes: { col: number; row: number }[] = [];
  const count = rng.between(5, 8);
  const midCol = Math.floor(ROOM_COLS / 2);
  const midRow = Math.floor(ROOM_ROWS / 2);
  for (let i = 0; i < count; i++) {
    const col = rng.between(2, ROOM_COLS - 3);
    const row = rng.between(2, ROOM_ROWS - 3);
    // Keep the door corridors walkable so traps are avoidable.
    if (col === midCol || row === midRow) continue;
    if (spikes.some((s) => s.col === col && s.row === row)) continue;
    spikes.push({ col, row });
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
    spikes: event === 'trap' ? rollSpikes(rng) : [],
    cleared: false,
  };
}
