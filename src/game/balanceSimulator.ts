import { MAX_DEPTH } from '../config';
import { Card, CARD_DEFS, cardEffectAmount, makeCard } from '../data/cards';
import { type PendingPrep } from '../data/campfirePurchases';
import { EnemyInstance, spawnBoss, spawnEnemy } from '../data/enemies';
import { InventoryItem, type InventoryItemDef, makeItem } from '../data/items';
import type { StarterKitId } from '../data/starterKits';
import { rollRoomEvent, type RoomEvent } from '../dungeon/rooms';
import { RunState } from '../state';
import { applyPendingPrepToRun } from './campfirePrep';
import { emitBattleWon } from './combatEvents';
import { ensureRelicBehaviorsWired } from './relicBehaviors';
import { commitDelve } from './delve';
import { intentView } from './intentPatterns';
import { convertGoldToEmbers } from './metaRewards';
import {
  awardEliteBonusGold,
  awardEnemyGold,
  awardPotionItem,
  ELITE_CARD_OFFER_COUNT,
  ELITE_TIER_BIAS_DEPTH,
  rollChestReward,
  rollVictoryCardOffers,
} from './rewards';
import { GameRng } from './rng';
import { startingCardIdsForRun } from './startingCards';
import { isStratumBoundary, stratumForDepth } from './strata';
import {
  cardCost,
  createBattle,
  endTurn,
  playableCards,
  playCard,
  TurnBattleState,
  useItem,
} from './turnEngine';
import { upgradeCard } from './cardUpgrade';
import { canUseRestAction, payRestAction } from './restEconomy';

/**
 * How a simulated player treats each boss gate. The three lines bracket the
 * push-your-luck decision so the harness can prove no single line dominates (R14).
 */
export type DelveStrategy = 'cautious' | 'moderate' | 'aggressive';

/** Gold→Ember conversion used by the economy harness; injectable so tests can probe over-generous curves. */
export type GoldConversion = (gold: number) => number;

/**
 * A cloneable RNG threaded through the simulation. The seed-stability gate (R5)
 * injects an *observed* implementation via `SimRunOptions.createRng` so it can sample
 * RNG draw order without reaching into the module-private `SeededRng`.
 */
export interface SimRng extends GameRng {
  clone(): SimRng;
}

/** Factory for the simulation's root RNG, given a seed. Injectable so the gate can observe draws. */
export type SimRngFactory = (seed: number) => SimRng;

/**
 * Build the default simulation RNG for a seed, optionally observing every `frac()` draw.
 * `observer` is fired *after* each result is computed (side-effect only), so an observed
 * RNG produces byte-identical values to an unobserved one — the gate samples without perturbing.
 */
export function createSimRng(seed: number, observer?: (frac: number) => void): SimRng {
  return new SeededRng(seed >>> 0, observer);
}

/** Safety cap on strata so a mis-tuned "push until death" line cannot loop unbounded (KTD8). */
export const MAX_SIMULATED_STRATA = 12;

interface SimRunOptions {
  strategy: DelveStrategy;
  maxStrata: number;
  convert: GoldConversion;
  /** Root RNG factory; the gate injects an observed RNG here (KTD4). Defaults to a plain seeded RNG. */
  createRng: SimRngFactory;
  /** Optional slant for the greedy card policy — the no-dominant-policy gate sweeps these. */
  emphasis: CardEmphasis | null;
}

/** Decide whether to delve the next stratum after clearing the boss of `stratumCleared`. */
function shouldDelve(strategy: DelveStrategy, stratumCleared: number, maxStrata: number): boolean {
  if (stratumCleared >= maxStrata) return false; // hard termination guard
  if (strategy === 'cautious') return false; // always bank at the first gate
  if (strategy === 'moderate') return stratumCleared < 2; // delve one stratum, then bank
  return true; // aggressive: push until death (or the cap)
}

