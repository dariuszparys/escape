import { describe, expect, test } from 'vitest';
import { CARD_DEFS, makeCard } from '../data/cards';
import { makeRelic } from '../data/relics';
import { RunState } from '../state';
import {
  applySimulatedRest,
  applySimulatedPostBattleRewards,
  assessCardEmphasisDominance,
  BALANCE_LOADOUT_SCENARIOS,
  createSimRng,
  SIM_BATTLE_TURN_CAP,
  SIM_DECK_THIN_THRESHOLD,
  simulateBattle,
  simulateLoadoutTierSummary,
  simulateScenarioProfileMatrix,
  simulateScenarioSummary,
  SCENARIO_BALANCE_PROFILES,
} from './balanceSimulator';
import { spawnBoss, spawnEnemy } from '../data/enemies';
import { restActionCost } from './restEconomy';
import type { GameRng } from './rng';
import { runSignature } from './runSignature';

function makeDeckCard(id: string) {
  const def = CARD_DEFS.find((card) => card.id === id);
  if (!def) throw new Error(`Missing card def ${id}`);
  return makeCard(def);
}

const minRng: GameRng = {
  frac: () => 0,
  between: (min) => min,
  pick: (items) => items[0],
};

const SIMULATION_TEST_TIMEOUT = 30_000;
const simulationTest = (name: string, fn: () => void) => test(name, fn, SIMULATION_TEST_TIMEOUT);

function expectWinRateInBand(
  row: ReturnType<typeof simulateScenarioProfileMatrix>[number],
  min: number,
  max: number,
): void {
  const rate = row.summary.winRate;
  if (rate < min || rate > max) {
    throw new Error(`${row.profile.id} winRate ${rate.toFixed(3)} outside [${min}, ${max}]`);
  }
}

function matrixRow(
  matrix: ReturnType<typeof simulateScenarioProfileMatrix>,
  id: (typeof SCENARIO_BALANCE_PROFILES)[number]['id'],
) {
  const row = matrix.find((candidate) => candidate.profile.id === id);
  if (!row) throw new Error(`Missing scenario profile row: ${id}`);
  return row;
}

