import { describe, expect, test } from 'vitest';
import { makeCard } from '../data/cards';
import { makeItem } from '../data/items';
import { buildBattleRoundHistory, orderedBattleActions } from './battleLog';
import { CombatAction } from './combat';

const quickJab = makeCard({
  id: 'quick_jab',
  name: 'Quick Jab',
  type: 'attack',
  tier: 1,
  cost: 0,
  speed: 8,
  color: 0,
  description: 'Deal 4 damage first',
  effects: [{ kind: 'damage', amount: 4 }],
});

const heavyStrike = makeCard({
  id: 'heavy_strike',
  name: 'Heavy Strike',
  type: 'attack',
  tier: 2,
  cost: 0,
  speed: 1,
  color: 0,
  description: 'Deal 10 damage, slower',
  effects: [{ kind: 'damage', amount: 10 }],
});

const poisonDagger = makeCard({
  id: 'poison_dagger',
  name: 'Poison Dagger',
  type: 'status',
  tier: 2,
  cost: 0,
  speed: 6,
  color: 0,
  description: 'Deal 3 and poison',
  effects: [
    { kind: 'damage', amount: 3 },
    { kind: 'status', status: 'poison', amount: 2, duration: 3 },
  ],
});

describe('battle log helpers', () => {
  test('orders actions by speed and lets the player win ties', () => {
    const playerAction: CombatAction = { actor: 'player', kind: 'card', card: quickJab };
    const enemyAction: CombatAction = { actor: 'enemy', kind: 'item', item: makeItem('bomb') };

    expect(orderedBattleActions(playerAction, enemyAction)).toEqual([
      { actor: 'player', label: 'Quick Jab', speed: 8 },
      { actor: 'enemy', label: 'Bomb', speed: 7 },
    ]);
  });

  test('shows action details and a compact net summary', () => {
    const lines = buildBattleRoundHistory({
      round: 3,
      playerAction: { actor: 'player', kind: 'item', item: makeItem('small_potion') },
      enemyAction: { actor: 'enemy', kind: 'card', card: heavyStrike },
      resolvedLog: [
        'Player uses Small Potion',
        'Player heals 8 HP',
        'Ogre uses Heavy Strike',
        'Player takes 8 damage',
      ],
      playerHpChange: { heal: 8, damage: 8 },
      enemyHpChange: { heal: 0, damage: 0 },
      enemyName: 'Ogre',
    });

    expect(lines).toEqual([
      'Round 3',
      '1) You: Small Potion [spd 10]',
      '2) Ogre: Heavy Strike [spd 1]',
      'You use Small Potion',
      'You heal 8 HP',
      'Ogre uses Heavy Strike',
      'You take 8 damage',
      'Net: You +8 HP, You -8 HP',
    ]);
  });

  test('shows old poison as a start-of-round effect before a new poison dagger lands', () => {
    const lines = buildBattleRoundHistory({
      round: 3,
      playerAction: { actor: 'player', kind: 'card', card: poisonDagger },
      enemyAction: { actor: 'enemy', kind: 'card', card: heavyStrike },
      resolvedLog: [
        'Player takes 2 poison damage',
        'Player uses Poison Dagger',
        'Bandit takes 3 damage',
        'Bandit is poisoned (2 for 3 rounds)',
        'Bandit uses Heavy Strike',
        'Player takes 10 damage',
      ],
      playerHpChange: { heal: 0, damage: 12 },
      enemyHpChange: { heal: 0, damage: 3 },
      enemyName: 'Bandit',
    });

    expect(lines).toEqual([
      'Round 3',
      'Start: You take 2 poison damage',
      '1) You: Poison Dagger [spd 6]',
      '2) Bandit: Heavy Strike [spd 1]',
      'You use Poison Dagger',
      'Bandit takes 3 damage',
      'Bandit is poisoned (2 for 3 rounds)',
      'Bandit uses Heavy Strike',
      'You take 10 damage',
      'Net: You -12 HP, Bandit -3 HP',
    ]);
  });
});
