import { Card, CardDef } from '../data/cards';
import type { InventoryItem } from '../data/items';
import type { ActiveStatusEffect, MutableCombatant } from './combat';
import { CombatEvent, emitCombatEvent } from './combatEvents';
import { dispatchEffect, ResolvableEffect } from './effectHandlers';
import {
  cloneIntentState,
  createIntentState,
  clearVoidedIntent,
  IntentPattern,
  IntentState,
  intentView,
  resolveIntent,
  telegraphIntent,
  voidIntent,
} from './intentPatterns';
import { GameRng } from './rng';

export const DEFAULT_ENERGY_PER_TURN = 3;
export const DEFAULT_DRAW_SIZE = 5;

/** A combatant in the turn battle. `block` is the R19 pool: absorbed before HP, expires at this combatant's next turn start. Armor stays permanent flat reduction after block. */
export interface TurnCombatant {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  armor: number;
  block: number;
  statuses: ActiveStatusEffect[];
}

/** `decided` is the R18 terminal state: rules reached lethal, only skip/accelerate remain legal. */
export type BattlePhase = 'player' | 'decided';
export type BattleOutcome = 'victory' | 'defeat';

/**
 * The whole battle as an explicit snapshot. Commands never mutate their input;
 * they clone, mutate the clone, and return it with the ordered event list.
 * `drawPile` is face-down: the LAST element is the top card (pop() draws).
 * `discardPile` is in true order: the last element is the most recent discard (R4).
 */
export interface TurnBattleState {
  turn: number;
  energy: number;
  energyPerTurn: number;
  drawSize: number;
  drawPile: Card[];
  hand: Card[];
  discardPile: Card[];
  /** Cards played with `exhaust` set (KTD1): they leave play for the rest of this battle,
   * joining neither the Draw Pile nor the Discard Pile. Per-battle only — `createBattle`
   * always rebuilds the Draw Pile from the full collection, so exhaust never persists. */
  exhaustPile: Card[];
  player: TurnCombatant;
  enemy: TurnCombatant;
  intent: IntentState;
  /** True while the player's consumed stun skips card plays this turn (R21); items stay legal. */
  playerStunned: boolean;
  phase: BattlePhase;
  outcome: BattleOutcome | null;
}

export interface TurnEngineConfig {
  /** The full card collection — the deck IS the collection (R1). */
  deck: readonly Card[];
  player: { name?: string; hp: number; maxHp: number; armor: number };
  enemy: { id: string; name: string; hp: number; maxHp: number; armor: number };
  pattern: IntentPattern;
  energyPerTurn?: number;
  drawSize?: number;
}

export type TurnCommandRejection =
  | 'battle_decided'
  | 'insufficient_energy'
  | 'player_stunned'
  | 'card_not_in_hand';

/**
 * Every command resolves completely and synchronously (KTD1). `events` is the
 * causally ordered presentation list the queue replays; `log` carries the
 * human-readable lines the effect handlers produced. A rejected command returns
 * the input state untouched with `rejected` set — the scene renders the cue (R7).
 */
export interface TurnCommandResult {
  state: TurnBattleState;
  events: CombatEvent[];
  log: string[];
  rejected?: TurnCommandRejection;
}

/** Energy cost accessor (KTD4): explicit `cost` wins; the tier is the placeholder default until Milestone 2 re-authors every def. */
export function cardCost(card: Pick<CardDef, 'tier' | 'cost'>): number {
  return card.cost ?? card.tier;
}

/** Cards the player could legally play right now — drives dimming and the R22 end-turn highlight. */
export function playableCards(state: TurnBattleState): Card[] {
  if (state.phase === 'decided' || state.playerStunned) return [];
  return state.hand.filter((card) => cardCost(card) <= state.energy);
}

function cloneCombatant(combatant: TurnCombatant): TurnCombatant {
  return { ...combatant, statuses: combatant.statuses.map((status) => ({ ...status })) };
}

function cloneState(state: TurnBattleState): TurnBattleState {
  return {
    ...state,
    drawPile: [...state.drawPile],
    hand: [...state.hand],
    discardPile: [...state.discardPile],
    exhaustPile: [...state.exhaustPile],
    player: cloneCombatant(state.player),
    enemy: cloneCombatant(state.enemy),
    intent: cloneIntentState(state.intent),
  };
}

