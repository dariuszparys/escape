import { describe, expect, test } from 'vitest';
import {
  DIRS,
  OPPOSITE,
  ROOM_COLS,
  ROOM_ROWS,
  TILE,
  TRAP_HITBOX_H,
  TRAP_HITBOX_W,
  TRAP_MIN_SPIKES,
} from '../config';
import { SequenceRng } from '../game/test-rng';
import type { GameRng } from '../game/rng';
import {
  createTrapDescriptors,
  hasSafeTrapRoute,
  isLaneDriftTrap,
  trapCenterAt,
  trapContactRectAt,
  trapFairCells,
  trapSweptCells,
  type SpikeTrap,
} from './traps';

function key(cell: { col: number; row: number }): string {
  return `${cell.col},${cell.row}`;
}

function rng(): SequenceRng {
  return new SequenceRng([
    0.12, 0.68, 0.31, 0.94, 0.47, 0.05, 0.83, 0.26, 0.74, 0.39, 0.58, 0.17, 0.91, 0.44, 0.63, 0.22,
    0.79, 0.36, 0.52, 0.08,
  ]);
}

class LcgRng implements GameRng {
  constructor(private state: number) {}

  frac(): number {
    this.state = (this.state * 1664525 + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  between(min: number, max: number): number {
    return Math.floor(this.frac() * (max - min + 1)) + min;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Cannot pick from an empty array.');
    return items[Math.min(items.length - 1, Math.floor(this.frac() * items.length))];
  }
}

describe('trap descriptors', () => {
  for (const travelDir of DIRS) {
    test(`new trap rooms entered from ${travelDir} create mostly moving lane hazards with safe entry`, () => {
      const entry = OPPOSITE[travelDir];
      const traps = createTrapDescriptors(rng(), entry);
      const moving = traps.filter(isLaneDriftTrap);
      const fair = new Set(trapFairCells(entry).map(key));

      expect(traps.length).toBeGreaterThanOrEqual(TRAP_MIN_SPIKES);
      expect(moving.length).toBeGreaterThan(traps.length / 2);

      for (const trap of traps) {
        expect(fair).not.toContain(key(trap));
        for (const swept of trapSweptCells(trap)) {
          expect(fair).not.toContain(key(swept));
          expect(swept.col).toBeGreaterThanOrEqual(1);
          expect(swept.col).toBeLessThanOrEqual(ROOM_COLS - 2);
          expect(swept.row).toBeGreaterThanOrEqual(1);
          expect(swept.row).toBeLessThanOrEqual(ROOM_ROWS - 2);
        }
      }

      expect(hasSafeTrapRoute(traps, entry)).toBe(true);
    });
  }

  test('same rng sequence and entry produce identical movement descriptors', () => {
    const build = () => createTrapDescriptors(rng(), 'S');

    expect(build()).toEqual(build());
  });

  test('varied seeds keep moving-majority and safe-route guarantees', () => {
    for (const entry of DIRS) {
      for (let seed = 1; seed <= 40; seed += 1) {
        const traps = createTrapDescriptors(new LcgRng(seed * 97), entry);

        expect(traps.filter(isLaneDriftTrap).length).toBeGreaterThan(traps.length / 2);
        expect(hasSafeTrapRoute(traps, entry)).toBe(true);
      }
    }
  });

  test('movement descriptors are lane drift only and keep pressure near the center lane', () => {
    const traps = createTrapDescriptors(rng(), 'S');
    const moving = traps.filter(isLaneDriftTrap);
    const midCol = Math.floor(ROOM_COLS / 2);

    expect(moving.length).toBeGreaterThan(traps.length / 2);
    expect(moving.every((trap) => trap.motion.kind === 'lane' && trap.motion.periodMs > 0)).toBe(
      true,
    );
    expect(traps.flatMap(trapSweptCells).some((cell) => cell.col === midCol)).toBe(true);
    expect(hasSafeTrapRoute(traps, 'S')).toBe(true);
  });

  test('motion evaluation returns current lane position and contact rectangle', () => {
    const trap: SpikeTrap = {
      col: 4,
      row: 4,
      motion: {
        kind: 'lane',
        axis: 'x',
        from: { col: 4, row: 4 },
        to: { col: 5, row: 4 },
        periodMs: 2000,
        phaseMs: 0,
      },
    };

    expect(trapCenterAt(trap, 0)).toEqual({ x: 4.5 * TILE, y: 4.5 * TILE });
    expect(trapCenterAt(trap, 500)).toEqual({ x: 5 * TILE, y: 4.5 * TILE });
    expect(trapCenterAt(trap, 1000)).toEqual({ x: 5.5 * TILE, y: 4.5 * TILE });
    expect(trapCenterAt(trap, 1500)).toEqual({ x: 5 * TILE, y: 4.5 * TILE });
    expect(trapCenterAt(trap, 2000)).toEqual({ x: 4.5 * TILE, y: 4.5 * TILE });

    expect(trapContactRectAt(trap, 1000)).toMatchObject({
      x: 5.5 * TILE - TRAP_HITBOX_W / 2,
      width: TRAP_HITBOX_W,
      height: TRAP_HITBOX_H,
    });
  });

  test('static-compatible legacy descriptors evaluate to their base cell', () => {
    const trap: SpikeTrap = { col: 6, row: 3 };

    expect(trapCenterAt(trap, 1600)).toEqual({ x: 6.5 * TILE, y: 3.5 * TILE });
    expect(trapContactRectAt(trap, 1600)).toMatchObject({
      x: 6.5 * TILE - TRAP_HITBOX_W / 2,
      width: TRAP_HITBOX_W,
      height: TRAP_HITBOX_H,
    });
  });
});
