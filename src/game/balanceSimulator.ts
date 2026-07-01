import { MAX_DEPTH } from '../config';
import { CARD_DEFS, Card, makeCard } from '../data/cards';
import { type PendingPrep } from '../data/campfirePurchases';
import { spawnBoss, spawnEnemy } from '../data/enemies';
import { InventoryItem, type InventoryItemDef, makeItem } from '../data/items';
import type { StarterKitId } from '../data/starterKits';
import { rollRoomEvent, type RoomEvent } from '../dungeon/rooms';
import { RunState } from '../state';
import { combatCardScore, selectCombatHand } from './cardSelection';
import { applyPendingPrepToRun } from './campfirePrep';
import type { ActiveStatusEffect } from './combat';
import { combatActionEffects, matchupPayoffForAction, resolveRound } from './combat';
import { emitBattleWon } from './combatEvents';
import { ensureRelicBehaviorsWired } from './relicBehaviors';
import { commitDelve } from './delve';
import { planEnemyIntent } from './enemyIntent';
import {
  type ActionFamily,
  familyForEffects,
  type MatchupRole,
  roleForFamily,
} from './familyMatchup';
import { convertGoldToEmbers } from './metaRewards';
import { awardEnemyGold, awardPotionItem, rollChestReward } from './rewards';
import { GameRng } from './rng';
import { startingCardIdsForRun } from './startingCards';
import { isStratumBoundary, stratumForDepth } from './strata';
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
  preferredRole: MatchupRole | null;
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

export type PlayerAction =
  | { kind: 'card'; card: Card }
  | { kind: 'item'; item: InventoryItem }
  | { kind: 'punch' };

export interface SimBattleState {
  rng: SimRng;
  round: number;
  hand: Card[];
  inventory: InventoryItem[];
  playerHp: number;
  playerMaxHp: number;
  playerArmor: number;
  playerStatuses: ActiveStatusEffect[];
  playerUsed: Set<number>;
  enemyDef: ReturnType<typeof spawnBoss>['def'];
  enemyCards: Card[];
  enemyHp: number;
  enemyMaxHp: number;
  enemyArmor: number;
  enemyStatuses: ActiveStatusEffect[];
  enemyUsed: Set<number>;
}

