export type RestActionMode = 'upgrade' | 'remove';

export const REST_UPGRADE_GOLD_COST = 12;
export const REST_REMOVE_GOLD_COST = 10;

interface RestEconomyRun {
  gold: number;
  cardCollection: readonly unknown[];
}

export type RestActionCheck = { ok: true; cost: number } | { ok: false; reason: string };

export function restActionCost(mode: RestActionMode): number {
  return mode === 'upgrade' ? REST_UPGRADE_GOLD_COST : REST_REMOVE_GOLD_COST;
}

export function canUseRestAction(run: RestEconomyRun, mode: RestActionMode): RestActionCheck {
  if (mode === 'remove' && run.cardCollection.length <= 1) {
    return { ok: false, reason: 'Cannot remove last card.' };
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
