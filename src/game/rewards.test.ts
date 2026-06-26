import { describe, expect, test } from 'vitest';
import { makeCard } from '../data/cards';
import { makeItem } from '../data/items';
import { RunState } from '../state';
import { awardFloorPotion, rollChestReward } from './rewards';
import { SequenceRng } from './test-rng';

describe('rewards', () => {
  test('cards go to collection and refresh combat hand without discarding overflow cards', () => {
    const run = new RunState('seed');
    for (let i = 0; i < 7; i++) {
      run.addCard(
        makeCard({
          id: `card-${i}`,
          name: `Card ${i}`,
          type: 'attack',
          tier: i < 2 ? 1 : 2,
          cost: 0,
          speed: 5,
          color: 0,
          description: 'card',
          effects: [{ kind: 'damage', amount: i + 1 }],
        }),
      );
    }

    expect(run.cardCollection).toHaveLength(7);
    expect(run.combatHand).toHaveLength(5);
    expect(run.combatHand.map((card) => card.id)).toEqual([
      'card-6',
      'card-5',
      'card-4',
      'card-3',
      'card-2',
    ]);
  });

  test('inventory accepts only three items', () => {
    const run = new RunState('seed');

    expect(run.addItem(makeItem('small_potion'))).toBe(true);
    expect(run.addItem(makeItem('bomb'))).toBe(true);
    expect(run.addItem(makeItem('smoke_bomb'))).toBe(true);
    expect(run.addItem(makeItem('large_potion'))).toBe(false);
    expect(run.inventory.map((item) => item.id)).toEqual(['small_potion', 'bomb', 'smoke_bomb']);
  });

  test('inventory can replace an item without changing capacity', () => {
    const run = new RunState('seed');
    run.addItem(makeItem('small_potion'));
    run.addItem(makeItem('bomb'));
    run.addItem(makeItem('smoke_bomb'));
    const bomb = run.inventory[1];

    expect(run.replaceItem(bomb.uid, makeItem('large_potion'))).toBe(true);

    expect(run.inventory).toHaveLength(3);
    expect(run.inventory.map((item) => item.id)).toEqual([
      'small_potion',
      'large_potion',
      'smoke_bomb',
    ]);
  });

  test('floor potion heals immediately when inventory is full', () => {
    const run = new RunState('seed');
    run.hp = 20;
    run.addItem(makeItem('small_potion'));
    run.addItem(makeItem('bomb'));
    run.addItem(makeItem('smoke_bomb'));

    const result = awardFloorPotion(run);

    expect(result.kind).toBe('heal');
    expect(run.hp).toBe(28);
    expect(run.inventory).toHaveLength(3);
  });

  test('floor potion waits for a replacement when inventory and health are full', () => {
    const run = new RunState('seed');
    run.addItem(makeItem('small_potion'));
    run.addItem(makeItem('bomb'));
    run.addItem(makeItem('smoke_bomb'));

    const result = awardFloorPotion(run);

    expect(result.kind).toBe('inventory_full');
    if (result.kind !== 'inventory_full') throw new Error(`Unexpected result: ${result.kind}`);
    expect(result.item.id).toBe('small_potion');
    expect(run.hp).toBe(run.maxHp);
    expect(run.inventory.map((item) => item.id)).toEqual(['small_potion', 'bomb', 'smoke_bomb']);
  });

  test('chest potion waits for a replacement when inventory and health are full', () => {
    const run = new RunState('seed');
    run.addItem(makeItem('small_potion'));
    run.addItem(makeItem('bomb'));
    run.addItem(makeItem('smoke_bomb'));

    const result = rollChestReward(run, new SequenceRng([0.6]), 5);

    expect(result.kind).toBe('inventory_full');
    if (result.kind !== 'inventory_full') throw new Error(`Unexpected result: ${result.kind}`);
    expect(result.item.id).toBe('small_potion');
    expect(run.hp).toBe(run.maxHp);
    expect(run.inventory.map((item) => item.id)).toEqual(['small_potion', 'bomb', 'smoke_bomb']);
  });

  test('chest can award deterministic gold', () => {
    const run = new RunState('seed');

    const result = rollChestReward(run, new SequenceRng([0.95], [17]), 5);

    expect(result.kind).toBe('gold');
    expect(run.gold).toBe(17);
  });
});