export interface BalanceScenario {
  prepItemIds?: InventoryItemDef['id'][];
  extraStartingChoice?: boolean;
  scoutFlame?: boolean;
  starterCardVarietyUnlocked?: boolean;
  unlockedStarterKitIds?: StarterKitId[];
  activeStarterKitId?: StarterKitId | null;
}

export interface EncounterBucketSummary {
  total: number;
  wins: number;
  bossReached: number;
}

export interface BalanceSimulationSummary {
  runs: number;
  winRate: number;
  bossReachRate: number;
  bossKillGivenReach: number;
  avgDeathDepth: number;
  byEncounter: Record<string, EncounterBucketSummary>;
}

interface SimRunResult {
  /** Banked successfully — the run's win condition. */
  victory: boolean;
  reachedBoss: boolean;
  /** Cleared the first stratum boss, so the run actually faced the bank-or-delve choice. */
  clearedFirstGate: boolean;
  deathDepth: number | null;
  /** Deepest stratum reached, whether banked or died. */
  stratumReached: number;
  encounters: number;
  /** Embers minted from Gold at the bank (0 on death). */
  convertedEmbers: number;
}

/**
 * A slant for the greedy multi-card turn policy. Replaces the retired matchup
 * roles: the dominance gate proves no single slant beats the others across the
 * seed spread (R15's no-dominant-line invariant under the deck model).
 */
export type CardEmphasis = 'damage' | 'block' | 'disruption';

/**
 * Card quality per point of energy — the simulator's whole card sense. Used by
 * the greedy play policy, starting picks, reward choice, and rest decisions.
 */
export function simCardScore(card: Card, emphasis: CardEmphasis | null = null): number {
  let score = 0;
  for (const effect of card.effects) {
    if (effect.kind === 'damage') score += effect.amount * (emphasis === 'damage' ? 1.8 : 1.2);
    else if (effect.kind === 'block') score += effect.amount * (emphasis === 'block' ? 1.6 : 1);
    else if (effect.kind === 'heal') score += effect.amount * 0.8;
    else if (effect.kind === 'status') score += effect.amount * (emphasis === 'disruption' ? 6 : 3);
    else score += effect.amount * 3; // draw/energy cantrips compress turns
  }
  return score / Math.max(1, cardCost(card));
}

const ITEM_VALUE: Record<string, number> = {
  small_potion: 18,
  large_potion: 28,
  smoke_bomb: 30,
  bomb: 26,
  iron_armor: 12,
};

class SeededRng implements SimRng {
  constructor(
    private state: number,
    private readonly observer?: (frac: number) => void,
  ) {}

  clone(): SeededRng {
    return new SeededRng(this.state, this.observer);
  }

  frac(): number {
    this.state += 0x6d2b79f5;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    const result = ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    this.observer?.(result);
    return result;
  }

  between(min: number, max: number): number {
    return min + Math.floor(this.frac() * (max - min + 1));
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Cannot pick from an empty array.');
    return items[Math.floor(this.frac() * items.length)];
  }
}

function chooseStartingCards(run: RunState): void {
  const offers = startingCardIdsForRun(run)
    .map((id) => CARD_DEFS.find((card) => card.id === id))
    .filter((card): card is (typeof CARD_DEFS)[number] => !!card)
    .map((card) => makeCard(card));

  offers
    .sort((a, b) => simCardScore(b) - simCardScore(a))
    .slice(0, run.startingCardPicks)
    .forEach((card) => {
      run.addCard(card);
      run.startingCardsTaken++;
    });
}

function makePendingPrep(scenario: BalanceScenario): PendingPrep {
  return {
    itemIds: [...(scenario.prepItemIds ?? [])],
    extraStartingChoice: scenario.extraStartingChoice === true,
    scoutFlame: scenario.scoutFlame === true,
  };
}

