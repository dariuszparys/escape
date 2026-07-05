/**
 * SPIKE (Plan 009 — docs/plans/2026-07-05-002-feat-event-relic-triggers-design.md).
 *
 * This file is NOT shipping test coverage. It is a proof-of-concept that a mid-battle
 * relic trigger can be expressed as a BATTLE-SCOPED subscriber on the existing combat
 * event bus (`combatEvents.ts`) — no bus, engine, or effect-handler code changes — and
 * that its lifecycle (fire / scope / dispose / determinism) behaves as the design's
 * candidate architecture (a) requires. It touches no shipping code: it only drives a
 * real battle through `turnEngine.ts` and registers a subscriber via the public
 * `subscribeCombatEvent` API, exactly as a real driver would.
 *
 * Disposable by design: once the design is accepted, this file should be folded into
 * `relicBehaviors.test.ts` (or deleted) per the plan's maintenance notes.
 *
 * IMPORTANT: `combatEvents.ts`'s subscriber map is module-global state. Every subscriber
 * registered in a test MUST be disposed (afterEach) or it leaks into later tests/files.
 */
import { afterEach, describe, expect, test } from 'vitest';
import type { Card, CardEffect } from '../data/cards';
import type { CombatEventOf } from './combatEvents';
import { subscribeCombatEvent } from './combatEvents';
import type { IntentPattern } from './intentPatterns';
import { SequenceRng } from './test-rng';
import { createBattle, playCard, TurnEngineConfig, TurnBattleState } from './turnEngine';

let nextUid = 1;

/** Minimal card builder mirroring `turnEngine.test.ts`'s local `card()` helper. */
function card(name: string, effects: CardEffect[], cost = 1): Card {
  return {
    id: name.toLowerCase().replace(/ /g, '_'),
    name,
    type: 'attack',
    tier: 1,
    cost,
    color: 0,
    description: name,
    effects,
    uid: nextUid++,
  };
}

const poisonDart = () =>
  card('Poison Dart', [{ kind: 'status', status: 'poison', amount: 2, duration: 3 }]);

function bracePattern(): IntentPattern {
  // A block-only intent — the enemy never damages the player, so nothing in this spike
  // depends on `endTurn`/enemy beats; every assertion is scoped to `playCard` alone.
  return {
    cycle: [{ name: 'Brace', telegraph: 'braces...', effects: [{ kind: 'block', amount: 0 }] }],
  };
}

/** A battle with a tough, harmless enemy and a hand made entirely of poison darts —
 * every draw is guaranteed playable, so the test never has to reason about shuffle order. */
function config(): TurnEngineConfig {
  return {
    deck: Array.from({ length: 10 }, () => poisonDart()),
    player: { hp: 30, maxHp: 30, armor: 0 },
    enemies: [{ id: 'foe', name: 'Foe', hp: 999, maxHp: 999, armor: 0, pattern: bracePattern() }],
  };
}

function findPoisonCard(state: TurnBattleState): Card {
  const found = state.hand.find((c) => c.effects.some((e) => e.kind === 'status'));
  if (!found) throw new Error(`no poison card in hand: ${JSON.stringify(state.hand)}`);
  return found;
}

interface StatusTallyEntry {
  status: string;
  targetId: string;
  amount: number;
}

/** Tracks every disposer created in a test so `afterEach` can guarantee cleanup even on failure. */
let activeDisposers: Array<() => void> = [];

function subscribeTallying(tally: StatusTallyEntry[]): () => void {
  const dispose = subscribeCombatEvent('statusApplied', (event: CombatEventOf<'statusApplied'>) => {
    tally.push({ status: event.status, targetId: event.targetId, amount: event.amount });
  });
  activeDisposers.push(dispose);
  return dispose;
}

afterEach(() => {
  for (const dispose of activeDisposers) dispose();
  activeDisposers = [];
});

describe('relic trigger spike: battle-scoped subscribers on the combat event bus', () => {
  test('a battle-scoped subscriber observes statusApplied from a real engine-driven battle', () => {
    const tally: StatusTallyEntry[] = [];
    subscribeTallying(tally);

    const rng = new SequenceRng();
    const created = createBattle(config(), rng);
    const played = findPoisonCard(created.state);
    playCard(created.state, played.uid, rng, 'foe');

    expect(tally).toEqual([{ status: 'poison', targetId: 'foe', amount: 2 }]);
  });

  test('disposing the subscription stops the tally from growing (battle-scoped lifecycle)', () => {
    const tally: StatusTallyEntry[] = [];
    const dispose = subscribeTallying(tally);

    const rng = new SequenceRng();
    const created = createBattle(config(), rng);
    const first = findPoisonCard(created.state);
    const afterFirst = playCard(created.state, first.uid, rng, 'foe');
    expect(tally).toHaveLength(1);

    dispose();
    // Playing again after disposal must NOT grow the tally — proves the disposer returned by
    // `subscribeCombatEvent` fully un-registers the handler with no shipping-code changes.
    const second = findPoisonCard(afterFirst.state);
    playCard(afterFirst.state, second.uid, rng, 'foe');
    expect(tally).toHaveLength(1);
  });

  test('the same seed produces an identical tally across two independent runs (determinism)', () => {
    function runOnce(): StatusTallyEntry[] {
      const tally: StatusTallyEntry[] = [];
      const dispose = subscribeTallying(tally);
      const rng = new SequenceRng();
      const created = createBattle(config(), rng);
      const played = findPoisonCard(created.state);
      playCard(created.state, played.uid, rng, 'foe');
      // Each run disposes its own subscription immediately — battle-scoped lifecycle means one
      // run's subscriber must never observe another run's events (this is what caught a real bug
      // in an earlier draft of this test: a leaked subscriber silently double-counted).
      dispose();
      return tally;
    }

    const tallyA = runOnce();
    const tallyB = runOnce();

    expect(tallyA).toEqual(tallyB);
    expect(tallyA).toEqual([{ status: 'poison', targetId: 'foe', amount: 2 }]);
  });
});
