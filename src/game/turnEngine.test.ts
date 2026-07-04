import { describe, expect, test } from 'vitest';
import { Card, CardEffect } from '../data/cards';
import { makeItem } from '../data/items';
import { CombatEvent } from './combatEvents';
import { registerEffectHandler } from './effectHandlers';
import { createIntentState, IntentPattern, telegraphIntent } from './intentPatterns';
import { SequenceRng } from './test-rng';
import {
  cardCost,
  createBattle,
  endTurn,
  playCard,
  playableCards,
  TurnBattleState,
  TurnEngineConfig,
  useItem,
} from './turnEngine';

let nextUid = 1000;

function card(
  name: string,
  effects: CardEffect[],
  cost?: number,
  tier: 1 | 2 | 3 = 1,
  exhaust?: boolean,
): Card {
  return {
    id: name.toLowerCase().replace(/ /g, '_'),
    name,
    type: 'attack',
    tier,
    cost: cost ?? tier,
    color: 0,
    description: name,
    effects,
    exhaust,
    uid: nextUid++,
  };
}

const strike = () => card('Strike', [{ kind: 'damage', amount: 5 }], 1);
const guard = () => card('Guard', [{ kind: 'block', amount: 7 }], 1);
const exhaustBomb = () => card('Volatile Bomb', [{ kind: 'damage', amount: 5 }], 1, 1, true);

function attackPattern(amount = 6): IntentPattern {
  return {
    cycle: [
      { name: 'Claw', telegraph: 'raises its claws...', effects: [{ kind: 'damage', amount }] },
    ],
  };
}

function blockPattern(): IntentPattern {
  return {
    cycle: [{ name: 'Brace', telegraph: 'braces...', effects: [{ kind: 'block', amount: 4 }] }],
  };
}

function makeState(partial: Partial<TurnBattleState>, pattern = attackPattern()): TurnBattleState {
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
    player: { id: 'player', name: 'You', hp: 30, maxHp: 30, armor: 0, block: 0, statuses: [] },
    enemies: [
      { id: 'foe', name: 'Foe', hp: 20, maxHp: 20, armor: 0, block: 0, statuses: [], intent },
    ],
    playerStunned: false,
    phase: 'player',
    outcome: null,
    ...partial,
  };
}

function baseConfig(
  overrides: {
    deck?: TurnEngineConfig['deck'];
    player?: TurnEngineConfig['player'];
    enemy?: { id: string; name: string; hp: number; maxHp: number; armor: number };
    pattern?: IntentPattern;
  } = {},
): TurnEngineConfig {
  const enemy = overrides.enemy ?? { id: 'foe', name: 'Foe', hp: 20, maxHp: 20, armor: 0 };
  return {
    deck: overrides.deck ?? Array.from({ length: 10 }, () => strike()),
    player: overrides.player ?? { hp: 30, maxHp: 30, armor: 0 },
    enemies: [{ ...enemy, pattern: overrides.pattern ?? attackPattern() }],
  };
}

function types(events: CombatEvent[]): string[] {
  return events.map((event) => event.type);
}

function eventOf<T extends CombatEvent['type']>(
  events: CombatEvent[],
  type: T,
): Extract<CombatEvent, { type: T }> {
  const found = events.find((event) => event.type === type);
  if (!found) throw new Error(`expected event ${type} in [${types(events).join(', ')}]`);
  return found as Extract<CombatEvent, { type: T }>;
}

describe('cardCost', () => {
  test('explicit cost wins over the tier default', () => {
    expect(cardCost(card('Free', [{ kind: 'damage', amount: 1 }], 0, 3))).toBe(0);
    expect(cardCost(card('Tiered', [{ kind: 'damage', amount: 1 }], undefined, 2))).toBe(2);
  });
});

