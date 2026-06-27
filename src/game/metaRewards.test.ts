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
      total: 2,
    });

    expect(
      calculateEmberReward({
        depth: 9,
        enemiesDefeated: 12,
        gold: 120,
        escaped: false,
      }),
    ).toEqual({
      depthMilestoneEmbers: 3,
      escapeEmbers: 0,
      total: 3,
    });
  });

  test('adds escape embers without converting carried gold', () => {
    expect(
      calculateEmberReward({
        depth: 10,
        enemiesDefeated: 5,
        gold: 49,
        escaped: true,
      }),
    ).toEqual({
      depthMilestoneEmbers: 3,
      escapeEmbers: 3,
      total: 6,
    });
  });

  test('normalizes bad numeric inputs before calculating milestones', () => {
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
      total: 0,
    });
  });
});