/** Fisher–Yates over a copy, driven by the injected rng (deterministic under SequenceRng). */
function shuffle(rng: GameRng, cards: readonly Card[]): Card[] {
  const result = [...cards];
  for (let i = result.length - 1; i > 0; i--) {
    const j = rng.between(0, i);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Working context for one command: the cloned state plus the event/log accumulators. */
interface EngineRuntime {
  state: TurnBattleState;
  events: CombatEvent[];
  log: string[];
  rng: GameRng;
}

function createRuntime(input: TurnBattleState, rng: GameRng): EngineRuntime {
  return { state: cloneState(input), events: [], log: [], rng };
}

function reject(input: TurnBattleState, rejected: TurnCommandRejection): TurnCommandResult {
  return { state: input, events: [], log: [], rejected };
}

/** Flip into the R18 terminal state the moment rules resolution reaches lethal. Enemy death wins ties. */
function checkTerminal(rt: EngineRuntime): boolean {
  if (rt.state.phase === 'decided') return true;
  if (rt.state.enemy.hp <= 0) {
    rt.state.phase = 'decided';
    rt.state.outcome = 'victory';
    return true;
  }
  if (rt.state.player.hp <= 0) {
    rt.state.phase = 'decided';
    rt.state.outcome = 'defeat';
    return true;
  }
  return false;
}

/**
 * Draw up to `requested` cards (R23): an empty draw pile reshuffles the discard
 * pile into it; when both are empty drawing simply stops — never a reshuffle loop.
 */
function drawCards(rt: EngineRuntime, requested: number): void {
  const state = rt.state;
  for (let i = 0; i < requested; i++) {
    if (state.drawPile.length === 0) {
      if (state.discardPile.length === 0) break;
      state.drawPile = shuffle(rt.rng, state.discardPile);
      state.discardPile = [];
      rt.events.push({ type: 'reshuffled', count: state.drawPile.length });
    }
    const card = state.drawPile.pop();
    if (!card) break;
    state.hand.push(card);
    rt.events.push({
      type: 'cardDrawn',
      card,
      handCount: state.hand.length,
      drawCount: state.drawPile.length,
      discardCount: state.discardPile.length,
    });
  }
}

function gainEnergy(rt: EngineRuntime, amount: number): void {
  rt.state.energy += amount;
  rt.events.push({ type: 'energyChanged', energy: rt.state.energy, max: rt.state.energyPerTurn });
}

function toMutable(combatant: TurnCombatant): MutableCombatant {
  return {
    id: combatant.id,
    name: combatant.name,
    hp: combatant.hp,
    maxHp: combatant.maxHp,
    armor: combatant.armor,
    statuses: combatant.statuses,
    roundBlock: combatant.block,
  };
}

function writeBack(mutable: MutableCombatant, combatant: TurnCombatant): void {
  combatant.hp = mutable.hp;
  combatant.armor = mutable.armor;
  combatant.statuses = mutable.statuses;
  combatant.block = mutable.roundBlock;
}

/**
 * Resolve one effect through the shared registry (KTD3) and synthesize its
 * presentation event with post-mutation values. Two turn-model adjustments the
 * round-based handlers don't make:
 * - damage CONSUMES the target's block pool (R19) — the handler applies block as
 *   flat reduction (identical HP arithmetic for a single hit) but never depletes it;
 * - stunning the enemy voids the telegraphed intent immediately (R21) and consumes
 *   the stun, so the fizzle is carried by the intent state, not a lingering status.
 */
function applyEffect(
  rt: EngineRuntime,
  effect: ResolvableEffect,
  actorSide: 'player' | 'enemy',
): void {
  const state = rt.state;
  const actor = actorSide === 'player' ? state.player : state.enemy;
  const target = actorSide === 'player' ? state.enemy : state.player;
  const actorM = toMutable(actor);
  const targetM = toMutable(target);
  const beforeTargetHp = targetM.hp;
  const beforeTargetBlock = targetM.roundBlock;
  const beforeActorHp = actorM.hp;
  const beforeActorBlock = actorM.roundBlock;

  dispatchEffect(effect, {
    actor: actorM,
    target: targetM,
    log: rt.log,
    drawCards: (count) => drawCards(rt, count),
    gainEnergy: (amount) => gainEnergy(rt, amount),
  });

  if (effect.kind === 'damage') {
    const raw = effect.amount ?? 0;
    const absorbed = Math.min(beforeTargetBlock, raw);
    targetM.roundBlock = beforeTargetBlock - absorbed;
  }
  writeBack(actorM, actor);
  writeBack(targetM, target);

  if (effect.kind === 'damage') {
    rt.events.push({
      type: 'damageResolved',
      sourceId: actor.id,
      targetId: target.id,
      amount: beforeTargetHp - target.hp,
      blockAbsorbed: Math.min(beforeTargetBlock, effect.amount ?? 0),
      hpAfter: target.hp,
      blockAfter: target.block,
    });
  } else if (effect.kind === 'block') {
    rt.events.push({
      type: 'blockGained',
      targetId: actor.id,
      amount: actor.block - beforeActorBlock,
      blockAfter: actor.block,
    });
  } else if (effect.kind === 'heal') {
    rt.events.push({
      type: 'healed',
      targetId: actor.id,
      amount: actor.hp - beforeActorHp,
      hpAfter: actor.hp,
    });
  } else if (effect.kind === 'status' && effect.status) {
    const current = target.statuses.find((status) => status.type === effect.status);
    rt.events.push({
      type: 'statusApplied',
      targetId: target.id,
      status: effect.status,
      amount: current?.amount ?? effect.amount ?? 0,
      remainingTurns: current?.remainingTurns ?? effect.duration ?? 0,
    });
    if (effect.status === 'stun' && target === state.enemy) {
      target.statuses = target.statuses.filter((status) => status.type !== 'stun');
      state.intent = voidIntent(state.intent, 'stun');
      rt.events.push({ type: 'intentVoided', reason: 'stun' });
    }
  }
}

/** Poison/burn tick at the afflicted combatant's turn start, before input opens (R20). Direct HP — block never absorbs a tick. */
function tickStatuses(rt: EngineRuntime, side: 'player' | 'enemy'): void {
  const combatant = side === 'player' ? rt.state.player : rt.state.enemy;
  const next: ActiveStatusEffect[] = [];
  for (const status of combatant.statuses) {
    if (status.type === 'poison' || status.type === 'burn') {
      combatant.hp = Math.max(0, combatant.hp - status.amount);
      rt.log.push(`${combatant.name} takes ${status.amount} ${status.type} damage`);
      const remaining = status.remainingTurns - 1;
      rt.events.push({
        type: 'statusTicked',
        targetId: combatant.id,
        status: status.type,
        amount: status.amount,
        hpAfter: combatant.hp,
        remainingTurns: Math.max(0, remaining),
      });
      if (remaining > 0) next.push({ ...status, remainingTurns: remaining });
      continue;
    }
    next.push({ ...status });
  }
  combatant.statuses = next;
}

/** R22 legibility: when no card play is possible, say so and highlight end turn. */
function announceNoPlays(rt: EngineRuntime): void {
  const state = rt.state;
  if (state.phase === 'decided') return;
  if (state.playerStunned) {
    rt.events.push({ type: 'noPlayableCards', reason: 'stunned' });
    return;
  }
  if (state.hand.length === 0) {
    rt.events.push({ type: 'noPlayableCards', reason: 'empty_hand' });
    return;
  }
  if (playableCards(state).length === 0) {
    rt.events.push({ type: 'noPlayableCards', reason: 'unaffordable' });
  }
}

/**
 * F1 turn start: block expires → status ticks (death here is final — no item
 * window) → stun consumption announced → energy resets → hand draws to size →
 * the next intent telegraphs before the player can commit anything (R5).
 */
function startPlayerTurn(rt: EngineRuntime): void {
  const state = rt.state;
  state.turn += 1;
  rt.events.push({ type: 'turnStarted', turn: state.turn });
  if (state.player.block > 0) {
    rt.events.push({ type: 'blockExpired', targetId: state.player.id, amount: state.player.block });
    state.player.block = 0;
  }
  tickStatuses(rt, 'player');
  if (checkTerminal(rt)) return;
  const stun = state.player.statuses.find((status) => status.type === 'stun');
  state.playerStunned = Boolean(stun);
  if (stun) {
    state.player.statuses = state.player.statuses.filter((status) => status.type !== 'stun');
    rt.events.push({ type: 'stunned', targetId: state.player.id });
  }
  state.energy = state.energyPerTurn;
  rt.events.push({ type: 'energyChanged', energy: state.energy, max: state.energyPerTurn });
  drawCards(rt, state.drawSize);
  state.intent = telegraphIntent(state.intent, state.turn);
  if (state.intent.current) {
    const view = intentView(state.intent.current);
    rt.events.push({
      type: 'intentTelegraphed',
      name: view.name,
      telegraph: view.telegraph,
      kind: view.kind,
      magnitude: view.magnitude,
    });
  }
  announceNoPlays(rt);
}

/**
 * The enemy's beat (R11 rules side): its block expires, its statuses tick, then
 * the telegraphed intent resolves — or fizzles without advancing the cycle when
 * voided by stun or smoke bomb (R21; delay, not skip — see clearVoidedIntent).
 */
function enemyBeat(rt: EngineRuntime): void {
  const state = rt.state;
  if (state.enemy.block > 0) {
    rt.events.push({ type: 'blockExpired', targetId: state.enemy.id, amount: state.enemy.block });
    state.enemy.block = 0;
  }
  tickStatuses(rt, 'enemy');
  if (checkTerminal(rt)) return;
  const intent = state.intent;
  if (!intent.current) {
    state.intent = resolveIntent(intent);
    return;
  }
  if (intent.voided) {
    rt.events.push({ type: 'enemyBeatFizzled', reason: intent.voided });
    rt.log.push(`${state.enemy.name}'s ${intent.current.name} fizzles`);
    state.intent = clearVoidedIntent(intent);
    return;
  }
  rt.events.push({ type: 'enemyBeatStarted', name: intent.current.name });
  rt.log.push(`${state.enemy.name} uses ${intent.current.name}`);
  for (const effect of intent.current.effects) {
    applyEffect(rt, effect, 'enemy');
    if (checkTerminal(rt)) break;
  }
  state.intent = resolveIntent(state.intent);
}

/**
 * Seal a command: append the R18 outcome marker as the final event of the command
 * that reached lethal, then mirror the list onto the combat event bus (KTD3).
 * `statusApplied` is skipped there — dispatchEffect already emitted it live.
 */
function finish(rt: EngineRuntime): TurnCommandResult {
  if (rt.state.phase === 'decided' && rt.state.outcome) {
    rt.events.push({ type: 'battleEnded', outcome: rt.state.outcome });
  }
  for (const event of rt.events) {
    if (event.type === 'statusApplied') continue;
    emitCombatEvent(event);
  }
  return { state: rt.state, events: rt.events, log: rt.log };
}

/** Build the battle and run the first turn start. The deck is shuffled whole — the collection IS the draw pile (R1). */
export function createBattle(config: TurnEngineConfig, rng: GameRng): TurnCommandResult {
  const state: TurnBattleState = {
    turn: 0,
    energy: 0,
    energyPerTurn: config.energyPerTurn ?? DEFAULT_ENERGY_PER_TURN,
    drawSize: config.drawSize ?? DEFAULT_DRAW_SIZE,
    drawPile: shuffle(rng, config.deck),
    hand: [],
    discardPile: [],
    exhaustPile: [],
    player: {
      id: 'player',
      name: config.player.name ?? 'You',
      hp: config.player.hp,
      maxHp: config.player.maxHp,
      armor: config.player.armor,
      block: 0,
      statuses: [],
    },
    enemy: {
      id: config.enemy.id,
      name: config.enemy.name,
      hp: config.enemy.hp,
      maxHp: config.enemy.maxHp,
      armor: config.enemy.armor,
      block: 0,
      statuses: [],
    },
    intent: createIntentState(config.pattern),
    playerStunned: false,
    phase: 'player',
    outcome: null,
  };
  const rt: EngineRuntime = { state, events: [], log: [], rng };
  startPlayerTurn(rt);
  return finish(rt);
}

/**
 * F2: play one card. Rules resolve here, completely and instantly; the returned
 * events replay it. Effects stop the moment lethal is reached (R18 — leftovers
 * are forfeit), but the card still lands in a pile before the outcome marker so
 * its lifecycle stays legible (R10): a card marked `exhaust` (KTD1) routes to
 * `exhaustPile` instead of `discardPile`, leaving play for the rest of the
 * battle without shrinking the collection permanently (AE1).
 */
export function playCard(input: TurnBattleState, cardUid: number, rng: GameRng): TurnCommandResult {
  if (input.phase === 'decided') return reject(input, 'battle_decided');
  if (input.playerStunned) return reject(input, 'player_stunned');
  const card = input.hand.find((candidate) => candidate.uid === cardUid);
  if (!card) return reject(input, 'card_not_in_hand');
  const cost = cardCost(card);
  if (cost > input.energy) return reject(input, 'insufficient_energy');

  const rt = createRuntime(input, rng);
  const state = rt.state;
  const played = state.hand.find((candidate) => candidate.uid === cardUid) as Card;
  state.hand = state.hand.filter((candidate) => candidate.uid !== cardUid);
  state.energy -= cost;
  rt.events.push({ type: 'cardPlayed', card: played, cost, energyAfter: state.energy });
  rt.log.push(`${state.player.name} plays ${played.name}`);
  for (const effect of played.effects) {
    applyEffect(rt, effect, 'player');
    if (checkTerminal(rt)) break;
  }
  if (played.exhaust) {
    state.exhaustPile.push(played);
    rt.events.push({
      type: 'cardExhausted',
      card: played,
      exhaustCount: state.exhaustPile.length,
    });
  } else {
    state.discardPile.push(played);
    rt.events.push({ type: 'cardDiscarded', card: played, discardCount: state.discardPile.length });
  }
  announceNoPlays(rt);
  return finish(rt);
}

/**
 * R16: items are free actions — no energy, no card play, legal while stunned.
 * Removing the item from the inventory is the caller's job (the engine holds no
 * inventory), mirroring how the old scene consumed items.
 */
export function useItem(
  input: TurnBattleState,
  item: InventoryItem,
  rng: GameRng,
): TurnCommandResult {
  if (input.phase === 'decided') return reject(input, 'battle_decided');
  const rt = createRuntime(input, rng);
  rt.events.push({ type: 'itemUsed', itemName: item.name });
  rt.log.push(`${rt.state.player.name} uses ${item.name}`);
  if (item.kind === 'heal') {
    applyEffect(rt, { kind: 'heal', amount: item.amount }, 'player');
  } else if (item.kind === 'shield') {
    applyEffect(rt, { kind: 'block', amount: item.amount }, 'player');
  } else if (item.kind === 'damage') {
    applyEffect(rt, { kind: 'damage', amount: item.amount }, 'player');
  } else if (item.kind === 'skip_attack') {
    rt.state.intent = voidIntent(rt.state.intent, 'smoke_bomb');
    rt.events.push({ type: 'intentVoided', reason: 'smoke_bomb' });
  }
  checkTerminal(rt);
  return finish(rt);
}

/** F1: end the turn — discard the remaining hand (R3), play the enemy beat, then start the next turn. */
export function endTurn(input: TurnBattleState, rng: GameRng): TurnCommandResult {
  if (input.phase === 'decided') return reject(input, 'battle_decided');
  const rt = createRuntime(input, rng);
  const state = rt.state;
  if (state.hand.length > 0) {
    const count = state.hand.length;
    state.discardPile.push(...state.hand);
    state.hand = [];
    rt.events.push({ type: 'handDiscarded', count, discardCount: state.discardPile.length });
  }
  enemyBeat(rt);
  if (state.phase !== 'decided') startPlayerTurn(rt);
  return finish(rt);
}
