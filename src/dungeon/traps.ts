import {
  Dir,
  DIR_VEC,
  DIRS,
  ROOM_COLS,
  ROOM_ROWS,
  TILE,
  TRAP_HITBOX_H,
  TRAP_HITBOX_TOP_OFFSET,
  TRAP_HITBOX_W,
  TRAP_LANE_DISTANCE_TILES,
  TRAP_LANE_PERIOD_MS,
  TRAP_MAX_SPIKES,
  TRAP_MIN_SPIKES,
} from '../config';
import type { GameRng } from '../game/rng';

export interface TrapCell {
  col: number;
  row: number;
}

export interface TrapLaneMotion {
  kind: 'lane';
  axis: 'x' | 'y';
  from: TrapCell;
  to: TrapCell;
  periodMs: number;
  phaseMs: number;
}

export interface SpikeTrap extends TrapCell {
  motion?: TrapLaneMotion;
}

export type LaneDriftSpikeTrap = SpikeTrap & { motion: TrapLaneMotion };

export interface TrapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TrapCenter {
  x: number;
  y: number;
}

/** Cells directly inside each door, kept trap-free for fairness. */
export const DOOR_ENTRY_CELL: Record<Dir, TrapCell> = {
  N: { col: 7, row: 1 },
  S: { col: 7, row: ROOM_ROWS - 2 },
  W: { col: 1, row: 5 },
  E: { col: ROOM_COLS - 2, row: 5 },
};

function cellKey(cell: TrapCell): string {
  return `${cell.col},${cell.row}`;
}

function uniqueCells(cells: TrapCell[]): TrapCell[] {
  const seen = new Set<string>();
  const unique: TrapCell[] = [];
  for (const cell of cells) {
    const key = cellKey(cell);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(cell);
  }
  return unique;
}

