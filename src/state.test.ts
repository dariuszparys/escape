import { describe, expect, test } from 'vitest';
import { makeCard } from './data/cards';
import { RunState } from './state';

describe('RunState.removeCard', () => {
  test('removes an existing card and refreshes combat hand', () => {
    const run = new RunState();
    run.cardCollection = [
      makeCard({
        id: 'strike',
        name: 'Strike',
        type: 'attack',
        tier: 1,
        speed: 5,
        color: 0,
        description: 'Deal 5 damage',
        effects: [{ kind: 'damage', amount: 5 }],
      }),
      makeCard({
        id: 'guard',
        name: 'Guard',
        type: 'block',
        tier: 1,
        speed: 6,
        color: 0,
        description: 'Gain 7 block',
        effects: [{ kind: 'block', amount: 7 }],
      }),
      makeCard({
        id: 'minor_heal',
        name: 'Minor Heal',
        type: 'heal',
        tier: 1,
        speed: 4,
        color: 0,
        description: 'Restore 5 HP',
        effects: [{ kind: 'heal', amount: 5 }],
      }),
    ];
    run.refreshCombatHand();

    const removedUid = run.cardCollection[1].uid;
    const result = run.removeCard(removedUid);

    expect(result).toBe(true);
    expect(run.cardCollection).toHaveLength(2);
    expect(run.combatHand.map((card) => card.uid)).not.toContain(removedUid);
  });

  test('returns false and does nothing for unknown cards', () => {
    const run = new RunState();
    run.cardCollection = [
      makeCard({
        id: 'strike',
        name: 'Strike',
        type: 'attack',
        tier: 1,
        speed: 5,
        color: 0,
        description: 'Deal 5 damage',
        effects: [{ kind: 'damage', amount: 5 }],
      }),
      makeCard({
        id: 'guard',
        name: 'Guard',
        type: 'block',
        tier: 1,
        speed: 6,
        color: 0,
        description: 'Gain 7 block',
        effects: [{ kind: 'block', amount: 7 }],
      }),
    ];
    run.refreshCombatHand();
    const uid = run.cardCollection[0].uid;
    const unchanged = run.cardCollection.map((card) => card.uid);

    const result = run.removeCard(uid + 1000);

    expect(result).toBe(false);
    expect(run.cardCollection.map((card) => card.uid)).toEqual(unchanged);
  });

  test('does not remove the last remaining card', () => {
    const run = new RunState();
    run.cardCollection = [
      makeCard({
        id: 'strike',
        name: 'Strike',
        type: 'attack',
        tier: 1,
        speed: 5,
        color: 0,
        description: 'Deal 5 damage',
        effects: [{ kind: 'damage', amount: 5 }],
      }),
    ];
    run.refreshCombatHand();

    const removed = run.removeCard(run.cardCollection[0].uid);

    expect(removed).toBe(false);
    expect(run.cardCollection).toHaveLength(1);
  });
});