describe('createBattle (U1 core)', () => {
  test('draws 5 from a 10-card pile: hand 5, draw 5, discard 0, telegraph up', () => {
    const result = createBattle(baseConfig(), new SequenceRng());
    expect(result.state.hand).toHaveLength(5);
    expect(result.state.drawPile).toHaveLength(5);
    expect(result.state.discardPile).toHaveLength(0);
    expect(result.state.energy).toBe(3);
    expect(result.state.turn).toBe(1);
    expect(types(result.events)).toEqual([
      'turnStarted',
      'energyChanged',
      'cardDrawn',
      'cardDrawn',
      'cardDrawn',
      'cardDrawn',
      'cardDrawn',
      'intentTelegraphed',
    ]);
  });

  test('shuffle is deterministic under a scripted rng', () => {
    const run = () =>
      createBattle(
        baseConfig({ deck: [strike(), guard(), strike(), guard(), strike()] }),
        new SequenceRng([], [1, 0, 2, 1, 3]),
      ).state.hand.map((c) => c.name);
    // Fresh decks share names but not uids; the ORDER must be identical.
    expect(run()).toEqual(run());
  });

  test('telegraph carries the raw magnitude, unadjusted for player armor (R5)', () => {
    const result = createBattle(
      baseConfig({ pattern: attackPattern(7), player: { hp: 30, maxHp: 30, armor: 2 } }),
      new SequenceRng(),
    );
    const telegraph = eventOf(result.events, 'intentTelegraphed');
    expect(telegraph.kind).toBe('attack');
    expect(telegraph.magnitude).toBe(7);
  });

  test('AE3: a battle starts the enemy at block 0 with no opening modifier', () => {
    const result = createBattle(baseConfig(), new SequenceRng());
    expect(result.state.enemies[0].block).toBe(0);
    expect(types(result.events)).not.toContain('blockGained');
  });
});

describe('playCard (U1)', () => {
  test('a 1-cost card with 3 energy: energy 2, card in discard, ordered events', () => {
    const hit = strike();
    const state = makeState({ hand: [hit, guard()] });
    const result = playCard(state, hit.uid, new SequenceRng());
    expect(result.rejected).toBeUndefined();
    expect(result.state.energy).toBe(2);
    expect(result.state.hand).toHaveLength(1);
    expect(result.state.discardPile.map((c) => c.uid)).toEqual([hit.uid]);
    expect(types(result.events)).toEqual(['cardPlayed', 'damageResolved', 'cardDiscarded']);
    expect(eventOf(result.events, 'damageResolved').hpAfter).toBe(15);
    // Regression: a non-exhaust card never touches the exhaust pile.
    expect(result.state.exhaustPile).toHaveLength(0);
  });

  test('rejects an unaffordable card with no state change (AE1 rules side)', () => {
    const heavy = card('Heavy', [{ kind: 'damage', amount: 10 }], 2);
    const state = makeState({ hand: [heavy], energy: 1 });
    const result = playCard(state, heavy.uid, new SequenceRng());
    expect(result.rejected).toBe('insufficient_energy');
    expect(result.state).toBe(state);
    expect(result.events).toHaveLength(0);
    expect(state.hand).toHaveLength(1);
  });

  test('rejects a card that is not in hand', () => {
    const state = makeState({ hand: [strike()] });
    expect(playCard(state, 999999, new SequenceRng()).rejected).toBe('card_not_in_hand');
  });

  test('never mutates the input state', () => {
    const hit = strike();
    const state = makeState({ hand: [hit] });
    playCard(state, hit.uid, new SequenceRng());
    expect(state.hand).toHaveLength(1);
    expect(state.energy).toBe(3);
    expect(state.enemies[0].hp).toBe(20);
  });

  test('draw effect pulls cards through the reshuffle rule (hook wiring)', () => {
    const scavenge = card('Scavenge', [{ kind: 'draw', amount: 2 }], 0);
    const state = makeState({
      hand: [scavenge],
      drawPile: [strike()],
      discardPile: [guard(), guard()],
    });
    const result = playCard(state, scavenge.uid, new SequenceRng());
    expect(result.state.hand).toHaveLength(2);
    expect(types(result.events)).toContain('reshuffled');
  });

  test('energy effect grants energy above the per-turn budget', () => {
    const surge = card('Surge', [{ kind: 'energy', amount: 2 }], 1);
    const state = makeState({ hand: [surge, strike()] });
    const result = playCard(state, surge.uid, new SequenceRng());
    expect(result.state.energy).toBe(4);
    expect(eventOf(result.events, 'energyChanged').energy).toBe(4);
  });

  test('unregistered effect kind still throws (registry contract)', () => {
    const bogus = card('Bogus', [{ kind: 'damage', amount: 1 }], 1);
    bogus.effects = [{ kind: 'warp', amount: 1 } as unknown as CardEffect];
    const state = makeState({ hand: [bogus] });
    expect(() => playCard(state, bogus.uid, new SequenceRng())).toThrow(/no effect handler/);
  });
});

