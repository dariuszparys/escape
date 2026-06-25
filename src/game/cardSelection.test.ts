import { describe, expect, test } from 'vitest';
import { makeCard } from '../data/cards';
import { selectCombatHand } from './cardSelection';

describe('selectCombatHand', () => {
  test('selects the strongest five cards from the full collection', () => {
    const collection = [
      makeCard({ id: 'weak-a', name: 'Weak A', type: 'attack', tier: 1, cost: 0, speed: 5, color: 0, description: 'weak', effects: [{ kind: 'damage', amount: 2 }] }),
      makeCard({ id: 'tier-3-a', name: 'Tier 3 A', type: 'attack', tier: 3, cost: 0, speed: 5, color: 0, description: 'strong', effects: [{ kind: 'damage', amount: 8 }] }),
      makeCard({ id: 'tier-2-a', name: 'Tier 2 A', type: 'attack', tier: 2, cost: 0, speed: 5, color: 0, description: 'mid', effects: [{ kind: 'damage', amount: 6 }] }),
      makeCard({ id: 'tier-3-b', name: 'Tier 3 B', type: 'block', tier: 3, cost: 0, speed: 5, color: 0, description: 'block', effects: [{ kind: 'block', amount: 7 }] }),
      makeCard({ id: 'tier-2-b', name: 'Tier 2 B', type: 'heal', tier: 2, cost: 0, speed: 5, color: 0, description: 'heal', effects: [{ kind: 'heal', amount: 5 }] }),
      makeCard({ id: 'tier-1-b', name: 'Tier 1 B', type: 'attack', tier: 1, cost: 0, speed: 5, color: 0, description: 'small', effects: [{ kind: 'damage', amount: 3 }] }),
    ];

    expect(selectCombatHand(collection).map((card) => card.id)).toEqual([
      'tier-3-a',
      'tier-3-b',
      'tier-2-a',
      'tier-2-b',
      'tier-1-b',
    ]);
  });

  test('uses stable tie ordering by name then uid', () => {
    const alpha = makeCard({ id: 'alpha', name: 'Alpha', type: 'attack', tier: 1, cost: 0, speed: 5, color: 0, description: 'a', effects: [{ kind: 'damage', amount: 4 }] });
    const beta = makeCard({ id: 'beta', name: 'Beta', type: 'attack', tier: 1, cost: 0, speed: 5, color: 0, description: 'b', effects: [{ kind: 'damage', amount: 4 }] });
    const betaLater = makeCard({ id: 'beta-later', name: 'Beta', type: 'attack', tier: 1, cost: 0, speed: 5, color: 0, description: 'b2', effects: [{ kind: 'damage', amount: 4 }] });

    expect(selectCombatHand([betaLater, beta, alpha]).map((card) => card.id)).toEqual([
      'alpha',
      'beta',
      'beta-later',
    ]);
  });
});