function isWalkableCell(cell: TrapCell): boolean {
  return cell.col >= 1 && cell.col <= ROOM_COLS - 2 && cell.row >= 1 && cell.row <= ROOM_ROWS - 2;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeTrapCell(value: unknown): TrapCell | null {
  if (!isRecord(value)) return null;
  if (typeof value.col !== 'number' || !Number.isFinite(value.col)) return null;
  if (typeof value.row !== 'number' || !Number.isFinite(value.row)) return null;
  const cell = { col: Math.floor(value.col), row: Math.floor(value.row) };
  return isWalkableCell(cell) ? cell : null;
}

export function isLaneDriftTrap(trap: SpikeTrap): trap is LaneDriftSpikeTrap {
  return trap.motion?.kind === 'lane';
}

export function trapFairCells(entry: Dir): TrapCell[] {
  const cells = DIRS.map((dir) => DOOR_ENTRY_CELL[dir]);
  const spawn = DOOR_ENTRY_CELL[entry];
  cells.push({ col: spawn.col - DIR_VEC[entry].x, row: spawn.row - DIR_VEC[entry].y });
  return uniqueCells(cells);
}

export function trapSweptCells(trap: SpikeTrap): TrapCell[] {
  if (!isLaneDriftTrap(trap)) return [{ col: trap.col, row: trap.row }];

  const cells: TrapCell[] = [];
  const from = trap.motion.from;
  const to = trap.motion.to;
  const stepCol = Math.sign(to.col - from.col);
  const stepRow = Math.sign(to.row - from.row);
  let col = from.col;
  let row = from.row;
  cells.push({ col, row });
  while (col !== to.col || row !== to.row) {
    col += stepCol;
    row += stepRow;
    cells.push({ col, row });
  }
  return cells;
}

function eligibleTrapCells(fair: Set<string>): TrapCell[] {
  const cells: TrapCell[] = [];
  for (let row = 1; row <= ROOM_ROWS - 2; row++) {
    for (let col = 1; col <= ROOM_COLS - 2; col++) {
      const cell = { col, row };
      if (fair.has(cellKey(cell))) continue;
      cells.push(cell);
    }
  }
  return cells;
}

function blockedCells(traps: readonly SpikeTrap[]): Set<string> {
  return new Set(traps.flatMap(trapSweptCells).map(cellKey));
}

export function hasSafeTrapRoute(traps: readonly SpikeTrap[], entry: Dir): boolean {
  const blocked = blockedCells(traps);
  const start = DOOR_ENTRY_CELL[entry];
  if (blocked.has(cellKey(start))) return false;

  const targets = new Set(
    DIRS.filter((dir) => dir !== entry)
      .map((dir) => DOOR_ENTRY_CELL[dir])
      .filter((cell) => !blocked.has(cellKey(cell)))
      .map(cellKey),
  );
  if (targets.size === 0) return false;

  const queue: TrapCell[] = [start];
  const seen = new Set<string>([cellKey(start)]);
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i];
    if (targets.has(cellKey(cell))) return true;
    for (const dir of DIRS) {
      const next = { col: cell.col + DIR_VEC[dir].x, row: cell.row + DIR_VEC[dir].y };
      const key = cellKey(next);
      if (!isWalkableCell(next) || blocked.has(key) || seen.has(key)) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return false;
}

function laneOptions(base: TrapCell, occupied: Set<string>, fair: Set<string>): TrapCell[] {
  return DIRS.map((dir) => ({
    col: base.col + DIR_VEC[dir].x * TRAP_LANE_DISTANCE_TILES,
    row: base.row + DIR_VEC[dir].y * TRAP_LANE_DISTANCE_TILES,
  })).filter((target) => {
    const key = cellKey(target);
    return isWalkableCell(target) && !occupied.has(key) && !fair.has(key);
  });
}

function makeLaneTrap(
  rng: GameRng,
  base: TrapCell,
  occupied: Set<string>,
  fair: Set<string>,
): SpikeTrap | null {
  const options = laneOptions(base, occupied, fair);
  if (options.length === 0) return null;
  const target = rng.pick(options);
  return {
    col: base.col,
    row: base.row,
    motion: {
      kind: 'lane',
      axis: target.col === base.col ? 'y' : 'x',
      from: { col: base.col, row: base.row },
      to: target,
      periodMs: TRAP_LANE_PERIOD_MS,
      phaseMs: rng.between(0, TRAP_LANE_PERIOD_MS - 1),
    },
  };
}

function addTrapFromPool(
  rng: GameRng,
  traps: SpikeTrap[],
  pool: readonly TrapCell[],
  entry: Dir,
  fair: Set<string>,
): boolean {
  const occupied = blockedCells(traps);
  const remaining = pool.filter((cell) => !occupied.has(cellKey(cell)) && !fair.has(cellKey(cell)));
  while (remaining.length > 0) {
    const base = rng.pick(remaining);
    remaining.splice(
      remaining.findIndex((cell) => cell.col === base.col && cell.row === base.row),
      1,
    );

    const laneTrap = makeLaneTrap(rng, base, occupied, fair);
    const candidates: SpikeTrap[] = laneTrap
      ? [laneTrap, { col: base.col, row: base.row }]
      : [{ col: base.col, row: base.row }];
    for (const candidate of candidates) {
      const next = [...traps, candidate];
      if (!hasSafeTrapRoute(next, entry)) continue;
      traps.push(candidate);
      return true;
    }
  }
  return false;
}

export function createTrapDescriptors(rng: GameRng, entry: Dir): SpikeTrap[] {
  const traps: SpikeTrap[] = [];
  const fair = new Set(trapFairCells(entry).map(cellKey));
  const eligible = eligibleTrapCells(fair);
  const midCol = Math.floor(ROOM_COLS / 2);
  const midRow = Math.floor(ROOM_ROWS / 2);
  const targetCount = rng.between(TRAP_MIN_SPIKES, TRAP_MAX_SPIKES);

  const pools = [
    eligible.filter((cell) => cell.col === midCol),
    eligible.filter((cell) => cell.row >= midRow - 1 && cell.row <= midRow + 1),
    eligible,
  ];

  for (const pool of pools) {
    if (traps.length >= targetCount) break;
    addTrapFromPool(rng, traps, pool, entry, fair);
  }

  while (traps.length < targetCount) {
    if (!addTrapFromPool(rng, traps, eligible, entry, fair)) break;
  }

  return traps;
}

export function normalizeSpikeTrap(value: unknown): SpikeTrap | null {
  const base = normalizeTrapCell(value);
  if (!base || !isRecord(value)) return null;
  if (value.motion === undefined) return base;
  if (!isRecord(value.motion)) return null;

  const motion = value.motion;
  if (motion.kind !== 'lane') return null;
  if (motion.axis !== 'x' && motion.axis !== 'y') return null;
  if (typeof motion.periodMs !== 'number' || !Number.isFinite(motion.periodMs)) return null;
  if (motion.periodMs <= 0) return null;
  if (typeof motion.phaseMs !== 'number' || !Number.isFinite(motion.phaseMs)) return null;
  if (motion.phaseMs < 0) return null;

  const from = normalizeTrapCell(motion.from);
  const to = normalizeTrapCell(motion.to);
  if (!from || !to) return null;
  if (from.col !== base.col || from.row !== base.row) return null;

  const deltaCol = Math.abs(to.col - from.col);
  const deltaRow = Math.abs(to.row - from.row);
  if (
    motion.axis === 'x' &&
    (deltaCol < 1 || deltaCol > TRAP_LANE_DISTANCE_TILES || deltaRow !== 0)
  ) {
    return null;
  }
  if (
    motion.axis === 'y' &&
    (deltaRow < 1 || deltaRow > TRAP_LANE_DISTANCE_TILES || deltaCol !== 0)
  ) {
    return null;
  }

  return {
    ...base,
    motion: {
      kind: 'lane',
      axis: motion.axis,
      from,
      to,
      periodMs: Math.floor(motion.periodMs),
      phaseMs: Math.floor(motion.phaseMs),
    },
  };
}

function laneProgress(motion: TrapLaneMotion, elapsedMs: number): number {
  const period = Math.max(1, motion.periodMs);
  const phase = ((elapsedMs + motion.phaseMs) % period) / period;
  return phase <= 0.5 ? phase * 2 : (1 - phase) * 2;
}

export function trapCenterAt(trap: SpikeTrap, elapsedMs: number): TrapCenter {
  if (!isLaneDriftTrap(trap)) {
    return { x: (trap.col + 0.5) * TILE, y: (trap.row + 0.5) * TILE };
  }
  const progress = laneProgress(trap.motion, elapsedMs);
  const from = trap.motion.from;
  const to = trap.motion.to;
  const col = from.col + (to.col - from.col) * progress;
  const row = from.row + (to.row - from.row) * progress;
  return { x: (col + 0.5) * TILE, y: (row + 0.5) * TILE };
}

export function trapContactRectFromCenter(center: TrapCenter): TrapRect {
  return {
    x: center.x - TRAP_HITBOX_W / 2,
    y: center.y + TRAP_HITBOX_TOP_OFFSET,
    width: TRAP_HITBOX_W,
    height: TRAP_HITBOX_H,
  };
}

export function trapContactRectAt(trap: SpikeTrap, elapsedMs: number): TrapRect {
  return trapContactRectFromCenter(trapCenterAt(trap, elapsedMs));
}