describe('balance simulator battle kernel (U13)', () => {
  test('simulated battles run the real turn engine and terminate across seeds', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rng = createSimRng(seed);
      const run = new RunState(String(seed), `sim-battle-${seed}`);
      run.cardCollection = [
        makeDeckCard('strike'),
        makeDeckCard('strike'),
        makeDeckCard('guard'),
        makeDeckCard('slash'),
        makeDeckCard('minor_heal'),
      ];
      const result = simulateBattle(run, spawnEnemy(rng, 2), rng);
      expect(typeof result.won).toBe('boolean');
      expect(run.hp).toBeGreaterThanOrEqual(0);
      expect(run.hp).toBeLessThanOrEqual(run.maxHp);
      if (!result.won) expect(run.hp).toBe(0);
    }
  });

  test('an all-block stalemate deck terminates at the turn cap as a loss', () => {
    const rng = createSimRng(7);
    const run = new RunState('7', 'sim-stall');
    run.cardCollection = [makeDeckCard('aegis'), makeDeckCard('iron_wall')];
    run.hp = run.maxHp;
    const enemy = spawnEnemy(createSimRng(3), 2);
    enemy.hp = 999;
    enemy.maxHp = 999;
    const result = simulateBattle(run, enemy, rng);
    expect(result.won).toBe(false);
    expect(SIM_BATTLE_TURN_CAP).toBeLessThan(100);
  });

  test('simulated victory rewards include vampiric healing and a deck-aware card pick', () => {
    const run = new RunState('seed', 'sim-victory-rewards');
    run.cardCollection = [makeDeckCard('quick_jab')];
    run.hp = run.maxHp - 5;
    run.addRelic(makeRelic('vampiric_blade'));

    applySimulatedPostBattleRewards(run, minRng, 10);

    expect(run.hp).toBe(run.maxHp - 3);
    expect(run.gold).toBeGreaterThan(0);
    // minRng at depth 10 offers heavy_strike, which beats a lone quick_jab deck's average.
    expect(run.cardCollection.map((card) => card.id)).toContain('heavy_strike');
  });

  test('curation declines dilution — by quality and, when bloated, by deck size (KTD9)', () => {
    // Re-expressed for the combat-depth rebaseline: the reward policy now curates against
    // DILUTION with a rising bar (balanceSimulator chooseRewardCard). Two ways a card is declined:
    // (1) a lean deck of efficient cards rejects a merely-average filler that would drag its draws.
    const strong = new RunState('seed', 'sim-reward-skip');
    strong.cardCollection = [makeDeckCard('bash'), makeDeckCard('bash')];
    applySimulatedPostBattleRewards(strong, minRng, 2);
    expect(strong.cardCollection).toHaveLength(2); // Strike filler scores below the bash deck's average

    // (2) a BLOATED deck declines even an equal-value card, because each add dilutes the 5-card open.
    const bloated = new RunState('seed', 'sim-bloat');
    bloated.cardCollection = Array.from({ length: 14 }, () => makeDeckCard('strike'));
    applySimulatedPostBattleRewards(bloated, minRng, 2);
    expect(bloated.cardCollection).toHaveLength(14); // the size-driven dilution bar rejects an equal Strike
  });

  test('simulated rest thins a bloated deck by removing its worst card', () => {
    const run = new RunState('seed', 'sim-rest-remove');
    run.cardCollection = Array.from({ length: SIM_DECK_THIN_THRESHOLD }, () =>
      makeDeckCard('thunder'),
    );
    run.cardCollection.push(makeDeckCard('quick_jab'));
    run.gold = restActionCost('remove');

    applySimulatedRest(run);

    expect(run.gold).toBe(0);
    expect(run.cardCollection).toHaveLength(SIM_DECK_THIN_THRESHOLD);
    expect(run.cardCollection.every((card) => card.id === 'thunder')).toBe(true);
  });

  test('simulated rest upgrades the best card while the deck stays lean', () => {
    const run = new RunState('seed', 'sim-rest-upgrade');
    run.cardCollection = [makeDeckCard('slash'), makeDeckCard('guard')];
    run.gold = restActionCost('upgrade');

    applySimulatedRest(run);

    expect(run.gold).toBe(0);
    expect(run.cardCollection.some((card) => card.name.endsWith('+'))).toBe(true);
    expect(run.cardCollection).toHaveLength(2);
  });

  test('simulated rest skips unaffordable actions without changing the deck', () => {
    const run = new RunState('seed', 'sim-rest-broke');
    run.cardCollection = [makeDeckCard('slash'), makeDeckCard('guard')];
    run.gold = 0;

    applySimulatedRest(run);

    expect(run.gold).toBe(0);
    expect(run.cardCollection.some((card) => card.name.endsWith('+'))).toBe(false);
  });
});

