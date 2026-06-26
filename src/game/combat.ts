import { PUNCH_DAMAGE } from '../config';
import { Card, CardEffect, StatusEffectType } from '../data/cards';
import { InventoryItem } from '../data/items';

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
}

export interface ResolveRoundResult {
  player: CombatantSnapshot;
  enemy: CombatantSnapshot;
  log: string[];
}

interface MutableCombatant extends CombatantSnapshot {
  roundBlock: number;
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
  if (action.kind === 'item') return action.item.kind === 'heal' || action.item.kind === 'shield' || action.item.kind === 'skip_attack' ? 10 : 7;
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

function actionEffects(action: CombatAction): CardEffect[] {
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

function formatStatusLine(status: ActiveStatusEffect): string {
  if (status.type === 'stun') return 'stunned';
  const rounds = `${status.remainingTurns} round${status.remainingTurns === 1 ? '' : 's'}`;
  return `${status.type}ed (${status.amount} for ${rounds})`;
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
  combatant.statuses = combatant.statuses.filter((status) => status.type !== 'stun' || status.remainingTurns > 0);
  return true;
}

function addStatus(target: MutableCombatant, status: ActiveStatusEffect): void {
  const existing = target.statuses.find((candidate) => candidate.type === status.type);
  if (!existing) {
    target.statuses.push(status);
    return;
  }
  existing.amount = Math.max(existing.amount, status.amount);
  existing.remainingTurns = Math.max(existing.remainingTurns, status.remainingTurns);
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

  for (const effect of actionEffects(action)) {
    if (effect.kind === 'block') {
      actor.roundBlock += effect.amount;
      log.push(`${actor.name} gains ${effect.amount} block`);
    } else if (effect.kind === 'heal') {
      const healed = Math.min(actor.maxHp, actor.hp + effect.amount) - actor.hp;
      actor.hp += healed;
      if (healed > 0) log.push(`${actor.name} heals ${healed} HP`);
    } else if (effect.kind === 'damage') {
      const reduction = target.armor + target.roundBlock;
      const dealt = Math.max(0, effect.amount - reduction);
      target.hp = Math.max(0, target.hp - dealt);
      if (dealt > 0) log.push(`${target.name} takes ${dealt} damage`);
      else log.push(`${target.name} blocks the hit`);
    } else if (effect.kind === 'status') {
      addStatus(target, {
        type: effect.status,
        amount: effect.amount,
        remainingTurns: effect.duration,
      });
      const current = target.statuses.find((status) => status.type === effect.status);
      if (current) log.push(`${target.name} is ${formatStatusLine(current)}`);
    }
  }

  return 'normal';
}

export function resolveRound(input: ResolveRoundInput): ResolveRoundResult {
  const player = cloneCombatant(input.player);
  const enemy = cloneCombatant(input.enemy);
  const log: string[] = [];

  applyStartOfRoundStatuses(player, log);
  applyStartOfRoundStatuses(enemy, log);

  if (player.hp <= 0 || enemy.hp <= 0) {
    return { player, enemy, log };
  }

  const playerStunned = consumeStun(player);
  const enemyStunned = consumeStun(enemy);
  if (playerStunned) log.push(`${player.name} is stunned`);
  if (enemyStunned) log.push(`${enemy.name} is stunned`);

  const actions = [
    { action: playerStunned ? { actor: 'player', kind: 'none' } as CombatAction : input.playerAction, actor: player, target: enemy },
    { action: enemyStunned ? { actor: 'enemy', kind: 'none' } as CombatAction : input.enemyAction, actor: enemy, target: player },
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

    const outcome = applyAction(turn.action, turn.actor, turn.target, log);
    if (outcome === 'skip_target') {
      if (turn.action.actor === 'player') skipEnemyAction = true;
      else skipPlayerAction = true;
    }
  }

  const trim = ({ roundBlock: _roundBlock, ...combatant }: MutableCombatant): CombatantSnapshot => combatant;
  return { player: trim(player), enemy: trim(enemy), log };
}
