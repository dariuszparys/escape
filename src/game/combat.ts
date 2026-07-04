import { StatusEffectType } from '../data/cards';

/**
 * Shared combatant vocabulary. The round-based resolver that used to live here
 * was retired with the turn-system rebuild (U14); these types survive because
 * the effect-handler registry and the turn engine both speak them.
 */
export interface ActiveStatusEffect {
  type: StatusEffectType;
  amount: number;
  remainingTurns: number;
}

export interface CombatantSnapshot {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  armor: number;
  statuses: ActiveStatusEffect[];
}

/** A combatant mid-resolution, carrying the transient block pool. Handlers mutate this. */
export interface MutableCombatant extends CombatantSnapshot {
  roundBlock: number;
}

/**
 * Hard per-battle cap on a combatant's Strength (B2). Strength stacks additively and never
 * decays, and the full card collection reshuffles every battle, so an uncapped ramp would
 * snowball out of the harness's sight. The cap bounds the scaling archetype to a strong-but-
 * finite finisher rather than a runaway multiplier.
 */
export const STRENGTH_CAP = 8;

/** The statuses that modify a number instead of ticking damage: read by `modifiedDamage`/`modifiedBlock`. */
type StatusCarrier = { statuses: ActiveStatusEffect[] };

/** Summed amount of a status on a combatant (0 if absent). Strength is the only additive one today. */
export function statusValue(c: StatusCarrier, type: StatusEffectType): number {
  return c.statuses.reduce((sum, s) => (s.type === type ? sum + s.amount : sum), 0);
}

export function hasStatus(c: StatusCarrier, type: StatusEffectType): boolean {
  return c.statuses.some((s) => s.type === type);
}

/**
 * The SINGLE source of truth for a damage effect's magnitude (B1). Every site that needs the
 * resolved number — the damage handler's HP math, the engine's block-pool depletion, the
 * `damageResolved` presentation event, the honest telegraph, and the simulator's lethal/valuation
 * reasoning — routes through here so they can never desync.
 *
 * Pinned operator order: `+strength (additive)` → `weak ×0.75` → `vulnerable ×1.5` → single
 * `floor`. Armor and block subtract AFTER this (in the caller), so strength/vulnerable sit on the
 * raw number and partial block keeps its value. Applied once per damage sub-effect — multi-hit
 * numbers are authored with that in mind (see the enemy-pattern authoring notes).
 */
export function modifiedDamage(raw: number, actor: StatusCarrier, target: StatusCarrier): number {
  let d = raw + statusValue(actor, 'strength');
  if (hasStatus(actor, 'weak')) d *= 0.75;
  if (hasStatus(target, 'vulnerable')) d *= 1.5;
  return Math.max(0, Math.floor(d));
}

/** Resolved block gain: Frail reduces the block a combatant gains by a quarter (B4). */
export function modifiedBlock(raw: number, actor: StatusCarrier): number {
  const b = hasStatus(actor, 'frail') ? raw * 0.75 : raw;
  return Math.max(0, Math.floor(b));
}
