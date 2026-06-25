import { describe, expect, test } from 'vitest';
import { getEnemyTierForDepth, spawnBoss, spawnEnemy } from './enemies';
import { SequenceRng } from '../game/test-rng';

describe('enemy generation', () => {
  test('enemy tiers follow dungeon depth', () => {
    expect(getEnemyTierForDepth(2)).toBe('weak');
    expect(getEnemyTierForDepth(4)).toBe('medium');
    expect(getEnemyTierForDepth(8)).toBe('strong');
  });

  test('normal enemies hold player combat hand plus one card capped at six', () => {
    expect(spawnEnemy(new SequenceRng([0]), 2, 1).cards).toHaveLength(2);
    expect(spawnEnemy(new SequenceRng([0]), 8, 5).cards).toHaveLength(6);
  });

  test('bosses have six cards and scheduled special mechanics', () => {
    const boss = spawnBoss(new SequenceRng([0]));

    expect(boss.cards).toHaveLength(6);
    expect(boss.def.boss).toBe(true);
    expect(boss.def.special?.interval).toBeGreaterThanOrEqual(2);
  });
});