export interface EnemyDecision {
  action: Parameters<typeof resolveRound>[0]['enemyAction'];
  used: Set<number>;
  nextRng: SimRng;
  intentFamily: ActionFamily;
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

function emptyStatuses(): ActiveStatusEffect[] {
  return [];
}

function inventoryValue(items: readonly InventoryItem[]): number {
  return items.reduce((sum, item) => sum + (ITEM_VALUE[item.id] ?? 10), 0);
}

function handScore(cards: readonly Card[]): number {
  return cards.reduce((sum, card) => sum + combatCardScore(card), 0);
}

function chooseStartingCards(run: RunState): void {
  const offers = startingCardIdsForRun(run)
    .map((id) => CARD_DEFS.find((card) => card.id === id))
    .filter((card): card is (typeof CARD_DEFS)[number] => !!card)
    .map((card) => makeCard(card));

  offers
    .sort((a, b) => combatCardScore(b) - combatCardScore(a))
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

function chooseRewardCard(run: RunState, enemyCards: readonly Card[]): void {
  const currentScore = handScore(run.combatHand);
  let best: Card | null = null;
  let bestScore = currentScore;

  for (const card of enemyCards) {
    const nextScore = handScore(selectCombatHand([...run.cardCollection, card]));
    if (nextScore > bestScore) {
      best = card;
      bestScore = nextScore;
    }
  }

  if (best) run.addCard(best);
}

export function applySimulatedPostBattleRewards(
  run: RunState,
  rng: GameRng,
  depth: number,
  enemyCards: readonly Card[],
): void {
  ensureRelicBehaviorsWired();
  const { heal } = emitBattleWon(run.relics.map((relic) => relic.id));
  if (heal > 0) run.heal(heal);
  awardEnemyGold(run, rng, depth);
  chooseRewardCard(run, enemyCards);
}

export function applySimulatedRest(run: RunState): void {
  const handIds = new Set(run.combatHand.map((card) => card.uid));
  const removable = [...run.cardCollection]
    .filter((card) => !handIds.has(card.uid))
    .sort((a, b) => combatCardScore(a) - combatCardScore(b))[0];

  if (removable) {
    const payment = payRestAction(run, 'remove');
    if (!payment.ok) return;
    if (run.removeCard(removable.uid)) return;
    run.gold += payment.cost;
    return;
  }

  const best = [...run.combatHand].sort((a, b) => combatCardScore(b) - combatCardScore(a))[0];
  if (!best) return;
  const payment = payRestAction(run, 'upgrade');
  if (!payment.ok) return;
  upgradeCard(best);
  run.refreshCombatHand();
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
      return 40 + Math.max(0, 5 - run.combatHand.length) * 4;
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

function cloneBattleState(state: SimBattleState): SimBattleState {
  return {
    ...state,
    inventory: state.inventory.map((item) => ({ ...item })),
    playerStatuses: state.playerStatuses.map((status) => ({ ...status })),
    enemyStatuses: state.enemyStatuses.map((status) => ({ ...status })),
    playerUsed: new Set(state.playerUsed),
    enemyUsed: new Set(state.enemyUsed),
    rng: state.rng.clone(),
  };
}

function availablePlayerCards(state: SimBattleState): Card[] {
  const available = state.hand.filter((card) => !state.playerUsed.has(card.uid));
  return available.length > 0 ? available : state.hand;
}

function listPlayerActions(state: SimBattleState): PlayerAction[] {
  const actions: PlayerAction[] = availablePlayerCards(state).map((card) => ({
    kind: 'card',
    card,
  }));
  state.inventory
    .filter((item) => item.usableInCombat)
    .forEach((item) => actions.push({ kind: 'item', item }));
  actions.push({ kind: 'punch' });
  return actions;
}

function toCombatAction(action: PlayerAction): Parameters<typeof resolveRound>[0]['playerAction'] {
  if (action.kind === 'card') return { actor: 'player', kind: 'card', card: action.card };
  if (action.kind === 'item') return { actor: 'player', kind: 'item', item: action.item };
  return { actor: 'player', kind: 'punch' };
}

function chooseEnemyDecision(state: SimBattleState): EnemyDecision {
  const nextRng = state.rng.clone();
  const intent = planEnemyIntent({
    enemy: {
      def: state.enemyDef,
      hp: state.enemyHp,
      maxHp: state.enemyMaxHp,
      armor: state.enemyArmor,
      statuses: state.enemyStatuses,
      cards: state.enemyCards,
    },
    round: state.round,
    usedCardUids: state.enemyUsed,
    rng: nextRng,
  });
  return {
    action: intent.action,
    used: intent.usedCardUids,
    nextRng,
    intentFamily: intent.summary.family,
  };
}

function statusScore(statuses: SimBattleState['playerStatuses'], multiplier = 1): number {
  return statuses.reduce((sum, status) => {
    if (status.type === 'stun') return sum + 22 * multiplier;
    return sum + status.amount * status.remainingTurns * 4 * multiplier;
  }, 0);
}

function evaluateBattleState(state: SimBattleState): number {
  if (state.enemyHp <= 0)
    return 1_000_000 + state.playerHp * 1000 + inventoryValue(state.inventory) * 10;
  if (state.playerHp <= 0) return -1_000_000 - state.enemyHp * 100;

  return (
    state.playerHp * 120 -
    state.enemyHp * 105 +
    statusScore(state.enemyStatuses, 1) -
    statusScore(state.playerStatuses, 1.2) +
    inventoryValue(state.inventory) * 12
  );
}

function roleForPlayerAction(action: PlayerAction): MatchupRole | null {
  return roleForFamily(familyForEffects(combatActionEffects(toCombatAction(action))));
}

export function applyRound(
  state: SimBattleState,
  action: PlayerAction,
  enemyDecision: EnemyDecision,
): SimBattleState {
  const next = cloneBattleState(state);
  next.rng = enemyDecision.nextRng.clone();
  next.enemyUsed = new Set(enemyDecision.used);

  const playerStunned = next.playerStatuses.some((status) => status.type === 'stun');
  if (!playerStunned) {
    if (action.kind === 'card') {
      next.playerUsed.add(action.card.uid);
      if (next.hand.every((card) => next.playerUsed.has(card.uid))) {
        next.playerUsed.clear();
      }
    } else if (action.kind === 'item') {
      next.inventory = next.inventory.filter((item) => item.uid !== action.item.uid);
    }
  }

  const playerAction = toCombatAction(action);
  const resolved = resolveRound({
    player: {
      id: 'player',
      name: 'Player',
      hp: next.playerHp,
      maxHp: next.playerMaxHp,
      armor: next.playerArmor,
      statuses: next.playerStatuses,
    },
    enemy: {
      id: next.enemyDef.id,
      name: next.enemyDef.name,
      hp: next.enemyHp,
      maxHp: next.enemyMaxHp,
      armor: next.enemyArmor,
      statuses: next.enemyStatuses,
    },
    playerAction,
    enemyAction: enemyDecision.action,
    playerMatchupPayoff: matchupPayoffForAction(playerAction, enemyDecision.intentFamily),
  });

  next.playerHp = resolved.player.hp;
  next.enemyHp = resolved.enemy.hp;
  next.playerStatuses = resolved.player.statuses;
  next.enemyStatuses = resolved.enemy.statuses;
  next.round++;
  return next;
}

function evaluatePlayerActionScore(
  state: SimBattleState,
  action: PlayerAction,
  enemyDecision: EnemyDecision,
): number {
  const beforePlayerHp = state.playerHp;
  const beforeEnemyHp = state.enemyHp;
  const next = applyRound(state, action, enemyDecision);
  let score = evaluateBattleState(next);
  score += (beforeEnemyHp - next.enemyHp) * 400;
  score += (next.playerHp - beforePlayerHp) * 160;
  if (action.kind === 'item') {
    score -= (ITEM_VALUE[action.item.id] ?? 10) * 120;
  }
  return score;
}

export function choosePlayerAction(
  state: SimBattleState,
  preferredRole: MatchupRole | null = null,
): {
  action: PlayerAction;
  enemyDecision: EnemyDecision;
} {
  const enemyDecision = chooseEnemyDecision(state);
  const actions = listPlayerActions(state);
  const roleActions = preferredRole
    ? actions.filter((action) => roleForPlayerAction(action) === preferredRole)
    : [];
  const candidates = roleActions.length > 0 ? roleActions : actions;
  let bestAction = candidates[0];
  let bestScore = -Infinity;

  for (const action of candidates) {
    const score = evaluatePlayerActionScore(state, action, enemyDecision);
    if (score > bestScore) {
      bestScore = score;
      bestAction = action;
    }
  }

  return { action: bestAction, enemyDecision };
}

function simulateBattle(
  run: RunState,
  enemy: ReturnType<typeof spawnEnemy>,
  rng: SimRng,
  preferredRole: MatchupRole | null,
): { won: boolean; enemyCards: Card[] } {
  const state: SimBattleState = {
    rng,
    round: 1,
    hand: [...run.combatHand],
    inventory: [...run.inventory],
    playerHp: run.hp,
    playerMaxHp: run.maxHp,
    playerArmor: run.armor,
    playerStatuses: emptyStatuses(),
    playerUsed: new Set(),
    enemyDef: enemy.def,
    enemyCards: enemy.cards,
    enemyHp: enemy.hp,
    enemyMaxHp: enemy.maxHp,
    enemyArmor: enemy.armor,
    enemyStatuses: emptyStatuses(),
    enemyUsed: new Set(),
  };

  while (state.playerHp > 0 && state.enemyHp > 0 && state.round < 50) {
    const { action, enemyDecision } = choosePlayerAction(state, preferredRole);
    const next = applyRound(state, action, enemyDecision);
    Object.assign(state, next);
  }

  run.hp = state.playerHp;
  run.inventory = state.inventory;
  return { won: state.enemyHp <= 0, enemyCards: enemy.cards };
}

const DEFAULT_RUN_OPTIONS: SimRunOptions = {
  strategy: 'cautious',
  maxStrata: MAX_SIMULATED_STRATA,
  convert: convertGoldToEmbers,
  createRng: (seed) => new SeededRng(seed >>> 0),
  preferredRole: null,
};

export function simulateRun(
  seed: number,
  scenario: BalanceScenario,
  options: Partial<SimRunOptions> = {},
): SimRunResult {
  const { strategy, maxStrata, convert, createRng, preferredRole } = {
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
      const battle = simulateBattle(run, spawnBoss(rng, depth), rng, preferredRole);
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
      applySimulatedPostBattleRewards(run, rng, depth, battle.enemyCards);
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
      const battle = simulateBattle(
        run,
        spawnEnemy(rng, depth, Math.max(run.combatHand.length, 1)),
        rng,
        preferredRole,
      );
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
      applySimulatedPostBattleRewards(run, rng, depth, battle.enemyCards);
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

export interface MatchupRolePolicySummary {
  role: MatchupRole;
  runs: number;
  winRate: number;
  bossReachRate: number;
}

export interface MatchupRoleDominanceOptions {
  runs?: number;
  margin?: number;
}

export interface MatchupRoleDominanceSummary {
  margin: number;
  policies: Record<MatchupRole, MatchupRolePolicySummary>;
  spread: number;
  dominantRole: MatchupRole | null;
  hasDominantRole: boolean;
}

const MATCHUP_ROLES: MatchupRole[] = ['aggression', 'defense', 'disruption'];

export function assessMatchupRoleDominance(
  scenario: BalanceScenario = {},
  options: MatchupRoleDominanceOptions = {},
): MatchupRoleDominanceSummary {
  const runs = options.runs ?? 120;
  const margin = options.margin ?? 0.12;
  const entries = MATCHUP_ROLES.map((role) => {
    const summary = simulateScenarioSummary(scenario, runs, { preferredRole: role });
    return [
      role,
      {
        role,
        runs,
        winRate: summary.winRate,
        bossReachRate: summary.bossReachRate,
      },
    ] as const;
  });
  const policies = Object.fromEntries(entries) as Record<MatchupRole, MatchupRolePolicySummary>;
  const ordered = [...Object.values(policies)].sort((left, right) => right.winRate - left.winRate);
  const spread = ordered[0].winRate - ordered[ordered.length - 1].winRate;
  const dominantRole = ordered[0].winRate > ordered[1].winRate + margin ? ordered[0].role : null;

  return {
    margin,
    policies,
    spread,
    dominantRole,
    hasDominantRole: dominantRole !== null,
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
