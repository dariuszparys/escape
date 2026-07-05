import { afterEach, describe, expect, test } from 'vitest';
import { makeCard } from '../data/cards';
import { createIntentState, telegraphIntent } from './intentPatterns';
import { SequenceRng } from './test-rng';
import { playCard, TurnBattleState } from './turnEngine';
import {
  type CombatEventType,
  emitBattleWon,
  emitCombatEvent,
  hasCombatEventSubscribers,
  subscribeCombatEvent,
} from './combatEvents';

const disposers: Array<() => void> = [];
function track(dispose: () => void): void {
  disposers.push(dispose);
}
afterEach(() => {
  while (disposers.length) disposers.pop()?.();
});

function playVenomStrike(): void {
  const venomStrike = makeCard({
    id: 'venom-strike',
    name: 'Venom Strike',
    type: 'status',
    tier: 1,
    cost: 1,
    color: 0,
    description: 'Deal 3, poison',
    effects: [
      { kind: 'damage', amount: 3 },
      { kind: 'status', status: 'poison', amount: 2, duration: 3 },
    ],
  });
  let intent = createIntentState({
    cycle: [{ name: 'Claw', telegraph: '...', effects: [{ kind: 'damage', amount: 3 }] }],
  });
  intent = telegraphIntent(intent, 1);
  const state: TurnBattleState = {
    turn: 1,
    energy: 3,
    energyPerTurn: 3,
    drawSize: 5,
    drawPile: [],
    hand: [venomStrike],
    discardPile: [],
    exhaustPile: [],
    player: { id: 'player', name: 'Player', hp: 20, maxHp: 20, armor: 0, block: 0, statuses: [] },
    enemies: [
      { id: 'enemy', name: 'Enemy', hp: 20, maxHp: 20, armor: 0, block: 0, statuses: [], intent },
    ],
    playerStunned: false,
    phase: 'player',
    outcome: null,
    startingEnergyBonus: 0,
    retainBlockCap: 0,
    poisonBonus: 0,
    enemyKillDraw: 0,
  };
  playCard(state, venomStrike.uid, new SequenceRng());
}

describe('combat event bus', () => {
  test('handler-level events fire from engine resolution in causal order', () => {
    const seen: CombatEventType[] = [];
    track(subscribeCombatEvent('damageDealt', () => seen.push('damageDealt')));
    track(subscribeCombatEvent('statusApplied', () => seen.push('statusApplied')));

    playVenomStrike();

    expect(seen).toEqual(['damageDealt', 'statusApplied']);
  });

  test('damageDealt and statusApplied carry the resolved payload', () => {
    let damage: { sourceId: string; targetId: string; amount: number } | null = null;
    let status: {
      targetId: string;
      status: string;
      amount: number;
      remainingTurns: number;
    } | null = null;
    track(
      subscribeCombatEvent('damageDealt', (e) => {
        damage = { sourceId: e.sourceId, targetId: e.targetId, amount: e.amount };
      }),
    );
    track(
      subscribeCombatEvent('statusApplied', (e) => {
        status = {
          targetId: e.targetId,
          status: e.status,
          amount: e.amount,
          remainingTurns: e.remainingTurns,
        };
      }),
    );

    playVenomStrike();

    expect(damage).toEqual({ sourceId: 'player', targetId: 'enemy', amount: 3 });
    expect(status).toEqual({
      targetId: 'enemy',
      status: 'poison',
      amount: 2,
      remainingTurns: 3,
    });
  });

  test('subscribers of the same type fire in registration order', () => {
    const order: string[] = [];
    track(subscribeCombatEvent('damageDealt', () => order.push('first')));
    track(subscribeCombatEvent('damageDealt', () => order.push('second')));

    playVenomStrike();

    expect(order).toEqual(['first', 'second']);
  });

  test('with no subscribers the bus is inert (zero-behavior emit path)', () => {
    expect(hasCombatEventSubscribers('turnStarted')).toBe(false);
    expect(hasCombatEventSubscribers('damageDealt')).toBe(false);
    // Emitting into an empty bus is a no-op and never throws.
    expect(() => emitCombatEvent({ type: 'turnStarted', turn: 1 })).not.toThrow();
  });

  test('a disposed subscriber stops receiving events', () => {
    let hits = 0;
    const dispose = subscribeCombatEvent('damageDealt', () => hits++);
    playVenomStrike();
    dispose();
    playVenomStrike();
    expect(hits).toBe(1);
  });

  test('emitBattleWon is inert without a subscriber and aggregates a subscriber result', () => {
    expect(emitBattleWon(['vampiric_blade'])).toEqual({ heal: 0 });

    track(
      subscribeCombatEvent('battleWon', (e) => {
        if (e.relicIds.includes('vampiric_blade')) e.result.heal += 2;
      }),
    );
    expect(emitBattleWon(['vampiric_blade'])).toEqual({ heal: 2 });
    expect(emitBattleWon([])).toEqual({ heal: 0 });
  });
});