describe('exhaust (U1 / KTD1)', () => {
  test('AE1: playing an exhaust card routes it to the exhaust pile, not the discard pile', () => {
    const bomb = exhaustBomb();
    const state = makeState({ hand: [bomb, guard()] });
    const result = playCard(state, bomb.uid, new SequenceRng());
    expect(result.rejected).toBeUndefined();
    expect(result.state.exhaustPile.map((c) => c.uid)).toEqual([bomb.uid]);
    expect(result.state.discardPile).toHaveLength(0);
    expect(result.state.drawPile.some((c) => c.uid === bomb.uid)).toBe(false);
    expect(types(result.events)).toEqual(['cardPlayed', 'damageResolved', 'cardExhausted']);
    expect(types(result.events)).not.toContain('cardDiscarded');
    expect(eventOf(result.events, 'cardExhausted').exhaustCount).toBe(1);
  });

  test('AE1: a fresh createBattle from the same collection includes a previously exhausted card', () => {
    const bomb = exhaustBomb();
    const collection = [bomb, strike(), strike(), strike(), strike(), strike()];

    // Simulate the tail of a prior battle where the bomb was exhausted: it sits in that
    // battle's exhaustPile and never touches the Draw or Discard Piles for the rest of it.
    const priorBattleState = makeState({ hand: [bomb], exhaustPile: [] });
    const afterPlay = playCard(priorBattleState, bomb.uid, new SequenceRng());
    expect(afterPlay.state.exhaustPile.map((c) => c.uid)).toEqual([bomb.uid]);
    expect(afterPlay.state.discardPile).toHaveLength(0);

    // exhaustPile lives only on that battle's TurnBattleState — the source collection
    // (config.deck) is untouched, so a brand-new createBattle from it reshuffles the bomb
    // straight back into the Draw Pile / hand.
    const battle2 = createBattle(baseConfig({ deck: collection }), new SequenceRng());
    const allCards = [...battle2.state.drawPile, ...battle2.state.hand];
    expect(allCards.some((c) => c.uid === bomb.uid)).toBe(true);
  });

  test('AE2: with draw and discard piles empty, a draw effect draws nothing even with cards sitting in the exhaust pile', () => {
    const scavenge = card('Scavenge', [{ kind: 'draw', amount: 2 }], 0);
    const state = makeState({
      hand: [scavenge],
      drawPile: [],
      discardPile: [],
      exhaustPile: [strike(), strike()],
    });
    const result = playCard(state, scavenge.uid, new SequenceRng());
    // scavenge itself was played and discarded, leaving an empty hand; the draw
    // effect then finds both piles empty and draws nothing further.
    expect(result.state.hand).toHaveLength(0);
    expect(types(result.events)).not.toContain('cardDrawn');
    expect(types(result.events)).not.toContain('reshuffled');
    expect(result.state.exhaustPile).toHaveLength(2);
  });

  test('an unplayed exhaust card in hand is discarded normally at end of turn (exhaust fires only on play)', () => {
    const bomb = exhaustBomb();
    const state = makeState(
      { hand: [bomb], drawPile: Array.from({ length: 5 }, strike) },
      blockPattern(),
    );
    const result = endTurn(state, new SequenceRng());
    expect(result.state.discardPile.map((c) => c.uid)).toContain(bomb.uid);
    expect(result.state.exhaustPile).toHaveLength(0);
    expect(types(result.events)).not.toContain('cardExhausted');
  });

  test('playing an exhaust card does not mutate the input state', () => {
    const bomb = exhaustBomb();
    const state = makeState({ hand: [bomb] });
    playCard(state, bomb.uid, new SequenceRng());
    expect(state.hand).toHaveLength(1);
    expect(state.exhaustPile).toHaveLength(0);
    expect(state.discardPile).toHaveLength(0);
  });
});