function createScenarioRun(seed: number, scenario: BalanceScenario): RunState {
  const run = new RunState(String(seed), `sim-${seed}`);
  const prep = makePendingPrep(scenario);
  applyPendingPrepToRun(run, prep, {
    starterCardVarietyUnlocked: scenario.starterCardVarietyUnlocked === true,
    migrationBonusGranted: false,
    unlockedStarterKitIds: scenario.unlockedStarterKitIds ?? [],
    activeStarterKitId: scenario.activeStarterKitId ?? null,
  });

  chooseStartingCards(run);
  return run;
}

/**
 * Deck-composition reward heuristic (KTD9): take the best offer only when it
 * beats the deck's average card quality — adding filler dilutes every draw.
 */
function chooseRewardCard(run: RunState, offers: readonly Card[]): void {
  if (offers.length === 0) return;
  const deckAverage =
    run.cardCollection.length === 0
      ? 0
      : run.cardCollection.reduce((sum, card) => sum + simCardScore(card), 0) /
        run.cardCollection.length;
  const best = [...offers].sort((a, b) => simCardScore(b) - simCardScore(a))[0];
  if (simCardScore(best) > deckAverage * 0.9) run.addCard(best);
}

export function applySimulatedPostBattleRewards(
  run: RunState,
  rng: GameRng,
  depth: number,
  isElite = false,
): void {
  ensureRelicBehaviorsWired();
  const { heal } = emitBattleWon(run.relics.map((relic) => relic.id));
  if (heal > 0) run.heal(heal);
  const gold = awardEnemyGold(run, rng, depth);
  if (isElite) awardEliteBonusGold(run, gold);
  const offers = isElite
    ? rollVictoryCardOffers(rng, depth, ELITE_CARD_OFFER_COUNT, ELITE_TIER_BIAS_DEPTH)
    : rollVictoryCardOffers(rng, depth);
  chooseRewardCard(run, offers);
}

/** Deck size above which a rest thins the deck instead of upgrading a card. */
export const SIM_DECK_THIN_THRESHOLD = 9;

export function applySimulatedRest(run: RunState): void {
  const byScore = [...run.cardCollection].sort((a, b) => simCardScore(a) - simCardScore(b));
  const worst = byScore[0];
  if (run.cardCollection.length > SIM_DECK_THIN_THRESHOLD && worst) {
    const payment = payRestAction(run, 'remove');
    if (!payment.ok) return;
    if (run.removeCard(worst.uid)) return;
    run.gold += payment.cost;
    return;
  }

  const best = byScore[byScore.length - 1];
  if (!best) return;
  const payment = payRestAction(run, 'upgrade');
  if (!payment.ok) return;
  upgradeCard(best);
}

function maybeUseDungeonPotion(run: RunState, beforeBoss = false): void {
  const potions = run.inventory
    .filter((item) => item.kind === 'heal')
    .sort((a, b) => a.amount - b.amount);

  if (beforeBoss) {
    for (const potion of potions) {
      if (run.hp >= run.maxHp) break;
      run.removeItem(potion.uid);
      run.heal(potion.amount);
    }
    return;
  }

  if (!run.inventoryFull) return;

  for (const potion of potions) {
    if (run.hp <= run.maxHp - potion.amount) {
      run.removeItem(potion.uid);
      run.heal(potion.amount);
      return;
    }
  }
}

function replaceInventoryItem(run: RunState, item: InventoryItem): void {
  const candidate = [...run.inventory]
    .map((held) => ({ held, value: ITEM_VALUE[held.id] ?? 10 }))
    .sort((a, b) => a.value - b.value)[0];

  if (!candidate) return;
  if ((ITEM_VALUE[item.id] ?? 10) <= candidate.value) return;

  run.replaceItem(candidate.held.uid, item);
}

