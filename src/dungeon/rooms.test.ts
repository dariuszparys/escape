import { describe, expect, test } from 'vitest';
import { isEliteEligibleDepth, makeNextRoom, rollRoomEvent } from './rooms';
import { SequenceRng } from '../game/test-rng';
import { ROOM_COLS, ROOM_ROWS } from '../config';

describe('room generation', () => {
  test('rooms 2 through 8 use the roguelike-hard event thresholds without empty rooms', () => {
    // Stratum-1 table (U12): encounter 50, chest 24, potion 10, rest 8, trap 8.
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
    // Stratum-1 pre-boss table (U12): encounter 30, chest 34, potion 18, rest 6, trap 12.
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

  test('the boss re-gates at every stratum boundary past depth 10', () => {
    for (const depth of [20, 30]) {
      const room = makeNextRoom(new SequenceRng([0]), depth, 'N');
      expect(room.event).toBe('boss');
      expect(room.openDoors).toEqual([]);
    }
  });

  test('depths between stratum boundaries roll normal events', () => {
    for (const depth of [11, 15, 19, 21]) {
      const room = makeNextRoom(new SequenceRng([0]), depth, 'N');
      expect(room.event).not.toBe('boss');
      expect(room.openDoors.length).toBeGreaterThan(0);
    }
  });

  test('the deep pre-boss table repeats every stratum past the first (depth 19 == depth 29), and is easier than stratum 1s (U12)', () => {
    // Deep pre-boss table (past MAX_DEPTH): encounter 14, chest 28, potion 26, rest 24, trap 8 —
    // softer than stratum 1's own pre-boss table, so a second stratum's gauntlet doesn't stack
    // stratum 1's difficulty on top of itself (R14: kept "bank at gate 1" from dominating).
    expect(rollRoomEvent(new SequenceRng([0.13]), 19)).toBe('encounter');
    expect(rollRoomEvent(new SequenceRng([0.13]), 29)).toBe('encounter');
    expect(rollRoomEvent(new SequenceRng([0.15]), 19)).toBe('chest');
    expect(rollRoomEvent(new SequenceRng([0.15]), 29)).toBe('chest');
    // Stratum 1's own pre-boss table (depth 9) is not deep — chest doesn't start until 0.30.
    expect(rollRoomEvent(new SequenceRng([0.15]), 9)).toBe('encounter');
  });
});

describe('elite room placement (KTD3)', () => {
  test("isEliteEligibleDepth excludes each stratum's start room, the pre-boss room, and the boss depth", () => {
    expect(isEliteEligibleDepth(1)).toBe(false); // stratum 1 start
    expect(isEliteEligibleDepth(2)).toBe(true);
    expect(isEliteEligibleDepth(8)).toBe(true);
    expect(isEliteEligibleDepth(9)).toBe(false); // pre-boss
    expect(isEliteEligibleDepth(10)).toBe(false); // boss
    expect(isEliteEligibleDepth(11)).toBe(false); // stratum 2 start
    expect(isEliteEligibleDepth(18)).toBe(true);
    expect(isEliteEligibleDepth(19)).toBe(false); // stratum 2 pre-boss
  });

  test('forceElite places an elite room inside the eligible window, regardless of the roll', () => {
    for (const depth of [2, 5, 8]) {
      const room = makeNextRoom(new SequenceRng([0]), depth, 'N', true);
      expect(room.event).toBe('elite');
      expect(room.spikes).toEqual([]);
    }
  });

  test('forceElite is ignored outside the eligible window — never in the start, pre-boss, or boss slot', () => {
    // Stratum start: falls back to the normal roll (r=0 -> encounter in the standard table).
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

describe('trap room spike placement', () => {
  const fairCells = ['7,1', '7,9', '1,5', '13,5'];

  // One-tile breathing room behind the player's spawn, keyed by travelDir.
  const behindCell: Record<string, { col: number; row: number }> = {
    N: { col: 7, row: 8 },
    S: { col: 7, row: 2 },
    E: { col: 2, row: 5 },
    W: { col: 12, row: 5 },
  };

  for (const dir of ['N', 'E', 'S', 'W'] as const) {
    test(`entering from ${dir} produces fair, challenging spikes`, () => {
      const rng = new SequenceRng(
        [0.95, 0.5, 0.3, 0.7, 0.1, 0.9, 0.4, 0.6, 0.2, 0.8, 0.35, 0.65, 0.45, 0.55],
        [1, 6],
      );
      const room = makeNextRoom(rng, 5, dir);

      expect(room.event).toBe('trap');
      expect(room.spikes.length).toBeGreaterThanOrEqual(5);

      // No spike directly in front of any door.
      for (const s of room.spikes) {
        expect(fairCells).not.toContain(`${s.col},${s.row}`);
      }

      // No spike on the spawn breathing-room cell.
      expect(room.spikes).not.toContainEqual(behindCell[dir]);

      // At least one spike blocks the center column.
      expect(room.spikes.some((s) => s.col === 7)).toBe(true);

      // All spikes within bounds.
      for (const s of room.spikes) {
        expect(s.col).toBeGreaterThanOrEqual(2);
        expect(s.col).toBeLessThanOrEqual(ROOM_COLS - 3);
        expect(s.row).toBeGreaterThanOrEqual(2);
        expect(s.row).toBeLessThanOrEqual(ROOM_ROWS - 3);
      }

      // All spikes unique.
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

    expect(room.event).toBe('trap');
    expect(room.spikes.length).toBeGreaterThanOrEqual(5);

    for (const s of room.spikes) {
      expect(fairCells).not.toContain(`${s.col},${s.row}`);
    }

    expect(room.spikes).not.toContainEqual(behindCell.N);
    expect(room.spikes.some((s) => s.col === 7)).toBe(true);

    for (const s of room.spikes) {
      expect(s.col).toBeGreaterThanOrEqual(2);
      expect(s.col).toBeLessThanOrEqual(ROOM_COLS - 3);
      expect(s.row).toBeGreaterThanOrEqual(2);
      expect(s.row).toBeLessThanOrEqual(ROOM_ROWS - 3);
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
