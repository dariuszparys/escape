import type { RelicId } from '../data/relics';
import { RELIC_BATTLE_WON_HEAL, RELIC_ELITE_GOLD } from './relicRegistry';
import { type CombatEventOf, subscribeCombatEvent } from './combatEvents';

/** Total post-victory heal granted by a run's owned relics. Capped at maxHp by the driver's `run.heal`. */
export function relicBattleWonHeal(relicIds: readonly RelicId[]): number {
  let heal = 0;
  for (const id of relicIds) heal += RELIC_BATTLE_WON_HEAL[id] ?? 0;
  return heal;
}

/** Bonus gold after an elite victory. */
export function relicEliteGoldBonus(relicIds: readonly RelicId[]): number {
  let bonus = 0;
  for (const id of relicIds) bonus += RELIC_ELITE_GOLD[id] ?? 0;
  return bonus;
}

/** The single `battleWon` subscriber, shared by both drivers — this is the de-duplication (R4). */
function applyRelicBattleWon(event: CombatEventOf<'battleWon'>): void {
  event.result.heal += relicBattleWonHeal(event.relicIds);
}

let wired = false;

/**
 * Register the relic `battleWon` subscriber exactly once. Idempotent, so both drivers can call
 * it before emitting without double-binding. This is the one definition R4 requires the Battle
 * scene and the balance simulator to share.
 */
export function ensureRelicBehaviorsWired(): void {
  if (wired) return;
  wired = true;
  subscribeCombatEvent('battleWon', applyRelicBattleWon);
}
