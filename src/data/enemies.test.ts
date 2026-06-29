import { describe, expect, test } from 'vitest';
import { ROOM_THREAT_PROFILES } from '../dungeon/roomThreat';
import {
  BOSSES,
  ENEMIES,
  getEnemyThreatProfile,
  getEnemyTierForDepth,
  spawnBoss,
  spawnEnemy,
} from './enemies';
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

  test('normal enemies resolve to known non-boss dungeon threat profiles', () => {
    for (const enemy of ENEMIES) {
      const profile = getEnemyThreatProfile(enemy);

      expect(profile).not.toBe('boss_pressure');
      expect(ROOM_THREAT_PROFILES[profile]).toBeDefined();
    }
  });

  test('first scripted combat enemies expose distinct planning archetypes', () => {
    expect(ENEMIES.find((enemy) => enemy.id === 'bandit')?.combatScript?.archetype).toBe(
      'tempo_pressure',
    );
    expect(ENEMIES.find((enemy) => enemy.id === 'cultist')?.combatScript?.archetype).toBe(
      'status_pressure',
    );
    expect(ENEMIES.find((enemy) => enemy.id === 'armored_goblin')?.combatScript?.archetype).toBe(
      'block_pressure',
    );
  });

  test('strong enemies carry readable combat scripts for deep strata', () => {
    expect(ENEMIES.find((enemy) => enemy.id === 'knight')?.combatScript?.archetype).toBe(
      'tempo_pressure',
    );
    expect(ENEMIES.find((enemy) => enemy.id === 'necromancer')?.combatScript?.archetype).toBe(
      'status_pressure',
    );
    expect(ENEMIES.find((enemy) => enemy.id === 'ogre')?.combatScript?.archetype).toBe(
      'block_pressure',
    );
  });

  test('a stratum-2 boss has more HP than a stratum-1 boss (depth term applied)', () => {
    const stratum1 = spawnBoss(new SequenceRng([0]), 10);
    const stratum2 = spawnBoss(new SequenceRng([0]), 20);

    expect(stratum2.def.id).toBe(stratum1.def.id); // same boss def for a fair comparison
    expect(stratum2.hp).toBeGreaterThan(stratum1.hp);
    expect(stratum2.maxHp).toBe(stratum2.hp);
  });

  test('boss HP increases monotonically across deeper strata, deterministically', () => {
    const hpAt = (depth: number) => spawnBoss(new SequenceRng([0]), depth).hp;
    expect(hpAt(10)).toBeLessThan(hpAt(20));
    expect(hpAt(20)).toBeLessThan(hpAt(30));
    expect(hpAt(30)).toBe(hpAt(30)); // deterministic for a fixed seed/depth
  });

  test('the stratum-1 boss is unchanged by the depth term', () => {
    const boss = spawnBoss(new SequenceRng([0]), 10);
    expect(boss.hp).toBe(boss.def.baseHp);
  });

  test('normal enemy HP increases monotonically with depth across strata', () => {
    const hpAt = (depth: number) => spawnEnemy(new SequenceRng([0]), depth, 3).hp;
    expect(hpAt(8)).toBeLessThan(hpAt(18));
    expect(hpAt(18)).toBeLessThan(hpAt(28));
  });

  test('bosses resolve to boss pressure dungeon threat profiles', () => {
    for (const boss of BOSSES) {
      expect(getEnemyThreatProfile(boss)).toBe('boss_pressure');
    }
  });
});
