import { describe, expect, test } from 'vitest';
import { gateSummary } from './gateSummary';
import { calculateEmberReward } from './metaRewards';

describe('gateSummary', () => {
  test('daily runs skip Ember conversion and embed the current depth', () => {
    const run = { depth: 12, enemiesDefeated: 4, gold: 37, isDaily: true };

    const summary = gateSummary(run);

    expect(summary.stratum).toBe(2);
    expect(summary.bankLine).toBe('Bank: end the delve at depth 12 (no Ember conversion in Daily)');
  });

  test('non-daily runs embed gold and the computed Ember conversion', () => {
    const run = { depth: 9, enemiesDefeated: 5, gold: 37, isDaily: false };

    const summary = gateSummary(run);
    const reward = calculateEmberReward({
      depth: run.depth,
      enemiesDefeated: run.enemiesDefeated,
      gold: run.gold,
      escaped: true,
      convertGold: true,
    });

    expect(summary.stratum).toBe(1);
    expect(summary.bankLine).toBe(
      `Bank: convert 37 Gold → ${reward.convertedEmbers} Embers (+${reward.escapeEmbers} escape)`,
    );
  });

  test('renders singular "Ember" when the conversion yields exactly one', () => {
    // Derive (rather than hardcode) a gold amount that converts to exactly 1 Ember.
    let goldForOneEmber: number | null = null;
    for (let gold = 1; gold <= 200; gold++) {
      const reward = calculateEmberReward({
        depth: 1,
        enemiesDefeated: 0,
        gold,
        escaped: true,
        convertGold: true,
      });
      if (reward.convertedEmbers === 1) {
        goldForOneEmber = gold;
        break;
      }
    }

    expect(goldForOneEmber).not.toBeNull();
    const gold = goldForOneEmber as number;
    const run = { depth: 1, enemiesDefeated: 0, gold, isDaily: false };

    const summary = gateSummary(run);
    const reward = calculateEmberReward({
      depth: run.depth,
      enemiesDefeated: run.enemiesDefeated,
      gold: run.gold,
      escaped: true,
      convertGold: true,
    });

    expect(reward.convertedEmbers).toBe(1);
    expect(summary.bankLine).toBe(
      `Bank: convert ${gold} Gold → 1 Ember (+${reward.escapeEmbers} escape)`,
    );
  });
});
