import { describe, expect, test } from 'vitest';
import {
  chooseForcedEliteDoor,
  isEliteEligibleDepth,
  makeNextRoom,
  rollRoomEvent,
  type RoomEvent,
} from './rooms';
import { SequenceRng } from '../game/test-rng';
import { BOSS_ROOM_INTERVAL, OPPOSITE, ROOM_COLS, ROOM_ROWS, TRAP_MIN_SPIKES } from '../config';
import { hasSafeTrapRoute, isLaneDriftTrap, trapFairCells, trapSweptCells } from './traps';

describe('room generation', () => {
  test('rooms 2 through 8 use the roguelike-hard event thresholds without empty rooms', () => {
    // First-decade table (U12): encounter 50, chest 24, potion 10, rest 8, trap 8.
    expect(rollRoomEvent(new SequenceRng([0.49]), 5)).toBe('encounter');
    expect(rollRoomEvent(new SequenceRng([0.5]), 5)).toBe('chest');
    expect(rollRoomEvent(new SequenceRng([0.73]), 5)).toBe('chest');
    expect(rollRoomEvent(new SequenceRng([0.74]), 5)).toBe('potion');
    expect(rollRoomEvent(new SequenceRng([0.83]), 5)).toBe('potion');
    expect(rollRoomEvent(new SequenceRng([0.84]), 5)).toBe('rest');
    expect(rollRoomEvent(new SequenceRng([0.91]), 5)).toBe('rest');
    expect(rollRoomEvent(new SequenceRng([0.92]), 5)).toBe('trap');
  });

  test('room 9 is biased toward rewards before the boss', () => {
    // First-decade pre-boss table (U12): encounter 30, chest 34, potion 18, rest 6, trap 12.
    expect(rollRoomEvent(new SequenceRng([0.29]), 9)).toBe('encounter');
    expect(rollRoomEvent(new SequenceRng([0.3]), 9)).toBe('chest');
    expect(rollRoomEvent(new SequenceRng([0.63]), 9)).toBe('chest');
    expect(rollRoomEvent(new SequenceRng([0.64]), 9)).toBe('potion');
    expect(rollRoomEvent(new SequenceRng([0.81]), 9)).toBe('potion');
    expect(rollRoomEvent(new SequenceRng([0.82]), 9)).toBe('rest');
    expect(rollRoomEvent(new SequenceRng([0.87]), 9)).toBe('rest');
    expect(rollRoomEvent(new SequenceRng([0.88]), 9)).toBe('trap');
  });

  test('room 10 always becomes the boss room', () => {
    const room = makeNextRoom(new SequenceRng([0]), 10, 'N');

    expect(room.event).toBe('boss');
    expect(room.openDoors).toEqual([]);
    expect(room.blockedDoor).toBe('S');
  });

  test('the boss repeats at every decade boundary past depth 10', () => {
    for (const depth of [20, 30]) {
      const room = makeNextRoom(new SequenceRng([0]), depth, 'N');
      expect(room.event).toBe('boss');
      expect(room.openDoors).toEqual([]);
    }
  });

  test('depths between decade boundaries roll normal events', () => {
    for (const depth of [11, 15, 19, 21]) {
      const room = makeNextRoom(new SequenceRng([0]), depth, 'N');
      expect(room.event).not.toBe('boss');
      expect(room.openDoors.length).toBeGreaterThan(0);
    }
  });

  test('the deep pre-boss table repeats every decade past the first (depth 19 == depth 29)', () => {
    // Deep pre-boss table (past MAX_DEPTH): encounter 26, chest 30, potion 18, rest 14, trap 12.
    // Still a touch softer than the first decade's own pre-boss table so decade 2 doesn't stack
    // that difficulty on top of itself, but no longer the recovery lane it used to be.
    expect(rollRoomEvent(new SequenceRng([0.13]), 19)).toBe('encounter');
    expect(rollRoomEvent(new SequenceRng([0.13]), 29)).toBe('encounter');
    expect(rollRoomEvent(new SequenceRng([0.3]), 19)).toBe('chest');
    expect(rollRoomEvent(new SequenceRng([0.3]), 29)).toBe('chest');
    // The first decade's own pre-boss table (depth 9) is not deep — chest doesn't start until 0.30.
    expect(rollRoomEvent(new SequenceRng([0.28]), 9)).toBe('encounter');
    expect(rollRoomEvent(new SequenceRng([0.28]), 19)).toBe('chest');
  });

  test('the deep table keeps a real encounter share and a bounded recovery share', () => {
    // The old endless-descent values ran 24% encounter against 44% potion+rest, so the back half
    // healed off attrition faster than the fights applied it. Deep rooms stay MORE forgiving than
    // shallow ones — a 90-room descent needs an out, and the survival harness confirms mid-tier
    // loadouts wall without one — but the lane is narrower and fights are back to a real share.
    const share = (depth: number, events: RoomEvent[]) => {
      let hits = 0;
      const samples = 400;
      for (let i = 0; i < samples; i++) {
        if (events.includes(rollRoomEvent(new SequenceRng([i / samples]), depth))) hits++;
      }
      return hits / samples;
    };

    const recovery: RoomEvent[] = ['potion', 'rest'];
    const shallowRecovery = share(5, recovery);
    const deepRecovery = share(42, recovery);

    expect(deepRecovery).toBeGreaterThan(shallowRecovery); // long runs still need an out
    expect(deepRecovery).toBeLessThanOrEqual(0.4); // but never back to the 44% recovery lane
    expect(share(42, ['encounter'])).toBeGreaterThanOrEqual(0.28); // was 24%
  });
});

