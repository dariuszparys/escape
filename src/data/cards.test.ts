import { describe, expect, test } from 'vitest';
import { CARD_DEFS, Card, CardDef, makeCard, randomCard, randomCardOfTier } from './cards';
import { SequenceRng } from '../game/test-rng';
import { createIntentState, IntentPattern, telegraphIntent } from '../game/intentPatterns';
import { playCard, TurnBattleState } from '../game/turnEngine';

describe('randomCard deep-stratum tier weights', () => {
  // pickWeighted consumes one frac to choose the tier, then rng.pick consumes a
  // second frac to choose within the tier pool. A frac of 0 on the second pick
  // deterministically selects the first card of the chosen tier.

  test('tier odds keep shifting toward tier 3 past depth 9 instead of freezing', () => {
    // r = 0.35 * 10 = 3.5. In stratum 2 weights [0,4,6] that lands in tier 2;
    // in stratum 3 weights [0,3,7] the same roll lands in tier 3.
    const stratum2 = randomCard(new SequenceRng([0.35, 0]), 15).tier;
    const stratum3 = randomCard(new SequenceRng([0.35, 0]), 25).tier;

    expect(stratum2).toBe(2);
    expect(stratum3).toBe(3);
  });

  test('depth 10 keeps the depth-9 baseline ([0,5,5]) so the base run is unchanged', () => {
    // r = 0.45 * 10 = 4.5 → tier 2 boundary at 5, so tier 2 for [0,5,5].
    expect(randomCard(new SequenceRng([0.45, 0]), 10).tier).toBe(2);
    // r = 0.55 * 10 = 5.5 → past the tier-2 boundary, so tier 3.
    expect(randomCard(new SequenceRng([0.55, 0]), 10).tier).toBe(3);
  });

  test('deep tiers never produce tier-1 cards', () => {
    for (const depth of [12, 22, 42, 99]) {
      for (const roll of [0, 0.1, 0.5, 0.9, 0.99]) {
        expect(randomCard(new SequenceRng([roll, 0]), depth).tier).not.toBe(1);
      }
    }
  });

  test('tier selection is deterministic for a fixed seed and depth', () => {
    const a = randomCard(new SequenceRng([0.42, 0.3]), 33);
    const b = randomCard(new SequenceRng([0.42, 0.3]), 33);
    expect(a.tier).toBe(b.tier);
    expect(a.id).toBe(b.id);
  });
});

