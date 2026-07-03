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
 *
 * The gate-clear breather is a full heal (re-tuned for U12): the roguelike-hard
 * base run (stratum 1 alone: ~37% boss-reach) already spends most of a run's HP
 * margin just clearing one stratum, so the old partial heal made a second stratum
 * a near-certain death and wrongly crowned "bank at gate 1" as a dominant line
 * (R14). A full heal keeps push-your-luck a genuine, non-degenerate choice — deep
 * escalation (HP/damage slopes past MAX_DEPTH, plus a still-real per-fight risk)
 * outpaces it eventually, so pushing forever still ends in death (proven by the
 * aggressive line's near-0% bank rate).
 */
export function commitDelve(run: RunState): RunState {
  run.stratum += 1;
  run.heal(run.maxHp);
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