describe('elite room placement (KTD3)', () => {
  test("isEliteEligibleDepth excludes each decade's start room, the pre-boss room, and the boss depth", () => {
    expect(isEliteEligibleDepth(1)).toBe(false); // decade 1 start
    expect(isEliteEligibleDepth(2)).toBe(true);
    expect(isEliteEligibleDepth(8)).toBe(true);
    expect(isEliteEligibleDepth(9)).toBe(false); // pre-boss
    expect(isEliteEligibleDepth(10)).toBe(false); // boss
    expect(isEliteEligibleDepth(11)).toBe(false); // decade 2 start
    expect(isEliteEligibleDepth(18)).toBe(true);
    expect(isEliteEligibleDepth(19)).toBe(false); // decade 2 pre-boss
  });

  test('forceElite places an elite room inside the eligible window, regardless of the roll', () => {
    for (const depth of [2, 5, 8]) {
      const room = makeNextRoom(new SequenceRng([0]), depth, 'N', true);
      expect(room.event).toBe('elite');
      expect(room.spikes).toEqual([]);
    }
  });

  test('forceElite is ignored outside the eligible window — never in the start, pre-boss, or boss slot', () => {
    // Decade start: falls back to the normal roll (r=0 -> encounter in the standard table).
    expect(makeNextRoom(new SequenceRng([0]), 11, 'N', true).event).toBe('encounter');
    // Pre-boss: falls back to the pre-boss table (r=0 -> encounter there too).
    expect(makeNextRoom(new SequenceRng([0]), 9, 'N', true).event).toBe('encounter');
    // Boss depth short-circuits before forceElite is even consulted.
    expect(makeNextRoom(new SequenceRng([0]), 10, 'N', true).event).toBe('boss');
  });

  test('without forceElite, the weighted roll never produces elite on its own', () => {
    for (let i = 0; i < 100; i++) {
      expect(rollRoomEvent(new SequenceRng([i / 100]), 5)).not.toBe('elite');
      expect(rollRoomEvent(new SequenceRng([i / 100]), 9)).not.toBe('elite');
    }
  });

  test('same seed and path produce identical room sequences (Daily Descent determinism)', () => {
    const buildPath = () => {
      const rng = new SequenceRng([0.1, 0.4, 0.7, 0.2, 0.9]);
      return [2, 3, 4, 5, 6].map((depth) => makeNextRoom(rng, depth, 'N').event);
    };
    expect(buildPath()).toEqual(buildPath());
  });
});

describe('chooseForcedEliteDoor (KTD3, scene side)', () => {
  const doors: ['N', 'S', 'E'] = ['N', 'S', 'E'];

  test('returns null when an elite was already offered for this decade', () => {
    // depth 5 is within decade 0 and eligible; decade 0 already got its offer.
    expect(chooseForcedEliteDoor(new SequenceRng([], [0]), 5, doors, 0)).toBeNull();
  });

  test('returns null outside the eligible window (decade start and pre-boss)', () => {
    expect(chooseForcedEliteDoor(new SequenceRng([], [0]), 1, doors, null)).toBeNull(); // decade 0 start
    expect(chooseForcedEliteDoor(new SequenceRng([], [0]), 11, doors, null)).toBeNull(); // decade 1 start
    expect(
      chooseForcedEliteDoor(new SequenceRng([], [0]), BOSS_ROOM_INTERVAL - 1, doors, null),
    ).toBeNull(); // pre-boss
  });

  test('returns an entry from openDoors when due', () => {
    const door = chooseForcedEliteDoor(new SequenceRng([], [1]), 5, doors, null);
    expect(door).not.toBeNull();
    expect(doors).toContain(door);

    // A previous decade's offer does not block the current decade.
    const doorNextDecade = chooseForcedEliteDoor(new SequenceRng([], [0]), 15, doors, 0);
    expect(doorNextDecade).not.toBeNull();
    expect(doors).toContain(doorNextDecade);
  });

  test('is deterministic for a given (rng sequence, inputs)', () => {
    const first = chooseForcedEliteDoor(new SequenceRng([], [2]), 5, doors, null);
    const second = chooseForcedEliteDoor(new SequenceRng([], [2]), 5, doors, null);
    expect(first).toBe(second);
    expect(first).toBe('E');
  });

  test('composes with makeNextRoom: the chosen door produces an elite room', () => {
    const door = chooseForcedEliteDoor(new SequenceRng([], [1]), 5, doors, null);
    expect(door).not.toBeNull();
    const room = makeNextRoom(new SequenceRng([0]), 5, door as 'N' | 'S' | 'E', true);
    expect(room.event).toBe('elite');
  });
});