describe('balance simulator survival bands', () => {
  simulationTest(
    'scenario profile matrix reports supported routes and diagnostics deterministically',
    () => {
      const first = simulateScenarioProfileMatrix(80);
      const second = simulateScenarioProfileMatrix(80);

      expect(second).toEqual(first);
      expect(first.map((row) => row.profile.id)).toEqual(
        SCENARIO_BALANCE_PROFILES.map((profile) => profile.id),
      );
      expect(first.map((row) => row.profile.id)).toEqual([
        'clean_supported',
        'poisoned_supported',
        'lost_left_arm_supported',
        'enemies_doubled_supported',
        'lost_left_arm_fixed_strong_diagnostic',
      ]);
      expect(
        first.find((row) => row.profile.id === 'lost_left_arm_supported')?.profile,
      ).toMatchObject({
        role: 'supported',
        playerScenarioId: 'lost_left_arm',
        scenario: { activeArchetypeId: 'barbarian' },
      });
      expect(
        first.find((row) => row.profile.id === 'lost_left_arm_fixed_strong_diagnostic')?.profile,
      ).toMatchObject({
        role: 'diagnostic',
        playerScenarioId: 'lost_left_arm',
        scenario: { activeArchetypeId: 'necromancer' },
      });

      for (const row of first) {
        expect(row.summary.runs).toBe(80);
        expect(row.summary.winRate).toBeGreaterThanOrEqual(0);
        expect(row.summary.winRate).toBeLessThanOrEqual(1);
        expect(row.summary.bossReachRate).toBeGreaterThanOrEqual(0);
        expect(row.summary.medianDeathDepth).toBeGreaterThanOrEqual(0);
        expect(row.summary.decadeSurvivalRates).toHaveLength(10);
      }
    },
  );

  test('scenario profile run signatures are stable across seed spreads', () => {
    for (const profile of SCENARIO_BALANCE_PROFILES) {
      for (let seed = 1; seed <= 10; seed++) {
        expect(runSignature(seed, profile.scenario)).toBe(runSignature(seed, profile.scenario));
      }
    }
  });

  simulationTest('legacy loadout-tier summaries remain available beside the profile matrix', () => {
    const legacy = simulateLoadoutTierSummary('strong', 80);
    const matrix = simulateScenarioProfileMatrix(80);
    const clean = matrix.find((row) => row.profile.id === 'clean_supported');

    expect(legacy.runs).toBe(80);
    expect(clean?.summary.runs).toBe(80);
    expect(clean?.profile.scenario).not.toBe(BALANCE_LOADOUT_SCENARIOS.strong);
  });

  simulationTest('baseline runs reach the first boss inside the first-decade survival band', () => {
    const summary = simulateLoadoutTierSummary('bare', 400);

    expect(summary.bossReachRate).toBeGreaterThanOrEqual(0.3);
    expect(summary.bossReachRate).toBeLessThanOrEqual(0.7);
  });

  simulationTest('bare level-1 loadouts almost never escape the 100-room arc', () => {
    const summary = simulateLoadoutTierSummary('bare', 400);

    expect(summary.winRate).toBeGreaterThanOrEqual(0);
    expect(summary.winRate).toBeLessThanOrEqual(0.05);
  });

  simulationTest('strong access loadouts land in the Earned escape band', () => {
    const summary = simulateLoadoutTierSummary('strong', 400);

    expect(summary.winRate).toBeGreaterThanOrEqual(0.15);
    expect(summary.winRate).toBeLessThanOrEqual(0.35);
  });

  simulationTest('mid-tier loadouts usually die in the middle arc', () => {
    const summary = simulateLoadoutTierSummary('mid', 400);

    expect(summary.medianDeathDepth).toBeGreaterThanOrEqual(40);
    expect(summary.medianDeathDepth).toBeLessThanOrEqual(80);
  });

  simulationTest('per-decade survival decreases across the fixed arc', () => {
    const summary = simulateLoadoutTierSummary('strong', 400);

    expect(summary.decadeSurvivalRates).toHaveLength(10);
    expect(summary.decadeSurvivalRates[0]).toBe(1);
    for (let i = 1; i < summary.decadeSurvivalRates.length; i++) {
      expect(summary.decadeSurvivalRates[i]).toBeLessThanOrEqual(
        summary.decadeSurvivalRates[i - 1],
      );
    }
    expect(summary.decadeSurvivalRates[9]).toBeLessThan(summary.decadeSurvivalRates[1]);
  });

  test('the room-100 boss is a larger wall than the room-10 boss', () => {
    const first = spawnBoss(createSimRng(1), 10);
    const final = spawnBoss(createSimRng(1), 100);

    expect(final.def.id).toBe(first.def.id);
    expect(final.hp / first.hp).toBeGreaterThanOrEqual(1.4);
  });

  simulationTest('weak-tier fights stay highly winnable — fresh-deck floor (U12)', () => {
    const summary = simulateScenarioSummary({}, 400);

    // Tier-1 winnability floor (plan test scenario): the base run's difficulty
    // comes from medium/strong tiers, elites, and the boss, not from the
    // fresh-deck opener. Measured 100% (all weak-tier 'encounter' fights won) at
    // 400 seeds; the floor sits below that so this isn't brittle to future
    // balance nudges elsewhere in the run.
    expect(summary.byTier.weak.total).toBeGreaterThan(0);
    expect(summary.weakTierWinRate).toBeGreaterThanOrEqual(0.85);
  });

  test('the run still models taken fights across the encounter buckets', () => {
    const summary = simulateScenarioSummary({}, 80);

    expect(Object.keys(summary.byEncounter).some((key) => key !== '0')).toBe(true);
  });

  simulationTest('starter-card variety alone stays inside the first-decade survival band', () => {
    const summary = simulateScenarioSummary({ starterCardVarietyUnlocked: true }, 400);

    expect(summary.bossReachRate).toBeGreaterThanOrEqual(0.3);
    expect(summary.bossReachRate).toBeLessThanOrEqual(0.7);
  });

  simulationTest('a selected combat archetype runs through the full simulation', () => {
    const baseline = simulateScenarioSummary({}, 400);
    const barbarian = simulateScenarioSummary({ activeArchetypeId: 'barbarian' }, 400);

    expect(barbarian.bossReachRate).toBeGreaterThan(0);
    expect(barbarian.winRate).toBeGreaterThanOrEqual(0);
    expect(barbarian.winRate).toBeLessThanOrEqual(1);
    expect(barbarian.byTier.weak.total).toBeGreaterThanOrEqual(baseline.byTier.weak.total * 0.5);
  });

  simulationTest(
    'battle-setup relics run cleanly through the harness and help rather than hurt',
    () => {
      // Coverage gate: before `startingRelicIds`, BalanceScenario had no way to grant spark_coil,
      // stone_heart, venom_ring, or hunter_charm, so `relicBattleSetup`'s startingEnergyBonus/
      // retainBlockCap/poisonBonus/enemyKillDraw branches never ran through a single simulated
      // battle. Keep each branch exercised under the current 100-room curve and make sure none
      // turns a bare run into an automatic escape.
      const baseline = simulateScenarioSummary({}, 400);
      const relicIds = ['spark_coil', 'stone_heart', 'venom_ring', 'hunter_charm'] as const;

      for (const relicId of relicIds) {
        const summary = simulateScenarioSummary({ startingRelicIds: [relicId] }, 400);
        expect(summary.winRate).toBeGreaterThanOrEqual(baseline.winRate - 0.03);
        expect(summary.winRate).toBeLessThanOrEqual(0.65);
      }
    },
  );

  simulationTest('Escape the Dungeon keeps the baseline combat shape', () => {
    const baseline = simulateScenarioSummary({}, 160);
    const escape = simulateScenarioSummary({ playerScenarioId: 'escape_the_dungeon' }, 160);

    // Escape is the clean/default Scenario: same combat route as the baseline simulator.
    expect(escape.winRate).toBe(baseline.winRate);
    expect(escape.bossReachRate).toBe(baseline.bossReachRate);
    expect(escape.byTier).toEqual(baseline.byTier);
  });

  simulationTest('scenario-supported profiles stay in explicit hard-but-viable bands', () => {
    const first = simulateScenarioProfileMatrix(400);
    const second = simulateScenarioProfileMatrix(400);

    expect(second).toEqual(first);

    const clean = matrixRow(first, 'clean_supported');
    const poisoned = matrixRow(first, 'poisoned_supported');
    const leftArm = matrixRow(first, 'lost_left_arm_supported');
    const doubled = matrixRow(first, 'enemies_doubled_supported');
    const leftArmDiagnostic = matrixRow(first, 'lost_left_arm_fixed_strong_diagnostic');

    expectWinRateInBand(clean, 0.15, 0.35);
    expectWinRateInBand(poisoned, 0.1, 0.25);
    expect(poisoned.summary.winRate).toBeLessThan(clean.summary.winRate);
    expect(poisoned.summary.medianDeathDepth).toBeGreaterThanOrEqual(30);

    expectWinRateInBand(leftArm, 0.1, 0.3);
    expect(leftArm.summary.winRate).toBeLessThanOrEqual(clean.summary.winRate + 0.03);
    expect(leftArmDiagnostic.summary.winRate).toBeLessThan(leftArm.summary.winRate);

    expectWinRateInBand(doubled, 0.03, 0.12);
    expect(doubled.summary.winRate).toBeLessThan(poisoned.summary.winRate);
    expect(doubled.summary.winRate).toBeLessThan(leftArm.summary.winRate);
  });
});