describe('draw and reshuffle (R23)', () => {
  test('AE3: draw 5 with draw pile 2 and discard 4 reshuffles mid-draw', () => {
    const state = makeState(
      {
        drawPile: [strike(), strike()],
        discardPile: [guard(), guard(), guard(), guard()],
      },
      blockPattern(),
    );
    const result = endTurn(state, new SequenceRng());
    const drawn = result.events.filter((event) => event.type === 'cardDrawn');
    expect(drawn).toHaveLength(5);
    const order = types(result.events);
    expect(order.indexOf('reshuffled')).toBeGreaterThan(order.indexOf('cardDrawn'));
    expect(result.state.hand).toHaveLength(5);
    expect(result.state.drawPile).toHaveLength(1);
    expect(result.state.discardPile).toHaveLength(0);
    // Counts stay truthful throughout the sequence (R4).
    const last = drawn[drawn.length - 1] as Extract<CombatEvent, { type: 'cardDrawn' }>;
    expect(last.handCount).toBe(5);
    expect(last.drawCount).toBe(1);
    expect(last.discardCount).toBe(0);
  });

  test('AE7: a 2-card collection draws 2, no reshuffle, no loop', () => {
    const state = makeState({ drawPile: [strike(), guard()] }, blockPattern());
    const result = endTurn(state, new SequenceRng());
    expect(result.state.hand).toHaveLength(2);
    expect(result.state.drawPile).toHaveLength(0);
    expect(result.state.discardPile).toHaveLength(0);
    expect(types(result.events)).not.toContain('reshuffled');
  });
});

describe('end turn and energy reset (U1)', () => {
  test('discards the remaining hand and resets energy next turn', () => {
    const state = makeState(
      { hand: [strike(), guard()], energy: 1, drawPile: Array.from({ length: 5 }, strike) },
      blockPattern(),
    );
    const result = endTurn(state, new SequenceRng());
    expect(eventOf(result.events, 'handDiscarded').count).toBe(2);
    expect(result.state.energy).toBe(3);
    expect(result.state.turn).toBe(2);
    expect(result.state.hand).toHaveLength(5);
    expect(result.state.discardPile).toHaveLength(2);
  });

  test('AE6: an all-unaffordable hand announces the no-plays state', () => {
    const pricey = () => card('Pricey', [{ kind: 'damage', amount: 9 }], 3);
    const state = makeState(
      { hand: [], drawPile: [pricey(), pricey()], energyPerTurn: 2, energy: 2 },
      blockPattern(),
    );
    const result = endTurn(state, new SequenceRng());
    expect(playableCards(result.state)).toHaveLength(0);
    expect(eventOf(result.events, 'noPlayableCards').reason).toBe('unaffordable');
  });
});