describe('trap room spike placement', () => {
  for (const dir of ['N', 'E', 'S', 'W'] as const) {
    test(`entering from ${dir} produces fair, challenging moving spikes`, () => {
      const rng = new SequenceRng(
        [0.95, 0.5, 0.3, 0.7, 0.1, 0.9, 0.4, 0.6, 0.2, 0.8, 0.35, 0.65, 0.45, 0.55],
        [1, 6],
      );
      const room = makeNextRoom(rng, 5, dir);
      const entry = OPPOSITE[dir];
      const fair = new Set(trapFairCells(entry).map((cell) => `${cell.col},${cell.row}`));

      expect(room.event).toBe('trap');
      expect(room.spikes.length).toBeGreaterThanOrEqual(TRAP_MIN_SPIKES);
      expect(room.spikes.filter(isLaneDriftTrap).length).toBeGreaterThan(room.spikes.length / 2);

      // No spike starts or sweeps through door-entry or spawn breathing-room cells.
      for (const s of room.spikes) {
        for (const swept of trapSweptCells(s)) {
          expect(fair).not.toContain(`${swept.col},${swept.row}`);
        }
      }

      // At least one spike blocks the center column.
      expect(room.spikes.flatMap(trapSweptCells).some((s) => s.col === 7)).toBe(true);
      expect(hasSafeTrapRoute(room.spikes, entry)).toBe(true);

      // All spikes within bounds.
      for (const s of room.spikes.flatMap(trapSweptCells)) {
        expect(s.col).toBeGreaterThanOrEqual(1);
        expect(s.col).toBeLessThanOrEqual(ROOM_COLS - 2);
        expect(s.row).toBeGreaterThanOrEqual(1);
        expect(s.row).toBeLessThanOrEqual(ROOM_ROWS - 2);
      }

      // All spike starting cells are unique.
      const keys = room.spikes.map((s) => `${s.col},${s.row}`);
      expect(new Set(keys).size).toBe(keys.length);
    });
  }

  test('denser spike layout still satisfies fairness rules', () => {
    const rng = new SequenceRng(
      [0.96, 0.3, 0.8, 0.15, 0.6, 0.4, 0.9, 0.2, 0.7, 0.5, 0.1, 0.85, 0.35, 0.65, 0.25, 0.75],
      [2, 8],
    );
    const room = makeNextRoom(rng, 5, 'N');
    const entry = OPPOSITE.N;
    const fair = new Set(trapFairCells(entry).map((cell) => `${cell.col},${cell.row}`));

    expect(room.event).toBe('trap');
    expect(room.spikes.length).toBeGreaterThanOrEqual(TRAP_MIN_SPIKES);
    expect(room.spikes.filter(isLaneDriftTrap).length).toBeGreaterThan(room.spikes.length / 2);

    for (const s of room.spikes) {
      for (const swept of trapSweptCells(s)) {
        expect(fair).not.toContain(`${swept.col},${swept.row}`);
      }
    }

    expect(room.spikes.flatMap(trapSweptCells).some((s) => s.col === 7)).toBe(true);
    expect(hasSafeTrapRoute(room.spikes, entry)).toBe(true);

    for (const s of room.spikes.flatMap(trapSweptCells)) {
      expect(s.col).toBeGreaterThanOrEqual(1);
      expect(s.col).toBeLessThanOrEqual(ROOM_COLS - 2);
      expect(s.row).toBeGreaterThanOrEqual(1);
      expect(s.row).toBeLessThanOrEqual(ROOM_ROWS - 2);
    }

    const keys = room.spikes.map((s) => `${s.col},${s.row}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('rest rooms have no spikes and block only the entry door', () => {
    const room = makeNextRoom(new SequenceRng([0.85]), 5, 'N');

    expect(room.event).toBe('rest');
    expect(room.spikes).toEqual([]);
    expect(room.blockedDoor).toBe('S');
  });
});
