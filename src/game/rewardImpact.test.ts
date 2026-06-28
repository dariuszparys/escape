import { describe, expect, test } from 'vitest';
import { Card, makeCard } from '../data/cards';
import { selectCombatHand } from './cardSelection';
import { previewRewardImpact } from './rewardImpact';

function attack(id: string, name: string, damage: number, tier: 1 | 2 | 3 = 1): Card {
  return makeCard({
    id,
    name,
    type: 'attack',
    tier,
    speed: 5,
    color: 0,
    description: `Deal ${damage} damage`,
    effects: [{ kind: 'damage', amount: damage }],
  });
}

function block(id: string, name: string, amount: number, tier: 1 | 2 | 3 = 1): Card {
  return makeCard({
    id,
    name,
    type: 'block',
    tier,
    speed: 6,
    color: 0,
    description: `Gain ${amount} block`,
    effects: [{ kind: 'block', amount }],
  });
}

function makeHand(collection: readonly Card[]) {
  return selectCombatHand(collection);
}

describe('previewRewardImpact', () => {
  test('labels a stolen card as collection-only when it misses the next hand', () => {
    const collection = [
      attack('thunder', 'Thunder', 12, 3),
      attack('smash', 'Smash', 11, 3),
      attack('cleave', 'Cleave', 10, 3),
      block('aegis', 'Aegis', 14, 3),
      block('wall', 'Iron Wall', 10, 2),
    ];
    const candidate = attack('scratch', 'Scratch', 2);

    const impact = previewRewardImpact({
      collection,
      combatHand: makeHand(collection),
      change: { kind: 'add', card: candidate },
    });

    expect(impact.kind).toBe('collection_only');
    expect(impact.label).toBe('Scratch stays in collection; next hand unchanged.');
    expect(impact.label).not.toMatch(/score/i);
  });

  test('names the entering card and replaced role when a stronger card enters hand', () => {
    const collection = [
      attack('jab', 'Jab', 2),
      attack('slash', 'Slash', 3),
      attack('strike', 'Strike', 4),
      block('guard', 'Guard', 7),
      block('wall', 'Wall', 8),
    ];
    const candidate = attack('thunder', 'Thunder', 12, 3);

    const impact = previewRewardImpact({
      collection,
      combatHand: makeHand(collection),
      change: { kind: 'add', card: candidate },
    });

    expect(impact.kind).toBe('replaces_card');
    expect(impact.entering?.name).toBe('Thunder');
    expect(impact.leaving?.name).toBe('Jab');
    expect(impact.label).toBe("Thunder enters hand, replacing Jab's attack role.");
    expect(impact.label).not.toMatch(/score/i);
  });

  test('labels an in-hand upgrade as improving its role without mutating the card', () => {
    const guard = block('guard', 'Guard', 7);
    const collection = [
      attack('jab', 'Jab', 2),
      attack('slash', 'Slash', 3),
      attack('strike', 'Strike', 4),
      guard,
      block('wall', 'Wall', 8),
    ];

    const impact = previewRewardImpact({
      collection,
      combatHand: makeHand(collection),
      change: { kind: 'upgrade', cardUid: guard.uid },
    });

    expect(impact.kind).toBe('improves_role');
    expect(impact.label).toBe('Guard+ stays in hand and improves its block role.');
    expect(guard.name).toBe('Guard');
    expect(guard.effects).toEqual([{ kind: 'block', amount: 7 }]);
  });

  test('labels reserve removal as next-hand unchanged', () => {
    const reserve = attack('scratch', 'Scratch', 1);
    const collection = [
      attack('thunder', 'Thunder', 12, 3),
      attack('smash', 'Smash', 11, 3),
      attack('cleave', 'Cleave', 10, 3),
      block('aegis', 'Aegis', 14, 3),
      block('wall', 'Iron Wall', 10, 2),
      reserve,
    ];

    const impact = previewRewardImpact({
      collection,
      combatHand: makeHand(collection),
      change: { kind: 'remove', cardUid: reserve.uid },
    });

    expect(impact.kind).toBe('unchanged');
    expect(impact.label).toBe('Scratch was in reserve; next hand unchanged.');
  });

  test('names the reserve card that enters after removing a current hand card', () => {
    const removed = attack('smash', 'Smash', 11, 3);
    const reserve = attack('slash', 'Slash', 5);
    const collection = [
      attack('thunder', 'Thunder', 12, 3),
      removed,
      attack('cleave', 'Cleave', 10, 3),
      block('aegis', 'Aegis', 14, 3),
      block('wall', 'Iron Wall', 10, 2),
      reserve,
    ];

    const impact = previewRewardImpact({
      collection,
      combatHand: makeHand(collection),
      change: { kind: 'remove', cardUid: removed.uid },
    });

    expect(impact.kind).toBe('removes_hand_card');
    expect(impact.entering?.name).toBe('Slash');
    expect(impact.leaving?.name).toBe('Smash');
    expect(impact.label).toBe('Smash leaves hand; Slash enters as an attack role.');
  });
});