describe('block, armor, and expiry (R19)', () => {
  test('block absorbs before HP and depletes across hits within one beat', () => {
    const doubleHit: IntentPattern = {
      cycle: [
        {
          name: 'Flurry',
          telegraph: 'winds up a flurry...',
          effects: [
            { kind: 'damage', amount: 4 },
            { kind: 'damage', amount: 4 },
          ],
        },
      ],
    };
    const state = makeState({ player: { ...makeState({}).player, block: 5 } }, doubleHit);
    const result = endTurn(state, new SequenceRng());
    const hits = result.events.filter(
      (event): event is Extract<CombatEvent, { type: 'damageResolved' }> =>
        event.type === 'damageResolved',
    );
    expect(hits[0].blockAbsorbed).toBe(4);
    expect(hits[0].amount).toBe(0);
    expect(hits[1].blockAbsorbed).toBe(1);
    expect(hits[1].amount).toBe(3);
    expect(result.state.player.hp).toBe(27);
  });

  test('armor applies after block; overkill computes through both', () => {
    const state = makeState(
      { player: { ...makeState({}).player, block: 3, armor: 2 } },
      attackPattern(10),
    );
    const result = endTurn(state, new SequenceRng());
    const hit = eventOf(result.events, 'damageResolved');
    expect(hit.blockAbsorbed).toBe(3);
    expect(hit.amount).toBe(5); // 10 - 3 block - 2 armor
    expect(result.state.player.hp).toBe(25);
  });

  test("player block expires at the player's next turn start, not before", () => {
    const played = guard();
    const state = makeState({ hand: [played] }, attackPattern(4));
    const afterGuard = playCard(state, played.uid, new SequenceRng());
    expect(afterGuard.state.player.block).toBe(7);
    const nextTurn = endTurn(afterGuard.state, new SequenceRng());
    // Beat: 4 damage fully absorbed (block 7 -> 3), then expiry at own turn start.
    expect(eventOf(nextTurn.events, 'damageResolved').amount).toBe(0);
    expect(eventOf(nextTurn.events, 'blockExpired').amount).toBe(3);
    expect(nextTurn.state.player.block).toBe(0);
    expect(nextTurn.state.player.hp).toBe(30);
  });

  test("enemy block expires at the enemy's own beat start", () => {
    const state = makeState({}, blockPattern());
    const first = endTurn(state, new SequenceRng());
    expect(first.state.enemies[0].block).toBe(4);
    const second = endTurn(first.state, new SequenceRng());
    expect(eventOf(second.events, 'blockExpired').targetId).toBe('foe');
    expect(second.state.enemies[0].block).toBe(4); // expired, then re-braced
  });
});

describe('status ticks (R20)', () => {
  test('poison ticks at the afflicted turn start and expires when spent', () => {
    const state = makeState({}, blockPattern());
    state.enemies[0].statuses = [{ type: 'poison', amount: 2, remainingTurns: 2 }];
    const result = endTurn(state, new SequenceRng());
    const tick = eventOf(result.events, 'statusTicked');
    expect(tick.targetId).toBe('foe');
    expect(tick.hpAfter).toBe(18);
    expect(result.state.enemies[0].statuses[0].remainingTurns).toBe(1);
    const next = endTurn(result.state, new SequenceRng());
    expect(next.state.enemies[0].hp).toBe(16);
    expect(next.state.enemies[0].statuses).toHaveLength(0);
  });

  test('a lethal tick at player turn start is final: no input window opens', () => {
    const state = makeState({}, blockPattern());
    state.player.hp = 2;
    state.player.statuses = [{ type: 'burn', amount: 3, remainingTurns: 2 }];
    const result = endTurn(state, new SequenceRng());
    expect(result.state.phase).toBe('decided');
    expect(result.state.outcome).toBe('defeat');
    const order = types(result.events);
    expect(order[order.length - 1]).toBe('battleEnded');
    // Death precedes energy reset / draw — input never opened (R20).
    expect(order).not.toContain('energyChanged');
    expect(order).not.toContain('cardDrawn');
  });
});

