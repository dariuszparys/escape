import type { RunState } from '../state';
import { isStratumBoundary, stratumForDepth } from './strata';

/**
 * Pure delve lifecycle the scene can drive: gate eligibility, the commit into the
 * next stratum, and the bank/death resolution. No Phaser, no RNG — depth climbs on
 * its own through room transitions, so committing a delve only advances the stratum
 * counter; difficulty escalation rides the existing depth formulas (U8).
 *
 * Mirrors the campfire-prep staging pattern: mutate the run in place, return a
 * structured result the caller renders and records.
 */

/**
 * HP restored on committing a delve — a breather between strata. Tuned against the
 * U7 harness (KTD8): enough that early delves are survivable so banking-at-gate-1 is
 * not a dominant line (R14), but a flat amount that deep escalation eventually
 * outpaces, so pushing forever still ends in death.
 */
export const STRATUM_CLEAR_HEAL = 20;

export interface DelveResolution {
  /** Run terminus: banked-and-escaped (true) vs. died (false). */
  escaped: boolean;
  /** Gold that survives to Gold→Ember conversion. Forfeited (0) on death. */
  gold: number;
  /** Depth reached at the terminus. */
  depth: number;
  /** Stratum reached at the terminus. */
  stratum: number;
}

/**
 * True when the run sits at a boss gate (a stratum boundary: depth 10/20/30...).
 * Delegates to the shared boundary predicate so room-gating and gate-logic cannot
 * drift (KTD1). The scene calls this after a boss victory to present the choice.
 */
export function isAtGate(depth: number): boolean {
  return isStratumBoundary(depth);
}

/**
 * Commit to delving the next stratum. Advances the stratum counter; depth keeps
 * climbing via subsequent room transitions, so escalation is automatic — there is
 * no multiplier to apply. Irreversible until the next gate (R3).
 */
export function commitDelve(run: RunState): RunState {
  run.stratum += 1;
  run.heal(STRATUM_CLEAR_HEAL);
  return run;
}

/** Bank terminus: cash out the unbanked Gold and end the run a win (R6). */
export function resolveBank(run: RunState): DelveResolution {
  run.escaped = true;
  return {
    escaped: true,
    gold: run.gold,
    depth: run.depth,
    stratum: stratumForDepth(run.depth),
  };
}

/** Death terminus: forfeit all unbanked Gold; the run ends a loss (R7). */
export function resolveDeath(run: RunState): DelveResolution {
  run.escaped = false;
  return {
    escaped: false,
    gold: 0,
    depth: run.depth,
    stratum: stratumForDepth(run.depth),
  };
}
