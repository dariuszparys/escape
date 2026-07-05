import { calculateEmberReward } from './metaRewards';
import { stratumForDepth } from './strata';
import type { RunState } from '../state';

export interface GateSummary {
  stratum: number;
  bankLine: string;
}

/**
 * Compose the bank-or-delve gate panel's summary (stratum label + Ember bank
 * line) after a stratum boss falls. Pure — the scene only renders these
 * strings (see `openGateDecision` in `scenes/Dungeon.ts`).
 */
export function gateSummary(
  run: Pick<RunState, 'depth' | 'enemiesDefeated' | 'gold' | 'isDaily'>,
): GateSummary {
  const stratum = stratumForDepth(run.depth);
  const reward = calculateEmberReward({
    depth: run.depth,
    enemiesDefeated: run.enemiesDefeated,
    gold: run.gold,
    escaped: true,
    convertGold: !run.isDaily,
  });
  const bankLine = run.isDaily
    ? `Bank: end the delve at depth ${run.depth} (no Ember conversion in Daily)`
    : `Bank: convert ${run.gold} Gold → ${reward.convertedEmbers} Ember${
        reward.convertedEmbers === 1 ? '' : 's'
      } (+${reward.escapeEmbers} escape)`;

  return { stratum, bankLine };
}