function roomEventScore(run: RunState, event: RoomEvent): number {
  switch (event) {
    case 'chest':
      return 40 + Math.max(0, 8 - run.cardCollection.length) * 2;
    case 'potion':
      return run.hp < run.maxHp * 0.6 ? 38 : 30;
    case 'encounter':
      return run.hp >= run.maxHp * 0.75 ? 20 : 8;
    case 'rest':
      if (canUseRestAction(run, 'remove').ok) return 42;
      if (canUseRestAction(run, 'upgrade').ok) return 34;
      return -2;
    case 'trap':
      return -8;
    case 'boss':
      return 0;
    case 'start':
      return 0;
    case 'elite':
      // Placeholder only (KTD9 exhaustiveness fix, not U9's real modeling): 'elite'
      // is currently unreachable here — chooseRoomEvent's rollRoomEvent(rng, depth)
      // call never produces it (only makeNextRoom's forceElite placement does), so
      // this case never actually executes yet. U9 wires real elite spawning and a
      // tuned score + engagement floor into this switch and the room-handling loop
      // below.
      return 0;
  }
}

function chooseRoomEvent(run: RunState, rng: SimRng, depth: number): RoomEvent {
  if (run.scoutCharges <= 0) {
    return rollRoomEvent(rng, depth);
  }

  const options = Array.from({ length: 3 }, () => rollRoomEvent(rng, depth));
  run.scoutCharges--;

  return [...options].sort(
    (left, right) => roomEventScore(run, right) - roomEventScore(run, left),
  )[0];
}

/** Hard cap so a stalemate deck (all block) terminates as a loss instead of looping. */
export const SIM_BATTLE_TURN_CAP = 60;

/** The telegraphed intent's raw view, or null once voided (nothing incoming). */
function incomingIntent(state: TurnBattleState) {
  if (!state.intent.current || state.intent.voided) return null;
  return intentView(state.intent.current);
}

/**
 * Greedy multi-card policy: lethal first, otherwise best value-per-energy with
 * block weighted up against a telegraphed attack (the read the telegraph buys).
 */
function pickCardToPlay(state: TurnBattleState, emphasis: CardEmphasis | null): Card | null {
  const playable = playableCards(state);
  if (playable.length === 0) return null;
  const incoming = incomingIntent(state);
  const enemyEffectiveHp = state.enemy.hp + state.enemy.block;
  let best: Card | null = null;
  let bestScore = -Infinity;
  for (const card of playable) {
    if (cardEffectAmount(card, 'damage') >= enemyEffectiveHp + state.enemy.armor) return card;
    let score = simCardScore(card, emphasis);
    if (incoming?.kind === 'attack') score += cardEffectAmount(card, 'block') * 0.8;
    if (state.player.hp < state.player.maxHp * 0.5) score += cardEffectAmount(card, 'heal') * 0.8;
    if (score > bestScore) {
      bestScore = score;
      best = card;
    }
  }
  return best;
}

/** Free actions (R16): potion when hurt, bomb for lethal, smoke bomb against a heavy telegraph, armor against a hit. */
function pickBattleItem(run: RunState, state: TurnBattleState): InventoryItem | null {
  const incoming = incomingIntent(state);
  for (const item of run.inventory) {
    if (!item.usableInCombat) continue;
    if (item.kind === 'damage' && state.enemy.hp + state.enemy.block <= item.amount) return item;
    if (
      item.kind === 'heal' &&
      state.player.hp < 12 &&
      state.player.hp <= state.player.maxHp - item.amount
    ) {
      return item;
    }
    if (item.kind === 'skip_attack' && incoming?.kind === 'attack' && incoming.magnitude >= 8) {
      return item;
    }
    if (
      item.kind === 'shield' &&
      incoming?.kind === 'attack' &&
      incoming.magnitude >= 6 &&
      state.player.block === 0
    ) {
      return item;
    }
  }
  return null;
}

/**
 * One battle through the real turn engine (U13/KTD1): the same createBattle/
 * playCard/endTurn commands the scene issues, so economy assertions measure
 * the shipped rules rather than a parallel model.
 */
