import { BOSS_ROOM_INTERVAL, MAX_DEPTH, RUN_LENGTH } from '../config';
import { Card, CARD_DEFS, cardEffectAmount, makeCard, type ArchetypeId } from '../data/cards';
import { hasStatus, modifiedDamage, statusValue } from './combat';
import {
  EnemyInstance,
  getEnemyTierForDepth,
  spawnScenarioEncounter,
  toEngineEnemies,
} from '../data/enemies';
import { InventoryItem, makeItem } from '../data/items';
import { requiredLevelForArchetype } from '../data/levelUnlocks';
import { makeRelic, type RelicId } from '../data/relics';
import type { ScenarioId } from '../data/scenarios';
import {
  decadeForDepth,
  isEliteEligibleDepth,
  rollRoomEvent,
  type RoomEvent,
} from '../dungeon/rooms';
import { RunState } from '../state';
import { applyLoadoutToRun } from './campfirePrep';
import { createDefaultProgressionState } from '../meta';
import { createDefaultProfileState, xpForLevel } from '../profile';
import { emitBattleWon } from './combatEvents';
import { ensureRelicBehaviorsWired } from './relicBehaviors';
import { relicBattleSetup } from './relicRegistry';
import { intentView } from './intentPatterns';
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
import { applyPoisonedRoomEntryDamage, shouldPreventPlayerBlock } from './scenarioRules';
import { startingCardIdsForRun } from './startingCards';
import {
  cardCost,
  createBattle,
  endTurn,
  playableCards,
  playCard,
  resolveOffensiveTarget,
  TurnBattleState,
  useItem,
} from './turnEngine';
import { upgradeCard } from './cardUpgrade';
import { canUseRestAction, payRestAction } from './restEconomy';

/**
 * A cloneable RNG threaded through the single-arc survival simulation. The seed-stability gate (R5)
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

interface SimRunOptions {
  /** Root RNG factory; the gate injects an observed RNG here (KTD4). Defaults to a plain seeded RNG. */
  createRng: SimRngFactory;
  /** Optional slant for the greedy card policy — the no-dominant-policy gate sweeps these. */
  emphasis: CardEmphasis | null;
}

export interface BalanceScenario {
  playerScenarioId?: ScenarioId | null;
  starterCardVarietyUnlocked?: boolean;
  activeArchetypeId?: ArchetypeId | null;
  /** Relics granted directly at run start — the knob that lets the harness measure win-rate
   * impact for relics that aren't in the starter pool (bypasses the meta relic-path/unlock
   * economy entirely; this harness cares about battle/economy effects, not acquisition odds). */
  startingRelicIds?: RelicId[];
}

export type BalanceLoadoutTier = 'bare' | 'mid' | 'strong';

/**
 * Harness-owned access tiers for the fixed 100-room arc. Level and discovery only gate access in
 * the product, so these scenarios model the loadout a player can choose at those access bands; they
 * do not grant hidden stats or extra resources beyond the selected archetype/starting relic.
 */
export const BALANCE_LOADOUT_SCENARIOS: Record<BalanceLoadoutTier, BalanceScenario> = {
  bare: {},
  mid: {
    activeArchetypeId: 'barbarian',
    startingRelicIds: ['iron_will'],
  },
  strong: {
    activeArchetypeId: 'necromancer',
    starterCardVarietyUnlocked: true,
    startingRelicIds: ['iron_will'],
  },
};

export type ScenarioBalanceProfileId =
  | 'clean_supported'
  | 'poisoned_supported'
  | 'lost_left_arm_supported'
  | 'enemies_doubled_supported'
  | 'lost_left_arm_fixed_strong_diagnostic';

export type ScenarioBalanceProfileRole = 'supported' | 'diagnostic';

export interface ScenarioBalanceProfile {
  id: ScenarioBalanceProfileId;
  label: string;
  role: ScenarioBalanceProfileRole;
  playerScenarioId: ScenarioId;
  scenario: BalanceScenario;
}

function scenarioWithPlayerScenario(
  base: BalanceScenario,
  playerScenarioId: ScenarioId,
): BalanceScenario {
  return {
    ...base,
    startingRelicIds: base.startingRelicIds ? [...base.startingRelicIds] : undefined,
    playerScenarioId,
  };
}

/**
 * Scenario-specific high-access routes used by the hard-Scenario contract.
 * These are fixed profile data, not a dynamic "best route" search, so a band
 * cannot pass by silently switching archetypes after a tuning regression.
 */
