import { describe, expect, test } from 'vitest';
import { makeNextRoom, rollRoomEvent } from './rooms';
import { SequenceRng } from '../game/test-rng';
import { ROOM_COLS, ROOM_ROWS } from '../config';

describe('room generation', () => {
  test('rooms 2 through 8 use the MVP event thresholds without empty rooms', () => {
    expect(rollRoomEvent(new SequenceRng([0.31]), 5)).toBe('encounter');
    expect(rollRoomEvent(new SequenceRng([0.32]), 5)).toBe('chest');
    expect(rollRoomEvent(new SequenceRng([0.58]), 5)).toBe('chest');
    expect(rollRoomEvent(new SequenceRng([0.59]), 5)).toBe('potion');
    expect(rollRoomEvent(new SequenceRng([0.79]), 5)).toBe('potion');
    expect(rollRoomEvent(new SequenceRng([0.8]), 5)).toBe('rest');
    expect(rollRoomEvent(new SequenceRng([0.93]), 5)).toBe('rest');
    expect(rollRoomEvent(new SequenceRng([0.94]), 5)).toBe('trap');
  });

  test('room 9 is biased toward rewards before the boss', () => {
    expect(rollRoomEvent(new SequenceRng([0.21]), 9)).toBe('encounter');
    expect(rollRoomEvent(new SequenceRng([0.22]), 9)).toBe('chest');
    expect(rollRoomEvent(new SequenceRng([0.59]), 9)).toBe('chest');
    expect(rollRoomEvent(new SequenceRng([0.6]), 9)).toBe('potion');
    expect(rollRoomEvent(new SequenceRng([0.85]), 9)).toBe('potion');
    expect(rollRoomEvent(new SequenceRng([0.86]), 9)).toBe('rest');
    expect(rollRoomEvent(new SequenceRng([0.93]), 9)).toBe('rest');
    expect(rollRoomEvent(new SequenceRng([0.94]), 9)).toBe('trap');
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

  test('the pre-boss reward table repeats each stratum (depth 19 == depth 9)', () => {
    // chest threshold: encounter 22, then chest fires at 0.22 in the pre-boss table.
    expect(rollRoomEvent(new SequenceRng([0.22]), 19)).toBe('chest');
    expect(rollRoomEvent(new SequenceRng([0.22]), 9)).toBe('chest');
    // In the normal table chest does not start until 0.32, so depth 11 mirrors depth 1.
    expect(rollRoomEvent(new SequenceRng([0.22]), 11)).toBe('encounter');
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