export function simulateBattle(
  run: RunState,
  enemy: EnemyInstance,
  rng: SimRng,
  emphasis: CardEmphasis | null = null,
): { won: boolean } {
  let { state } = createBattle(
    {
      deck: run.cardCollection,
      player: { hp: run.hp, maxHp: run.maxHp, armor: run.armor },
      enemy: {
        id: enemy.def.id,
        name: enemy.def.name,
        hp: enemy.hp,
        maxHp: enemy.maxHp,
        armor: enemy.armor,
      },
      pattern: enemy.pattern,
    },
    rng,
  );

  let guard = 0;
  while (state.phase !== 'decided' && state.turn <= SIM_BATTLE_TURN_CAP && guard++ < 2000) {
    const item = pickBattleItem(run, state);
    if (item) {
      const result = useItem(state, item, rng);
      if (!result.rejected) {
        run.removeItem(item.uid);
        state = result.state;
        continue;
      }
    }
    const card = pickCardToPlay(state, emphasis);
    if (card) {
      const result = playCard(state, card.uid, rng);
      if (!result.rejected) {
        state = result.state;
        continue;
      }
    }
    const result = endTurn(state, rng);
    if (result.rejected) break;
    state = result.state;
  }

  run.hp = state.outcome === 'defeat' ? 0 : state.player.hp;
  return { won: state.outcome === 'victory' };
}

const DEFAULT_RUN_OPTIONS: SimRunOptions = {
  strategy: 'cautious',
  maxStrata: MAX_SIMULATED_STRATA,
  convert: convertGoldToEmbers,
  createRng: (seed) => new SeededRng(seed >>> 0),
  emphasis: null,
};

export function simulateRun(
  seed: number,
  scenario: BalanceScenario,
  options: Partial<SimRunOptions> = {},
): SimRunResult {
  const { strategy, maxStrata, convert, createRng, emphasis } = {
    ...DEFAULT_RUN_OPTIONS,
    ...options,
  };
  const rng = createRng(seed);
  const run = createScenarioRun(seed, scenario);
  let encounters = 0;
  let reachedBoss = false;
  let bossesCleared = 0;

  // Depth climbs forever; a boss sits at every stratum boundary and the loop only
  // exits on a bank or a death. The maxStrata guard caps the boundary count.
  for (let depth = 2; ; depth++) {
    run.depth = depth;
    const atBoss = isStratumBoundary(depth);
    maybeUseDungeonPotion(run, atBoss);

    if (atBoss) {
      reachedBoss = true;
      const battle = simulateBattle(run, spawnBoss(rng, depth), rng, emphasis);
      if (!battle.won) {
        return {
          victory: false,
          reachedBoss: true,
          clearedFirstGate: bossesCleared >= 1,
          deathDepth: depth,
          stratumReached: stratumForDepth(depth),
          encounters,
          convertedEmbers: 0,
        };
      }
      run.enemiesDefeated++;
      applySimulatedPostBattleRewards(run, rng, depth);
      bossesCleared++;
      const stratumCleared = stratumForDepth(depth);
      run.stratum = stratumCleared;

      if (!shouldDelve(strategy, stratumCleared, maxStrata)) {
        return {
          victory: true,
          reachedBoss: true,
          clearedFirstGate: true,
          deathDepth: null,
          stratumReached: stratumCleared,
          encounters,
          convertedEmbers: convert(run.gold),
        };
      }
      commitDelve(run); // advance stratum + gate-clear breather, then keep descending
      continue;
    }

    const event = chooseRoomEvent(run, rng, depth);
    if (event === 'encounter') {
      encounters++;
      const battle = simulateBattle(run, spawnEnemy(rng, depth), rng, emphasis);
      if (!battle.won) {
        return {
          victory: false,
          reachedBoss,
          clearedFirstGate: bossesCleared >= 1,
          deathDepth: depth,
          stratumReached: stratumForDepth(depth),
          encounters,
          convertedEmbers: 0,
        };
      }
      run.enemiesDefeated++;
      applySimulatedPostBattleRewards(run, rng, depth);
      continue;
    }

    if (event === 'chest') {
      const reward = rollChestReward(run, rng, depth);
      if (reward.kind === 'inventory_full') replaceInventoryItem(run, reward.item);
      continue;
    }

    if (event === 'rest') {
      applySimulatedRest(run);
      continue;
    }

    if (event === 'potion') {
      const reward = awardPotionItem(run, makeItem(depth >= 7 ? 'large_potion' : 'small_potion'));
      if (reward.kind === 'inventory_full') replaceInventoryItem(run, reward.item);
    }
  }
}

