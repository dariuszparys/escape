import { describe, expect, test } from 'vitest';
import { makeCard } from './data/cards';
import { makeRelic } from './data/relics';
import { RunState } from './state';

describe('RunState.removeCard', () => {
  test('removes an existing card from the collection', () => {
    const run = new RunState();
    run.cardCollection = [
      makeCard({
        id: 'strike',
        name: 'Strike',
        type: 'attack',
        tier: 1,
        cost: 1,
        color: 0,
        description: 'Deal 5 damage',
        effects: [{ kind: 'damage', amount: 5 }],
      }),
      makeCard({
        id: 'guard',
        name: 'Guard',
        type: 'block',
        tier: 1,
        cost: 1,
        color: 0,
        description: 'Gain 7 block',
        effects: [{ kind: 'block', amount: 7 }],
      }),
      makeCard({
        id: 'minor_heal',
        name: 'Minor Heal',
        type: 'heal',
        tier: 1,
        cost: 1,
        color: 0,
        description: 'Restore 5 HP',
        effects: [{ kind: 'heal', amount: 5 }],
      }),
    ];

    const removedUid = run.cardCollection[1].uid;
    const result = run.removeCard(removedUid);

    expect(result).toBe(true);
    expect(run.cardCollection).toHaveLength(2);
  });

  test('returns false and does nothing for unknown cards', () => {
    const run = new RunState();
    run.cardCollection = [
      makeCard({
        id: 'strike',
        name: 'Strike',
        type: 'attack',
        tier: 1,
        cost: 1,
        color: 0,
        description: 'Deal 5 damage',
        effects: [{ kind: 'damage', amount: 5 }],
      }),
      makeCard({
        id: 'guard',
        name: 'Guard',
        type: 'block',
        tier: 1,
        cost: 1,
        color: 0,
        description: 'Gain 7 block',
        effects: [{ kind: 'block', amount: 7 }],
      }),
    ];
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
        cost: 1,
        color: 0,
        description: 'Deal 5 damage',
        effects: [{ kind: 'damage', amount: 5 }],
      }),
    ];

    const removed = run.removeCard(run.cardCollection[0].uid);

    expect(removed).toBe(false);
    expect(run.cardCollection).toHaveLength(1);
  });

  test('swift boots is a battle-side relic: owning it changes no run state (U12)', () => {
    const run = new RunState('seed');
    run.addRelic(makeRelic('swift_boots'));

    // Its +1 draw applies inside the turn battle; here it is just owned.
    expect(run.hasRelic('swift_boots')).toBe(true);
    expect(run.maxArmor).toBe(3);
  });

  test('adds iron will to increase max armor to 4 and fills armor immediately', () => {
    const run = new RunState('seed');
    run.addRelic(makeRelic('iron_will'));

    expect(run.maxArmor).toBe(4);
    expect(run.armor).toBe(4);
    // Already at the cap, so no further armor pickups can add anything.
    expect(run.addArmor()).toBe(false);
  });

  test('does not duplicate relics by id', () => {
    const run = new RunState('seed');
    run.addRelic(makeRelic('swift_boots'));
    run.addRelic(makeRelic('swift_boots'));

    expect(run.relics).toHaveLength(1);
    expect(run.relics[0]?.id).toBe('swift_boots');
  });

  test('provides a 1.5 gold multiplier when lucky coin is owned', () => {
    const run = new RunState('seed');

    expect(run.goldMultiplier).toBe(1);

    run.addRelic(makeRelic('lucky_coin'));

    expect(run.goldMultiplier).toBe(1.5);
  });

  test('still caps armor without iron will', () => {
    const run = new RunState('seed');
    const added = [run.addArmor(), run.addArmor(), run.addArmor(), run.addArmor()];

    expect(run.maxArmor).toBe(3);
    expect(added).toEqual([true, true, true, false]);
  });
});
