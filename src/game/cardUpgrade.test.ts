import { describe, expect, test } from 'vitest';
import { makeCard } from '../data/cards';
import { MAX_CARD_UPGRADES, isCardUpgradable, upgradeCard, upgradeCount } from './cardUpgrade';

describe('upgradeCard', () => {
  test('upgrades a damage card', () => {
    const card = makeCard({
      id: 'strike',
      name: 'Strike',
      type: 'attack',
      tier: 1,
      cost: 1,
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
      cost: 1,
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
      cost: 1,
      color: 0,
      description: 'Restore 5 HP',
      effects: [{ kind: 'heal', amount: 5 }],
    });
    upgradeCard(card);

    expect(card.name).toBe('Minor Heal+');
    expect(card.effects).toEqual([{ kind: 'heal', amount: 8 }]);
  });

  test('a second upgrade is a no-op: one upgraded version per card', () => {
    const card = makeCard({
      id: 'strike',
      name: 'Strike',
      type: 'attack',
      tier: 1,
      cost: 1,
      color: 0,
      description: 'Deal 5 damage',
      effects: [{ kind: 'damage', amount: 5 }],
    });

    upgradeCard(card);
    upgradeCard(card);

    // The cap is what stops a run pouring every rest-room upgrade into one scaling card.
    expect(card.name).toBe('Strike+');
    expect(card.effects).toEqual([{ kind: 'damage', amount: 7 }]);
    expect(card.upgrades).toBe(MAX_CARD_UPGRADES);
    expect(isCardUpgradable(card)).toBe(false);
  });

  test('a maxed card drops out of the upgradable set even with upgradable effects', () => {
    const card = makeCard({
      id: 'guard',
      name: 'Guard',
      type: 'block',
      tier: 1,
      cost: 1,
      color: 0,
      description: 'Gain 7 block',
      effects: [{ kind: 'block', amount: 7 }],
    });

    expect(isCardUpgradable(card)).toBe(true);
    upgradeCard(card);
    expect(isCardUpgradable(card)).toBe(false);
  });

  test('legacy cards without an upgrades field count as un-upgraded', () => {
    const card = makeCard({
      id: 'strike',
      name: 'Strike',
      type: 'attack',
      tier: 1,
      cost: 1,
      color: 0,
      description: 'Deal 5 damage',
      effects: [{ kind: 'damage', amount: 5 }],
    });
    delete card.upgrades;

    expect(upgradeCount(card)).toBe(0);
    expect(isCardUpgradable(card)).toBe(true);
  });

  test('the cap bounds a multi-hit scaling card that used to snowball', () => {
    // Sunder-shaped: two damage effects around a self-applied Vulnerable, so each upgrade pays
    // +2 twice AND the second hit banks x1.5 off the card's own debuff. That is fine ONCE; the
    // 60-damage card came from repeating it six times, which the cap now forbids.
    const card = makeCard({
      id: 'sunder',
      name: 'Sunder',
      type: 'attack',
      tier: 3,
      cost: 2,
      color: 0,
      description: 'Deal 4, Vulnerable, then Deal 4',
      effects: [
        { kind: 'damage', amount: 4 },
        { kind: 'status', status: 'vulnerable', amount: 1, duration: 2 },
        { kind: 'damage', amount: 4 },
      ],
    });

    upgradeCard(card);
    upgradeCard(card);
    upgradeCard(card);

    expect(card.effects).toEqual([
      { kind: 'damage', amount: 6 },
      { kind: 'status', status: 'vulnerable', amount: 1, duration: 3 },
      { kind: 'damage', amount: 6 },
    ]);
    // 6 + floor(6 * 1.5) = 15 raw, against the 40 that six unbounded upgrades reached.
    expect(card.upgrades).toBe(MAX_CARD_UPGRADES);
  });

  test('a single-hit card keeps the full damage budget', () => {
    const card = makeCard({
      id: 'strike',
      name: 'Strike',
      type: 'attack',
      tier: 1,
      cost: 1,
      color: 0,
      description: 'Deal 6 damage',
      effects: [{ kind: 'damage', amount: 6 }],
    });

    upgradeCard(card);

    expect(card.effects).toEqual([{ kind: 'damage', amount: 8 }]);
  });

  test('upgrades only upgradable effects on mixed cards', () => {
    const card = makeCard({
      id: 'poison_dagger',
      name: 'Poison Dagger',
      type: 'status',
      tier: 2,
      cost: 1,
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
      { kind: 'status', status: 'poison', amount: 3, duration: 3 },
    ]);
  });

  test('upgrades a pure burn card', () => {
    const card = makeCard({
      id: 'mystic_mark',
      name: 'Mystic Mark',
      type: 'status',
      tier: 2,
      cost: 1,
      color: 0,
      description: 'Burns for two turns',
      effects: [{ kind: 'status', status: 'burn', amount: 2, duration: 2 }],
    });

    upgradeCard(card);

    expect(card.name).toBe('Mystic Mark+');
    expect(card.effects).toEqual([{ kind: 'status', status: 'burn', amount: 3, duration: 2 }]);
  });

  test('upgrades a poison card (amount +1, duration unchanged)', () => {
    const card = makeCard({
      id: 'toxin_dart',
      name: 'Toxin Dart',
      type: 'status',
      tier: 1,
      cost: 1,
      color: 0,
      description: 'Poisons the target',
      effects: [{ kind: 'status', status: 'poison', amount: 3, duration: 4 }],
    });

    upgradeCard(card);

    expect(card.name).toBe('Toxin Dart+');
    expect(card.effects).toEqual([{ kind: 'status', status: 'poison', amount: 4, duration: 4 }]);
  });

  test('upgrades a vulnerable card (duration +1, amount unchanged)', () => {
    const card = makeCard({
      id: 'expose',
      name: 'Expose',
      type: 'status',
      tier: 1,
      cost: 1,
      color: 0,
      description: 'Applies vulnerable',
      effects: [{ kind: 'status', status: 'vulnerable', amount: 1, duration: 2 }],
    });

    upgradeCard(card);

    expect(card.name).toBe('Expose+');
    expect(card.effects).toEqual([
      { kind: 'status', status: 'vulnerable', amount: 1, duration: 3 },
    ]);
  });

  test('upgrades a weak card (duration +1, amount unchanged)', () => {
    const card = makeCard({
      id: 'jeer',
      name: 'Jeer',
      type: 'status',
      tier: 1,
      cost: 1,
      color: 0,
      description: 'Applies weak',
      effects: [{ kind: 'status', status: 'weak', amount: 1, duration: 2 }],
    });

    upgradeCard(card);

    expect(card.name).toBe('Jeer+');
    expect(card.effects).toEqual([{ kind: 'status', status: 'weak', amount: 1, duration: 3 }]);
  });

  test('upgrades a frail card (duration +1, amount unchanged)', () => {
    const card = makeCard({
      id: 'crack_armor',
      name: 'Crack Armor',
      type: 'status',
      tier: 1,
      cost: 1,
      color: 0,
      description: 'Applies frail',
      effects: [{ kind: 'status', status: 'frail', amount: 1, duration: 2 }],
    });

    upgradeCard(card);

    expect(card.name).toBe('Crack Armor+');
    expect(card.effects).toEqual([{ kind: 'status', status: 'frail', amount: 1, duration: 3 }]);
  });

  test('upgrades a strength card', () => {
    const card = makeCard({
      id: 'flex',
      name: 'Flex',
      type: 'utility',
      tier: 1,
      cost: 1,
      color: 0,
      description: 'Gain strength',
      effects: [{ kind: 'strength', amount: 2 }],
    });

    upgradeCard(card);

    expect(card.name).toBe('Flex+');
    expect(card.effects).toEqual([{ kind: 'strength', amount: 3 }]);
  });

  test('upgrades a draw card', () => {
    const card = makeCard({
      id: 'quick_draw',
      name: 'Quick Draw',
      type: 'utility',
      tier: 1,
      cost: 1,
      color: 0,
      description: 'Draw a card',
      effects: [{ kind: 'draw', amount: 1 }],
    });

    upgradeCard(card);

    expect(card.name).toBe('Quick Draw+');
    expect(card.effects).toEqual([{ kind: 'draw', amount: 2 }]);
  });

  test('upgrades an energy card', () => {
    const card = makeCard({
      id: 'surge',
      name: 'Surge',
      type: 'utility',
      tier: 1,
      cost: 1,
      color: 0,
      description: 'Gain energy',
      effects: [{ kind: 'energy', amount: 1 }],
    });

    upgradeCard(card);

    expect(card.name).toBe('Surge+');
    expect(card.effects).toEqual([{ kind: 'energy', amount: 2 }]);
  });

  test('does not upgrade or rename a stun-only card', () => {
    const card = makeCard({
      id: 'daze',
      name: 'Daze',
      type: 'status',
      tier: 1,
      cost: 1,
      color: 0,
      description: 'Stuns the target',
      effects: [{ kind: 'status', status: 'stun', amount: 1, duration: 1 }],
    });

    upgradeCard(card);

    expect(card.name).toBe('Daze');
    expect(card.effects).toEqual([{ kind: 'status', status: 'stun', amount: 1, duration: 1 }]);
  });

  test('does not upgrade or rename a shuffleCurse-only card', () => {
    const card = makeCard({
      id: 'hex',
      name: 'Hex',
      type: 'status',
      tier: 1,
      cost: 1,
      color: 0,
      description: 'Curses the target',
      effects: [{ kind: 'shuffleCurse', amount: 1 }],
    });

    upgradeCard(card);

    expect(card.name).toBe('Hex');
    expect(card.effects).toEqual([{ kind: 'shuffleCurse', amount: 1 }]);
  });

  test('isCardUpgradable returns false for a stun-only or shuffleCurse-only card', () => {
    const stunCard = makeCard({
      id: 'daze2',
      name: 'Daze',
      type: 'status',
      tier: 1,
      cost: 1,
      color: 0,
      description: 'Stuns the target',
      effects: [{ kind: 'status', status: 'stun', amount: 1, duration: 1 }],
    });
    const curseCard = makeCard({
      id: 'hex2',
      name: 'Hex',
      type: 'status',
      tier: 1,
      cost: 1,
      color: 0,
      description: 'Curses the target',
      effects: [{ kind: 'shuffleCurse', amount: 1 }],
    });

    expect(isCardUpgradable(stunCard)).toBe(false);
    expect(isCardUpgradable(curseCard)).toBe(false);
  });

  test('isCardUpgradable returns true for a normal card', () => {
    const card = makeCard({
      id: 'strike2',
      name: 'Strike',
      type: 'attack',
      tier: 1,
      cost: 1,
      color: 0,
      description: 'Deal 5 damage',
      effects: [{ kind: 'damage', amount: 5 }],
    });

    expect(isCardUpgradable(card)).toBe(true);
  });
});
