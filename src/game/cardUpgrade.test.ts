import { describe, expect, test } from 'vitest';
import { makeCard } from '../data/cards';
import { upgradeCard } from './cardUpgrade';

describe('upgradeCard', () => {
  test('upgrades a damage card', () => {
    const card = makeCard({
      id: 'strike',
      name: 'Strike',
      type: 'attack',
      tier: 1,
      speed: 5,
      color: 0,
      description: 'Deal 5 damage',
      effects: [{ kind: 'damage', amount: 5 }],
    });
    const beforeUid = card.uid;
    const upgraded = upgradeCard(card);

    expect(upgraded).toBe(card);
    expect(upgraded.uid).toBe(beforeUid);
    expect(upgraded.name).toBe('Strike+');
    expect(upgraded.effects).toEqual([{ kind: 'damage', amount: 7 }]);
  });

  test('upgrades a block card', () => {
    const card = makeCard({
      id: 'guard',
      name: 'Guard',
      type: 'block',
      tier: 1,
      speed: 6,
      color: 0,
      description: 'Gain 7 block',
      effects: [{ kind: 'block', amount: 7 }],
    });
    upgradeCard(card);

    expect(card.name).toBe('Guard+');
    expect(card.effects).toEqual([{ kind: 'block', amount: 10 }]);
  });

  test('upgrades a heal card', () => {
    const card = makeCard({
      id: 'minor_heal',
      name: 'Minor Heal',
      type: 'heal',
      tier: 1,
      speed: 4,
      color: 0,
      description: 'Restore 5 HP',
      effects: [{ kind: 'heal', amount: 5 }],
    });
    upgradeCard(card);

    expect(card.name).toBe('Minor Heal+');
    expect(card.effects).toEqual([{ kind: 'heal', amount: 8 }]);
  });

  test('does not add duplicate plus on repeated upgrades', () => {
    const card = makeCard({
      id: 'strike',
      name: 'Strike',
      type: 'attack',
      tier: 1,
      speed: 5,
      color: 0,
      description: 'Deal 5 damage',
      effects: [{ kind: 'damage', amount: 5 }],
    });

    upgradeCard(card);
    upgradeCard(card);

    expect(card.name).toBe('Strike+');
    expect(card.effects).toEqual([{ kind: 'damage', amount: 9 }]);
  });

  test('upgrades only upgradable effects on mixed cards', () => {
    const card = makeCard({
      id: 'poison_dagger',
      name: 'Poison Dagger',
      type: 'status',
      tier: 2,
      speed: 6,
      color: 0,
      description: 'Deal 3 and poison',
      effects: [
        { kind: 'damage', amount: 3 },
        { kind: 'status', status: 'poison', amount: 2, duration: 3 },
      ],
    });

    upgradeCard(card);

    expect(card.name).toBe('Poison Dagger+');
    expect(card.effects).toEqual([
      { kind: 'damage', amount: 5 },
      { kind: 'status', status: 'poison', amount: 2, duration: 3 },
    ]);
  });

  test('keeps pure status effects unchanged but adds plus suffix', () => {
    const card = makeCard({
      id: 'mystic_mark',
      name: 'Mystic Mark',
      type: 'status',
      tier: 2,
      speed: 3,
      color: 0,
      description: 'Burns for two turns',
      effects: [{ kind: 'status', status: 'burn', amount: 2, duration: 2 }],
    });

    upgradeCard(card);

    expect(card.name).toBe('Mystic Mark+');
    expect(card.effects).toEqual([{ kind: 'status', status: 'burn', amount: 2, duration: 2 }]);
  });
});