describe('elite engagement (U9)', () => {
  // KTD3 parity: the simulator has no doors/branching, so it replicates "one
  // elite offered per decade, in the mid-decade window" directly inside its
  // own room-choosing loop. These gates prove the mechanism is real (elites are
  // actually reachable AND actually fought at a non-degenerate rate) — the
  // exact rate is playtest-owned (U12), so the bounds here stay loose.

  simulationTest('the elite engagement rate is non-degenerate — neither near 0 nor near 1', () => {
    const summary = simulateScenarioSummary({}, 400);

    expect(summary.eliteEngagementRate).toBeGreaterThan(0.05);
    expect(summary.eliteEngagementRate).toBeLessThan(0.98);
  });

  simulationTest(
    'elites are offered and engaged at a representative rate, with a sane win/engaged ordering',
    () => {
      const summary = simulateScenarioSummary({}, 400);

      expect(summary.eliteBucket.offered).toBeGreaterThan(0);
      expect(summary.eliteBucket.engaged).toBeGreaterThan(0);
      expect(summary.eliteBucket.wins).toBeLessThanOrEqual(summary.eliteBucket.engaged);
    },
  );

  simulationTest(
    'the top-level elite rates are internally consistent with the raw bucket counts',
    () => {
      const summary = simulateScenarioSummary({}, 400);
      const { offered, engaged, wins } = summary.eliteBucket;

      expect(summary.eliteEngagementRate).toBeCloseTo(engaged / offered, 10);
      expect(summary.eliteWinRate).toBeCloseTo(wins / engaged, 10);
    },
  );

  test('a fixed seed set produces an identical elite summary across double runs', () => {
    const first = simulateScenarioSummary({}, 50);
    const second = simulateScenarioSummary({}, 50);

    expect(second).toEqual(first);
    expect(second.eliteBucket).toEqual(first.eliteBucket);
    expect(second.eliteEngagementRate).toBe(first.eliteEngagementRate);
    expect(second.eliteWinRate).toBe(first.eliteWinRate);
  });
});

