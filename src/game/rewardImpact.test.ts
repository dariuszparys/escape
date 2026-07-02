import { describe, expect, test } from 'vitest';
import { Card, CardEffect, makeCard } from '../data/cards';
import { openingHandOdds, previewRewardImpact } from './rewardImpact';

function card(name: string, effects: CardEffect[] = [{ kind: 'damage', amount: 5 }]): Card {
  return makeCard({
    id: name.toLowerCase().replace(/ /g, '_'),
    name,
    type: 'attack',
    tier: 1,
    cost: 1,
    color: 0,
    description: name,
    effects,
  });
}

function collection(size: number): Card[] {
  return Array.from({ length: size }, (_, index) => card(`Card ${index}`));
}

describe('openingHandOdds', () => {
  test('a deck at or below draw size guarantees the draw', () => {
    expect(openingHandOdds(4, 5)).toBe(1);
    expect(openingHandOdds(5, 5)).toBe(1);
  });

  test('larger decks dilute the odds proportionally', () => {
    expect(openingHandOdds(10, 5)).toBeCloseTo(0.5);
    expect(openingHandOdds(20, 5)).toBeCloseTo(0.25);
  });
});

describe('previewRewardImpact (KTD9 — deck vocabulary)', () => {
  test('adding a card grows the deck and reports its opening-hand odds', () => {
    const deck = collection(9);
    const impact = previewRewardImpact({
      collection: deck,
      change: { kind: 'add', card: card('Thunder') },
    });
    expect(impact.kind).toBe('grows_deck');
    expect(impact.deckBefore).toBe(9);
    expect(impact.deckAfter).toBe(10);
    expect(impact.drawOdds).toBeCloseTo(0.5);
    expect(impact.label).toContain('Thunder');
    expect(impact.label).toContain('10-card deck');
    // No trace of the retired hand-membership vocabulary.
    expect(impact.label).not.toMatch(/enters hand|replaces/i);
  });

  test('upgrading improves in place without changing deck size', () => {
    const deck = collection(8);
    const impact = previewRewardImpact({
      collection: deck,
      change: { kind: 'upgrade', cardUid: deck[2].uid },
    });
    expect(impact.kind).toBe('improves_card');
    expect(impact.deckBefore).toBe(8);
    expect(impact.deckAfter).toBe(8);
    expect(impact.label).toContain(deck[2].name);
  });

  test('removing thins the deck', () => {
    const deck = collection(12);
    const impact = previewRewardImpact({
      collection: deck,
      change: { kind: 'remove', cardUid: deck[0].uid },
    });
    expect(impact.kind).toBe('thins_deck');
    expect(impact.deckAfter).toBe(11);
    expect(impact.label).toContain('11-card deck');
  });

  test('an unknown uid reports the deck unchanged', () => {
    const impact = previewRewardImpact({
      collection: collection(6),
      change: { kind: 'remove', cardUid: 999999 },
    });
    expect(impact.kind).toBe('unchanged');
    expect(impact.deckAfter).toBe(6);
  });
});
