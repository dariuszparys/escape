import { STRATUM_SIZE } from '../config';

/**
 * Pure stratum geometry for the endless descent. Strata are fixed-size bands of
 * depth: depths 1..STRATUM_SIZE are stratum 1, the next band is stratum 2, and so
 * on. The boss sits on each band's final depth, which is also the band boundary.
 *
 * These helpers consume only `depth` and never touch RNG, so the room generator,
 * the gate logic, and the HUD can all share one definition without drift.
 */

/** 1-based stratum index for a dungeon depth. Boundary depths belong to the lower stratum. */
export function stratumForDepth(depth: number): number {
  if (depth < 1) return 1;
  return Math.floor((depth - 1) / STRATUM_SIZE) + 1;
}

/** Depth measured within its own stratum: 1..STRATUM_SIZE, with the boss at STRATUM_SIZE. */
export function depthWithinStratum(depth: number): number {
  if (depth < 1) return 1;
  return ((depth - 1) % STRATUM_SIZE) + 1;
}

/** True at every stratum boundary — the boss room — i.e. depths 10, 20, 30, ... */
export function isStratumBoundary(depth: number): boolean {
  return depth >= 1 && depth % STRATUM_SIZE === 0;
}
