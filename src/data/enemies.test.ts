import { describe, expect, test } from 'vitest';
import { ROOM_THREAT_PROFILES } from '../dungeon/roomThreat';
import {
  BOSSES,
  ENEMIES,
  getEnemyThreatProfile,
  getEnemyTierForDepth,
  intentBonusForDepth,
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

  test('spawns carry no card decks — behavior is the authored intent pattern (U9)', () => {
    const enemy = spawnEnemy(new SequenceRng([0]), 2);
    expect(enemy.def.pattern.cycle.length).toBeGreaterThan(0);
    const boss = spawnBoss(new SequenceRng([0]));
    expect(boss.def.boss).toBe(true);
    expect(boss.def.pattern.special?.interval).toBeGreaterThanOrEqual(2);
  });

  test('normal enemies resolve to known non-boss dungeon threat profiles', () => {
    for (const enemy of ENEMIES) {
      const profile = getEnemyThreatProfile(enemy);

      expect(profile).not.toBe('boss_pressure');
      expect(ROOM_THREAT_PROFILES[profile]).toBeDefined();
    }
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
    const hpAt = (depth: number) => spawnEnemy(new SequenceRng([0]), depth).hp;
    expect(hpAt(8)).toBeLessThan(hpAt(18));
    expect(hpAt(18)).toBeLessThan(hpAt(28));
  });

  test('bosses resolve to boss pressure dungeon threat profiles', () => {
    for (const boss of BOSSES) {
      expect(getEnemyThreatProfile(boss)).toBe('boss_pressure');
    }
  });
});

describe('intent patterns (U9, R5/R6)', () => {
  const RESOLVABLE_KINDS = ['damage', 'block', 'heal', 'status'];
  const all = [...ENEMIES, ...BOSSES];

  test('every enemy and boss carries a non-empty intent cycle', () => {
    for (const def of all) {
      expect(def.pattern.cycle.length, `${def.id} needs cycle entries`).toBeGreaterThan(0);
    }
  });

  test('every intent entry telegraphs and resolves only engine-legal effects', () => {
    for (const def of all) {
      const entries = [
        ...def.pattern.cycle,
        ...(def.pattern.special ? [def.pattern.special.entry] : []),
      ];
      for (const entry of entries) {
        expect(entry.telegraph.length, `${def.id}/${entry.name} telegraph`).toBeGreaterThan(0);
        expect(entry.effects.length, `${def.id}/${entry.name} effects`).toBeGreaterThan(0);
        for (const effect of entry.effects) {
          expect(RESOLVABLE_KINDS, `${def.id}/${entry.name} kind ${effect.kind}`).toContain(
            effect.kind,
          );
        }
      }
    }
  });

  test('boss specials fold into interval entries on the player-turn counter', () => {
    for (const def of BOSSES) {
      expect(def.pattern.special, `${def.id} keeps its interval special`).toBeDefined();
      expect(def.pattern.special!.interval).toBeGreaterThanOrEqual(2);
    }
  });

  test('archetype character survives: statuses stay on pressure enemies, block on bruisers', () => {
    const kindsOf = (id: string) =>
      new Set(
        [...ENEMIES, ...BOSSES]
          .find((def) => def.id === id)!
          .pattern.cycle.flatMap((entry) => entry.effects.map((effect) => effect.kind)),
      );
    expect(kindsOf('cultist')).toContain('status');
    expect(kindsOf('necromancer')).toContain('status');
    expect(kindsOf('armored_goblin')).toContain('block');
    expect(kindsOf('ogre')).toContain('block');
    expect(kindsOf('bandit')).toContain('damage');
    expect(kindsOf('knight')).toContain('damage');
  });
});

describe('depth-scaled intent damage (U13/R10)', () => {
  test('the bonus climbs through the first stratum and keeps climbing gently past it', () => {
    expect(intentBonusForDepth(2)).toBe(1);
    expect(intentBonusForDepth(6)).toBe(3);
    expect(intentBonusForDepth(10)).toBe(5);
    expect(intentBonusForDepth(30)).toBeGreaterThan(intentBonusForDepth(10));
    expect(intentBonusForDepth(30)).toBeLessThan(intentBonusForDepth(10) + 20);
  });

  test('spawned instances carry an empowered pattern; the authored def stays pristine', () => {
    const enemy = spawnEnemy(new SequenceRng([0]), 8);
    const defMax = Math.max(
      ...enemy.def.pattern.cycle.flatMap((entry) =>
        entry.effects.filter((effect) => effect.kind === 'damage').map((effect) => effect.amount),
      ),
    );
    const instanceMax = Math.max(
      ...enemy.pattern.cycle.flatMap((entry) =>
        entry.effects.filter((effect) => effect.kind === 'damage').map((effect) => effect.amount),
      ),
    );
    expect(instanceMax).toBe(defMax + intentBonusForDepth(8));
  });
});