describe('stun (R21)', () => {
  test('AE8: stunning the enemy voids the telegraph and the beat fizzles', () => {
    const stunCard = card(
      'Stunning Blow',
      [
        { kind: 'damage', amount: 6 },
        { kind: 'status', status: 'stun', amount: 1, duration: 1 },
      ],
      2,
    );
    const state = makeState({ hand: [stunCard] }, attackPattern(9));
    const played = playCard(state, stunCard.uid, new SequenceRng());
    expect(types(played.events)).toContain('intentVoided');
    expect(played.state.enemies[0].intent.voided).toBe('stun');
    expect(played.state.enemies[0].statuses).toHaveLength(0);
    const beat = endTurn(played.state, new SequenceRng());
    expect(types(beat.events)).toContain('enemyBeatFizzled');
    expect(types(beat.events)).not.toContain('enemyBeatStarted');
    expect(beat.state.player.hp).toBe(30);
  });

  test('a stunned player skips card plays but keeps free actions', () => {
    const stunning: IntentPattern = {
      cycle: [
        {
          name: 'Gaze',
          telegraph: 'meets your eyes...',
          effects: [{ kind: 'status', status: 'stun', amount: 1, duration: 1 }],
        },
        { name: 'Brace', telegraph: 'braces...', effects: [{ kind: 'block', amount: 2 }] },
      ],
    };
    const state = makeState({ drawPile: [strike(), strike()] }, stunning);
    const next = endTurn(state, new SequenceRng());
    expect(next.state.playerStunned).toBe(true);
    expect(types(next.events)).toContain('stunned');
    expect(eventOf(next.events, 'noPlayableCards').reason).toBe('stunned');
    expect(playableCards(next.state)).toHaveLength(0);
    const uid = next.state.hand[0].uid;
    expect(playCard(next.state, uid, new SequenceRng()).rejected).toBe('player_stunned');
    const potion = useItem(next.state, makeItem('small_potion'), new SequenceRng());
    expect(potion.rejected).toBeUndefined();
    // The stun is consumed: the following turn plays normally.
    const after = endTurn(next.state, new SequenceRng());
    expect(after.state.playerStunned).toBe(false);
  });
});

describe('terminal state (R18)', () => {
  test('AE5: lethal mid-turn forfeits leftovers and rejects further commands', () => {
    const hit = strike();
    const spare = strike();
    const state = makeState({ hand: [hit, spare, guard()], energy: 2 });
    state.enemies[0].hp = 4;
    const result = playCard(state, hit.uid, new SequenceRng());
    expect(result.state.phase).toBe('decided');
    expect(result.state.outcome).toBe('victory');
    const order = types(result.events);
    expect(order[order.length - 1]).toBe('battleEnded');
    expect(order.indexOf('cardDiscarded')).toBeLessThan(order.indexOf('battleEnded'));
    expect(playCard(result.state, spare.uid, new SequenceRng()).rejected).toBe('battle_decided');
    expect(endTurn(result.state, new SequenceRng()).rejected).toBe('battle_decided');
    expect(useItem(result.state, makeItem('bomb'), new SequenceRng()).rejected).toBe(
      'battle_decided',
    );
  });

  test('remaining card effects stop once lethal is reached', () => {
    const combo = card(
      'Combo',
      [
        { kind: 'damage', amount: 10 },
        { kind: 'block', amount: 5 },
      ],
      1,
    );
    const state = makeState({ hand: [combo] });
    state.enemies[0].hp = 3;
    const result = playCard(state, combo.uid, new SequenceRng());
    expect(result.state.outcome).toBe('victory');
    expect(types(result.events)).not.toContain('blockGained');
    expect(result.state.player.block).toBe(0);
  });

  test('the enemy beat can end the battle in defeat', () => {
    const state = makeState({}, attackPattern(50));
    const result = endTurn(state, new SequenceRng());
    expect(result.state.outcome).toBe('defeat');
    expect(types(result.events)[types(result.events).length - 1]).toBe('battleEnded');
    expect(types(result.events)).not.toContain('turnStarted');
  });
});

