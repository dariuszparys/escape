import { describe, expect, test } from 'vitest';
import { makeCard } from '../data/cards';
import { orderedDeckEntries } from './deckOrdering';

describe('orderedDeckEntries', () => {
  test('uses the combat-hand sort order and flags in-hand cards', () => {
    const slash = makeCard({
      id: 'slash',
      name: 'Slash',
      type: 'attack',
      tier: 1,
      cost: 0,
      speed: 5,
      color: 0,
      description: 'Deal 6 damage',
      effects: [{ kind: 'damage', amount: 6 }],
    });
    const guard = makeCard({
      id: 'guard',
      name: 'Guard',
      type: 'block',
      tier: 1,
      cost: 0,
      speed: 6,
      color: 0,
      description: 'Gain 7 block',
      effects: [{ kind: 'block', amount: 7 }],
    });
    const thunder = makeCard({
      id: 'thunder',
      name: 'Thunder',
      type: 'attack',
      tier: 3,
      cost: 0,
      speed: 6,
      color: 0,
      description: 'Deal 12 damage',
      effects: [{ kind: 'damage', amount: 12 }],
    });

    const ordered = orderedDeckEntries([guard, slash, thunder], [thunder, slash]);

    expect(ordered.map((entry) => [entry.card.id, entry.inHand])).toEqual([
      ['thunder', true],
      ['slash', true],
      ['guard', false],
    ]);
  });
});
