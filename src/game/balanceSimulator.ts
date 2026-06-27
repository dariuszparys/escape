import { MAX_DEPTH } from '../config';
import { CARD_DEFS, Card, cardEffectAmount, makeCard } from '../data/cards';
import { type PendingPrep } from '../data/campfirePurchases';
import { spawnBoss, spawnEnemy } from '../data/enemies';
import { InventoryItem, type InventoryItemDef, makeItem } from '../data/items';
import { rollRoomEvent, type RoomEvent } from '../dungeon/rooms';
import { RunState } from '../state';
import { combatCardScore, selectCombatHand } from './cardSelection';
import type { ActiveStatusEffect } from './combat';
import { resolveRound } from './combat';
import { awardPotionItem, rollChestReward } from './rewards';
import { GameRng } from './rng';
import { startingCardIdsForChoiceCount } from './startingCards';
import { upgradeCard } from './cardUpgrade';

export interface BalanceScenario {
  prepItemIds?: InventoryItemDef['id'][];
  extraStartingChoice?: boolean;
  scoutFlame?: boolean;
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
  victory: boolean;
  reachedBoss: boolean;
  deathDepth: number | null;
  encounters: number;
}

type PlayerAction =
  | { kind: 'card'; card: Card }
  | { kind: 'item'; item: InventoryItem }
  | { kind: 'punch' };

interface SimBattleState {
  rng: SeededRng;
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

interface EnemyDecision {
  action: Parameters<typeof resolveRound>[0]['enemyAction'];
  used: Set<number>;
  nextRng: SeededRng;
}

const ITEM_VALUE: Record<string, number> = {
  small_potion: 18,
  large_potion: 28,
  smoke_bomb: 30,
  bomb: 26,
  iron_armor: 12,
};

class SeededRng implements GameRng {
  constructor(private state: number) {}

  clone(): SeededRng {
    return new SeededRng(this.state);
  }