export const SCENARIO_BALANCE_PROFILES: readonly ScenarioBalanceProfile[] = [
  {
    id: 'clean_supported',
    label: 'Clean supported',
    role: 'supported',
    playerScenarioId: 'escape_the_dungeon',
    scenario: scenarioWithPlayerScenario(BALANCE_LOADOUT_SCENARIOS.strong, 'escape_the_dungeon'),
  },
  {
    id: 'poisoned_supported',
    label: 'Poisoned supported',
    role: 'supported',
    playerScenarioId: 'im_poisoned',
    scenario: scenarioWithPlayerScenario(BALANCE_LOADOUT_SCENARIOS.strong, 'im_poisoned'),
  },
  {
    id: 'lost_left_arm_supported',
    label: 'Lost Left Arm supported',
    role: 'supported',
    playerScenarioId: 'lost_left_arm',
    scenario: scenarioWithPlayerScenario(BALANCE_LOADOUT_SCENARIOS.mid, 'lost_left_arm'),
  },
  {
    id: 'enemies_doubled_supported',
    label: 'Enemies Are Doubled supported',
    role: 'supported',
    playerScenarioId: 'enemies_doubled',
    // U1 characterization: Barbarian plus Iron Will had the best current boss reach
    // among named high-access candidates before U2 retuned doubled encounters.
    scenario: scenarioWithPlayerScenario(BALANCE_LOADOUT_SCENARIOS.mid, 'enemies_doubled'),
  },
  {
    id: 'lost_left_arm_fixed_strong_diagnostic',
    label: 'Lost Left Arm fixed strong diagnostic',
    role: 'diagnostic',
    playerScenarioId: 'lost_left_arm',
    scenario: scenarioWithPlayerScenario(BALANCE_LOADOUT_SCENARIOS.strong, 'lost_left_arm'),
  },
];

export interface EncounterBucketSummary {
  total: number;
  wins: number;
  bossReached: number;
}

export interface EliteBucketSummary {
  offered: number;
  engaged: number;
  wins: number;
}

/** Depth-tier band, excluding elite/boss (tracked separately). */
type StandardTier = 'weak' | 'medium' | 'strong';

export interface TierBucketSummary {
  total: number;
  wins: number;
}

export interface BalanceSimulationSummary {
  runs: number;
  winRate: number;
  bossReachRate: number;
  bossKillGivenReach: number;
  avgDeathDepth: number;
  medianDeathDepth: number;
  /** Fraction of runs that reached rooms 1, 11, 21, ..., 91. */
  decadeSurvivalRates: number[];
  byEncounter: Record<string, EncounterBucketSummary>;
  eliteBucket: EliteBucketSummary;
  /** engaged / offered — 0 if never offered across the sample. */
  eliteEngagementRate: number;
  /** wins / engaged — 0 if never engaged across the sample. */
  eliteWinRate: number;
  /** Individual 'encounter'-room battle outcomes (U12), bucketed by `getEnemyTierForDepth`. */
  byTier: Record<StandardTier, TierBucketSummary>;
  /** wins / total for weak-tier fights specifically — fresh-deck winnability (U12 tier-1 floor). 0 if none fought. */
  weakTierWinRate: number;
}

export interface SimRunResult {
  /** Escaped — defeated the room-100 boss, the run's only win condition (R1). */
  victory: boolean;
  reachedBoss: boolean;
  /** Cleared the first boss (room 10) — retained as a determinism-signature signal. */
  clearedFirstBoss: boolean;
  deathDepth: number | null;
  encounters: number;
  /** How many times the per-decade elite guarantee fired this run (KTD3 parity), regardless of whether it was fought. */
  eliteEligible: number;
  /** How many elite fights this run actually engaged. */
  eliteEncounters: number;
  eliteWins: number;
  finalGold: number;
  /** Individual 'encounter'-room battle outcomes this run, bucketed by tier (U12). */
  tierFights: Record<StandardTier, TierBucketSummary>;
}

