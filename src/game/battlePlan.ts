import { orderedBattleActions } from './battleLog';
import { CombatAction, combatActionEffects, combatActionLabel, combatActionSpeed } from './combat';
import { ActiveStatusEffect } from './combat';
import { EnemyIntentSummary } from './enemyIntent';
import {
  counterTextForFamily,
  familyForEffects,
  type MatchupOutcome,
  matchupResult,
  roleLabel,
  roleForFamily,
} from './familyMatchup';

export type BattlePlanPhase = 'planning' | 'resolved';
export type BattleStatusLaneKind = ActiveStatusEffect['type'] | 'armor' | 'block';

export interface BattlePlanCombatantInput {
  label: string;
  armor: number;
  statuses: readonly ActiveStatusEffect[];
  plannedAction?: CombatAction;
}

export interface BattleStatusLaneEntry {
  kind: BattleStatusLaneKind;
  text: string;
}

export interface BattleStatusLane {
  owner: 'player' | 'enemy';
  label: string;
  entries: BattleStatusLaneEntry[];
}

export interface BattleSpeedTimelineEntry {
  actor: 'player' | 'enemy';
  label: string;
  actionLabel: string;
  speed: number;
  rank: number;
}

export interface BattleMatchupHint {
  counterLine: string;
  previewLine: string | null;
  outcome: MatchupOutcome;
}

export interface BattlePlanState {
  phase: BattlePlanPhase;
  predictionLine: string;
  choiceLine: string | null;
  matchupHint: BattleMatchupHint;
  speedTimeline: BattleSpeedTimelineEntry[];
  statusLanes: BattleStatusLane[];
  resolution: {
    predicted: string;
    chosen: string | null;
    actual: string[];
  };
}

export interface BuildBattlePlanStateInput {
  phase?: BattlePlanPhase;
  enemyName: string;
  enemyIntent: EnemyIntentSummary;
  enemyAction: CombatAction;
  playerAction?: CombatAction;
  player: BattlePlanCombatantInput;
  enemy: BattlePlanCombatantInput;
  resolvedLog?: readonly string[];
}

export interface BuildStatusLanesInput {
  player: BattlePlanCombatantInput;
  enemy: BattlePlanCombatantInput;
}

function formatRoundCount(turns: number): string {
  return `${turns} round${turns === 1 ? '' : 's'}`;
}

function statusEntry(status: ActiveStatusEffect): BattleStatusLaneEntry {
  if (status.type === 'stun') {
    return {
      kind: 'stun',
      text:
        status.remainingTurns <= 1
          ? 'Stun skips the next action, then expires'
          : `Stun skips the next action (${formatRoundCount(status.remainingTurns)} left)`,
    };
  }

  const label = status.type === 'poison' ? 'Poison' : 'Burn';
  return {
    kind: status.type,
    text:
      status.remainingTurns <= 1
        ? `${label} ticks for ${status.amount} damage at round start, then expires`
        : `${label} ticks for ${status.amount} damage at round start (${formatRoundCount(
            status.remainingTurns,
          )} left)`,
  };
}

function plannedBlock(action: CombatAction | undefined): number {
  if (!action) return 0;
  return combatActionEffects(action)
    .filter((effect) => effect.kind === 'block')
    .reduce((sum, effect) => sum + effect.amount, 0);
}

function laneFor(owner: 'player' | 'enemy', input: BattlePlanCombatantInput): BattleStatusLane {
  const entries = input.statuses.map(statusEntry);
  if (input.armor > 0) {
    entries.push({ kind: 'armor', text: `Armor reduces each hit by ${input.armor}` });
  }

  const block = plannedBlock(input.plannedAction);
  if (block > 0) {
    entries.push({ kind: 'block', text: `Block can reduce damage this round by ${block}` });
  }

  return { owner, label: input.label, entries };
}

export function buildStatusLanes(input: BuildStatusLanesInput): BattleStatusLane[] {
  return [laneFor('player', input.player), laneFor('enemy', input.enemy)];
}

function predictionLine(enemyName: string, intent: EnemyIntentSummary): string {
  return `${enemyName}: ${intent.title} [spd ${intent.speed}] - ${intent.consequence}`;
}

function choiceLine(action: CombatAction | undefined): string | null {
  if (!action) return null;
  return `You choose ${combatActionLabel(action)} [spd ${combatActionSpeed(action)}]`;
}

function previewLine(action: CombatAction, outcome: MatchupOutcome): string {
  const label = combatActionLabel(action);
  if (outcome === 'win') return `${label}: wins the matchup`;
  if (outcome === 'lose') return `${label}: loses the matchup`;
  if (outcome === 'tie') return `${label}: ties the matchup`;
  return `${label}: neutral matchup`;
}

function buildMatchupHint(
  enemyIntent: EnemyIntentSummary,
  playerAction: CombatAction | undefined,
): BattleMatchupHint {
  const enemyRole = roleForFamily(enemyIntent.family);
  const counterLine = enemyRole
    ? counterTextForFamily(enemyIntent.family)
    : `${enemyIntent.title}: no matchup bonus`;

  if (!playerAction) return { counterLine, previewLine: null, outcome: 'neutral' };

  const playerFamily = familyForEffects(combatActionEffects(playerAction));
  const result = matchupResult(playerFamily, enemyIntent.family);
  const playerRole = result.playerRole ? roleLabel(result.playerRole) : 'Neutral';
  return {
    counterLine,
    previewLine: `${previewLine(playerAction, result.outcome)} (${playerRole})`,
    outcome: result.outcome,
  };
}

function speedTimeline(input: BuildBattlePlanStateInput): BattleSpeedTimelineEntry[] {
  if (!input.playerAction) {
    return [
      {
        actor: 'enemy',
        label: input.enemy.label,
        actionLabel: input.enemyIntent.title,
        speed: input.enemyIntent.speed,
        rank: 1,
      },
    ];
  }

  return orderedBattleActions(input.playerAction, input.enemyAction).map((entry, index) => ({
    actor: entry.actor,
    label: entry.actor === 'player' ? input.player.label : input.enemy.label,
    actionLabel: entry.actor === 'player' ? entry.label : input.enemyIntent.title,
    speed: entry.speed,
    rank: index + 1,
  }));
}

export function buildBattlePlanState(input: BuildBattlePlanStateInput): BattlePlanState {
  const predicted = predictionLine(input.enemyName, input.enemyIntent);
  const chosen = choiceLine(input.playerAction);

  return {
    phase: input.phase ?? 'planning',
    predictionLine: predicted,
    choiceLine: chosen,
    matchupHint: buildMatchupHint(input.enemyIntent, input.playerAction),
    speedTimeline: speedTimeline(input),
    statusLanes: buildStatusLanes({
      player: { ...input.player, plannedAction: input.playerAction ?? input.player.plannedAction },
      enemy: { ...input.enemy, plannedAction: input.enemyAction },
    }),
    resolution: {
      predicted,
      chosen,
      actual: [...(input.resolvedLog ?? [])],
    },
  };
}