  frac(): number {
    this.state += 0x6d2b79f5;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
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
  const offers = startingCardIdsForChoiceCount(run.startingCardChoices)
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

  run.startingCardChoices = prep.extraStartingChoice ? 4 : 3;
  run.startingCardPicks = prep.extraStartingChoice ? 3 : 2;
  run.scoutCharges = prep.scoutFlame ? 1 : 0;

  prep.itemIds.forEach((itemId) => {
    run.addItem(makeItem(itemId));
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

function applySimulatedRest(run: RunState): void {
  const handIds = new Set(run.combatHand.map((card) => card.uid));
  const removable = [...run.cardCollection]
    .filter((card) => !handIds.has(card.uid))
    .sort((a, b) => combatCardScore(a) - combatCardScore(b))[0];

  if (removable && run.removeCard(removable.uid)) return;

  const best = [...run.combatHand].sort((a, b) => combatCardScore(b) - combatCardScore(a))[0];
  if (!best) return;
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
      return run.cardCollection.length > run.combatHand.length ? 42 : 34;
    case 'trap':
      return -8;
    case 'boss':
      return 0;
    case 'start':
      return 0;
  }
}

function chooseRoomEvent(run: RunState, rng: SeededRng, depth: number): RoomEvent {
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

function pickEnemyCard(state: SimBattleState, rng: SeededRng): { card: Card; used: Set<number> } {
  let used = new Set(state.enemyUsed);
  let pool = state.enemyCards.filter((card) => !used.has(card.uid));
  if (pool.length === 0) {
    used = new Set();
    pool = state.enemyCards;
  }

  const lowHp = state.enemyHp / state.enemyMaxHp < 0.35;
  const weighted = pool.map((card) => {
    let weight = 3;
    if (cardEffectAmount(card, 'block') > 0) weight = 1.5;
    if (cardEffectAmount(card, 'heal') > 0) weight = lowHp ? 6 : 0.8;
    if (card.effects.some((effect) => effect.kind === 'status')) weight = 4;
    return { card, weight };
  });

  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng.frac() * totalWeight;
  let picked = weighted[weighted.length - 1].card;
  for (const entry of weighted) {
    if ((roll -= entry.weight) < 0) {
      picked = entry.card;
      break;
    }
  }

  used.add(picked.uid);
  if (state.enemyCards.every((card) => used.has(card.uid))) used.clear();
  return { card: picked, used };
}

function chooseEnemyDecision(state: SimBattleState): EnemyDecision {
  const nextRng = state.rng.clone();
  const special = state.enemyDef.special;
  if (special && state.round % special.interval === 0) {
    return {
      action: {
        actor: 'enemy',
        kind: 'special',
        name: special.name,
        speed: special.speed,
        effects: special.effects,
      },
      used: new Set(state.enemyUsed),
      nextRng,
    };
  }

  const picked = pickEnemyCard(state, nextRng);
  return {
    action: { actor: 'enemy', kind: 'card', card: picked.card },
    used: picked.used,
    nextRng,
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

function applyRound(
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
    playerAction: toCombatAction(action),
    enemyAction: enemyDecision.action,
  });

  next.playerHp = resolved.player.hp;
  next.enemyHp = resolved.enemy.hp;
  next.playerStatuses = resolved.player.statuses;
  next.enemyStatuses = resolved.enemy.statuses;
  next.round++;
  return next;
}

function choosePlayerAction(state: SimBattleState): {
  action: PlayerAction;
  enemyDecision: EnemyDecision;
} {
  const enemyDecision = chooseEnemyDecision(state);
  let bestAction = listPlayerActions(state)[0];
  let bestScore = -Infinity;

  for (const action of listPlayerActions(state)) {
    const beforePlayerHp = state.playerHp;
    const beforeEnemyHp = state.enemyHp;
    const next = applyRound(state, action, enemyDecision);
    let score = evaluateBattleState(next);
    score += (beforeEnemyHp - next.enemyHp) * 400;
    score += (next.playerHp - beforePlayerHp) * 160;
    if (action.kind === 'item') {
      score -= (ITEM_VALUE[action.item.id] ?? 10) * 120;
    }
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
  rng: SeededRng,
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
    const { action, enemyDecision } = choosePlayerAction(state);
    const next = applyRound(state, action, enemyDecision);
    Object.assign(state, next);
  }

  run.hp = state.playerHp;
  run.inventory = state.inventory;
  return { won: state.enemyHp <= 0, enemyCards: enemy.cards };
}

export function simulateRun(seed: number, scenario: BalanceScenario): SimRunResult {
  const rng = new SeededRng(seed >>> 0);
  const run = createScenarioRun(seed, scenario);
  let encounters = 0;

  for (let depth = 2; depth <= MAX_DEPTH; depth++) {
    maybeUseDungeonPotion(run, depth === MAX_DEPTH);

    if (depth === MAX_DEPTH) {
      const battle = simulateBattle(run, spawnBoss(rng), rng);
      return {
        victory: battle.won,
        reachedBoss: true,
        deathDepth: battle.won ? null : depth,
        encounters,
      };
    }

    const event = chooseRoomEvent(run, rng, depth);
    if (event === 'encounter') {
      encounters++;
      const battle = simulateBattle(
        run,
        spawnEnemy(rng, depth, Math.max(run.combatHand.length, 1)),
        rng,
      );
      if (!battle.won) {
        return {
          victory: false,
          reachedBoss: false,
          deathDepth: depth,
          encounters,
        };
      }
      chooseRewardCard(run, battle.enemyCards);
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

  return {
    victory: false,
    reachedBoss: false,
    deathDepth: MAX_DEPTH,
    encounters,
  };
}

export function simulateScenarioSummary(
  scenario: BalanceScenario,
  runs = 400,
): BalanceSimulationSummary {
  let wins = 0;
  let bossReached = 0;
  let deaths = 0;
  let deathDepthTotal = 0;
  const byEncounter: Record<string, EncounterBucketSummary> = {};

  for (let seed = 1; seed <= runs; seed++) {
    const result = simulateRun(seed, scenario);
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
