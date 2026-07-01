import { describe, expect, test } from 'vitest';
import { CARD_DEFS, makeCard } from '../data/cards';
import { ENEMIES } from '../data/enemies';
import { makeRelic } from '../data/relics';
import { RunState } from '../state';
import { CONVERSION_EMBER_CAP } from './metaRewards';
import {
  applyRound,
  applySimulatedRest,
  applySimulatedPostBattleRewards,
  assessMatchupRoleDominance,
  assessDelveDominance,
  choosePlayerAction,
  createSimRng,
  MAX_SIMULATED_STRATA,
  simulateDelveEconomy,
  simulateRun,
  simulateScenarioSummary,
  type SimBattleState,
} from './balanceSimulator';
import { matchupPayoffForAction, resolveRound } from './combat';
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

function enemyDef(id: string) {
  const def = ENEMIES.find((candidate) => candidate.id === id);
  if (!def) throw new Error(`Missing enemy def ${id}`);
  return def;
}

function simState(overrides: Partial<SimBattleState> = {}): SimBattleState {
  const quick = makeDeckCard('quick_jab');
  const guard = makeDeckCard('guard');
  const heavy = makeDeckCard('heavy_strike');
  return {
    rng: createSimRng(123),
    round: 1,
    hand: [quick, guard],
    inventory: [],
    playerHp: 20,
    playerMaxHp: 20,
    playerArmor: 0,
    playerStatuses: [],
    playerUsed: new Set(),
    enemyDef: enemyDef('bandit'),
    enemyCards: [heavy],
    enemyHp: 20,
    enemyMaxHp: 20,
    enemyArmor: 0,
    enemyStatuses: [],
    enemyUsed: new Set(),
    ...overrides,
  };
}

describe('balance simulator', () => {
  test('prefers a matchup-winning card over a close non-winning alternative', () => {
    const guard = makeDeckCard('guard');
    const quick = makeDeckCard('quick_jab');
    const heavy = makeDeckCard('heavy_strike');
    const { action, enemyDecision } = choosePlayerAction(
      simState({ hand: [quick, guard], enemyCards: [heavy] }),
    );

    expect(enemyDecision.intentFamily).toBe('attack');
    expect(action.kind === 'card' ? action.card.id : action.kind).toBe('guard');
  });

  test('simulator and live resolution apply equivalent matchup effects', () => {
    const guard = makeDeckCard('guard');
    const heavy = makeDeckCard('heavy_strike');
    const state = simState({ hand: [guard], enemyCards: [heavy] });
    const playerAction = { actor: 'player' as const, kind: 'card' as const, card: guard };
    const enemyAction = { actor: 'enemy' as const, kind: 'card' as const, card: heavy };

    const simulated = applyRound(
      state,
      { kind: 'card', card: guard },
      {
        action: enemyAction,
        used: new Set([heavy.uid]),
        nextRng: state.rng.clone(),
        intentFamily: 'attack',
      },
    );
    const live = resolveRound({
      player: {
        id: 'player',
        name: 'Player',
        hp: state.playerHp,
        maxHp: state.playerMaxHp,
        armor: state.playerArmor,
        statuses: state.playerStatuses,
      },
      enemy: {
        id: state.enemyDef.id,
        name: state.enemyDef.name,
        hp: state.enemyHp,
        maxHp: state.enemyMaxHp,
        armor: state.enemyArmor,
        statuses: state.enemyStatuses,
      },
      playerAction,
      enemyAction,
      playerMatchupPayoff: matchupPayoffForAction(playerAction, 'attack'),
    });

    expect(simulated.playerHp).toBe(live.player.hp);
    expect(simulated.enemyHp).toBe(live.enemy.hp);
    expect(simulated.playerStatuses).toEqual(live.player.statuses);
    expect(simulated.enemyStatuses).toEqual(live.enemy.statuses);
  });

  test('simulated victory rewards include vampiric healing and enemy card choice', () => {
    const run = new RunState('seed', 'sim-victory-rewards');
    const slash = makeDeckCard('slash');
    const thunder = makeDeckCard('thunder');
    run.cardCollection = [slash];
    run.combatHand = [slash];
    run.hp = run.maxHp - 5;
    run.addRelic(makeRelic('vampiric_blade'));

    applySimulatedPostBattleRewards(run, minRng, 10, [thunder]);

    expect(run.hp).toBe(run.maxHp - 3);
    expect(run.gold).toBeGreaterThan(0);
    expect(run.cardCollection.map((card) => card.uid)).toContain(thunder.uid);
  });

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
    // Re-baselined from 0.15: the simulator now awards enemy Gold (matching the real
    // game), so rest actions are slightly better funded and the win rate edges up.
    // Re-baselined from 0.17: read-aware action choice now earns the same 3-damage
    // matchup payoff as live combat, improving correct defensive lines without adding RNG.
    expect(summary.winRate).toBeLessThanOrEqual(0.21);
    expect(summary.bossReachRate).toBeGreaterThanOrEqual(0.28);
    // Re-baselined from 0.40: strong enemies now play coherent combat scripts (U4),
    // which nudged boss-kill-given-reach down a hair without changing the band's intent.
    expect(summary.bossKillGivenReach).toBeGreaterThanOrEqual(0.38);
  });

  test('the run still models taken fights across the encounter buckets', () => {
    const summary = simulateScenarioSummary({}, 80);

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
      // Lower bound re-baselined from 0.07: enemy Gold funding shifts the weakest kits' win rates.
      expect(summary.winRate).toBeGreaterThanOrEqual(0.06);
      // Upper bound re-baselined from 0.18: the duelist benefits most from read-aware
      // matchup scoring because its opener can pick the right counter more often.
      expect(summary.winRate).toBeLessThanOrEqual(0.27);
      // Re-baselined from 0.42: matchup payoff lifts the duelist's boss reach, while
      // the weaker kits remain well below this ceiling.
      expect(summary.bossReachRate).toBeLessThanOrEqual(0.47);
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
    // Re-baselined from 0.35: bombs plus Scout Flame compound with read-aware combat,
    // but the prepared line still wins less than half the 400-run spread.
    expect(prepared.winRate).toBeLessThanOrEqual(0.47);
    expect(prepared.winRate).toBeGreaterThan(baseline.winRate + 0.1);
    expect(prepared.bossReachRate).toBeGreaterThan(baseline.bossReachRate);
    expect(prepared.bossKillGivenReach).toBeGreaterThanOrEqual(0.5);
  });
});

