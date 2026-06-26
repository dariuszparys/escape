import { describe, expect, test } from 'vitest';
import { calculateEmberReward } from './metaRewards';

describe('calculateEmberReward', () => {
  test('awards enough embers for an early death to buy a small potion', () => {
    expect(calculateEmberReward({
      depth: 2,
      enemiesDefeated: 0,
      gold: 0,
      escaped: false,
    })).toEqual({
      roomEmbers: 4,
      enemyEmbers: 0,
      goldEmbers: 0,
      victoryEmbers: 0,
      total: 4,
    });
  });

  test('combines room progress, enemy kills, and carried gold', () => {
    expect(calculateEmberReward({
      depth: 6,
      enemiesDefeated: 3,
      gold: 27,
      escaped: false,
    })).toEqual({
      roomEmbers: 12,
      enemyEmbers: 9,
      goldEmbers: 2,
      victoryEmbers: 0,
      total: 23,
    });
  });

  test('adds the escape bonus on victory', () => {
    expect(calculateEmberReward({
      depth: 10,
      enemiesDefeated: 5,
      gold: 49,
      escaped: true,
    })).toEqual({
      roomEmbers: 20,
      enemyEmbers: 15,
      goldEmbers: 4,
      victoryEmbers: 15,
      total: 54,
    });
  });
});
