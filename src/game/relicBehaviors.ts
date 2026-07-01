import type { RelicId } from '../data/relics';
import { type CombatEventOf, subscribeCombatEvent } from './combatEvents';

/**
 * Relic → battle-lifecycle binding (KTD3). Only `vampiric_blade` rides a battle-lifecycle
 * moment (post-victory heal), so it is the sole relic bound here. `swift_boots`, `iron_will`,
 * and `lucky_coin` operate at the hand-selection, combat-setup, and reward-economy layers and
 * deliberately stay there — forcing them onto the combat bus would re-couple layers the
 * "decouple enemy power from reward scaling" learning warns against.
 */
export const RELIC_BATTLE_WON_HEAL: Partial<Record<RelicId, number>> = {
  vampiric_blade: 2,
};

/** Total post-victory heal granted by a run's owned relics. Capped at maxHp by the driver's `run.heal`. */
export function relicBattleWonHeal(relicIds: readonly RelicId[]): number {
  let heal = 0;
  for (const id of relicIds) heal += RELIC_BATTLE_WON_HEAL[id] ?? 0;
  return heal;
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