describe('card costs (U8, R2/R6)', () => {
  test('every def carries an explicit cost within the legal range', () => {
    for (const def of CARD_DEFS) {
      expect(def.cost, `${def.id} must have an authored cost`).toBeDefined();
      expect(def.cost).toBeGreaterThanOrEqual(0);
      expect(def.cost).toBeLessThanOrEqual(3);
    }
  });

  test('higher tiers never cost less than a zero-cost trick would suggest', () => {
    // Structural sanity, not tuning: tier 1 stays 0-1, tiers 2-3 stay 1-2.
    for (const def of CARD_DEFS) {
      if (def.tier === 1) expect(def.cost).toBeLessThanOrEqual(1);
      else expect(def.cost).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('CARD_DEFS ids are unique (U3)', () => {
  test('no duplicate ids across the whole array, old or new', () => {
    const ids = CARD_DEFS.map((def) => def.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('U3 new cards (draw, exhaust, energy, tempo)', () => {
  const NEW_CARD_IDS = [
    'scavenge',
    'battle_focus',
    'ransack',
    'overcharge',
    'rally_strike',
    'riving_cut',
    'last_stand',
    'second_wind',
  ];
  const newDefs: CardDef[] = CARD_DEFS.filter((def) => NEW_CARD_IDS.includes(def.id));

  test('all expected new defs are present, exactly once each', () => {
    expect(newDefs.map((def) => def.id).sort()).toEqual([...NEW_CARD_IDS].sort());
  });

  function findDef(id: string): CardDef {
    const def = CARD_DEFS.find((candidate) => candidate.id === id);
    if (!def) throw new Error(`missing card def: ${id}`);
    return def;
  }

  /**
   * Builds a real TurnBattleState by hand (mirroring turnEngine.test.ts's own helper)
   * so `playCard` — the real engine command, not a mock — is what resolves each new
   * card's effects.
   */
  function battleStateFor(card: Card, overrides: Partial<TurnBattleState> = {}): TurnBattleState {
    const waitPattern: IntentPattern = {
      cycle: [{ name: 'Wait', telegraph: 'waits...', effects: [{ kind: 'block', amount: 0 }] }],
    };
    let intent = createIntentState(waitPattern);
    intent = telegraphIntent(intent, 1);
    return {
      turn: 1,
      energy: 3,
      energyPerTurn: 3,
      drawSize: 5,
      drawPile: [],
      hand: [card],
      discardPile: [],
      exhaustPile: [],
      player: { id: 'player', name: 'You', hp: 30, maxHp: 30, armor: 0, block: 0, statuses: [] },
      enemy: { id: 'foe', name: 'Foe', hp: 30, maxHp: 30, armor: 0, block: 0, statuses: [] },
      intent,
      playerStunned: false,
      phase: 'player',
      outcome: null,
      ...overrides,
    };
  }

  test.each(newDefs)('$id resolves through the real engine without throwing', (def) => {
    const card = makeCard(def);
    const state = battleStateFor(card);
    expect(() => playCard(state, card.uid, new SequenceRng([0], [0]))).not.toThrow();
  });

  test('a new draw card draws its stated count, reshuffling the discard pile first when the draw pile is empty (R23 regression)', () => {
    const ransack = makeCard(findDef('ransack'));
    const filler = [makeCard(findDef('strike')), makeCard(findDef('slash'))];
    const state = battleStateFor(ransack, { drawPile: [], discardPile: filler });

    const result = playCard(state, ransack.uid, new SequenceRng([], [0]));

    expect(result.events.some((event) => event.type === 'reshuffled')).toBe(true);
    expect(result.events.filter((event) => event.type === 'cardDrawn')).toHaveLength(2);
    expect(result.state.hand).toHaveLength(2);
    expect(result.state.drawPile).toHaveLength(0);
    expect(result.state.discardPile).toHaveLength(0);
  });

  test('exhaust-flagged new cards route to the exhaust pile, not the discard pile (KTD1 integration)', () => {
    const exhaustDefs = newDefs.filter((def) => def.exhaust);
    expect(exhaustDefs.map((def) => def.id).sort()).toEqual(
      ['last_stand', 'overcharge', 'ransack'].sort(),
    );

    for (const def of exhaustDefs) {
      const card = makeCard(def);
      const state = battleStateFor(card);
      const result = playCard(state, card.uid, new SequenceRng([0], [0]));
      expect(result.state.exhaustPile.map((c) => c.uid)).toContain(card.uid);
      expect(result.state.discardPile.map((c) => c.uid)).not.toContain(card.uid);
    }
  });

  test('every new def has a non-empty description', () => {
    for (const def of newDefs) {
      expect(def.description.length).toBeGreaterThan(0);
    }
  });

  test('every new def carries a legal cost (0-3)', () => {
    for (const def of newDefs) {
      expect(def.cost).toBeGreaterThanOrEqual(0);
      expect(def.cost).toBeLessThanOrEqual(3);
    }
  });

  test('new defs surface from randomCardOfTier for their own tier (reward-pool wiring)', () => {
    for (const def of newDefs) {
      const seen = new Set<string>();
      for (let i = 0; i < 200; i++) {
        const rng = new SequenceRng([i / 200]);
        seen.add(randomCardOfTier(rng, [def.tier]).id);
      }
      expect(seen.has(def.id)).toBe(true);
    }
  });
});