function emptyTierFights(): Record<StandardTier, TierBucketSummary> {
  return {
    weak: { total: 0, wins: 0 },
    medium: { total: 0, wins: 0 },
    strong: { total: 0, wins: 0 },
  };
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
    else if (effect.kind === 'strength') {
      // Scaling: worth more than its face because it rides every later hit. A flat proxy — the
      // fight-length value lives in the play policy, not here (B5).
      score += effect.amount * (emphasis === 'damage' ? 6 : 4.5);
    } else if (effect.kind === 'status') {
      // vulnerable/weak/frail carry amount 1 (flags); value them as tactical utility, not by amount.
      // Tuned so no single emphasis dominates the seed spread (the disruption line ran ahead).
      if (effect.status === 'vulnerable') score += emphasis === 'disruption' ? 8 : 6;
      else if (effect.status === 'weak' || effect.status === 'frail')
        score += emphasis === 'disruption' ? 5 : 4;
      else score += effect.amount * (emphasis === 'disruption' ? 6 : 3); // poison/burn DoT
    } else score += effect.amount * 3; // draw/energy cantrips compress turns
  }
  // Exhaust cards fire once per battle — discount their recurring value slightly so the curation
  // policy prefers repeatable engines when the raw scores are close.
  if (card.exhaust) score *= 0.85;
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

function createScenarioRun(seed: number, scenario: BalanceScenario): RunState {
  const run = new RunState(String(seed), `sim-${seed}`);
  run.scenarioId = scenario.playerScenarioId ?? null;
  const requiredArchetypeLevel = scenario.activeArchetypeId
    ? (requiredLevelForArchetype(scenario.activeArchetypeId) ?? 1)
    : 1;
  const level = Math.max(scenario.starterCardVarietyUnlocked ? 4 : 1, requiredArchetypeLevel);
  applyLoadoutToRun(
    run,
    {
      ...createDefaultProgressionState(),
      activeArchetypeId: scenario.activeArchetypeId ?? null,
    },
    { ...createDefaultProfileState(), xp: xpForLevel(level) },
    run.scenarioId,
  );

  for (const relicId of scenario.startingRelicIds ?? []) {
    run.addRelic(makeRelic(relicId));
  }

  chooseStartingCards(run);
  return run;
}

/**
 * Deck-composition reward heuristic (KTD9): take the best offer only when it
 * beats the deck's average card quality — adding filler dilutes every draw.
 */
function chooseRewardCard(run: RunState, offers: readonly Card[]): void {
  if (offers.length === 0) return;
  const size = run.cardCollection.length;
  const deckAverage =
    size === 0 ? 0 : run.cardCollection.reduce((sum, card) => sum + simCardScore(card), 0) / size;
  const best = [...offers].sort((a, b) => simCardScore(b) - simCardScore(a))[0];
  // Curation with a rising dilution bar (B5): in the full-collection reshuffle, every card you add
  // dilutes the 5-card opening you draw, so a bigger deck demands a proportionally better card.
  const dilutionBar = 0.9 + Math.max(0, size - 10) * 0.06;
  if (simCardScore(best) > deckAverage * dilutionBar) run.addCard(best);
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
    ? rollVictoryCardOffers(
        rng,
        depth,
        ELITE_CARD_OFFER_COUNT,
        ELITE_TIER_BIAS_DEPTH,
        run.archetypeId,
        run.scenarioId,
      )
    : rollVictoryCardOffers(rng, depth, undefined, undefined, run.archetypeId, run.scenarioId);
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
      // Reviewed under the U12 numeric rebaseline and left unchanged: scored
      // above trap, comparable to a fresh-HP encounter, so a scouted player
      // sometimes routes toward it for the richer reward and sometimes away
      // for safety — the target band and elite engagement rate were reached
      // without needing to move this heuristic.
      return run.hp >= run.maxHp * 0.6 ? 18 : 4;
  }
}

/**
 * Engagement floor (KTD8) for an *unscouted* player who reaches the elite's
 * eligible window: the real game offers the guarantee through a specific door
 * among several (KTD3), so an unscouted player doesn't automatically walk
 * straight into it just because it's somewhere in the decade — they still
 * only take one door per room. This is the simulator's stand-in for "which
 * door did they happen to take," expressed as a flat per-decade probability
 * since the simulator has no branching doors to sample from directly. The
 * guarantee is *spent* the moment it's due regardless of the roll's outcome
 * (see chooseRoomEvent below) — exactly one flip per decade, never retried
 * across the rest of the window — so the measured engagement rate tracks this
 * constant directly rather than compounding across every eligible depth.
 * Reviewed under the U12 numeric rebaseline and left unchanged (measured
 * eliteEngagementRate ~0.505 — comfortably non-degenerate, KTD8).
 */
export const ELITE_ENGAGEMENT_FLOOR = 0.5;