export function simulateScenarioSummary(
  scenario: BalanceScenario,
  runs = 400,
  options: Partial<SimRunOptions> = {},
): BalanceSimulationSummary {
  let wins = 0;
  let bossReached = 0;
  let deaths = 0;
  let deathDepthTotal = 0;
  const byEncounter: Record<string, EncounterBucketSummary> = {};

  for (let seed = 1; seed <= runs; seed++) {
    const result = simulateRun(seed, scenario, options);
    if (result.reachedBoss) bossReached++;
    if (result.victory) wins++;
    if (!result.victory) {
      deaths++;
      deathDepthTotal += result.deathDepth ?? MAX_DEPTH;
    }

    const key = result.encounters >= 3 ? '3+' : String(result.encounters);
    byEncounter[key] ??= { total: 0, wins: 0, bossReached: 0 };
    byEncounter[key].total++;
    if (result.victory) byEncounter[key].wins++;
    if (result.reachedBoss) byEncounter[key].bossReached++;
  }

  return {
    runs,
    winRate: wins / runs,
    bossReachRate: bossReached / runs,
    bossKillGivenReach: bossReached === 0 ? 0 : wins / bossReached,
    avgDeathDepth: deaths === 0 ? MAX_DEPTH : deathDepthTotal / deaths,
    byEncounter,
  };
}

export interface EmphasisPolicySummary {
  emphasis: CardEmphasis;
  runs: number;
  winRate: number;
  bossReachRate: number;
}

export interface EmphasisDominanceOptions {
  runs?: number;
  margin?: number;
}

export interface EmphasisDominanceSummary {
  margin: number;
  policies: Record<CardEmphasis, EmphasisPolicySummary>;
  spread: number;
  dominantEmphasis: CardEmphasis | null;
  hasDominantEmphasis: boolean;
}

const CARD_EMPHASES: CardEmphasis[] = ['damage', 'block', 'disruption'];

/**
 * The no-dominant-policy gate under the deck model (U13): sweep the three card
 * emphases across the seed spread and prove none beats the rest by more than
 * `margin` win rate — the successor to the retired matchup-role gate.
 */
export function assessCardEmphasisDominance(
  scenario: BalanceScenario = {},
  options: EmphasisDominanceOptions = {},
): EmphasisDominanceSummary {
  const runs = options.runs ?? 120;
  const margin = options.margin ?? 0.12;
  const entries = CARD_EMPHASES.map((emphasis) => {
    const summary = simulateScenarioSummary(scenario, runs, { emphasis });
    return [
      emphasis,
      {
        emphasis,
        runs,
        winRate: summary.winRate,
        bossReachRate: summary.bossReachRate,
      },
    ] as const;
  });
  const policies = Object.fromEntries(entries) as Record<CardEmphasis, EmphasisPolicySummary>;
  const ordered = [...Object.values(policies)].sort((left, right) => right.winRate - left.winRate);
  const spread = ordered[0].winRate - ordered[ordered.length - 1].winRate;
  const dominantEmphasis =
    ordered[0].winRate > ordered[1].winRate + margin ? ordered[0].emphasis : null;

  return {
    margin,
    policies,
    spread,
    dominantEmphasis,
    hasDominantEmphasis: dominantEmphasis !== null,
  };
}

