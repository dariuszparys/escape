import { describe, expect, test } from 'vitest';
import { RunState } from '../state';
import { shouldResolveProgressionRewards } from './runCompletion';

describe('run completion eligibility', () => {
  test('suppresses progression rewards for Escape the Dungeon runs', () => {
    const run = new RunState('seed');
    run.scenarioId = 'escape_the_dungeon';

    expect(shouldResolveProgressionRewards(run)).toBe(false);
  });

  test('keeps progression rewards for hard scenarios and legacy normal runs', () => {
    for (const scenarioId of ['im_poisoned', 'lost_left_arm', 'enemies_doubled', null] as const) {
      const run = new RunState('seed');
      run.scenarioId = scenarioId;

      expect(shouldResolveProgressionRewards(run)).toBe(true);
    }
  });

  test('keeps Daily Descent reward handling independent from scenario selection', () => {
    const run = new RunState('seed');
    run.isDaily = true;
    run.scenarioId = 'escape_the_dungeon';

    expect(shouldResolveProgressionRewards(run)).toBe(true);
  });
});
