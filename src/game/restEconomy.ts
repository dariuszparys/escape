import type { Card } from '../data/cards';
import { isCardUpgradable } from './cardUpgrade';

export type RestActionMode = 'upgrade' | 'remove';

export const REST_UPGRADE_GOLD_COST = 12;
export const REST_REMOVE_GOLD_COST = 10;

/** The upgrade path only sees cards an upgrade would actually change. */
type RestEconomyCard = Pick<Card, 'effects' | 'upgrades'>;

interface RestEconomyRun {
  gold: number;
  cardCollection: readonly RestEconomyCard[];
}

export type RestActionCheck = { ok: true; cost: number } | { ok: false; reason: string };

export function restActionCost(mode: RestActionMode): number {
  return mode === 'upgrade' ? REST_UPGRADE_GOLD_COST : REST_REMOVE_GOLD_COST;
}

/**
 * Cards this rest action can legally target.
 *
 * Removal can target anything (a maxed-out card is still worth cutting for draw
 * consistency), but the upgrade path must exclude cards an upgrade cannot change — those
 * already at `MAX_CARD_UPGRADES`, and the handful whose only effects are un-upgradable
 * (stun, shuffleCurse). Offering one would charge Gold for a no-op.
 */
export function restActionTargets<T extends RestEconomyCard>(
  collection: readonly T[],
  mode: RestActionMode,
): T[] {
  return mode === 'upgrade' ? collection.filter((card) => isCardUpgradable(card)) : [...collection];
}

export function canUseRestAction(run: RestEconomyRun, mode: RestActionMode): RestActionCheck {
  if (mode === 'remove' && run.cardCollection.length <= 1) {
    return { ok: false, reason: 'Cannot remove last card.' };
  }

  if (mode === 'upgrade' && restActionTargets(run.cardCollection, mode).length === 0) {
    return { ok: false, reason: 'Every card is fully upgraded.' };
  }

  const cost = restActionCost(mode);
  if (run.gold < cost) {
    return { ok: false, reason: 'Not enough Gold.' };
  }

  return { ok: true, cost };
}

export function payRestAction(run: RestEconomyRun, mode: RestActionMode): RestActionCheck {
  const check = canUseRestAction(run, mode);
  if (!check.ok) return check;

  run.gold -= check.cost;
  return check;
}
