import { describe, expect, test } from 'vitest';
import { Card, CARD_DEFS, CardEffect, makeCard } from '../data/cards';
import { hasStatus, modifiedBlock, modifiedDamage, STRENGTH_CAP, statusValue } from './combat';
import { CombatEvent } from './combatEvents';
import { createIntentState, IntentPattern, intentView, telegraphIntent } from './intentPatterns';
import { createBattle, endTurn, playCard, TurnBattleState } from './turnEngine';

let nextUid = 5000;
function card(name: string, effects: CardEffect[], cost = 1): Card {
  return {
    id: `${name}_${nextUid}`,
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

const minRng = { frac: () => 0, between: (min: number) => min, pick: <T>(a: readonly T[]) => a[0] };

function makeState(partial: Partial<TurnBattleState>, pattern: IntentPattern): TurnBattleState {
  let intent = createIntentState(pattern);
  intent = telegraphIntent(intent, 1);
  return {
    turn: 1,
    energy: 3,
    energyPerTurn: 3,
    drawSize: 5,
    drawPile: [],
    hand: [],
    discardPile: [],
    exhaustPile: [],
    player: { id: 'player', name: 'You', hp: 40, maxHp: 40, armor: 0, block: 0, statuses: [] },
    enemy: { id: 'foe', name: 'Foe', hp: 100, maxHp: 100, armor: 0, block: 0, statuses: [] },
    intent,
    playerStunned: false,
    phase: 'player',
    outcome: null,
    ...partial,
  };
}

const waitPattern: IntentPattern = {
  cycle: [{ name: 'Wait', telegraph: 'waits...', effects: [{ kind: 'block', amount: 0 }] }],
};

function damageResolved(events: CombatEvent[]) {
  return events.find((e) => e.type === 'damageResolved') as Extract<
    CombatEvent,
    { type: 'damageResolved' }
  >;
}

describe('modifier math (B1 pinned order)', () => {
  const withStatuses = (...types: { type: string; amount: number }[]) => ({
    statuses: types.map((t) => ({ ...t, remainingTurns: 0 })) as never,
  });

  test('order is +strength, ×weak, ×vulnerable, then a single floor', () => {
    // (10 + 3) = 13, ×0.75 = 9.75, ×1.5 = 14.625 → floor 14
    const actor = withStatuses({ type: 'strength', amount: 3 }, { type: 'weak', amount: 1 });
    const target = withStatuses({ type: 'vulnerable', amount: 1 });
    expect(modifiedDamage(10, actor, target)).toBe(14);
  });

  test('no statuses is the identity (existing behaviour preserved)', () => {
    const bare = withStatuses();
    expect(modifiedDamage(7, bare, bare)).toBe(7);
    expect(modifiedBlock(7, bare)).toBe(7);
  });

  test('frail cuts block by a quarter, floored', () => {
    expect(modifiedBlock(7, withStatuses({ type: 'frail', amount: 1 }))).toBe(5); // floor(5.25)
  });

  test('statusValue sums; hasStatus detects', () => {
    const c = withStatuses({ type: 'strength', amount: 3 });
    expect(statusValue(c, 'strength')).toBe(3);
    expect(hasStatus(c, 'strength')).toBe(true);
    expect(hasStatus(c, 'weak')).toBe(false);
  });
});

describe('strength stacking + cap (B2)', () => {
  test('strength stacks additively across plays and clamps at the cap', () => {
    const deck = [
      card('Empower', [{ kind: 'strength', amount: 5 }]),
      card('Empower', [{ kind: 'strength', amount: 5 }]),
      card('Strike', [{ kind: 'damage', amount: 4 }]),
    ];
    let { state } = createBattle(
      {
        deck,
        player: { hp: 40, maxHp: 40, armor: 0 },
        enemy: { id: 'foe', name: 'Foe', hp: 100, maxHp: 100, armor: 0 },
        pattern: waitPattern,
      },
      minRng,
    );
    for (const buff of state.hand.filter((c) => c.effects[0].kind === 'strength')) {
      state = playCard(state, buff.uid, minRng).state;
    }
    // 5 + 5 = 10, clamped to the cap.
    expect(statusValue(state.player, 'strength')).toBe(STRENGTH_CAP);
    const strike = state.hand.find((c) => c.effects[0].kind === 'damage')!;
    const res = playCard(state, strike.uid, minRng);
    // 4 base + 8 strength = 12 damage.
    expect(damageResolved(res.events).amount).toBe(12);
  });
});

describe('B1 block-depletion no longer desyncs from modified damage', () => {
  test('strength-boosted hit chips HP and depletes block by the same integer', () => {
    // base 5, enemy block 7, strength +4 → resolved 9. absorbed = min(7,9) = 7 → block 0, HP -2.
    const state = makeState(
      {
        player: {
          id: 'player',
          name: 'You',
          hp: 40,
          maxHp: 40,
          armor: 0,
          block: 0,
          statuses: [{ type: 'strength', amount: 4, remainingTurns: 0 }],
        },
        enemy: { id: 'foe', name: 'Foe', hp: 100, maxHp: 100, armor: 0, block: 7, statuses: [] },
        hand: [card('Strike', [{ kind: 'damage', amount: 5 }])],
      },
      waitPattern,
    );
    const res = playCard(state, state.hand[0].uid, minRng);
    const ev = damageResolved(res.events);
    expect(ev.amount).toBe(2);
    expect(ev.blockAbsorbed).toBe(7);
    expect(ev.blockAfter).toBe(0);
    expect(res.state.enemy.hp).toBe(98);
  });
});

describe('vulnerable / weak on the enemy (single-card, same-turn payoff)', () => {
  test('a hit into an enemy the player just made Vulnerable deals ×1.5', () => {
    const state = makeState(
      {
        hand: [
          card('Expose', [{ kind: 'status', status: 'vulnerable', amount: 1, duration: 2 }]),
          card('Strike', [{ kind: 'damage', amount: 8 }]),
        ],
      },
      waitPattern,
    );
    const expose = state.hand.find((c) => c.effects[0].kind === 'status')!;
    const s1 = playCard(state, expose.uid, minRng).state;
    const strike = s1.hand.find((c) => c.effects[0].kind === 'damage')!;
    const res = playCard(s1, strike.uid, minRng);
    expect(damageResolved(res.events).amount).toBe(12); // floor(8 × 1.5)
  });
});

describe('debuff tick timing (B4)', () => {
  test('an enemy-applied Weak lands on the player and reduces the NEXT card phase, then decays', () => {
    // Enemy cycle: turn 1 applies Weak(1) to the player, then Waits.
    const pattern: IntentPattern = {
      cycle: [
        {
          name: 'Sap',
          telegraph: 'saps your strength...',
          effects: [{ kind: 'status', status: 'weak', amount: 1, duration: 1 }],
        },
        { name: 'Wait', telegraph: 'waits...', effects: [{ kind: 'block', amount: 0 }] },
      ],
    };
    const deck = [
      card('Strike', [{ kind: 'damage', amount: 8 }]),
      card('Strike', [{ kind: 'damage', amount: 8 }]),
      card('Strike', [{ kind: 'damage', amount: 8 }]),
    ];
    let { state } = createBattle(
      {
        deck,
        player: { hp: 40, maxHp: 40, armor: 0 },
        enemy: { id: 'foe', name: 'Foe', hp: 100, maxHp: 100, armor: 0 },
        pattern,
      },
      minRng,
    );
    // Turn 1: player not yet weak, strike full (8). Then enemy applies Weak.
    let strike = state.hand.find((c) => c.effects[0].kind === 'damage')!;
    let res = playCard(state, strike.uid, minRng);
    expect(damageResolved(res.events).amount).toBe(8);
    state = endTurn(res.state, minRng).state; // enemy Saps → player now Weak; startPlayerTurn turn 2
    expect(hasStatus(state.player, 'weak')).toBe(true);
    // Turn 2: player IS weak, strike reduced to floor(8×0.75)=6.
    strike = state.hand.find((c) => c.effects[0].kind === 'damage')!;
    res = playCard(state, strike.uid, minRng);
    expect(damageResolved(res.events).amount).toBe(6);
    state = endTurn(res.state, minRng).state; // end of card phase → Weak decays to 0
    expect(hasStatus(state.player, 'weak')).toBe(false);
    // Turn 3: full strike again.
    strike = state.hand.find((c) => c.effects[0].kind === 'damage')!;
    res = playCard(state, strike.uid, minRng);
    expect(damageResolved(res.events).amount).toBe(8);
  });

  test('a duration-1 Vulnerable the player puts on the enemy fires exactly once, then is gone', () => {
    const deck = [
      card('Expose', [{ kind: 'status', status: 'vulnerable', amount: 1, duration: 1 }]),
      card('Strike', [{ kind: 'damage', amount: 8 }]),
      card('Strike', [{ kind: 'damage', amount: 8 }]),
    ];
    let { state } = createBattle(
      {
        deck,
        player: { hp: 40, maxHp: 40, armor: 0 },
        enemy: { id: 'foe', name: 'Foe', hp: 100, maxHp: 100, armor: 0 },
        pattern: waitPattern,
      },
      minRng,
    );
    const expose = state.hand.find((c) => c.effects[0].kind === 'status')!;
    state = playCard(state, expose.uid, minRng).state;
    const strike = state.hand.find((c) => c.effects[0].kind === 'damage')!;
    const boosted = playCard(state, strike.uid, minRng);
    expect(damageResolved(boosted.events).amount).toBe(12); // vulnerable applied this turn
    // The enemy beat ends the turn; Vulnerable decays at end of the enemy beat.
    state = endTurn(boosted.state, minRng).state;
    expect(hasStatus(state.enemy, 'vulnerable')).toBe(false);
    const strike2 = state.hand.find((c) => c.effects[0].kind === 'damage')!;
    const plain = playCard(state, strike2.uid, minRng);
    expect(damageResolved(plain.events).amount).toBe(8); // no longer vulnerable
  });

  test('an enemy-applied Vulnerable (duration 2) survives to boost the enemy’s NEXT hit', () => {
    // Enemy Marks the player Vulnerable(2), then Smashes next beat — the mark must persist through
    // the player's turn (duration 1 would decay before it lands; see the necromancer authoring note).
    const pattern: IntentPattern = {
      cycle: [
        {
          name: 'Mark',
          telegraph: 'marks you...',
          effects: [{ kind: 'status', status: 'vulnerable', amount: 1, duration: 2 }],
        },
        { name: 'Smash', telegraph: 'smashes...', effects: [{ kind: 'damage', amount: 8 }] },
      ],
    };
    let { state } = createBattle(
      {
        deck: [card('Wait', [{ kind: 'block', amount: 0 }])],
        player: { hp: 40, maxHp: 40, armor: 0 },
        enemy: { id: 'foe', name: 'Foe', hp: 100, maxHp: 100, armor: 0 },
        pattern,
      },
      minRng,
    );
    state = endTurn(state, minRng).state; // enemy Marks → player Vulnerable(2), decays to 1
    expect(hasStatus(state.player, 'vulnerable')).toBe(true);
    const hpBefore = state.player.hp;
    const smashed = endTurn(state, minRng);
    expect(hpBefore - smashed.state.player.hp).toBe(12); // floor(8 × 1.5), the mark landed
  });

  test('strength never ticks — it persists across turns', () => {
    const deck = [
      card('Empower', [{ kind: 'strength', amount: 3 }]),
      card('Guard', [{ kind: 'block', amount: 4 }]),
    ];
    let { state } = createBattle(
      {
        deck,
        player: { hp: 40, maxHp: 40, armor: 0 },
        enemy: { id: 'foe', name: 'Foe', hp: 100, maxHp: 100, armor: 0 },
        pattern: waitPattern,
      },
      minRng,
    );
    const buff = state.hand.find((c) => c.effects[0].kind === 'strength')!;
    state = playCard(state, buff.uid, minRng).state;
    for (let i = 0; i < 3; i++) state = endTurn(state, minRng).state;
    expect(statusValue(state.player, 'strength')).toBe(3);
  });
});

describe('exhaust scaling cards (real defs) route to exhaust, not discard', () => {
  const realCard = (id: string): Card => {
    const def = CARD_DEFS.find((c) => c.id === id);
    if (!def) throw new Error(`no card def ${id}`);
    return makeCard(def);
  };
  const build = (deck: Card[]) =>
    createBattle(
      {
        deck,
        player: { hp: 40, maxHp: 40, armor: 0 },
        enemy: { id: 'foe', name: 'Foe', hp: 100, maxHp: 100, armor: 0 },
        pattern: waitPattern,
      },
      minRng,
    ).state;

  test('War Cry grants +3 Strength to the player and exhausts (never recurs to fuel the cap)', () => {
    const state = build([realCard('war_cry'), realCard('guard')]);
    const wc = state.hand.find((c) => c.id === 'war_cry')!;
    const res = playCard(state, wc.uid, minRng);
    expect(statusValue(res.state.player, 'strength')).toBe(3);
    expect(res.state.exhaustPile.some((c) => c.id === 'war_cry')).toBe(true);
    expect(res.state.discardPile.some((c) => c.id === 'war_cry')).toBe(false);
  });

  test('Reckless Swing deals 12 and exhausts', () => {
    const state = build([realCard('reckless_swing'), realCard('guard')]);
    const rs = state.hand.find((c) => c.id === 'reckless_swing')!;
    const res = playCard(state, rs.uid, minRng);
    expect(damageResolved(res.events).amount).toBe(12);
    expect(res.state.exhaustPile.some((c) => c.id === 'reckless_swing')).toBe(true);
    expect(res.state.discardPile.some((c) => c.id === 'reckless_swing')).toBe(false);
  });
});

describe('telegraph honesty under Strength (R5)', () => {
  test('a ritual-buffed enemy telegraphs exactly what its next hit resolves', () => {
    // Enemy Rituals (+4 strength), then Smashes for a base 6 → should telegraph and deal 10.
    const pattern: IntentPattern = {
      cycle: [
        {
          name: 'Ritual',
          telegraph: 'gathers dark power...',
          effects: [{ kind: 'strength', amount: 4 }],
        },
        { name: 'Smash', telegraph: 'winds up...', effects: [{ kind: 'damage', amount: 6 }] },
      ],
    };
    let { state } = createBattle(
      {
        deck: [card('Guard', [{ kind: 'block', amount: 0 }])],
        player: { hp: 40, maxHp: 40, armor: 0 },
        enemy: { id: 'foe', name: 'Foe', hp: 100, maxHp: 100, armor: 0 },
        pattern,
      },
      minRng,
    );
    // Turn 1 resolves Ritual; turn 2 telegraphs Smash with the strength folded in.
    const t2 = endTurn(state, minRng);
    const telegraph = t2.events.find((e) => e.type === 'intentTelegraphed') as Extract<
      CombatEvent,
      { type: 'intentTelegraphed' }
    >;
    expect(telegraph.magnitude).toBe(10); // 6 base + 4 strength, honestly reported
    // Resolve the Smash: player takes exactly the telegraphed 10.
    state = t2.state;
    const hpBefore = state.player.hp;
    const t3 = endTurn(state, minRng);
    expect(hpBefore - t3.state.player.hp).toBe(10);
    // Sanity: intentView folds strength identically.
    expect(intentView(pattern.cycle[1], 4).magnitude).toBe(10);
  });
});
