import { describe, expect, test } from 'vitest';
import { getEnemyTierForDepth, spawnBoss, spawnEnemy } from './enemies';
import { SequenceRng } from '../game/test-rng';

describe('enemy generation', () => {
  test('enemy tiers follow dungeon depth', () => {
    expect(getEnemyTierForDepth(2)).toBe('weak');
    expect(getEnemyTierForDepth(4)).toBe('medium');
    expect(getEnemyTierForDepth(8)).toBe('strong');
  });

  test('normal enemies mirror the player hand size within the combat cap', () => {
    expect(spawnEnemy(new SequenceRng([0]), 2, 1).cards).toHaveLength(2);
    expect(spawnEnemy(new SequenceRng([0]), 8, 5).cards).toHaveLength(5);
  });

  test('bosses have five cards and scheduled special mechanics', () => {
    const boss = spawnBoss(new SequenceRng([0]));

    expect(boss.cards).toHaveLength(5);
    expect(boss.def.boss).toBe(true);
    expect(boss.def.special?.interval).toBeGreaterThanOrEqual(2);
  });
});