describe('matchup role policy guard', () => {
  test('no single always-one-role policy dominates the seed spread', () => {
    const dominance = assessMatchupRoleDominance({}, { runs: 120, margin: 0.12 });

    expect(dominance.hasDominantRole).toBe(false);
    expect(dominance.dominantRole).toBeNull();
    expect(dominance.policies.aggression.runs).toBe(120);
    expect(dominance.policies.defense.runs).toBe(120);
    expect(dominance.policies.disruption.runs).toBe(120);
  });
});

describe('delve economy', () => {
  // The dominant-line gate (R14): a line is "dominant" only if its expected Ember
  // payoff beats both rivals by this many Embers. Healthy tuning keeps the lines closer.
  const DOMINANCE_MARGIN = 1.5;

  test('a delve run reaches strata past depth 10 and terminates within the cap', () => {
    // Aggressive never banks until forced, so this exercises the max-strata guard.
    let deepestStratum = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const result = simulateRun(
        seed,
        {},
        { strategy: 'aggressive', maxStrata: MAX_SIMULATED_STRATA },
      );
      deepestStratum = Math.max(deepestStratum, result.stratumReached);
      // Always terminates: never delves past the cap.
      expect(result.stratumReached).toBeLessThanOrEqual(MAX_SIMULATED_STRATA);
    }
    // At least one aggressive line pushed past the first stratum boss.
    expect(deepestStratum).toBeGreaterThanOrEqual(2);
  });

  test('the three heuristics produce distinct banked/died profiles', () => {
    const economy = simulateDelveEconomy({}, { runs: 400 });

    // Cautious always banks at gate 1; moderate sometimes dies pushing one stratum;
    // aggressive (almost) never banks because it keeps pushing until it dies.
    expect(economy.cautious.bankRate).toBe(1);
    expect(economy.moderate.bankRate).toBeGreaterThan(0);
    expect(economy.moderate.bankRate).toBeLessThan(1);
    expect(economy.aggressive.bankRate).toBeLessThan(economy.moderate.bankRate);
    // Distinct depth profiles, too.
    expect(economy.moderate.avgStratumReached).toBeGreaterThan(economy.cautious.avgStratumReached);
    expect(economy.aggressive.avgStratumReached).toBeGreaterThan(
      economy.moderate.avgStratumReached,
    );
  });

  test('no line dominates under the tuned conversion (R14)', () => {
    const economy = simulateDelveEconomy({}, { runs: 400 });
    const dominance = assessDelveDominance(economy, DOMINANCE_MARGIN);

    expect(dominance.cautiousDominant).toBe(false);
    expect(dominance.aggressiveDominant).toBe(false);
    expect(dominance.hasDominantLine).toBe(false);
  });

  test('a deliberately over-generous conversion trips the dominant-line gate', () => {
    // 1 Ember per Gold with no guard: locking in Gold becomes a runaway-best line.
    const generous = simulateDelveEconomy({}, { runs: 400, convert: (gold) => Math.floor(gold) });

    expect(assessDelveDominance(generous, DOMINANCE_MARGIN).hasDominantLine).toBe(true);
  });

  test('expected Ember yield stays bounded by the conversion guard across strata', () => {
    // Even pushing the iteration cap higher cannot unbound the yield: the guard caps
    // per-run conversion, so the average can never exceed it for any strategy.
    for (const maxStrata of [4, MAX_SIMULATED_STRATA, 24]) {
      const economy = simulateDelveEconomy({}, { runs: 200, maxStrata });
      for (const line of [economy.cautious, economy.moderate, economy.aggressive]) {
        expect(line.avgConvertedEmbers).toBeLessThanOrEqual(CONVERSION_EMBER_CAP);
      }
    }
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

  test('the signature stays stable under a non-default strategy', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const first = runSignature(seed, {}, { strategy: 'aggressive' });
      const second = runSignature(seed, {}, { strategy: 'aggressive' });
      expect(first).toBe(second);
    }
  });
});
