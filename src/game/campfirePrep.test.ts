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
