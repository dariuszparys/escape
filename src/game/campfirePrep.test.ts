import { describe, expect, test } from 'vitest';
import { RunState } from '../state';
import { createDefaultPendingPrep } from '../data/campfirePurchases';
import { applyPendingPrepToRun } from './campfirePrep';

describe('applyPendingPrepToRun', () => {
  test('adds starting items and clears pending prep shape for the caller', () => {
    const run = new RunState('seed', 'run-1');
    const cleared = applyPendingPrepToRun(run, {
      itemIds: ['small_potion', 'bomb'],
      extraStartingChoice: false,
      scoutFlame: false,
      curseIds: [],
    });

    expect(run.inventory.map((item) => item.id)).toEqual(['small_potion', 'bomb']);
    expect(cleared).toEqual(createDefaultPendingPrep());
  });

  test('applies one-off preparations to a fresh run', () => {
    const run = new RunState('seed', 'run-2');

    applyPendingPrepToRun(run, {
      itemIds: [],
      extraStartingChoice: true,
      scoutFlame: true,
      curseIds: [],
    });

    expect(run.startingCardChoices).toBe(4);
    expect(run.startingCardPicks).toBe(3);
    expect(run.startingCardsTaken).toBe(0);
    expect(run.scoutCharges).toBe(1);
  });

  test('applies starter-card progression without increasing picks', () => {
    const run = new RunState('seed', 'run-progression');

    applyPendingPrepToRun(
      run,
      {
        itemIds: [],
        extraStartingChoice: false,
        scoutFlame: false,
        curseIds: [],
      },
      {
        starterCardVarietyUnlocked: true,
        migrationBonusGranted: false,
      },
    );

    expect(run.startingCardChoices).toBe(4);
    expect(run.startingCardPicks).toBe(2);
    expect(run.startingCardsTaken).toBe(0);
  });

  test('preserved extra opening pick still combines with the starter-card unlock once', () => {
    const run = new RunState('seed', 'run-progression-prep');

    applyPendingPrepToRun(
      run,
      {
        itemIds: [],
        extraStartingChoice: true,
        scoutFlame: false,
        curseIds: [],
      },
      {
        starterCardVarietyUnlocked: true,
        migrationBonusGranted: true,
      },
    );

    expect(run.startingCardChoices).toBe(4);
    expect(run.startingCardPicks).toBe(3);
  });

  test('Escape the Dungeon applies archetype only and preserves pending prep', () => {
    const run = new RunState('seed', 'run-escape');
    run.scenarioId = 'escape_the_dungeon';
    const pending = {
      itemIds: ['small_potion', 'bomb'],
      extraStartingChoice: true,
      scoutFlame: true,
      curseIds: ['blood_oath' as const],
      pendingRelicRoll: true,
    };

    const result = applyPendingPrepToRun(
      run,
      pending,
      {
        starterCardVarietyUnlocked: true,
        migrationBonusGranted: false,
        activeArchetypeId: 'ranger',
        relicPathUnlocked: true,
        unlockedRelicIds: ['spark_coil'],
        activeStartingRelicId: 'swift_boots',
      },
      undefined,
      'escape_the_dungeon',
    );

    expect(result).toEqual(pending);
    expect(run.archetypeId).toBe('ranger');
    expect(run.startingCardChoices).toBe(3);
    expect(run.startingCardPicks).toBe(2);
    expect(run.inventory).toHaveLength(0);
    expect(run.scoutCharges).toBe(0);
    expect(run.curseIds).toEqual([]);
    expect(run.hp).toBe(run.maxHp);
    expect(run.relics).toHaveLength(0);
    expect(run.relicPool.has('spark_coil')).toBe(false);
    expect(run.cardCollection.map((card) => card.id)).toEqual([
      'strike',
      'strike',
      'guard',
      'guard',
    ]);
  });

  test('hard scenarios apply full progression prep and clear it', () => {
    const run = new RunState('seed', 'run-hard-scenario');
    run.scenarioId = 'lost_left_arm';

    const cleared = applyPendingPrepToRun(
      run,
      {
        itemIds: ['small_potion'],
        extraStartingChoice: true,
        scoutFlame: true,
        curseIds: [],
        pendingRelicRoll: false,
      },
      {
        starterCardVarietyUnlocked: true,
        migrationBonusGranted: false,
        activeArchetypeId: 'barbarian',
        relicPathUnlocked: true,
        unlockedRelicIds: ['spark_coil'],
        activeStartingRelicId: 'swift_boots',
      },
      undefined,
      'lost_left_arm',
    );

    expect(cleared).toEqual(createDefaultPendingPrep());
    expect(run.archetypeId).toBe('barbarian');
    expect(run.startingCardChoices).toBe(4);
    expect(run.startingCardPicks).toBe(3);
    expect(run.inventory.map((item) => item.id)).toEqual(['small_potion']);
    expect(run.scoutCharges).toBe(1);
    expect(run.relicIds).toEqual(['swift_boots']);
    expect(run.relicPool.has('spark_coil')).toBe(true);
  });

  test('Left Arm full prep filters shield items and block-only starting relics', () => {
    const run = new RunState('seed', 'run-left-arm-prep');
    run.scenarioId = 'lost_left_arm';

    applyPendingPrepToRun(
      run,
      {
        itemIds: ['iron_armor', 'small_potion'],
        extraStartingChoice: false,
        scoutFlame: false,
        curseIds: [],
        pendingRelicRoll: false,
      },
      {
        starterCardVarietyUnlocked: false,
        migrationBonusGranted: false,
        relicPathUnlocked: true,
        unlockedRelicIds: ['stone_heart'],
        activeStartingRelicId: 'stone_heart',
      },
      undefined,
      'lost_left_arm',
    );

    expect(run.inventory.map((item) => item.id)).toEqual(['small_potion']);
    expect(run.relicIds).toEqual([]);
    expect(run.cardCollection.map((card) => card.id)).not.toContain('guard');
  });

  test('pads the starting deck with the fixed basic body', () => {
    const run = new RunState('seed', 'run-basic-pad');

    applyPendingPrepToRun(
      run,
      {
        itemIds: [],
        extraStartingChoice: false,
        scoutFlame: false,
        curseIds: [],
      },
      {
        starterCardVarietyUnlocked: true,
        migrationBonusGranted: false,
      },
    );

    expect(run.cardCollection.map((card) => card.id)).toEqual([
      'strike',
      'strike',
      'guard',
      'guard',
    ]);
    expect(run.startingCardsTaken).toBe(0);
  });

  test('applies Blood Oath to max HP and current HP for the next run', () => {
    const run = new RunState('seed', 'run-3');
    const cleared = applyPendingPrepToRun(run, {
      itemIds: [],
      extraStartingChoice: false,
      scoutFlame: false,
      curseIds: ['blood_oath'],
    });

    expect(run.curseIds).toEqual(['blood_oath']);
    expect(run.maxHp).toBe(28);
    expect(run.hp).toBe(28);
    expect(cleared).toEqual(createDefaultPendingPrep());
  });

  test('applies Narrow Opening to reduce default opening picks', () => {
    const run = new RunState('seed', 'run-4');

    applyPendingPrepToRun(run, {
      itemIds: [],
      extraStartingChoice: false,
      scoutFlame: false,
      curseIds: ['narrow_opening'],
    });

    expect(run.curseIds).toEqual(['narrow_opening']);
    expect(run.startingCardPicks).toBe(1);
  });

  test('applies Narrow Opening after extra opening pick', () => {
    const run = new RunState('seed', 'run-5');

    applyPendingPrepToRun(run, {
      itemIds: [],
      extraStartingChoice: true,
      scoutFlame: false,
      curseIds: ['narrow_opening'],
    });

    expect(run.startingCardChoices).toBe(4);
    expect(run.startingCardPicks).toBe(2);
  });
});
