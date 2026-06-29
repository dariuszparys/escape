import { describe, expect, test } from 'vitest';
import { calculateEmberReward } from './metaRewards';

describe('calculateEmberReward', () => {
  test('awards no embers before the first depth milestone', () => {
    expect(
      calculateEmberReward({
        depth: 2,
        enemiesDefeated: 4,
        gold: 99,
        escaped: false,
      }),
    ).toEqual({
      depthMilestoneEmbers: 0,
      escapeEmbers: 0,
      convertedEmbers: 0,
      total: 0,
    });
  });

  test('awards embers for depth milestones on failed runs', () => {
    expect(
      calculateEmberReward({
        depth: 3,
        enemiesDefeated: 0,
        gold: 0,
        escaped: false,
      }).total,
    ).toBe(1);

    expect(
      calculateEmberReward({
        depth: 6,
        enemiesDefeated: 3,
        gold: 27,
        escaped: false,
      }),
    ).toEqual({
      depthMilestoneEmbers: 2,
      escapeEmbers: 0,
      convertedEmbers: 0,
      total: 2,
    });
  });

  // AE1: Bank with leftover Gold on a normal run → conversion + milestones + escape.
  test('AE1: banking a normal run converts leftover Gold on top of milestones and escape', () => {
    const reward = calculateEmberReward({
      depth: 10,
      enemiesDefeated: 5,
      gold: 49,
      escaped: true,
    });

    expect(reward.depthMilestoneEmbers).toBe(3);
    expect(reward.escapeEmbers).toBe(3);
    expect(reward.convertedEmbers).toBeGreaterThan(0);
    expect(reward.total).toBe(
      reward.depthMilestoneEmbers + reward.escapeEmbers + reward.convertedEmbers,
    );
  });

  // AE2: Death forfeits Gold — no conversion, no escape, milestones retained.
  test('AE2: dying forfeits Gold but retains milestone Embers', () => {
    expect(
      calculateEmberReward({
        depth: 9,
        enemiesDefeated: 12,
        gold: 240,
        escaped: false,
      }),
    ).toEqual({
      depthMilestoneEmbers: 3,
      escapeEmbers: 0,
      convertedEmbers: 0,
      total: 3,
    });
  });

  // AE4: Daily bank disables conversion; milestones and escape behave as normal.
  test('AE4: Daily banking disables Gold conversion but keeps milestones and escape', () => {
    expect(
      calculateEmberReward({
        depth: 10,
        enemiesDefeated: 5,
        gold: 240,
        escaped: true,
        convertGold: false,
      }),
    ).toEqual({
      depthMilestoneEmbers: 3,
      escapeEmbers: 3,
      convertedEmbers: 0,
      total: 6,
    });
  });

  test('the guard bounds conversion: doubling raw Gold does not double converted Embers', () => {
    const single = calculateEmberReward({
      depth: 10,
      enemiesDefeated: 0,
      gold: 200,
      escaped: true,
    }).convertedEmbers;
    const double = calculateEmberReward({
      depth: 10,
      enemiesDefeated: 0,
      gold: 400,
      escaped: true,
    }).convertedEmbers;

    expect(double).toBeGreaterThan(single);
    expect(double).toBeLessThan(single * 2);
  });

  test('conversion stays bounded by the guard cap even for enormous hauls', () => {
    const huge = calculateEmberReward({
      depth: 10,
      enemiesDefeated: 0,
      gold: 1_000_000,
      escaped: true,
    }).convertedEmbers;

    expect(huge).toBeLessThanOrEqual(10);
  });

  test('milestone and escape Embers are independent of the Gold term (separation invariant)', () => {
    const withoutGold = calculateEmberReward({
      depth: 9,
      enemiesDefeated: 0,
      gold: 0,
      escaped: true,
    });
    const withGold = calculateEmberReward({
      depth: 9,
      enemiesDefeated: 0,
      gold: 320,
      escaped: true,
    });

    expect(withGold.depthMilestoneEmbers).toBe(withoutGold.depthMilestoneEmbers);
    expect(withGold.escapeEmbers).toBe(withoutGold.escapeEmbers);
    expect(withGold.convertedEmbers).toBeGreaterThan(withoutGold.convertedEmbers);
  });

  test('normalizes bad numeric inputs before calculating', () => {
    expect(
      calculateEmberReward({
        depth: Number.NaN,
        enemiesDefeated: -2.5,
        gold: -10.5,
        escaped: false,
      }),
    ).toEqual({
      depthMilestoneEmbers: 0,
      escapeEmbers: 0,
      convertedEmbers: 0,
      total: 0,
    });
  });
});