// ---------------------------------------------------------------- delve economy

export interface DelveStrategySummary {
  strategy: DelveStrategy;
  /** Runs that actually reached the first gate, where the bank-or-delve choice applies. */
  gateRuns: number;
  /** Among gate-reachers: fraction that banked a win. */
  bankRate: number;
  /** Among gate-reachers: fraction that died chasing a deeper bank. */
  deathRate: number;
  /** Among gate-reachers: expected Embers minted from Gold (the line's payoff). */
  avgConvertedEmbers: number;
  /** Among gate-reachers: average deepest stratum reached. */
  avgStratumReached: number;
}

export interface DelveEconomyOptions {
  runs?: number;
  maxStrata?: number;
  convert?: GoldConversion;
}

export interface DelveEconomySummary {
  maxStrata: number;
  cautious: DelveStrategySummary;
  moderate: DelveStrategySummary;
  aggressive: DelveStrategySummary;
}

function summarizeStrategy(
  strategy: DelveStrategy,
  scenario: BalanceScenario,
  runs: number,
  maxStrata: number,
  convert: GoldConversion,
): DelveStrategySummary {
  let gateRuns = 0;
  let banked = 0;
  let embersTotal = 0;
  let strataTotal = 0;

  for (let seed = 1; seed <= runs; seed++) {
    const result = simulateRun(seed, scenario, { strategy, maxStrata, convert });
    if (!result.clearedFirstGate) continue; // the line only diverges once the gate is reached
    gateRuns++;
    if (result.victory) banked++;
    embersTotal += result.convertedEmbers;
    strataTotal += result.stratumReached;
  }

  return {
    strategy,
    gateRuns,
    bankRate: gateRuns === 0 ? 0 : banked / gateRuns,
    deathRate: gateRuns === 0 ? 0 : (gateRuns - banked) / gateRuns,
    avgConvertedEmbers: gateRuns === 0 ? 0 : embersTotal / gateRuns,
    avgStratumReached: gateRuns === 0 ? 0 : strataTotal / gateRuns,
  };
}

/**
 * Model the bank-or-delve economy across the three strategy lines. Conditioned on
 * reaching the first gate so the comparison isolates the push-your-luck decision
 * rather than the base run's difficulty.
 */
export function simulateDelveEconomy(
  scenario: BalanceScenario,
  options: DelveEconomyOptions = {},
): DelveEconomySummary {
  const runs = options.runs ?? 240;
  const maxStrata = options.maxStrata ?? MAX_SIMULATED_STRATA;
  const convert = options.convert ?? convertGoldToEmbers;

  return {
    maxStrata,
    cautious: summarizeStrategy('cautious', scenario, runs, maxStrata, convert),
    moderate: summarizeStrategy('moderate', scenario, runs, maxStrata, convert),
    aggressive: summarizeStrategy('aggressive', scenario, runs, maxStrata, convert),
  };
}

export interface DelveDominance {
  cautiousDominant: boolean;
  aggressiveDominant: boolean;
  hasDominantLine: boolean;
}

/**
 * A line "dominates" when its expected Ember payoff beats both rivals by more than
 * `margin` Embers — i.e. a rational player would always pick it, collapsing the
 * decision. Healthy tuning keeps the three lines within a margin of each other.
 */
export function assessDelveDominance(economy: DelveEconomySummary, margin = 1): DelveDominance {
  const c = economy.cautious.avgConvertedEmbers;
  const m = economy.moderate.avgConvertedEmbers;
  const a = economy.aggressive.avgConvertedEmbers;

  const cautiousDominant = c > m + margin && c > a + margin;
  const aggressiveDominant = a > m + margin && a > c + margin;

  return {
    cautiousDominant,
    aggressiveDominant,
    hasDominantLine: cautiousDominant || aggressiveDominant,
  };
}