describe('card emphasis policy guard (U13)', () => {
  simulationTest('no single always-one-emphasis policy dominates the seed spread', () => {
    const dominance = assessCardEmphasisDominance({}, { runs: 120, margin: 0.12 });

    expect(dominance.hasDominantEmphasis).toBe(false);
    expect(dominance.dominantEmphasis).toBeNull();
    expect(dominance.policies.damage.runs).toBe(120);
    expect(dominance.policies.block.runs).toBe(120);
    expect(dominance.policies.disruption.runs).toBe(120);
  });
});

describe('determinism gate (R5)', () => {
  // The seed-stability safety net for the Combat Content Engine refactor: a fixed seed must
  // produce a draw-order-sensitive run signature that never drifts. Authored against current
  // behavior before any refactor unit; every later unit keeps this green (KTD5). If a change
  // here goes red without an intentional-determinism note, it is a regression, not a rebaseline.
  test('a fixed seed produces an identical run signature across double runs', () => {
    for (let seed = 1; seed <= 50; seed++) {
      expect(runSignature(seed)).toBe(runSignature(seed));
    }
  });

  test('a non-default scenario keeps a stable signature across double runs', () => {
    const scenario = { activeArchetypeId: 'ranger' } as const;
    for (let seed = 1; seed <= 25; seed++) {
      expect(runSignature(seed, scenario)).toBe(runSignature(seed, scenario));
    }
  });
});
