import { Card, CardDef, StatusEffectType } from '../data/cards';
import type { InventoryItem } from '../data/items';
import type { ActiveStatusEffect, MutableCombatant } from './combat';
import { modifiedDamage, statusValue } from './combat';
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

/**
 * An enemy combatant. Multi-enemy packs carry an intent PER enemy (each
 * telegraphs and beats on its own cycle), so the intent lives on the combatant
 * rather than a single battle-level field.
 */
export interface EnemyCombatant extends TurnCombatant {
  intent: IntentState;
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
  /**
   * The enemy pack (multi-enemy). A solo fight is a one-element array; index 0
   * is the "primary" enemy that presentation/policy default their focus to.
   * Victory is when every enemy is dead. Each enemy owns its intent.
   */
  enemies: EnemyCombatant[];
  /** True while the player's consumed stun skips card plays this turn (R21); items stay legal. */
  playerStunned: boolean;
  phase: BattlePhase;
  outcome: BattleOutcome | null;
  /** Relic battle-setup modifiers (per-battle, set from `createBattle` config). */
  startingEnergyBonus: number;
  retainBlockCap: number;
  poisonBonus: number;
  enemyKillDraw: number;
}

export interface TurnEngineConfig {
  /** The full card collection — the deck IS the collection (R1). */
  deck: readonly Card[];
  player: { name?: string; hp: number; maxHp: number; armor: number };
  /** One or more enemies; each carries its own authored intent pattern. */
  enemies: {
    id: string;
    name: string;
    hp: number;
    maxHp: number;
    armor: number;
    pattern: IntentPattern;
  }[];
  energyPerTurn?: number;
  drawSize?: number;
  startingEnergyBonus?: number;
  retainBlockCap?: number;
  poisonBonus?: number;
  enemyKillDraw?: number;
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

/** Living enemies (hp > 0), in pack order. */
export function livingEnemies(state: TurnBattleState): EnemyCombatant[] {
  return state.enemies.filter((enemy) => enemy.hp > 0);
}

/**
 * The living enemy a player's offensive effect lands on: the caller's focus if
 * it is still alive, otherwise the weakest living enemy (hp+block), so a combo
 * that overkills its focus spills onto the next-nearest kill instead of a corpse.
 * Falls back to `enemies[0]` only when the pack is already wiped (the effect loop
 * breaks on the terminal check before that is ever hit).
 */
export function resolveOffensiveTarget(state: TurnBattleState, focusId?: string): EnemyCombatant {
  const living = livingEnemies(state);
  if (living.length === 0) return state.enemies[0];
  const focused = focusId ? living.find((enemy) => enemy.id === focusId) : undefined;
  if (focused) return focused;
  return [...living].sort((a, b) => a.hp + a.block - (b.hp + b.block))[0];
}

function cloneCombatant(combatant: TurnCombatant): TurnCombatant {
  return { ...combatant, statuses: combatant.statuses.map((status) => ({ ...status })) };
}

function cloneEnemy(enemy: EnemyCombatant): EnemyCombatant {
  return {
    ...enemy,
    statuses: enemy.statuses.map((status) => ({ ...status })),
    intent: cloneIntentState(enemy.intent),
  };
}

function cloneState(state: TurnBattleState): TurnBattleState {
  return {
    ...state,
    drawPile: [...state.drawPile],
    hand: [...state.hand],
    discardPile: [...state.discardPile],
    exhaustPile: [...state.exhaustPile],
    player: cloneCombatant(state.player),
    enemies: state.enemies.map(cloneEnemy),
    startingEnergyBonus: state.startingEnergyBonus,
    retainBlockCap: state.retainBlockCap,
    poisonBonus: state.poisonBonus,
    enemyKillDraw: state.enemyKillDraw,
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

/** Flip into the R18 terminal state the moment rules resolution reaches lethal. The whole pack
 * dying wins the battle; player death loses. Enemy death wins ties (checked first). */
function checkTerminal(rt: EngineRuntime): boolean {
  if (rt.state.phase === 'decided') return true;
  if (rt.state.enemies.every((enemy) => enemy.hp <= 0)) {
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

/** Shuffle a card into a random position in the Draw Pile (hexer elite's curse-shuffle, U5). */
function shuffleCardIntoDrawPile(rt: EngineRuntime, card: Card): void {
  const state = rt.state;
  const index = state.drawPile.length === 0 ? 0 : rt.rng.between(0, state.drawPile.length);
  state.drawPile.splice(index, 0, card);
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
  actor: TurnCombatant,
  target: TurnCombatant,
): void {
  const state = rt.state;
  const actorM = toMutable(actor);
  // A self-targeted effect (a block/heal item: actor === target) must share ONE mutable, or the
  // second writeBack below would revert the first from a stale copy (silently zeroing the gain).
  const targetM = actor === target ? actorM : toMutable(target);
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
    shuffleIntoDrawPile: (card) => shuffleCardIntoDrawPile(rt, card),
    // venom_ring boosts poison the PLAYER applies, not poison inflicted on them — scope the
    // bonus to the actor, or an enemy's own poison attack would get buffed by the player's relic.
    poisonBonus: actor.id === state.player.id ? state.poisonBonus : 0,
  });

  // The single resolved damage number (B1): the same value the damage handler used for HP, so
  // block depletion and the presentation event can never desync from the modifiers.
  const resolvedDamage =
    effect.kind === 'damage' ? modifiedDamage(effect.amount ?? 0, actorM, targetM) : 0;

  if (effect.kind === 'damage') {
    const absorbed = Math.min(beforeTargetBlock, resolvedDamage);
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
      blockAbsorbed: Math.min(beforeTargetBlock, resolvedDamage),
      hpAfter: target.hp,
      blockAfter: target.block,
    });
    if (
      target.id !== state.player.id &&
      beforeTargetHp > 0 &&
      target.hp <= 0 &&
      state.enemyKillDraw > 0
    ) {
      drawCards(rt, state.enemyKillDraw);
    }
  } else if (effect.kind === 'strength') {
    // Strength is a self-buff: mirror it as a statusApplied on the ACTOR carrying the
    // post-stack total so the HUD shows the running stack (B-adjust: dual-channel amounts).
    const current = actor.statuses.find((status) => status.type === 'strength');
    rt.events.push({
      type: 'statusApplied',
      targetId: actor.id,
      status: 'strength',
      amount: current?.amount ?? effect.amount ?? 0,
      remainingTurns: 0,
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
    if (effect.status === 'stun' && target !== state.player) {
      const enemy = target as EnemyCombatant;
      enemy.statuses = enemy.statuses.filter((status) => status.type !== 'stun');
      enemy.intent = voidIntent(enemy.intent, 'stun');
      rt.events.push({ type: 'intentVoided', reason: 'stun', sourceId: enemy.id });
    }
  }
}

/** Poison/burn tick at the afflicted combatant's turn start, before input opens (R20). Direct HP — block never absorbs a tick. */
function tickStatuses(rt: EngineRuntime, combatant: TurnCombatant): void {
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

/** The timed modifier debuffs, ticked by `tickDebuffs`. Strength (permanent) and DoTs (ticked at
 * turn start) are deliberately excluded — see B4. */
const TIMED_DEBUFFS: StatusEffectType[] = ['vulnerable', 'weak', 'frail'];

/**
 * Count the listed timed debuffs on one side down by one and drop the expired ones (B4). Timed by
 * WHAT they modify, not "the side's turn": enemy debuffs decay at the end of the enemy beat; the
 * player's `weak`/`frail` (spent in the card phase) at the start of `endTurn`; the player's
 * `vulnerable` (spent by the enemy's hit) right after the beat resolves. Emits a silent
 * `statusFaded` per change so the HUD decrements without a damage pop.
 */
function tickDebuffs(rt: EngineRuntime, combatant: TurnCombatant, kinds: StatusEffectType[]): void {
  const next: ActiveStatusEffect[] = [];
  for (const status of combatant.statuses) {
    if (!kinds.includes(status.type)) {
      next.push(status);
      continue;
    }
    const remaining = status.remainingTurns - 1;
    if (remaining > 0) next.push({ ...status, remainingTurns: remaining });
    rt.events.push({
      type: 'statusFaded',
      targetId: combatant.id,
      status: status.type,
      remainingTurns: Math.max(0, remaining),
    });
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
    if (state.retainBlockCap > 0) {
      const retained = Math.min(state.player.block, state.retainBlockCap);
      const expired = state.player.block - retained;
      if (expired > 0) {
        rt.events.push({ type: 'blockExpired', targetId: state.player.id, amount: expired });
      }
      state.player.block = retained;
    } else {
      rt.events.push({
        type: 'blockExpired',
        targetId: state.player.id,
        amount: state.player.block,
      });
      state.player.block = 0;
    }
  }
  tickStatuses(rt, state.player);
  if (checkTerminal(rt)) return;
  const stun = state.player.statuses.find((status) => status.type === 'stun');
  state.playerStunned = Boolean(stun);
  if (stun) {
    state.player.statuses = state.player.statuses.filter((status) => status.type !== 'stun');
    rt.events.push({ type: 'stunned', targetId: state.player.id });
  }
  const turnEnergyMax = state.energyPerTurn + (state.turn === 1 ? state.startingEnergyBonus : 0);
  state.energy = turnEnergyMax;
  rt.events.push({ type: 'energyChanged', energy: state.energy, max: turnEnergyMax });
  drawCards(rt, state.drawSize);
  // Every living enemy telegraphs its own next beat (multi-enemy: one panel per enemy).
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    // Block is a defensive stance, not a delayed reward: last round's guard drops before
    // this round's (possibly new) one goes up — mirrors the old "expires at own beat start"
    // lifespan, just anchored to the telegraph instead of the beat.
    if (enemy.block > 0) {
      rt.events.push({ type: 'blockExpired', targetId: enemy.id, amount: enemy.block });
      enemy.block = 0;
    }
    enemy.intent = telegraphIntent(enemy.intent, state.turn);
    if (enemy.intent.current) {
      // Fold the enemy's Strength into the telegraphed magnitude so a ritual-buffed hit reads
      // honestly (R5) — the number shown matches what the beat will resolve.
      const view = intentView(enemy.intent.current, statusValue(enemy, 'strength'));
      rt.events.push({
        type: 'intentTelegraphed',
        sourceId: enemy.id,
        name: view.name,
        telegraph: view.telegraph,
        kind: view.kind,
        magnitude: view.magnitude,
      });
      // Block-kind effects raise the guard the instant they're telegraphed, not at the end of
      // this same turn — the player's hits THIS round must contend with it, matching what a
      // "will block" telegraph actually promises. Non-block effects (damage/status/etc.) still
      // wait for the enemy's own beat below. A voided intent (stun/smoke bomb) is decided by a
      // player action AFTER this point, so it can no longer undo a guard already raised — the
      // trade-off of making block honest instead of delayed.
      for (const effect of enemy.intent.current.effects) {
        if (effect.kind === 'block') applyEffect(rt, effect, enemy, state.player);
      }
    }
  }
  announceNoPlays(rt);
}

/**
 * The enemy's beat (R11 rules side): its statuses tick, then the telegraphed intent's
 * non-block effects resolve — or fizzle without advancing the cycle when voided by stun
 * or smoke bomb (R21; delay, not skip — see clearVoidedIntent). Block already went up
 * when the intent was telegraphed, at the start of this turn (see startPlayerTurn).
 */
function enemyBeat(rt: EngineRuntime, enemy: EnemyCombatant): void {
  const state = rt.state;
  const hpBeforeDot = enemy.hp;
  tickStatuses(rt, enemy);
  // hunter_charm's draw-on-kill otherwise only triggers from `applyEffect`'s damage branch, which
  // a DoT tick never goes through — credit the kill here too. Checked BEFORE `checkTerminal`
  // (mirroring the damage branch's own ordering) so it still fires when this is the last enemy
  // standing and the kill ends the battle, not just when a packmate survives.
  if (hpBeforeDot > 0 && enemy.hp <= 0 && state.enemyKillDraw > 0) {
    drawCards(rt, state.enemyKillDraw);
  }
  if (checkTerminal(rt)) return;
  // A DoT can drop THIS enemy while its packmates live (not terminal) — a corpse takes no beat.
  if (enemy.hp <= 0) return;
  const intent = enemy.intent;
  if (!intent.current) {
    enemy.intent = resolveIntent(intent);
  } else if (intent.voided) {
    rt.events.push({ type: 'enemyBeatFizzled', sourceId: enemy.id, reason: intent.voided });
    rt.log.push(`${enemy.name}'s ${intent.current.name} fizzles`);
    enemy.intent = clearVoidedIntent(intent);
  } else {
    rt.events.push({ type: 'enemyBeatStarted', sourceId: enemy.id, name: intent.current.name });
    rt.log.push(`${enemy.name} uses ${intent.current.name}`);
    for (const effect of intent.current.effects) {
      // Already applied when this intent was telegraphed at the top of the turn.
      if (effect.kind === 'block') continue;
      applyEffect(rt, effect, enemy, state.player);
      if (checkTerminal(rt)) break;
    }
    enemy.intent = resolveIntent(enemy.intent);
  }
  // Enemy-side timed debuffs decay at the END of the enemy's beat, on every non-terminal path
  // (empty/fizzled/resolved) — a fizzled beat is still the enemy's action (mirrors "stun delays,
  // not skips"). Skipped only when the battle already ended this beat.
  if (state.phase !== 'decided') tickDebuffs(rt, enemy, TIMED_DEBUFFS);
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
    enemies: config.enemies.map((enemy) => ({
      id: enemy.id,
      name: enemy.name,
      hp: enemy.hp,
      maxHp: enemy.maxHp,
      armor: enemy.armor,
      block: 0,
      statuses: [],
      intent: createIntentState(enemy.pattern),
    })),
    playerStunned: false,
    phase: 'player',
    outcome: null,
    startingEnergyBonus: config.startingEnergyBonus ?? 0,
    retainBlockCap: config.retainBlockCap ?? 0,
    poisonBonus: config.poisonBonus ?? 0,
    enemyKillDraw: config.enemyKillDraw ?? 0,
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
export function playCard(
  input: TurnBattleState,
  cardUid: number,
  rng: GameRng,
  targetId?: string,
): TurnCommandResult {
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
  // Offensive effects land on `targetId` if it is still alive, else the weakest living enemy —
  // recomputed per effect so a combo that kills its focus spills onto the next target (R-pack).
  for (const effect of played.effects) {
    applyEffect(rt, effect, state.player, resolveOffensiveTarget(state, targetId));
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
  targetId?: string,
): TurnCommandResult {
  if (input.phase === 'decided') return reject(input, 'battle_decided');
  const rt = createRuntime(input, rng);
  const state = rt.state;
  rt.events.push({ type: 'itemUsed', itemName: item.name });
  rt.log.push(`${state.player.name} uses ${item.name}`);
  if (item.kind === 'heal') {
    applyEffect(rt, { kind: 'heal', amount: item.amount }, state.player, state.player);
  } else if (item.kind === 'shield') {
    applyEffect(rt, { kind: 'block', amount: item.amount }, state.player, state.player);
  } else if (item.kind === 'damage') {
    applyEffect(
      rt,
      { kind: 'damage', amount: item.amount },
      state.player,
      resolveOffensiveTarget(state, targetId),
    );
  } else if (item.kind === 'skip_attack') {
    // Smoke bomb voids ONE enemy's telegraph ("skip one enemy attack"): the focus if alive, else
    // the weakest — the same enemy the player is committing against this turn.
    const target = resolveOffensiveTarget(state, targetId);
    target.intent = voidIntent(target.intent, 'smoke_bomb');
    rt.events.push({ type: 'intentVoided', sourceId: target.id, reason: 'smoke_bomb' });
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
  // Player Weak/Frail were spent across the card phase that just ended (B4).
  tickDebuffs(rt, state.player, ['weak', 'frail']);
  // Each living enemy beats in pack order; a mid-pack lethal on the player stops the rest.
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    enemyBeat(rt, enemy);
    if (checkTerminal(rt)) break;
  }
  if (state.phase !== 'decided') {
    // Player Vulnerable persisted through every enemy hit this turn; it decays once, after them all (B4).
    tickDebuffs(rt, state.player, ['vulnerable']);
    startPlayerTurn(rt);
  }
  return finish(rt);
}
