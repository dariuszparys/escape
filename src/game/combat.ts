import { MATCHUP_BONUS_DAMAGE, PUNCH_DAMAGE } from '../config';
import { Card, CardEffect, StatusEffectType } from '../data/cards';
import { InventoryItem } from '../data/items';
import { HpChange } from './combatFeedback';
import { emitCombatEvent, hasCombatEventSubscribers } from './combatEvents';
import { dispatchEffect } from './effectHandlers';
import { type ActionFamily, familyForEffects, matchupResult } from './familyMatchup';

export interface ActiveStatusEffect {
  type: StatusEffectType;
  amount: number;
  remainingTurns: number;
}

export interface CombatantSnapshot {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  armor: number;
  statuses: ActiveStatusEffect[];
}

export type CombatActor = 'player' | 'enemy';

export type CombatAction =
  | { actor: CombatActor; kind: 'card'; card: Card }
  | { actor: CombatActor; kind: 'item'; item: InventoryItem }
  | { actor: CombatActor; kind: 'punch' }
  | { actor: CombatActor; kind: 'special'; name: string; speed: number; effects: CardEffect[] }
  | { actor: CombatActor; kind: 'none' };

export interface ResolveRoundInput {
  player: CombatantSnapshot;
  enemy: CombatantSnapshot;
  playerAction: CombatAction;
  enemyAction: CombatAction;
  playerMatchupPayoff?: PlayerMatchupPayoff | null;
}

export interface ResolveRoundResult {
  player: CombatantSnapshot;
  enemy: CombatantSnapshot;
  log: string[];
  playerHpChange: HpChange;
  enemyHpChange: HpChange;
}

/** A combatant mid-round, carrying the transient block accumulated this round. Handlers mutate this. */
export interface MutableCombatant extends CombatantSnapshot {
  roundBlock: number;
}

export interface PlayerMatchupPayoff {
  damage: number;
  outcome: 'win';
  playerFamily: ActionFamily;
  enemyFamily: ActionFamily;
}

function cloneCombatant(combatant: CombatantSnapshot): MutableCombatant {
  return {
    ...combatant,
    hp: Math.max(0, Math.min(combatant.maxHp, combatant.hp)),
    statuses: combatant.statuses.map((status) => ({ ...status })),
    roundBlock: 0,
  };
}

export function combatActionSpeed(action: CombatAction): number {
  if (action.kind === 'card') return action.card.speed;
  if (action.kind === 'item')
    return action.item.kind === 'heal' ||
      action.item.kind === 'shield' ||
      action.item.kind === 'skip_attack'
      ? 10
      : 7;
  if (action.kind === 'punch') return 5;
  if (action.kind === 'special') return action.speed;
  return 0;
}

export function combatActionLabel(action: CombatAction): string {
  if (action.kind === 'card') return action.card.name;
  if (action.kind === 'item') return action.item.name;
  if (action.kind === 'punch') return 'Punch';
  if (action.kind === 'special') return action.name;
  return 'nothing';
}

export function combatActionEffects(action: CombatAction): CardEffect[] {
  if (action.kind === 'card') return action.card.effects;
  if (action.kind === 'punch') return [{ kind: 'damage', amount: PUNCH_DAMAGE }];
  if (action.kind === 'special') return action.effects;
  if (action.kind === 'item') {
    if (action.item.kind === 'heal') return [{ kind: 'heal', amount: action.item.amount }];
    if (action.item.kind === 'damage') return [{ kind: 'damage', amount: action.item.amount }];
    if (action.item.kind === 'shield') return [{ kind: 'block', amount: action.item.amount }];
  }
  return [];
}

export function matchupPayoffForAction(
  action: CombatAction,
  enemyFamily: ActionFamily,
): PlayerMatchupPayoff | null {
  const playerFamily = familyForEffects(combatActionEffects(action));
  const result = matchupResult(playerFamily, enemyFamily);
  if (result.outcome !== 'win') return null;
  return {
    damage: MATCHUP_BONUS_DAMAGE,
    outcome: result.outcome,
    playerFamily,
    enemyFamily,
  };
}

function applyStartOfRoundStatuses(combatant: MutableCombatant, log: string[]): void {
  const next: ActiveStatusEffect[] = [];
  for (const status of combatant.statuses) {
    if (status.type === 'poison' || status.type === 'burn') {
      combatant.hp = Math.max(0, combatant.hp - status.amount);
      log.push(`${combatant.name} takes ${status.amount} ${status.type} damage`);
      if (status.remainingTurns > 1) {
        next.push({ ...status, remainingTurns: status.remainingTurns - 1 });
      }
      continue;
    }
    next.push({ ...status });
  }
  combatant.statuses = next;
}

