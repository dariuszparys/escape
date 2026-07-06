import { describe, expect, test } from 'vitest';
import { BOSS_ROOM_INTERVAL, RUN_LENGTH } from '../config';
import { CONTRACT_DEFS } from '../data/contracts';
import { chooseForcedEliteDoor, decadeForDepth, isBossRoom, makeNextRoom } from '../dungeon/rooms';
import { SequenceRng } from './test-rng';
import { simulateRun } from './balanceSimulator';

describe('fixed 100-room run structure (U1)', () => {
  test('the run is 100 rooms with a boss every 10th', () => {
    expect(RUN_LENGTH).toBe(100);
    expect(BOSS_ROOM_INTERVAL).toBe(10);
  });

  test('a boss guards exactly rooms 10, 20, ..., 100 and nowhere else', () => {
    const bossRooms: number[] = [];
    for (let depth = 1; depth <= RUN_LENGTH; depth++) {
      if (isBossRoom(depth)) bossRooms.push(depth);
    }
    expect(bossRooms).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    // A couple of non-boss neighbours, including the first and last non-boss rooms.
    for (const depth of [1, 9, 11, 19, 91, 99]) {
      expect(isBossRoom(depth)).toBe(false);
    }
  });

  test('makeNextRoom seals a boss room at every boss depth and opens doors between them', () => {
    for (let depth = BOSS_ROOM_INTERVAL; depth <= RUN_LENGTH; depth += BOSS_ROOM_INTERVAL) {
      const room = makeNextRoom(new SequenceRng([0]), depth, 'N');
      expect(room.event).toBe('boss');
      expect(room.openDoors).toEqual([]);
    }
    for (const depth of [11, 45, 99]) {
      const room = makeNextRoom(new SequenceRng([0]), depth, 'N');
      expect(room.event).not.toBe('boss');
      expect(room.openDoors.length).toBeGreaterThan(0);
    }
  });

  test('the room-100 boss is the final room; the room-90 boss is not final', () => {
    expect(isBossRoom(RUN_LENGTH)).toBe(true);
    // The escape terminus fires only at the final boss (scene + sim both gate on depth >= RUN_LENGTH).
    expect(RUN_LENGTH - BOSS_ROOM_INTERVAL).toBe(90);
    expect(isBossRoom(90)).toBe(true);
    expect(90 < RUN_LENGTH).toBe(true);
  });

  test('a bare loadout runs to death, never escaping short of the room-100 boss', () => {
    // The early exit is gone (R2): the only terminus other than death is the room-100 boss (R1). A bare
    // loadout escapes ~never, so every run here dies with a bounded death room, and any victory
    // (should one ever occur) must carry the escape shape — reached the final boss, no death room.
    for (let seed = 1; seed <= 60; seed++) {
      const result = simulateRun(seed, {});
      if (result.victory) {
        expect(result.deathDepth).toBeNull();
        expect(result.reachedBoss).toBe(true);
      } else {
        expect(result.deathDepth).toBeGreaterThanOrEqual(1);
        expect(result.deathDepth).toBeLessThanOrEqual(RUN_LENGTH);
      }
    }
  });

  test('the forced elite is offered at most once per decade and re-offers in the next decade', () => {
    const doors = ['N', 'S', 'E'] as const;
    let offeredDecade: number | null = null;

    const offersIn = (from: number, to: number): number[] => {
      const hits: number[] = [];
      for (let depth = from; depth <= to; depth++) {
        // Fresh rng per call — between() is only consumed when an offer actually fires.
        const door = chooseForcedEliteDoor(new SequenceRng([], [0]), depth, doors, offeredDecade);
        if (door !== null) {
          hits.push(depth);
          offeredDecade = decadeForDepth(depth);
        }
      }
      return hits;
    };

    // Decade 0 eligible window is rooms 2..8; exactly one offer fires, then the flag suppresses the rest.
    expect(offersIn(2, 8)).toEqual([2]);
    // The decade-0 flag does not block decade 1 (rooms 12..18): the guarantee re-offers once.
    expect(offersIn(12, 18)).toEqual([12]);
  });

  test('the retired delve-past-a-gate contract is gone, replaced by a room milestone', () => {
    const ids = CONTRACT_DEFS.map((contract) => contract.id);
    expect(ids).not.toContain('delve_past_first_gate');
    expect(ids).toContain('reach_room_20');
  });
});
