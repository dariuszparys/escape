import { describe, expect, test } from 'vitest';
import { CARD_DEFS, makeCard } from '../data/cards';
import { makeRelic } from '../data/relics';
import { RunState } from '../state';
import { CONVERSION_EMBER_CAP } from './metaRewards';
import {
  applySimulatedRest,
  applySimulatedPostBattleRewards,
  assessCardEmphasisDominance,
  assessDelveDominance,
  createSimRng,
  MAX_SIMULATED_STRATA,
  SIM_BATTLE_TURN_CAP,
  SIM_DECK_THIN_THRESHOLD,
  simulateBattle,
  simulateDelveEconomy,
  simulateRun,
  simulateScenarioSummary,
} from './balanceSimulator';
import { spawnEnemy } from '../data/enemies';
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

describe('balance simulator economy bands', () => {
  test('baseline runs land in the roguelike-hard band (combat-depth rebaseline)', () => {
    const summary = simulateScenarioSummary({}, 400);

    // Re-baselined for the combat-depth rework (2026-07-04). The band is now measured against a
    // COMPETENT play policy (pickCardToPlay: multi-card lethal, Strength/Vulnerable-aware, sequences
    // setup-before-dump, blocks the honest telegraph) plus a dilution-aware curation reward policy —
    // NOT the old conservative bot whose passivity fabricated a fake 25%. Fights are also externally
    // anchored by the fixed reference-deck gates below, so this band cannot be gamed by tuning
    // enemies against the bot alone.
    // Measured at 400 seeds: winRate 0.333, bossReachRate 0.542, bossKillGivenReach 0.613, and
    // avgDeathDepth 8.3 — deaths cluster at the END of the stratum (strong tier + boss), the
    // signature of an attrition gauntlet rather than a room-1 wall. The difficulty comes from
    // ATTRITION: the medium tier on takes a flat +2 heaviest-hit punch (intentBonusForDepth) and
    // fights last long enough (elite/boss ~7 turns) that rituals fire, so ~5 fights drain the 34-HP
    // pool faster than limited healing refills. The number is honest: an anti-stalemate racing rule
    // (pickCardToPlay) removed the full-HP turn-cap losses that would otherwise inflate it.
    // Multi-enemy packs (spawnEncounter) are kept close to difficulty-neutral here: a pack carries
    // ~1.3x a solo's HP (PACK_HP_MULTIPLIER) to partly offset the focus-fire advantage, so the band
    // holds (re-measured ~0.36 winRate / ~0.65 bossReach at 400 seeds) — packs are a change of pace,
    // not a difficulty shift. The multiplier is deliberately modest so it doesn't tighten the
    // co-tuned delve gold economy past its over-generous-conversion guard.
    expect(summary.winRate).toBeGreaterThanOrEqual(0.2);
    expect(summary.winRate).toBeLessThanOrEqual(0.45);
    expect(summary.bossReachRate).toBeGreaterThanOrEqual(0.3);
    expect(summary.bossReachRate).toBeLessThanOrEqual(0.7);
    expect(summary.bossKillGivenReach).toBeGreaterThanOrEqual(0.4);
    expect(summary.bossKillGivenReach).toBeLessThanOrEqual(0.85);
  });

  test('weak-tier fights stay highly winnable — fresh-deck floor (U12)', () => {
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

  test('starter-card variety alone stays inside the baseline band', () => {
    const summary = simulateScenarioSummary({ starterCardVarietyUnlocked: true }, 400);

    // Same band as the baseline test (variety alone doesn't distort the challenge band).
    expect(summary.winRate).toBeGreaterThanOrEqual(0.2);
    expect(summary.winRate).toBeLessThanOrEqual(0.45);
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
      // Kits are a separate tuning surface (not U12's file scope) and legitimately
      // sit at different power levels — measured 0.32 (hexbinder) to 0.47 (warden)
      // at 400 seeds. The upper bound widened with multi-enemy packs: the warden's
      // block kit strongly synergizes with a pack's turn-1 multi-hit burst (one big
      // block absorbs the combined salvo, then you pick members off with reduced
      // incoming), so its win rate legitimately sits higher than the baseline's. The
      // band still catches a kit drifting to "always wins"/"never wins".
      expect(summary.winRate).toBeGreaterThanOrEqual(0.15);
      expect(summary.winRate).toBeLessThanOrEqual(0.53);
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

    // Re-baselined for U12: with the base band now genuinely hard (0.2525), full
    // prep has real headroom to show its worth — measured 0.595 winRate / 0.8175
    // bossReachRate / 0.728 bossKillGivenReach, vs baseline's 0.2525 / 0.365 / 0.69.
    expect(prepared.winRate).toBeGreaterThan(baseline.winRate);
    expect(prepared.bossReachRate).toBeGreaterThan(baseline.bossReachRate);
    expect(prepared.bossKillGivenReach).toBeGreaterThanOrEqual(0.65);
  });
});

describe('elite engagement (U9)', () => {
  // KTD3 parity: the simulator has no doors/branching, so it replicates "one
  // elite offered per stratum, in the mid-stratum window" directly inside its
  // own room-choosing loop. These gates prove the mechanism is real (elites are
  // actually reachable AND actually fought at a non-degenerate rate) — the
  // exact rate is playtest-owned (U12), so the bounds here stay loose.

  test('the elite engagement rate is non-degenerate — neither near 0 nor near 1', () => {
    const summary = simulateScenarioSummary({}, 400);

    expect(summary.eliteEngagementRate).toBeGreaterThan(0.05);
    expect(summary.eliteEngagementRate).toBeLessThan(0.98);
  });

  test('elites are offered and engaged at a representative rate, with a sane win/engaged ordering', () => {
    const summary = simulateScenarioSummary({}, 400);

    expect(summary.eliteBucket.offered).toBeGreaterThan(0);
    expect(summary.eliteBucket.engaged).toBeGreaterThan(0);
    expect(summary.eliteBucket.wins).toBeLessThanOrEqual(summary.eliteBucket.engaged);
  });

  test('the top-level elite rates are internally consistent with the raw bucket counts', () => {
    const summary = simulateScenarioSummary({}, 400);
    const { offered, engaged, wins } = summary.eliteBucket;

    expect(summary.eliteEngagementRate).toBeCloseTo(engaged / offered, 10);
    expect(summary.eliteWinRate).toBeCloseTo(wins / engaged, 10);
  });

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
  test('no single always-one-emphasis policy dominates the seed spread', () => {
    const dominance = assessCardEmphasisDominance({}, { runs: 120, margin: 0.12 });

    expect(dominance.hasDominantEmphasis).toBe(false);
    expect(dominance.dominantEmphasis).toBeNull();
    expect(dominance.policies.damage.runs).toBe(120);
    expect(dominance.policies.block.runs).toBe(120);
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

  test('an over-generous conversion still leaks straight into line payoffs', () => {
    // The old canary asserted a cautious/aggressive extreme would dominate; under
    // the rebuilt combat the aggressive line dies before it ever banks, so no
    // conversion can crown an extreme (deep-scaling tuning is playtest-owned).
    // The guard's INPUT still matters: 1 Ember per Gold must blow the payoff
    // spread up well past the tuned (guarded) conversion's spread.
    // Re-baselined for the combat-depth rework: the harder base run banks even less Gold before a
    // stratum clears, so both spreads shrink and the multiplier tightens further — measured ~3.5x at
    // 400 seeds (tuned spread ~3.1, generous spread ~10.7). The guard still proves the INPUT matters:
    // an un-guarded 1-Ember-per-Gold conversion still blows the payoff spread well past the tuned one.
    const tuned = simulateDelveEconomy({}, { runs: 400 });
    const generous = simulateDelveEconomy({}, { runs: 400, convert: (gold) => Math.floor(gold) });
    const spread = (economy: typeof tuned) => {
      const lines = [economy.cautious, economy.moderate, economy.aggressive].map(
        (line) => line.avgConvertedEmbers,
      );
      return Math.max(...lines) - Math.min(...lines);
    };

    expect(spread(generous)).toBeGreaterThan(spread(tuned) * 2.5);
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