function consumeStun(combatant: MutableCombatant): boolean {
  const stun = combatant.statuses.find((status) => status.type === 'stun');
  if (!stun) return false;

  stun.remainingTurns--;
  combatant.statuses = combatant.statuses.filter(
    (status) => status.type !== 'stun' || status.remainingTurns > 0,
  );
  return true;
}

function applyAction(
  action: CombatAction,
  actor: MutableCombatant,
  target: MutableCombatant,
  log: string[],
): 'skip_target' | 'normal' {
  if (action.kind === 'none') return 'normal';

  log.push(`${actor.name} uses ${combatActionLabel(action)}`);

  if (action.kind === 'item' && action.item.kind === 'skip_attack') {
    return 'skip_target';
  }

  for (const effect of combatActionEffects(action)) {
    dispatchEffect(effect, { actor, target, log });
  }

  return 'normal';
}

export function resolveRound(input: ResolveRoundInput): ResolveRoundResult {
  const player = cloneCombatant(input.player);
  const enemy = cloneCombatant(input.enemy);
  const log: string[] = [];
  const playerHpChange: HpChange = { damage: 0, heal: 0 };
  const enemyHpChange: HpChange = { damage: 0, heal: 0 };

  const trackHp = (combatant: MutableCombatant, before: number, isPlayer: boolean) => {
    const delta = combatant.hp - before;
    if (delta < 0) {
      if (isPlayer) playerHpChange.damage += -delta;
      else enemyHpChange.damage += -delta;
    } else if (delta > 0) {
      if (isPlayer) playerHpChange.heal += delta;
      else enemyHpChange.heal += delta;
    }
  };

  const playerHpBeforeStatus = player.hp;
  const enemyHpBeforeStatus = enemy.hp;
  applyStartOfRoundStatuses(player, log);
  applyStartOfRoundStatuses(enemy, log);
  trackHp(player, playerHpBeforeStatus, true);
  trackHp(enemy, enemyHpBeforeStatus, false);

  if (player.hp <= 0 || enemy.hp <= 0) {
    return { player, enemy, log, playerHpChange, enemyHpChange };
  }

  // Round-level lifecycle signal: the action phase is underway. Inert (and allocation-free)
  // until a subscriber registers — I1/I5 are the first real consumers (KTD2).
  if (hasCombatEventSubscribers('roundStart')) emitCombatEvent({ type: 'roundStart' });

  const playerStunned = consumeStun(player);
  const enemyStunned = consumeStun(enemy);
  if (playerStunned) log.push(`${player.name} is stunned`);
  if (enemyStunned) log.push(`${enemy.name} is stunned`);

  const actions = [
    {
      action: playerStunned
        ? ({ actor: 'player', kind: 'none' } as CombatAction)
        : input.playerAction,
      actor: player,
      target: enemy,
    },
    {
      action: enemyStunned ? ({ actor: 'enemy', kind: 'none' } as CombatAction) : input.enemyAction,
      actor: enemy,
      target: player,
    },
  ].sort((a, b) => {
    const speed = combatActionSpeed(b.action) - combatActionSpeed(a.action);
    if (speed !== 0) return speed;
    return a.action.actor === 'player' ? -1 : 1;
  });

  let skipEnemyAction = false;
  let skipPlayerAction = false;
  for (const turn of actions) {
    if (turn.actor.hp <= 0 || turn.target.hp <= 0) continue;
    if (turn.action.kind === 'none') continue;

    if (turn.action.actor === 'enemy' && skipEnemyAction) {
      log.push(`${enemy.name} attack is skipped`);
      continue;
    }
    if (turn.action.actor === 'player' && skipPlayerAction) {
      log.push(`${player.name} attack is skipped`);
      continue;
    }

    const actorIsPlayer = turn.actor.id === 'player';
    const targetIsPlayer = turn.target.id === 'player';
    const actorHpBefore = turn.actor.hp;
    const targetHpBefore = turn.target.hp;
    const outcome = applyAction(turn.action, turn.actor, turn.target, log);
    if (
      turn.action.actor === 'player' &&
      input.playerMatchupPayoff?.outcome === 'win' &&
      turn.target.hp > 0
    ) {
      log.push(
        `${turn.actor.name} exploits the read for ${input.playerMatchupPayoff.damage} bonus damage`,
      );
      dispatchEffect(
        { kind: 'damage', amount: input.playerMatchupPayoff.damage },
        { actor: turn.actor, target: turn.target, log },
      );
    }
    trackHp(turn.actor, actorHpBefore, actorIsPlayer);
    trackHp(turn.target, targetHpBefore, targetIsPlayer);
    if (outcome === 'skip_target') {
      if (turn.action.actor === 'player') skipEnemyAction = true;
      else skipPlayerAction = true;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const trim = ({ roundBlock: _roundBlock, ...combatant }: MutableCombatant): CombatantSnapshot =>
    combatant;
  return { player: trim(player), enemy: trim(enemy), log, playerHpChange, enemyHpChange };
}
