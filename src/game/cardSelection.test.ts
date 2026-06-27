import { describe, expect, test } from 'vitest';
import { makeCard } from '../data/cards';
import { isOffensiveCard, selectCombatHand } from './cardSelection';

describe('selectCombatHand', () => {
  test('keeps a core of offensive cards when support cards are stronger on paper', () => {
    const collection = [
      makeCard({
        id: 'aegis',
        name: 'Aegis',
        type: 'block',
        tier: 3,
        speed: 7,
        color: 0,
        description: 'Gain 14 block',
        effects: [{ kind: 'block', amount: 14 }],
      }),
      makeCard({
        id: 'sanctuary',
        name: 'Sanctuary',
        type: 'heal',
        tier: 3,
        speed: 5,
        color: 0,
        description: 'Restore 12 HP',
        effects: [{ kind: 'heal', amount: 12 }],
      }),
      makeCard({
        id: 'bulwark',
        name: 'Bulwark',
        type: 'block',
        tier: 2,
        speed: 6,
        color: 0,
        description: 'Gain 10 block',
        effects: [{ kind: 'block', amount: 10 }],
      }),
      makeCard({
        id: 'thunder',
        name: 'Thunder',
        type: 'attack',
        tier: 3,
        speed: 6,
        color: 0,
        description: 'Deal 12 damage',
        effects: [{ kind: 'damage', amount: 12 }],
      }),
      makeCard({
        id: 'stunning_blow',
        name: 'Stunning Blow',
        type: 'status',
        tier: 3,
        speed: 4,
        color: 0,
        description: 'Deal 6 and stun',
        effects: [
          { kind: 'damage', amount: 6 },
          { kind: 'status', status: 'stun', amount: 1, duration: 1 },
        ],
      }),
      makeCard({
        id: 'heavy_strike',
        name: 'Heavy Strike',
        type: 'attack',
        tier: 2,
        speed: 1,
        color: 0,
        description: 'Deal 10 damage',
        effects: [{ kind: 'damage', amount: 10 }],
      }),
    ];

    const hand = selectCombatHand(collection);

    expect(hand).toHaveLength(5);
    expect(hand.filter(isOffensiveCard)).toHaveLength(3);
    expect(hand.map((card) => card.id)).toEqual([
      'thunder',
      'aegis',
      'stunning_blow',
      'sanctuary',
      'heavy_strike',
    ]);
  });

  test('selectCombatHand respects a larger hand size', () => {
    const collection = [
      makeCard({
        id: 'aegis',
        name: 'Aegis',
        type: 'block',
        tier: 3,
        speed: 7,
        color: 0,
        description: 'Gain 14 block',
        effects: [{ kind: 'block', amount: 14 }],
      }),
      makeCard({
        id: 'sanctuary',
        name: 'Sanctuary',
        type: 'heal',
        tier: 3,
        speed: 5,
        color: 0,
        description: 'Restore 12 HP',
        effects: [{ kind: 'heal', amount: 12 }],
      }),
      makeCard({
        id: 'bulwark',
        name: 'Bulwark',
        type: 'block',
        tier: 2,
        speed: 6,
        color: 0,
        description: 'Gain 10 block',
        effects: [{ kind: 'block', amount: 10 }],
      }),
      makeCard({
        id: 'thunder',
        name: 'Thunder',
        type: 'attack',
        tier: 3,
        speed: 6,
        color: 0,
        description: 'Deal 12 damage',
        effects: [{ kind: 'damage', amount: 12 }],
      }),
      makeCard({
        id: 'stunning_blow',
        name: 'Stunning Blow',
        type: 'status',
        tier: 3,
        speed: 4,
        color: 0,
        description: 'Deal 6 and stun',
        effects: [
          { kind: 'damage', amount: 6 },
          { kind: 'status', status: 'stun', amount: 1, duration: 1 },
        ],
      }),
      makeCard({
        id: 'heavy_strike',
        name: 'Heavy Strike',
        type: 'attack',
        tier: 2,
        speed: 1,
        color: 0,
        description: 'Deal 10 damage',
        effects: [{ kind: 'damage', amount: 10 }],
      }),
    ];

    const hand = selectCombatHand(collection, 6);

    expect(hand).toHaveLength(6);
    expect(hand.filter(isOffensiveCard)).toHaveLength(3);
  });
});
