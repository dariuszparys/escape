import { describe, expect, test } from 'vitest';
import { CARD_DEFS, makeCard } from '../data/cards';
import { RunState } from '../state';
import {
  BALANCE_ENCOUNTER_POLICY,
  applySimulatedRest,
  simulateScenarioSummary,
} from './balanceSimulator';

function makeDeckCard(id: string) {
  const def = CARD_DEFS.find((card) => card.id === id);
  if (!def) throw new Error(`Missing card def ${id}`);
  return makeCard(def);
}

describe('balance simulator', () => {
  test('simulated rest spends gold before removing a reserve card', () => {
    const run = new RunState('seed', 'sim-rest-remove');
    const slash = makeDeckCard('slash');
    const guard = makeDeckCard('guard');
    run.cardCollection = [slash, guard];
    run.combatHand = [slash];
    run.gold = 10;

    applySimulatedRest(run);

    expect(run.gold).toBe(0);
    expect(run.cardCollection.map((card) => card.uid)).toEqual([slash.uid]);
  });

  test('simulated rest skips unaffordable actions without changing the deck', () => {
    const run = new RunState('seed', 'sim-rest-broke');
    const slash = makeDeckCard('slash');
    const guard = makeDeckCard('guard');
    run.cardCollection = [slash, guard];
    run.combatHand = [slash];
    run.gold = 9;

    applySimulatedRest(run);

    expect(run.gold).toBe(9);
    expect(run.cardCollection.map((card) => card.uid)).toEqual([slash.uid, guard.uid]);
  });

  test('baseline runs stay difficult but winnable', () => {
    const summary = simulateScenarioSummary({}, 400);

    expect(summary.winRate).toBeGreaterThanOrEqual(0.11);
    expect(summary.winRate).toBeLessThanOrEqual(0.15);
    expect(summary.bossReachRate).toBeGreaterThanOrEqual(0.28);
    expect(summary.bossKillGivenReach).toBeGreaterThanOrEqual(0.4);
  });

  test('encounter simulation remains the fight-taken balance baseline', () => {
    const summary = simulateScenarioSummary({}, 80);

    expect(BALANCE_ENCOUNTER_POLICY).toBe('fight-taken-baseline');
    expect(Object.keys(summary.byEncounter).some((key) => key !== '0')).toBe(true);
  });

  test('starter-card variety alone does not erase the challenge band', () => {
    const summary = simulateScenarioSummary({ starterCardVarietyUnlocked: true }, 400);

    expect(summary.winRate).toBeGreaterThanOrEqual(0.11);
    expect(summary.winRate).toBeLessThanOrEqual(0.2);
    expect(summary.bossReachRate).toBeLessThanOrEqual(0.42);
  });

  test('starter kit scenarios change the opener without erasing the challenge band', () => {
    const varietyOnly = simulateScenarioSummary({ starterCardVarietyUnlocked: true }, 400);
    const kits = ['duelist', 'warden', 'hexbinder'] as const;

    for (const kit of kits) {
      const summary = simulateScenarioSummary(
        {
          starterCardVarietyUnlocked: true,
          unlockedStarterKitIds: [kit],
          activeStarterKitId: kit,
        },
        400,
      );

      expect(summary).not.toEqual(varietyOnly);
      expect(summary.winRate).toBeGreaterThanOrEqual(0.07);
      expect(summary.winRate).toBeLessThanOrEqual(0.18);
      expect(summary.bossReachRate).toBeLessThanOrEqual(0.36);
    }
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

    expect(prepared.winRate).toBeGreaterThanOrEqual(0.3);
    expect(prepared.winRate).toBeLessThanOrEqual(0.35);
    expect(prepared.winRate).toBeGreaterThan(baseline.winRate + 0.1);
    expect(prepared.bossReachRate).toBeGreaterThan(baseline.bossReachRate);
    expect(prepared.bossKillGivenReach).toBeGreaterThanOrEqual(0.5);
  });
});
