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
