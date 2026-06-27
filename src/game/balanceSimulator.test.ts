import { describe, expect, test } from 'vitest';
import { simulateScenarioSummary } from './balanceSimulator';

describe('balance simulator', () => {
  test('baseline runs stay difficult but winnable', () => {
    const summary = simulateScenarioSummary({}, 400);

    expect(summary.winRate).toBeGreaterThanOrEqual(0.14);
    expect(summary.winRate).toBeLessThanOrEqual(0.19);
    expect(summary.bossReachRate).toBeGreaterThanOrEqual(0.22);
    expect(summary.bossKillGivenReach).toBeGreaterThanOrEqual(0.42);
  });

  test('full prep materially improves the chance to escape', () => {
    const baseline = simulateScenarioSummary({}, 400);
    const prepared = simulateScenarioSummary(
      {
        prepItemIds: ['bomb', 'bomb', 'bomb'],
        extraStartingChoice: true,
        scoutFlame: true,
      },
      400,
    );

    expect(prepared.winRate).toBeGreaterThanOrEqual(0.35);
    expect(prepared.winRate).toBeLessThanOrEqual(0.42);
    expect(prepared.winRate).toBeGreaterThan(baseline.winRate + 0.1);
    expect(prepared.bossReachRate).toBeGreaterThan(baseline.bossReachRate);
    expect(prepared.bossKillGivenReach).toBeGreaterThanOrEqual(0.45);
  });
});
