import { CombatAction, combatActionLabel, combatActionSpeed } from './combat';
import { HpChange } from './combatFeedback';

export interface OrderedBattleAction {
  actor: 'player' | 'enemy';
  label: string;
  speed: number;
}

interface BattleRoundHistoryInput {
  round: number;
  playerAction: CombatAction;
  enemyAction: CombatAction;
  resolvedLog: string[];
  playerHpChange: HpChange;
  enemyHpChange: HpChange;
  enemyName: string;
}

export function orderedBattleActions(
  playerAction: CombatAction,
  enemyAction: CombatAction,
): OrderedBattleAction[] {
  const actions: OrderedBattleAction[] = [
    {
      actor: 'player',
      label: combatActionLabel(playerAction),
      speed: combatActionSpeed(playerAction),
    },
    {
      actor: 'enemy',
      label: combatActionLabel(enemyAction),
      speed: combatActionSpeed(enemyAction),
    },
  ];

  return actions.sort((left, right) => {
    const speed = right.speed - left.speed;
    if (speed !== 0) return speed;
    return left.actor === 'player' ? -1 : 1;
  });
}

function hpChangeLines(label: string, change: HpChange): string[] {
  const lines: string[] = [];
  if (change.heal > 0) lines.push(`${label} +${change.heal} HP`);
  if (change.damage > 0) lines.push(`${label} -${change.damage} HP`);
  return lines;
}

function normalizeActorLine(line: string): string {
  if (line.startsWith('Player uses ')) return line.replace('Player uses ', 'You use ');
  if (line.startsWith('Player takes ')) return line.replace('Player takes ', 'You take ');
  if (line.startsWith('Player heals ')) return line.replace('Player heals ', 'You heal ');
  if (line.startsWith('Player gains ')) return line.replace('Player gains ', 'You gain ');
  if (line.startsWith('Player blocks ')) return line.replace('Player blocks ', 'You block ');
  if (line.startsWith('Player is ')) return line.replace('Player is ', 'You are ');
  if (line.startsWith('Player attack is ')) return line.replace('Player attack is ', 'Your attack is ');
  return line;
}

function splitResolvedLog(resolvedLog: string[]): { start: string[]; actions: string[] } {
  const firstActionIndex = resolvedLog.findIndex((line) => line.includes(' uses '));
  if (firstActionIndex < 0) {
    return { start: resolvedLog, actions: [] };
  }

  return {
    start: resolvedLog.slice(0, firstActionIndex),
    actions: resolvedLog.slice(firstActionIndex),
  };
}

export function buildBattleRoundHistory(input: BattleRoundHistoryInput): string[] {
  const order = orderedBattleActions(input.playerAction, input.enemyAction);
  const sections = splitResolvedLog(input.resolvedLog);
  const lines = [
    `Round ${input.round}`,
  ];

  lines.push(...sections.start.map((line) => `Start: ${normalizeActorLine(line)}`));
  lines.push(
    `1) ${order[0].actor === 'player' ? 'You' : input.enemyName}: ${order[0].label} [spd ${order[0].speed}]`,
    `2) ${order[1].actor === 'player' ? 'You' : input.enemyName}: ${order[1].label} [spd ${order[1].speed}]`,
  );
  lines.push(...sections.actions.map(normalizeActorLine));

  const netLines: string[] = [];
  const youNet = hpChangeLines('You', input.playerHpChange);
  const enemyNet = hpChangeLines(input.enemyName, input.enemyHpChange);
  if (youNet.length > 0 || enemyNet.length > 0) {
    netLines.push(`Net: ${[...youNet, ...enemyNet].join(', ')}`);
  }
  lines.push(...netLines);
  return lines;
}