describe('items are free actions (R16)', () => {
  test('a potion heals without touching energy or the hand', () => {
    const state = makeState({ hand: [strike()], energy: 2 });
    state.player.hp = 20;
    const result = useItem(state, makeItem('small_potion'), new SequenceRng());
    expect(result.state.player.hp).toBe(28);
    expect(result.state.energy).toBe(2);
    expect(result.state.hand).toHaveLength(1);
    expect(eventOf(result.events, 'itemUsed').itemName).toBe('Small Potion');
  });

  test('iron armor feeds the R19 block pool', () => {
    const state = makeState({});
    const result = useItem(state, makeItem('iron_armor'), new SequenceRng());
    expect(result.state.player.block).toBe(5);
  });

  test('a smoke bomb voids the telegraph and the beat fizzles', () => {
    const state = makeState({}, attackPattern(9));
    const bombed = useItem(state, makeItem('smoke_bomb'), new SequenceRng());
    expect(bombed.state.enemies[0].intent.voided).toBe('smoke_bomb');
    const beat = endTurn(bombed.state, new SequenceRng());
    expect(eventOf(beat.events, 'enemyBeatFizzled').reason).toBe('smoke_bomb');
    expect(beat.state.player.hp).toBe(30);
  });

  test('a bomb can reach lethal and decide the battle', () => {
    const state = makeState({});
    state.enemies[0].hp = 10;
    const result = useItem(state, makeItem('bomb'), new SequenceRng());
    expect(result.state.outcome).toBe('victory');
  });
});

describe('full-deck cycling (R1/R3)', () => {
  test('played and discarded cards return through a reshuffle, never vanish', () => {
    const deck = Array.from({ length: 7 }, () => strike());
    let state = createBattle(
      baseConfig({
        deck,
        pattern: blockPattern(),
        enemy: { id: 'foe', name: 'Foe', hp: 999, maxHp: 999, armor: 0 },
      }),
      new SequenceRng(),
    ).state;
    const total = () => state.drawPile.length + state.hand.length + state.discardPile.length;
    expect(total()).toBe(7);
    for (let i = 0; i < 4; i++) {
      state = endTurn(state, new SequenceRng()).state;
      expect(total()).toBe(7);
      expect(state.hand.length).toBe(5);
    }
  });

  test('shuffleCurse (U5 hexer plumbing) inserts a card into the Draw Pile via the engine hook', () => {
    const hex = card('Curse Weaving', [{ kind: 'shuffleCurse', amount: 1 } as CardEffect], 1);
    const state = makeState({
      hand: [hex],
      drawPile: [strike(), strike(), strike()],
    });
    const before = state.drawPile.length;
    const result = playCard(state, hex.uid, new SequenceRng([], [1]));
    expect(result.state.drawPile).toHaveLength(before + 1);
    expect(result.state.drawPile.some((c) => c.name === 'Festering Curse')).toBe(true);
    expect(result.log.some((line) => line.includes('curse slip into their deck'))).toBe(true);
  });

  test('effect handlers see the turn model through custom registrations', () => {
    const dispose = registerEffectHandler('lifesteal_test', (effect, ctx) => {
      const amount = effect.amount ?? 0;
      ctx.target.hp = Math.max(0, ctx.target.hp - amount);
      ctx.actor.hp = Math.min(ctx.actor.maxHp, ctx.actor.hp + amount);
    });
    try {
      const vamp = card(
        'Vamp',
        [{ kind: 'lifesteal_test', amount: 4 } as unknown as CardEffect],
        1,
      );
      const state = makeState({ hand: [vamp] });
      state.player.hp = 20;
      const result = playCard(state, vamp.uid, new SequenceRng());
      expect(result.state.enemies[0].hp).toBe(16);
      expect(result.state.player.hp).toBe(24);
    } finally {
      dispose();
    }
  });
});
