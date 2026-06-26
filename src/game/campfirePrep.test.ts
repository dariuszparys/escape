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
    });

    expect(run.startingCardChoices).toBe(3);
    expect(run.scoutCharges).toBe(1);
  });
});
