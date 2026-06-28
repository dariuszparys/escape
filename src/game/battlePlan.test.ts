import { describe, expect, test } from 'vitest';
import { makeCard } from '../data/cards';
import { buildBattlePlanState, buildStatusLanes } from './battlePlan';
import { CombatAction } from './combat';
import { EnemyIntentSummary } from './enemyIntent';

const quick = makeCard({
  id: 'quick_jab',
  name: 'Quick Jab',
  type: 'attack',
  tier: 1,
  speed: 8,
  color: 0,
  description: 'Deal 4 damage first',
  effects: [{ kind: 'damage', amount: 4 }],
});

const guard = makeCard({
  id: 'guard',
  name: 'Guard',
  type: 'block',
  tier: 1,
  speed: 6,
  color: 0,
  description: 'Gain 7 block',
  effects: [{ kind: 'block', amount: 7 }],
});

const heavy = makeCard({
  id: 'heavy_strike',
  name: 'Heavy Strike',
  type: 'attack',
  tier: 2,
  speed: 1,
  color: 0,
  description: 'Deal 10 damage, slower',
  effects: [{ kind: 'damage', amount: 10 }],
});

const enemyIntent: EnemyIntentSummary = {
  family: 'attack',
  title: 'Attack intent',
  speed: 1,
  consequence: 'Deals 10 damage',
  revealMode: 'summary',
};

function enemyAction(card = heavy): CombatAction {
  return { actor: 'enemy', kind: 'card', card };
}

describe('battle planning state', () => {
  test('orders selected player action against committed enemy intent by speed', () => {
    const state = buildBattlePlanState({
      enemyName: 'Bandit',
      enemyIntent,
      enemyAction: enemyAction(),
      playerAction: { actor: 'player', kind: 'card', card: quick },
      player: { label: 'You', armor: 0, statuses: [] },
      enemy: { label: 'Bandit', armor: 0, statuses: [] },
    });

    expect(state.speedTimeline).toEqual([
      { actor: 'player', label: 'You', actionLabel: 'Quick Jab', speed: 8, rank: 1 },
      { actor: 'enemy', label: 'Bandit', actionLabel: 'Attack intent', speed: 1, rank: 2 },
    ]);
    expect(state.predictionLine).toBe('Bandit: Attack intent [spd 1] - Deals 10 damage');
    expect(state.choiceLine).toBe('You choose Quick Jab [spd 8]');
  });

  test('summarizes enemy stun and burn as future-facing lane consequences', () => {
    const lanes = buildStatusLanes({
      player: { label: 'You', armor: 0, statuses: [] },
      enemy: {
        label: 'Bandit',
        armor: 0,
        statuses: [
          { type: 'stun', amount: 1, remainingTurns: 1 },
          { type: 'burn', amount: 2, remainingTurns: 2 },
        ],
      },
    });

    expect(lanes.find((lane) => lane.owner === 'enemy')?.entries).toEqual([
      { kind: 'stun', text: 'Stun skips the next action, then expires' },
      { kind: 'burn', text: 'Burn ticks for 2 damage at round start (2 rounds left)' },
    ]);
  });

  test('labels armor and planned block as different damage reducers', () => {
    const lanes = buildStatusLanes({
      player: {
        label: 'You',
        armor: 2,
        statuses: [],
        plannedAction: { actor: 'player', kind: 'card', card: guard },
      },
      enemy: { label: 'Bandit', armor: 0, statuses: [] },
    });

    expect(lanes.find((lane) => lane.owner === 'player')?.entries).toEqual([
      { kind: 'armor', text: 'Armor reduces each hit by 2' },
      { kind: 'block', text: 'Block can reduce damage this round by 7' },
    ]);
  });

  test('names poison and burn expiry on the next tick', () => {
    const lanes = buildStatusLanes({
      player: {
        label: 'You',
        armor: 0,
        statuses: [
          { type: 'poison', amount: 2, remainingTurns: 1 },
          { type: 'burn', amount: 3, remainingTurns: 1 },
        ],
      },
      enemy: { label: 'Bandit', armor: 0, statuses: [] },
    });

    expect(lanes.find((lane) => lane.owner === 'player')?.entries).toEqual([
      { kind: 'poison', text: 'Poison ticks for 2 damage at round start, then expires' },
      { kind: 'burn', text: 'Burn ticks for 3 damage at round start, then expires' },
    ]);
  });

  test('keeps predicted intent, chosen action, and resolved outcome distinct', () => {
    const state = buildBattlePlanState({
      phase: 'resolved',
      enemyName: 'Bandit',
      enemyIntent,
      enemyAction: enemyAction(),
      playerAction: { actor: 'player', kind: 'card', card: guard },
      player: { label: 'You', armor: 0, statuses: [] },
      enemy: { label: 'Bandit', armor: 0, statuses: [] },
      resolvedLog: ['Player uses Guard', 'Player gains 7 block', 'Bandit uses Heavy Strike'],
    });

    expect(state.resolution).toEqual({
      predicted: 'Bandit: Attack intent [spd 1] - Deals 10 damage',
      chosen: 'You choose Guard [spd 6]',
      actual: ['Player uses Guard', 'Player gains 7 block', 'Bandit uses Heavy Strike'],
    });
  });
});
