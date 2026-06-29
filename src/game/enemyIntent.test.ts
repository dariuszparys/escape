import { describe, expect, test } from 'vitest';
import { CARD_DEFS, makeCard } from '../data/cards';
import { BOSSES, ENEMIES, EnemyInstance } from '../data/enemies';
import { SequenceRng } from './test-rng';
import { planEnemyIntent } from './enemyIntent';

function card(id: string) {
  const def = CARD_DEFS.find((candidate) => candidate.id === id);
  if (!def) throw new Error(`Missing card ${id}`);
  return makeCard(def);
}

function enemy(id: string, cardIds: string[], hp?: number): EnemyInstance {
  const def = [...ENEMIES, ...BOSSES].find((candidate) => candidate.id === id);
  if (!def) throw new Error(`Missing enemy ${id}`);
  const cards = cardIds.map(card);
  return {
    def,
    hp: hp ?? def.baseHp,
    maxHp: def.baseHp,
    armor: 0,
    statuses: [],
    cards,
  };
}

describe('planEnemyIntent', () => {
  test('returns a readable scripted Bandit intent before player choice', () => {
    const result = planEnemyIntent({
      enemy: enemy('bandit', ['quick_jab', 'heavy_strike', 'guard']),
      round: 1,
      usedCardUids: new Set(),
      rng: new SequenceRng([0, 0]),
    });

    expect(result.source).toBe('script');
    expect(result.summary).toMatchObject({
      family: 'attack',
      title: 'Attack intent',
      speed: 8,
      consequence: 'Deals 4 damage',
    });
    expect(result.summary.cardName).toBeUndefined();
    expect(result.action.kind).toBe('card');
  });

  test('can reveal exact card identity when requested without changing the committed action', () => {
    const normal = planEnemyIntent({
      enemy: enemy('cultist', ['poison_dagger', 'slash']),
      round: 1,
      usedCardUids: new Set(),
      rng: new SequenceRng([0]),
    });
    const exact = planEnemyIntent({
      enemy: enemy('cultist', ['poison_dagger', 'slash']),
      round: 1,
      usedCardUids: new Set(),
      rng: new SequenceRng([0]),
      revealMode: 'exact',
    });

    expect(normal.summary.cardName).toBeUndefined();
    expect(exact.summary.cardName).toBe('Poison Dagger');
    expect(exact.summary.consequence).toBe(normal.summary.consequence);
  });

  test('fallback enemies still choose legal unused cards and update used-card state', () => {
    const rat = enemy('rat', ['guard', 'slash']);
    const usedCardUids = new Set([rat.cards[0].uid]);

    const result = planEnemyIntent({
      enemy: rat,
      round: 1,
      usedCardUids,
      rng: new SequenceRng([0]),
    });

    expect(result.source).toBe('fallback');
    expect(result.action.kind).toBe('card');
    expect(result.action.kind === 'card' ? result.action.card.uid : null).toBe(rat.cards[1].uid);
    expect([...result.usedCardUids]).toEqual([]);
    expect([...usedCardUids]).toEqual([rat.cards[0].uid]);
  });

  test('boss special interval commits the special with telegraph data', () => {
    const result = planEnemyIntent({
      enemy: enemy('iron_warden', ['slash', 'guard']),
      round: 5,
      usedCardUids: new Set([123]),
      rng: new SequenceRng([0]),
    });

    expect(result.source).toBe('boss_special');
    expect(result.action).toMatchObject({
      actor: 'enemy',
      kind: 'special',
      name: 'Warhammer',
      speed: 4,
    });
    expect(result.summary).toMatchObject({
      family: 'special',
      title: 'Warhammer',
      speed: 4,
      telegraph: 'The Iron Warden braces behind iron plates...',
    });
    expect([...result.usedCardUids]).toEqual([123]);
  });

  test('strong enemies resolve their scripts rather than falling back', () => {
    const cases: [string, string[]][] = [
      ['knight', ['quick_jab', 'heavy_strike', 'guard']],
      ['necromancer', ['poison_dagger', 'slash']],
      ['ogre', ['guard', 'slash']],
    ];

    for (const [id, cardIds] of cases) {
      const result = planEnemyIntent({
        enemy: enemy(id, cardIds),
        round: 1,
        usedCardUids: new Set(),
        rng: new SequenceRng([0, 0]),
      });

      expect(result.source).toBe('script');
      expect(result.action.kind).toBe('card');
    }
  });

  test('script patterns index by round modulo length (round 4 mirrors round 1)', () => {
    const ogre = () => enemy('ogre', ['guard', 'slash', 'iron_wall']);

    const round1 = planEnemyIntent({
      enemy: ogre(),
      round: 1,
      usedCardUids: new Set(),
      rng: new SequenceRng([0, 0]),
    });
    const round4 = planEnemyIntent({
      enemy: ogre(),
      round: 4,
      usedCardUids: new Set(),
      rng: new SequenceRng([0, 0]),
    });

    expect(round4.source).toBe('script');
    expect(round1.summary).toEqual(round4.summary);
  });

  test('the low-HP branch prepends heal to a script enemy preferences', () => {
    const healthy = planEnemyIntent({
      enemy: enemy('necromancer', ['minor_heal', 'slash']),
      round: 1,
      usedCardUids: new Set(),
      rng: new SequenceRng([0, 0]),
      lowHealth: false,
    });
    const wounded = planEnemyIntent({
      enemy: enemy('necromancer', ['minor_heal', 'slash']),
      round: 1,
      usedCardUids: new Set(),
      rng: new SequenceRng([0, 0]),
      lowHealth: true,
    });

    expect(healthy.summary.family).toBe('attack'); // slash, no heal prepended
    expect(wounded.summary.family).toBe('heal'); // heal prepended and chosen
  });

  test('a script enemy with no matching card still falls back safely', () => {
    const result = planEnemyIntent({
      enemy: enemy('ogre', ['minor_heal']),
      round: 1,
      usedCardUids: new Set(),
      rng: new SequenceRng([0]),
      lowHealth: false,
    });

    expect(result.source).toBe('fallback');
    expect(result.action.kind).toBe('card');
  });

  test('same seeded inputs commit equivalent actions for shared callers', () => {
    const state = enemy('armored_goblin', ['shield_bash', 'iron_wall', 'slash']);

    const first = planEnemyIntent({
      enemy: state,
      round: 2,
      usedCardUids: new Set(),
      rng: new SequenceRng([0.8, 0]),
    });
    const second = planEnemyIntent({
      enemy: state,
      round: 2,
      usedCardUids: new Set(),
      rng: new SequenceRng([0.8, 0]),
    });

    expect(first.action).toEqual(second.action);
    expect(first.usedCardUids).toEqual(second.usedCardUids);
    expect(first.summary).toEqual(second.summary);
  });
});
