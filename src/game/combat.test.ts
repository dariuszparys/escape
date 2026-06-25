import { describe, expect, test } from 'vitest';
import { makeCard } from '../data/cards';
import { makeItem } from '../data/items';
import { resolveRound } from './combat';

const strike = makeCard({ id: 'strike', name: 'Strike', type: 'attack', tier: 1, cost: 0, speed: 5, color: 0, description: 'Deal 6', effects: [{ kind: 'damage', amount: 6 }] });
const quick = makeCard({ id: 'quick', name: 'Quick Jab', type: 'attack', tier: 1, cost: 0, speed: 8, color: 0, description: 'Deal 4', effects: [{ kind: 'damage', amount: 4 }] });
const slow = makeCard({ id: 'slow', name: 'Heavy Strike', type: 'attack', tier: 2, cost: 0, speed: 1, color: 0, description: 'Deal 10', effects: [{ kind: 'damage', amount: 10 }] });
const poison = makeCard({ id: 'poison', name: 'Poison Dagger', type: 'status', tier: 2, cost: 0, speed: 6, color: 0, description: 'Poison', effects: [{ kind: 'damage', amount: 3 }, { kind: 'status', status: 'poison', amount: 2, duration: 3 }] });

describe('resolveRound', () => {
  test('higher speed resolves first and skips the slower action if lethal', () => {
    const result = resolveRound({
      player: { id: 'player', name: 'Player', hp: 10, maxHp: 10, armor: 0, statuses: [] },
      enemy: { id: 'enemy', name: 'Enemy', hp: 4, maxHp: 4, armor: 0, statuses: [] },
      playerAction: { actor: 'player', kind: 'card', card: quick },
      enemyAction: { actor: 'enemy', kind: 'card', card: slow },
    });

    expect(result.enemy.hp).toBe(0);
    expect(result.player.hp).toBe(10);
    expect(result.log).toContain('Player uses Quick Jab');
    expect(result.log).not.toContain('Enemy uses Heavy Strike');
  });

  test('poison ticks at the start of the next round and expires by duration', () => {
    const applied = resolveRound({
      player: { id: 'player', name: 'Player', hp: 20, maxHp: 20, armor: 0, statuses: [] },
      enemy: { id: 'enemy', name: 'Enemy', hp: 20, maxHp: 20, armor: 0, statuses: [] },
      playerAction: { actor: 'player', kind: 'card', card: poison },
      enemyAction: { actor: 'enemy', kind: 'card', card: strike },
    });

    expect(applied.enemy.statuses).toEqual([{ type: 'poison', amount: 2, remainingTurns: 3 }]);

    const ticked = resolveRound({
      player: applied.player,
      enemy: applied.enemy,
      playerAction: { actor: 'player', kind: 'card', card: strike },
      enemyAction: { actor: 'enemy', kind: 'card', card: strike },
    });

    expect(ticked.enemy.hp).toBe(9);
    expect(ticked.enemy.statuses).toEqual([{ type: 'poison', amount: 2, remainingTurns: 2 }]);
  });

  test('combat items can skip enemy attacks', () => {
    const result = resolveRound({
      player: { id: 'player', name: 'Player', hp: 10, maxHp: 10, armor: 0, statuses: [] },
      enemy: { id: 'enemy', name: 'Enemy', hp: 10, maxHp: 10, armor: 0, statuses: [] },
      playerAction: { actor: 'player', kind: 'item', item: makeItem('smoke_bomb') },
      enemyAction: { actor: 'enemy', kind: 'card', card: slow },
    });

    expect(result.player.hp).toBe(10);
    expect(result.log).toContain('Player uses Smoke Bomb');
    expect(result.log).toContain('Enemy attack is skipped');
  });
});
