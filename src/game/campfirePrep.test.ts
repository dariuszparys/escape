import { describe, expect, test } from 'vitest';
import { createDefaultProgressionState } from '../meta';
import { createDefaultProfileState, xpForLevel } from '../profile';
import { RunState } from '../state';
import { applyLoadoutToRun, relicPoolForRun } from './campfirePrep';

function profileAtLevel(level: number, discoveredRelicIds: string[] = []) {
  return {
    ...createDefaultProfileState(),
    xp: xpForLevel(level),
    discoveredRelicIds: discoveredRelicIds as ReturnType<
      typeof createDefaultProfileState
    >['discoveredRelicIds'],
  };
}

describe('campfire loadout application', () => {
  test('fresh profiles still run against the full discovery-blind relic drop pool', () => {
    const pool = relicPoolForRun();

    expect(pool.has('swift_boots')).toBe(true);
    expect(pool.has('spark_coil')).toBe(true);
    expect(pool.has('wanderers_flask')).toBe(true);
  });

  test('applies level-gated starter variety without changing pick count', () => {
    const run = new RunState('seed', 'run-variety');

    applyLoadoutToRun(run, createDefaultProgressionState(), profileAtLevel(4));

    expect(run.startingCardChoices).toBe(4);
    expect(run.startingCardPicks).toBe(2);
    expect(run.startingCardsTaken).toBe(0);
  });

  test('applies an unlocked archetype and discovered eligible starting relic', () => {
    const run = new RunState('seed', 'run-loadout');
    const progression = {
      ...createDefaultProgressionState(),
      activeArchetypeId: 'barbarian' as const,
      activeStartingRelicId: 'spark_coil' as const,
    };

    applyLoadoutToRun(run, progression, profileAtLevel(5, ['spark_coil']));

    expect(run.archetypeId).toBe('barbarian');
    expect(run.relicIds).toEqual(['spark_coil']);
    expect(run.cardCollection.map((card) => card.id)).toEqual([
      'strike',
      'strike',
      'guard',
      'guard',
    ]);
  });

  test('ignores stale locked selections rather than granting level power', () => {
    const run = new RunState('seed', 'run-locked');
    const progression = {
      ...createDefaultProgressionState(),
      activeArchetypeId: 'barbarian' as const,
      activeStartingRelicId: 'spark_coil' as const,
    };

    applyLoadoutToRun(run, progression, profileAtLevel(1, ['spark_coil']));

    expect(run.archetypeId).toBeNull();
    expect(run.relicIds).toEqual([]);
    expect(run.maxHp).toBe(new RunState().maxHp);
    expect(run.gold).toBe(0);
  });

  test('daily runs ignore loadout selections but keep the open drop pool', () => {
    const run = new RunState('seed', 'run-daily');
    run.isDaily = true;
    const progression = {
      ...createDefaultProgressionState(),
      activeArchetypeId: 'barbarian' as const,
      activeStartingRelicId: 'swift_boots' as const,
    };

    applyLoadoutToRun(run, progression, profileAtLevel(5, ['swift_boots']));

    expect(run.archetypeId).toBeNull();
    expect(run.relicIds).toEqual([]);
    expect(run.relicPool.has('spark_coil')).toBe(true);
  });

  test('levels alone do not grant in-run stats or resources', () => {
    const levelOne = new RunState('seed', 'run-l1');
    const levelTwenty = new RunState('seed', 'run-l20');
    const progression = createDefaultProgressionState();

    applyLoadoutToRun(levelOne, progression, profileAtLevel(1));
    applyLoadoutToRun(levelTwenty, progression, profileAtLevel(20));

    expect({
      hp: levelTwenty.hp,
      maxHp: levelTwenty.maxHp,
      gold: levelTwenty.gold,
      armor: levelTwenty.armor,
      maxArmor: levelTwenty.maxArmor,
      relicIds: levelTwenty.relicIds,
      archetypeId: levelTwenty.archetypeId,
      inventoryIds: levelTwenty.inventory.map((item) => item.id),
    }).toEqual({
      hp: levelOne.hp,
      maxHp: levelOne.maxHp,
      gold: levelOne.gold,
      armor: levelOne.armor,
      maxArmor: levelOne.maxArmor,
      relicIds: levelOne.relicIds,
      archetypeId: levelOne.archetypeId,
      inventoryIds: levelOne.inventory.map((item) => item.id),
    });
  });
});