/**
 * KTD3 parity for the simulator: it has no doors/branching, so it replicates
 * "one elite offered per decade, in the mid-decade window" directly here,
 * reusing the same run.eliteOfferedForDecade field the real game's Dungeon
 * scene uses. `eliteOffered` tells the caller whether this call's guarantee
 * fired this decade (regardless of whether the elite was actually chosen —
 * KTD3's guarantee is "was reachable", not "was fought").
 */
function chooseRoomEvent(
  run: RunState,
  rng: SimRng,
  depth: number,
): { event: RoomEvent; eliteOffered: boolean } {
  const decade = decadeForDepth(depth);
  const eliteDue = isEliteEligibleDepth(depth) && run.eliteOfferedForDecade !== decade;

  if (run.scoutCharges <= 0) {
    // No scouting means no foreknowledge to strategically route around it, but
    // an unscouted player still only walks through one door per room — the
    // guarantee being "due" doesn't guarantee THIS is the door behind it. Spend
    // the guarantee now either way (one flip per decade, KTD8's engagement
    // floor) so the rest of the window doesn't get repeated chances to convert
    // an "offered" into an "engaged".
    if (eliteDue) {
      run.eliteOfferedForDecade = decade;
      if (rng.frac() < ELITE_ENGAGEMENT_FLOOR) {
        return { event: 'elite', eliteOffered: true };
      }
      return { event: rollRoomEvent(rng, depth), eliteOffered: true };
    }
    return { event: rollRoomEvent(rng, depth), eliteOffered: false };
  }

  const options: RoomEvent[] = Array.from({ length: 3 }, () => rollRoomEvent(rng, depth));
  if (eliteDue) {
    options[0] = 'elite'; // one of the three scouted doors is the forced elite (KTD3)
    run.eliteOfferedForDecade = decade;
  }
  run.scoutCharges--;

  const chosen = [...options].sort(
    (left, right) => roomEventScore(run, right) - roomEventScore(run, left),
  )[0];
  return { event: chosen, eliteOffered: eliteDue };
}

/** Hard cap so a stalemate deck (all block) terminates as a loss instead of looping. */
export const SIM_BATTLE_TURN_CAP = 60;

/** One enemy's telegraphed view (Strength folded), or null if it has none/voided. */
function enemyIntentView(enemy: TurnBattleState['enemies'][number]) {
  if (!enemy.intent.current || enemy.intent.voided) return null;
  return intentView(enemy.intent.current, statusValue(enemy, 'strength'));
}

/** Total attack damage telegraphed by the whole living pack this turn (0 if none attack).
 * For a solo enemy this is exactly the single telegraph — the policy is unchanged there. */
function incomingAttackTotal(state: TurnBattleState): number {
  return state.enemies
    .filter((enemy) => enemy.hp > 0)
    .reduce((sum, enemy) => {
      const view = enemyIntentView(enemy);
      return sum + (view?.kind === 'attack' ? view.magnitude : 0);
    }, 0);
}

/** The single biggest telegraphed attack across the pack (drives smoke-bomb value); 0 if none. */
function biggestIncomingAttack(state: TurnBattleState): number {
  let best = 0;
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    const view = enemyIntentView(enemy);
    if (view?.kind === 'attack' && view.magnitude > best) best = view.magnitude;
  }
  return best;
}

/** The enemy the policy attacks this turn: the weakest living one (mirrors the engine's focus). */
function focusEnemy(state: TurnBattleState) {
  return resolveOffensiveTarget(state);
}

/** The damage a card would actually deal to the focus enemy RIGHT NOW, threading the player's
 * Strength/Weak and the focus enemy's Vulnerable through the same resolver the engine uses. */
function effectiveCardDamage(card: Card, state: TurnBattleState): number {
  const focus = focusEnemy(state);
  return card.effects.reduce(
    (sum, effect) =>
      effect.kind === 'damage' ? sum + modifiedDamage(effect.amount, state.player, focus) : sum,
    0,
  );
}

const grantsStrength = (card: Card): boolean => card.effects.some((e) => e.kind === 'strength');
const appliesVulnerable = (card: Card): boolean =>
  card.effects.some((e) => e.kind === 'status' && e.status === 'vulnerable');

/**
 * A competent one-card-at-a-time policy (B5): it detects MULTI-card lethal (dump when the whole
 * affordable hand can finish, biggest hit first), sequences setup (Vulnerable) before the dump on a
 * healthy target, blocks/weakens a telegraph that would bite, front-loads scaling early in a long
 * fight, and otherwise plays best value. Damage math threads Strength/Vulnerable through the real
 * resolver, so the policy neither under-kills nor misvalues the new cards.
 */
