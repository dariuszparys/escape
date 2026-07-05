import { describe, expect, test } from 'vitest';
import {
  CARD_DEFS,
  Card,
  CardDef,
  CardEffect,
  cardPoolForArchetype,
  makeCard,
  randomCard,
  randomCardOfTier,
  type ArchetypeId,
} from './cards';
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

describe('archetype card pools', () => {
  const ARCHETYPES: ArchetypeId[] = ['barbarian', 'necromancer', 'ranger'];

  test('the neutral pool (null) excludes every archetype-tagged card', () => {
    const pool = cardPoolForArchetype(null);
    expect(pool.every((card) => !card.archetype)).toBe(true);
    expect(pool.map((card) => card.id)).toEqual(
      expect.arrayContaining(['riposte', 'field_dressing', 'cinder_hex']),
    );
  });

  test('an archetype pool adds ONLY that archetype’s cards to the neutral pool', () => {
    for (const archetype of ARCHETYPES) {
      const pool = cardPoolForArchetype(archetype);
      const own = CARD_DEFS.filter((card) => card.archetype === archetype);
      expect(own.length).toBeGreaterThan(0);
      // Every one of this archetype's cards is present...
      for (const card of own) expect(pool).toContain(card);
      // ...and no OTHER archetype's cards leak in.
      expect(pool.some((card) => card.archetype && card.archetype !== archetype)).toBe(false);
    }
  });

  test('random draws stay neutral without an archetype and can surface archetype cards with one', () => {
    const archetypeIds = new Set(
      CARD_DEFS.filter((card) => card.archetype === 'barbarian').map((card) => card.id),
    );
    // Neutral draws never surface an archetype card, at any depth.
    for (let seed = 0; seed < 200; seed++) {
      const roll = (seed % 20) / 20;
      const card = randomCard(new SequenceRng([roll, roll]), 7);
      expect(card.archetype).toBeUndefined();
    }
    // A barbarian draw CAN surface a barbarian card (sweep the within-tier pick).
    let sawBarbarian = false;
    for (let i = 0; i < 40 && !sawBarbarian; i++) {
      const pick = i / 40;
      const card = randomCard(new SequenceRng([0.5, pick]), 7, 'barbarian');
      if (archetypeIds.has(card.id)) sawBarbarian = true;
    }
    expect(sawBarbarian).toBe(true);
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

  test('no standard card is strictly dominated by another of the same tier AND cost (card-lint)', () => {
    // A reward offer is only a real choice if no same-tier/same-cost card is weakly worse on every
    // axis. Benefits (more is better): raw damage/block/heal/draw/energy/strength, debuff DURATIONS
    // (a longer Vulnerable/Weak/Frail is worth more), stun, and DoT output. Exhaust is a COST
    // (worse). Two cards that each lead on a different axis are a genuine choice, not domination.
    const sum = (c: CardDef, pred: (e: CardEffect) => number) =>
      c.effects.reduce((n, e) => n + pred(e), 0);
    const statusDur = (c: CardDef, s: string) =>
      sum(c, (e) => (e.kind === 'status' && e.status === s ? e.duration : 0));
    const profile = (c: CardDef) => ({
      damage: sum(c, (e) => (e.kind === 'damage' ? e.amount : 0)),
      block: sum(c, (e) => (e.kind === 'block' ? e.amount : 0)),
      heal: sum(c, (e) => (e.kind === 'heal' ? e.amount : 0)),
      draw: sum(c, (e) => (e.kind === 'draw' ? e.amount : 0)),
      energy: sum(c, (e) => (e.kind === 'energy' ? e.amount : 0)),
      strength: sum(c, (e) => (e.kind === 'strength' ? e.amount : 0)),
      vulnerable: statusDur(c, 'vulnerable'),
      weak: statusDur(c, 'weak'),
      frail: statusDur(c, 'frail'),
      stun: statusDur(c, 'stun'),
      dot: sum(c, (e) =>
        e.kind === 'status' && (e.status === 'poison' || e.status === 'burn')
          ? e.amount * e.duration
          : 0,
      ),
    });
    const cost = (c: CardDef) => (c.exhaust ? 1 : 0); // exhaust is a downside
    const pool = CARD_DEFS;

    for (const a of pool) {
      for (const b of pool) {
        if (a.id === b.id || a.tier !== b.tier || a.cost !== b.cost) continue;
        const pa = profile(a);
        const pb = profile(b);
        const keys = Object.keys(pa) as (keyof typeof pa)[];
        const aWeaklyBetterEverywhere = keys.every((k) => pa[k] >= pb[k]) && cost(a) <= cost(b);
        const aStrictlyBetterSomewhere = keys.some((k) => pa[k] > pb[k]) || cost(a) < cost(b);
        expect(
          aWeaklyBetterEverywhere && aStrictlyBetterSomewhere,
          `${a.id} strictly dominates ${b.id} (same tier ${a.tier}, cost ${a.cost})`,
        ).toBe(false);
      }
    }
  });

  test('no 0-cost card is a free compounding engine (card-lint, combat-depth review)', () => {
    // The full collection reshuffles every battle, so a 0-cost card that nets a permanent buff, or
    // nets BOTH energy and a draw, would loop for free forever. Guard against authoring one.
    for (const def of CARD_DEFS) {
      if (def.cost !== 0 || def.exhaust) continue;
      const grantsStrength = def.effects.some((e) => e.kind === 'strength');
      const netEnergy = def.effects
        .filter((e) => e.kind === 'energy')
        .reduce((sum, e) => sum + e.amount, 0);
      const draws = def.effects.some((e) => e.kind === 'draw');
      expect(grantsStrength, `${def.id}: a 0-cost card must not grant Strength`).toBe(false);
      expect(
        netEnergy > 0 && draws,
        `${def.id}: a 0-cost card must not net both energy and a draw`,
      ).toBe(false);
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
      enemies: [
        { id: 'foe', name: 'Foe', hp: 30, maxHp: 30, armor: 0, block: 0, statuses: [], intent },
      ],
      playerStunned: false,
      phase: 'player',
      outcome: null,
      startingEnergyBonus: 0,
      retainBlockCap: 0,
      poisonBonus: 0,
      enemyKillDraw: 0,
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
