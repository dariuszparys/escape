import { describe, expect, test } from 'vitest';
import { RunState } from '../state';
import { createDefaultProfileState, levelForXp, xpForLevel } from '../profile';
import {
  awardRunXpOnce,
  bossesKilledForRun,
  shouldResolveProgressionRewards,
} from './runCompletion';

describe('run completion eligibility', () => {
  test('pays progression rewards for Escape the Dungeon runs', () => {
    const run = new RunState('seed');
    run.scenarioId = 'escape_the_dungeon';

    expect(shouldResolveProgressionRewards(run)).toBe(true);
  });

  test('keeps progression rewards for every other run type', () => {
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

describe('run XP payout', () => {
  test('counts only defeated bosses for the current room snapshot', () => {
    const run = new RunState('seed');

    run.depth = 47;
    expect(bossesKilledForRun(run)).toBe(4);

    run.depth = 30;
    run.bossDefeated = false;
    expect(bossesKilledForRun(run)).toBe(2);

    run.bossDefeated = true;
    expect(bossesKilledForRun(run)).toBe(3);
  });

  test('death at room 47 pays room XP plus four boss bonuses and updates best room', () => {
    const run = new RunState('seed', 'run-47');
    run.depth = 47;
    const profile = createDefaultProfileState();

    const result = awardRunXpOnce(profile, run, false);

    expect(result.handled).toBe(true);
    expect(result.reward.roomsXp).toBeGreaterThan(0);
    expect(result.reward.bossXp).toBeGreaterThan(0);
    expect(result.reward.escapeXp).toBe(0);
    expect(result.reward.total).toBe(result.reward.roomsXp + result.reward.bossXp);
    expect(result.profile.xp).toBe(result.reward.total);
    expect(result.profile.personalBestRoom).toBe(47);
    expect(result.profile.lastAwardedRunId).toBe('run-47');
  });

  test('room-100 escape adds the escape bonus', () => {
    const run = new RunState('seed', 'run-100');
    run.depth = 100;
    run.bossDefeated = true;

    const result = awardRunXpOnce(createDefaultProfileState(), run, true);

    expect(result.reward.escapeXp).toBeGreaterThan(0);
    expect(result.reward.total).toBe(
      result.reward.roomsXp + result.reward.bossXp + result.reward.escapeXp,
    );
  });

  test('pay-once guard returns no additional XP for the same run id', () => {
    const run = new RunState('seed', 'run-same');
    run.depth = 20;
    const first = awardRunXpOnce(createDefaultProfileState(), run, false);
    const second = awardRunXpOnce(first.profile, run, false);

    expect(second.handled).toBe(false);
    expect(second.reward.total).toBe(0);
    expect(second.profile).toEqual(first.profile);
  });

  test('reports every level crossed by a large payout', () => {
    const run = new RunState('seed', 'run-levels');
    run.depth = 100;
    run.bossDefeated = true;
    const profile = {
      ...createDefaultProfileState(),
      xp: xpForLevel(2) - 1,
    };

    const result = awardRunXpOnce(profile, run, true);

    expect(result.previousLevel).toBe(1);
    expect(result.nextLevel).toBe(levelForXp(result.profile.xp));
    expect(result.levelsGained.length).toBeGreaterThanOrEqual(2);
    expect(result.levelsGained[0]).toBe(2);
  });
});