function pickCardToPlay(state: TurnBattleState, emphasis: CardEmphasis | null): Card | null {
  const playable = playableCards(state);
  if (playable.length === 0) return null;
  const incomingTotal = incomingAttackTotal(state);
  const focus = focusEnemy(state);
  const enemyEff = focus.hp + focus.block + focus.armor;
  const attackers = playable
    .filter((card) => effectiveCardDamage(card, state) > 0)
    .sort((a, b) => effectiveCardDamage(b, state) - effectiveCardDamage(a, state));

  // 1) Kill mode: if the affordable attack SUBSET (greedy knapsack by ascending cost, respecting the
  //    total energy budget) can finish the enemy, dump the biggest hit (the loop repeats →
  //    multi-card lethal). Summing every individually-affordable attacker would over-count lethal.
  const biggestAffordableAttacker =
    attackers.find((card) => cardCost(card) <= state.energy) ?? null;
  if (biggestAffordableAttacker) {
    let budget = state.energy;
    let reachable = 0;
    for (const card of [...attackers].sort((a, b) => cardCost(a) - cardCost(b))) {
      if (cardCost(card) > budget) continue;
      budget -= cardCost(card);
      reachable += effectiveCardDamage(card, state);
    }
    if (reachable >= enemyEff) return biggestAffordableAttacker;
  }

  // 1b) Anti-stalemate (harness honesty): once a fight has dragged on, stop turtling and RACE —
  //     play the biggest hit and only ever block a strictly LETHAL incoming. This mirrors a real
  //     player abandoning a stall against a heal/block wall, so an unwinnable matchup ends in an
  //     honest death instead of a full-HP turn-cap loss that would fabricate difficulty.
  const racing = state.turn > 8;
  if (racing) {
    const lethalIncoming =
      incomingTotal > 0 &&
      incomingTotal - state.player.block - state.player.armor >= state.player.hp;
    if (lethalIncoming) {
      const blocker = playable
        .filter((card) => cardEffectAmount(card, 'block') > 0)
        .sort((a, b) => cardEffectAmount(b, 'block') - cardEffectAmount(a, 'block'))[0];
      if (blocker) return blocker;
    }
    if (biggestAffordableAttacker) return biggestAffordableAttacker;
  }

  // 2) Setup before the dump: on a worth-it target that isn't Vulnerable yet, spend a pure setup
  //    card first — but only with energy and an attacker to spare, so it never wastes the turn.
  if (!hasStatus(focus, 'vulnerable') && enemyEff > 22) {
    const setup = playable.find(
      (card) =>
        appliesVulnerable(card) &&
        effectiveCardDamage(card, state) === 0 &&
        cardCost(card) < state.energy,
    );
    if (
      setup &&
      attackers.some((card) => card !== setup && cardCost(card) <= state.energy - cardCost(setup))
    ) {
      return setup;
    }
  }

  // 3) Defense: block (or weaken) the turn's incoming that would take a real bite out of us.
  if (incomingTotal > 0) {
    const projected = incomingTotal - state.player.block - state.player.armor;
    if (projected > 0 && projected >= state.player.hp * 0.45) {
      const blocker = playable
        .filter((card) => cardEffectAmount(card, 'block') > 0)
        .sort((a, b) => cardEffectAmount(b, 'block') - cardEffectAmount(a, 'block'))[0];
      if (blocker) return blocker;
      const weaken = playable.find((card) =>
        card.effects.some((e) => e.kind === 'status' && e.status === 'weak'),
      );
      if (weaken) return weaken;
    }
  }

  // 4) Heal when badly hurt.
  if (state.player.hp < state.player.maxHp * 0.4) {
    const healer = playable
      .filter((card) => cardEffectAmount(card, 'heal') > 0)
      .sort((a, b) => cardEffectAmount(b, 'heal') - cardEffectAmount(a, 'heal'))[0];
    if (healer) return healer;
  }

  // 5) Scaling: early in a fight that will clearly run long, build Strength.
  if (enemyEff > 34 && state.turn <= 3 && statusValue(state.player, 'strength') < 6) {
    const empower = playable.find((card) => grantsStrength(card));
    if (empower) return empower;
  }

  // 6) Fallback: best value-per-energy, block weighted up against a telegraphed attack.
  let best: Card | null = null;
  let bestScore = -Infinity;
  for (const card of playable) {
    let score = simCardScore(card, emphasis);
    if (incomingTotal > 0) score += cardEffectAmount(card, 'block') * 0.8;
    if (score > bestScore) {
      bestScore = score;
      best = card;
    }
  }
  return best;
}

/** Free actions (R16): potion when hurt, bomb for lethal, smoke bomb against a heavy telegraph, armor against a hit. */
function pickBattleItem(run: RunState, state: TurnBattleState): InventoryItem | null {
  const focus = focusEnemy(state);
  const biggest = biggestIncomingAttack(state);
  const incomingTotal = incomingAttackTotal(state);
  for (const item of run.inventory) {
    if (!item.usableInCombat) continue;
    // Bomb when it can finish the focus enemy (the target the policy is committing against).
    if (item.kind === 'damage' && focus.hp + focus.block <= item.amount) return item;
    if (
      item.kind === 'heal' &&
      state.player.hp < 12 &&
      state.player.hp <= state.player.maxHp - item.amount
    ) {
      return item;
    }
    // Smoke bomb only skips ONE beat, so it earns its use against a single heavy telegraph.
    if (item.kind === 'skip_attack' && biggest >= 8) {
      return item;
    }
    // Armor buffers the turn's whole incoming.
    if (item.kind === 'shield' && incomingTotal >= 6 && state.player.block === 0) {
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
  enemyOrPack: EnemyInstance | EnemyInstance[],
  rng: SimRng,
  emphasis: CardEmphasis | null = null,
): { won: boolean; turns: number } {
  const pack = Array.isArray(enemyOrPack) ? enemyOrPack : [enemyOrPack];
  const setup = relicBattleSetup(run.relicIds);
  let { state } = createBattle(
    {
      deck: run.cardCollection,
      player: { hp: run.hp, maxHp: run.maxHp, armor: run.armor },
      enemies: toEngineEnemies(pack),
      drawSize: setup.drawSize,
      startingEnergyBonus: setup.startingEnergyBonus,
      retainBlockCap: setup.retainBlockCap,
      poisonBonus: setup.poisonBonus,
      enemyKillDraw: setup.enemyKillDraw,
      preventPlayerBlock: shouldPreventPlayerBlock(run.scenarioId),
    },
    rng,
  );

  let guard = 0;
  while (state.phase !== 'decided' && state.turn <= SIM_BATTLE_TURN_CAP && guard++ < 2000) {
    const item = pickBattleItem(run, state);
    if (item) {
      const result = useItem(state, item, rng, resolveOffensiveTarget(state).id);
      if (!result.rejected) {
        run.removeItem(item.uid);
        state = result.state;
        continue;
      }
    }
    const card = pickCardToPlay(state, emphasis);
    if (card) {
      const result = playCard(state, card.uid, rng, resolveOffensiveTarget(state).id);
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
  return { won: state.outcome === 'victory', turns: state.turn };
}

/**
 * The EXTERNAL anchor for difficulty (B5): run a FIXED, hand-authored reference deck at full HP
 * against one enemy kind many times and report win rate, average HP lost on a win, and how often a
 * loss was a turn-cap stalemate (a stalemate is a policy artifact, not real difficulty). This does
 * not depend on the reward/curation policy, so tuning enemies to land these decks in band cannot be
 * gamed by the very bot being replaced — it breaks the harness's circularity.
 */
export interface ReferenceFightSummary {
  winRate: number;
  avgHpLostOnWin: number;
  avgTurns: number;
  cappedRate: number;
}

export function simulateReferenceDeck(
  deckIds: readonly string[],
  spawn: (rng: SimRng, depth: number) => EnemyInstance,
  depth: number,
  runs = 300,
): ReferenceFightSummary {
  let wins = 0;
  let hpLost = 0;
  let turnsTotal = 0;
  let capped = 0;
  for (let seed = 1; seed <= runs; seed++) {
    const rng = new SeededRng((seed * 2654435761) >>> 0);
    const run = new RunState(String(seed), `ref-${seed}`);
    run.cardCollection = deckIds.map((id) => {
      const def = CARD_DEFS.find((card) => card.id === id);
      if (!def) throw new Error(`reference deck: unknown card id ${id}`);
      return makeCard(def);
    });
    run.hp = run.maxHp;
    const before = run.hp;
    const result = simulateBattle(run, spawn(rng, depth), rng);
    turnsTotal += result.turns;
    if (result.won) {
      wins++;
      hpLost += before - run.hp;
    } else if (result.turns >= SIM_BATTLE_TURN_CAP) {
      capped++;
    }
  }
  return {
    winRate: wins / runs,
    avgHpLostOnWin: wins === 0 ? 0 : hpLost / wins,
    avgTurns: turnsTotal / runs,
    cappedRate: capped / runs,
  };
}

const DEFAULT_RUN_OPTIONS: SimRunOptions = {
  createRng: (seed) => new SeededRng(seed >>> 0),
  emphasis: null,
};

export function simulateRun(
  seed: number,
  scenario: BalanceScenario,
  options: Partial<SimRunOptions> = {},
): SimRunResult {
  const { createRng, emphasis } = {
    ...DEFAULT_RUN_OPTIONS,
    ...options,
  };
  const rng = createRng(seed);
  const run = createScenarioRun(seed, scenario);
  let encounters = 0;
  let reachedBoss = false;
  let bossesCleared = 0;
  let eliteEligible = 0;
  let eliteEncounters = 0;
  let eliteWins = 0;
  const tierFights = emptyTierFights();

  // The fixed 100-room descent (R1): a boss sits at every BOSS_ROOM_INTERVAL and
  // the loop exits on death or on defeating the room-100 boss (the only victory).
  // No exit choice and no between-boss heal — the run flows straight through.
  // The RUN_LENGTH bound is a guard; the room-100 boss branch is the real
  // terminus, so the trailing throw is unreachable.
  for (let depth = 2; depth <= RUN_LENGTH; depth++) {
    run.depth = depth;
    const atBoss = depth % BOSS_ROOM_INTERVAL === 0;
    run.onRoomEntered();
    const poison = applyPoisonedRoomEntryDamage(run, rng);
    if (poison.died) {
      return {
        victory: false,
        reachedBoss: reachedBoss || atBoss,
        clearedFirstBoss: bossesCleared >= 1,
        deathDepth: depth,
        encounters,
        eliteEligible,
        eliteEncounters,
        eliteWins,
        finalGold: run.gold,
        tierFights,
      };
    }
    maybeUseDungeonPotion(run, atBoss);

    if (atBoss) {
      reachedBoss = true;
      const battle = simulateBattle(
        run,
        spawnScenarioEncounter(rng, depth, 'boss', run.scenarioId),
        rng,
        emphasis,
      );
      if (!battle.won) {
        return {
          victory: false,
          reachedBoss: true,
          clearedFirstBoss: bossesCleared >= 1,
          deathDepth: depth,
          encounters,
          eliteEligible,
          eliteEncounters,
          eliteWins,
          finalGold: run.gold,
          tierFights,
        };
      }
      run.enemiesDefeated++;
      applySimulatedPostBattleRewards(run, rng, depth);
      bossesCleared++;

      if (depth >= RUN_LENGTH) {
        run.escaped = true;
        return {
          victory: true,
          reachedBoss: true,
          clearedFirstBoss: true,
          deathDepth: null,
          encounters,
          eliteEligible,
          eliteEncounters,
          eliteWins,
          finalGold: run.gold,
          tierFights,
        };
      }
      continue; // descend past the boss toward room 100
    }

    const { event, eliteOffered } = chooseRoomEvent(run, rng, depth);
    if (eliteOffered) eliteEligible++;

    if (event === 'elite') {
      eliteEncounters++;
      const battle = simulateBattle(
        run,
        spawnScenarioEncounter(rng, depth, 'elite', run.scenarioId),
        rng,
        emphasis,
      );
      if (!battle.won) {
        return {
          victory: false,
          reachedBoss,
          clearedFirstBoss: bossesCleared >= 1,
          deathDepth: depth,
          encounters,
          eliteEligible,
          eliteEncounters,
          eliteWins,
          finalGold: run.gold,
          tierFights,
        };
      }
      eliteWins++;
      run.enemiesDefeated++;
      applySimulatedPostBattleRewards(run, rng, depth, true);
      continue;
    }

    if (event === 'encounter') {
      encounters++;
      const tier = getEnemyTierForDepth(depth) as StandardTier;
      tierFights[tier].total++;
      const battle = simulateBattle(
        run,
        spawnScenarioEncounter(rng, depth, 'normal', run.scenarioId),
        rng,
        emphasis,
      );
      if (!battle.won) {
        return {
          victory: false,
          reachedBoss,
          clearedFirstBoss: bossesCleared >= 1,
          deathDepth: depth,
          encounters,
          eliteEligible,
          eliteEncounters,
          eliteWins,
          finalGold: run.gold,
          tierFights,
        };
      }
      tierFights[tier].wins++;
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

  throw new Error('simulateRun: reached RUN_LENGTH without a boss terminus');
}

function median(values: readonly number[], fallback: number): number {
  if (values.length === 0) return fallback;
  const ordered = [...values].sort((left, right) => left - right);
  const mid = Math.floor(ordered.length / 2);
  if (ordered.length % 2 === 1) return ordered[mid];
  return (ordered[mid - 1] + ordered[mid]) / 2;
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
  const deathDepths: number[] = [];
  const decadeSurvivors = Array.from({ length: RUN_LENGTH / BOSS_ROOM_INTERVAL }, () => 0);
  const byEncounter: Record<string, EncounterBucketSummary> = {};
  let eliteOfferedTotal = 0;
  let eliteEngagedTotal = 0;
  let eliteWinsTotal = 0;
  const byTier: Record<StandardTier, TierBucketSummary> = emptyTierFights();

  for (let seed = 1; seed <= runs; seed++) {
    const result = simulateRun(seed, scenario, options);
    if (result.reachedBoss) bossReached++;
    if (result.victory) wins++;
    if (!result.victory) {
      deaths++;
      const deathDepth = result.deathDepth ?? MAX_DEPTH;
      deathDepthTotal += deathDepth;
      deathDepths.push(deathDepth);
    }

    const deepestReached = result.victory ? RUN_LENGTH : (result.deathDepth ?? 1);
    for (let decade = 0; decade < decadeSurvivors.length; decade++) {
      const decadeStart = decade * BOSS_ROOM_INTERVAL + 1;
      if (deepestReached >= decadeStart) decadeSurvivors[decade]++;
    }

    const key = result.encounters >= 3 ? '3+' : String(result.encounters);
    byEncounter[key] ??= { total: 0, wins: 0, bossReached: 0 };
    byEncounter[key].total++;
    if (result.victory) byEncounter[key].wins++;
    if (result.reachedBoss) byEncounter[key].bossReached++;

    eliteOfferedTotal += result.eliteEligible;
    eliteEngagedTotal += result.eliteEncounters;
    eliteWinsTotal += result.eliteWins;

    for (const tier of ['weak', 'medium', 'strong'] as const) {
      byTier[tier].total += result.tierFights[tier].total;
      byTier[tier].wins += result.tierFights[tier].wins;
    }
  }

  return {
    runs,
    winRate: wins / runs,
    bossReachRate: bossReached / runs,
    bossKillGivenReach: bossReached === 0 ? 0 : wins / bossReached,
    avgDeathDepth: deaths === 0 ? MAX_DEPTH : deathDepthTotal / deaths,
    medianDeathDepth: median(deathDepths, RUN_LENGTH),
    decadeSurvivalRates: decadeSurvivors.map((count) => count / runs),
    byEncounter,
    eliteBucket: {
      offered: eliteOfferedTotal,
      engaged: eliteEngagedTotal,
      wins: eliteWinsTotal,
    },
    eliteEngagementRate: eliteOfferedTotal === 0 ? 0 : eliteEngagedTotal / eliteOfferedTotal,
    eliteWinRate: eliteEngagedTotal === 0 ? 0 : eliteWinsTotal / eliteEngagedTotal,
    byTier,
    weakTierWinRate: byTier.weak.total === 0 ? 0 : byTier.weak.wins / byTier.weak.total,
  };
}

export interface ScenarioBalanceMatrixRow {
  profile: ScenarioBalanceProfile;
  summary: BalanceSimulationSummary;
}

export function simulateScenarioProfileMatrix(
  runs = 400,
  options: Partial<SimRunOptions> = {},
  profiles: readonly ScenarioBalanceProfile[] = SCENARIO_BALANCE_PROFILES,
): ScenarioBalanceMatrixRow[] {
  return profiles.map((profile) => ({
    profile,
    summary: simulateScenarioSummary(profile.scenario, runs, options),
  }));
}

export function simulateLoadoutTierSummary(
  tier: BalanceLoadoutTier,
  runs = 400,
  options: Partial<SimRunOptions> = {},
): BalanceSimulationSummary {
  return simulateScenarioSummary(BALANCE_LOADOUT_SCENARIOS[tier], runs, options);
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
