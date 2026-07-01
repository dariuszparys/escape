import { describe, expect, test } from 'vitest';
import { MATCHUP_BONUS_DAMAGE } from '../config';
import { CardEffect, makeCard } from '../data/cards';
import { makeItem } from '../data/items';
import { matchupPayoffForAction, resolveRound } from './combat';
import { registerEffectHandler } from './effectHandlers';

const strike = makeCard({
  id: 'strike',
  name: 'Strike',
  type: 'attack',
  tier: 1,
  speed: 5,
  color: 0,
  description: 'Deal 6',
  effects: [{ kind: 'damage', amount: 6 }],
});
const quick = makeCard({
  id: 'quick',
  name: 'Quick Jab',
  type: 'attack',
  tier: 1,
  speed: 8,
  color: 0,
  description: 'Deal 4',
  effects: [{ kind: 'damage', amount: 4 }],
});
const guard = makeCard({
  id: 'guard',
  name: 'Guard',
  type: 'block',
  tier: 1,
  speed: 6,
  color: 0,
  description: 'Gain 7 block',
  effects: [{ kind: 'block', amount: 7 }],
});
const slow = makeCard({
  id: 'slow',
  name: 'Heavy Strike',
  type: 'attack',
  tier: 2,
  speed: 1,
  color: 0,
  description: 'Deal 10',
  effects: [{ kind: 'damage', amount: 10 }],
});
const poison = makeCard({
  id: 'poison',
  name: 'Poison Dagger',
  type: 'status',
  tier: 2,
  speed: 6,
  color: 0,
  description: 'Poison',
  effects: [
    { kind: 'damage', amount: 3 },
    { kind: 'status', status: 'poison', amount: 2, duration: 3 },
  ],
});
const heal = makeCard({
  id: 'heal',
  name: 'Minor Heal',
  type: 'heal',
  tier: 1,
  speed: 4,
  color: 0,
  description: 'Restore 5',
  effects: [{ kind: 'heal', amount: 5 }],
});
const vampiricStrike = makeCard({
  id: 'vampiric-strike',
  name: 'Vampiric Strike',
  type: 'utility',
  tier: 2,
  speed: 5,
  color: 0,
  description: 'Deal 4 and heal 5',
  effects: [
    { kind: 'damage', amount: 4 },
    { kind: 'heal', amount: 5 },
  ],
});
const shieldBash = makeCard({
  id: 'shield-bash',
  name: 'Shield Bash',
  type: 'utility',
  tier: 2,
  speed: 6,
  color: 0,
  description: 'Deal 3, gain 4 block',
  effects: [
    { kind: 'damage', amount: 3 },
    { kind: 'block', amount: 4 },
  ],
});
const lowBlock = makeCard({
  id: 'low-block',
  name: 'Low Block',
  type: 'block',
  tier: 1,
  speed: 8,
  color: 0,
  description: 'Gain 1 block',
  effects: [{ kind: 'block', amount: 1 }],
});

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
    expect(applied.log).toContain('Enemy is poisoned (2 for 3 rounds)');

    const ticked = resolveRound({
      player: applied.player,
      enemy: applied.enemy,
      playerAction: { actor: 'player', kind: 'card', card: strike },
      enemyAction: { actor: 'enemy', kind: 'card', card: strike },
    });

    expect(ticked.enemy.hp).toBe(9);
    expect(ticked.enemy.statuses).toEqual([{ type: 'poison', amount: 2, remainingTurns: 2 }]);
    expect(ticked.log[0]).toBe('Enemy takes 2 poison damage');
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

  test('player heal cards restore player health without healing the enemy', () => {
    const result = resolveRound({
      player: { id: 'player', name: 'Player', hp: 10, maxHp: 20, armor: 0, statuses: [] },
      enemy: { id: 'enemy', name: 'Enemy', hp: 12, maxHp: 20, armor: 0, statuses: [] },
      playerAction: { actor: 'player', kind: 'card', card: heal },
      enemyAction: { actor: 'enemy', kind: 'none' },
    });

    expect(result.player.hp).toBe(15);
    expect(result.enemy.hp).toBe(12);
  });

  test('player mixed damage and heal cards damage the enemy and heal the player', () => {
    const result = resolveRound({
      player: { id: 'player', name: 'Player', hp: 10, maxHp: 20, armor: 0, statuses: [] },
      enemy: { id: 'enemy', name: 'Enemy', hp: 20, maxHp: 20, armor: 0, statuses: [] },
      playerAction: { actor: 'player', kind: 'card', card: vampiricStrike },
      enemyAction: { actor: 'enemy', kind: 'none' },
    });

    expect(result.player.hp).toBe(15);
    expect(result.enemy.hp).toBe(16);
  });

  test('enemy mixed damage and heal cards damage the player and heal the enemy', () => {
    const result = resolveRound({
      player: { id: 'player', name: 'Player', hp: 20, maxHp: 20, armor: 0, statuses: [] },
      enemy: { id: 'enemy', name: 'Enemy', hp: 10, maxHp: 20, armor: 0, statuses: [] },
      playerAction: { actor: 'player', kind: 'none' },
      enemyAction: { actor: 'enemy', kind: 'card', card: vampiricStrike },
    });

    expect(result.player.hp).toBe(16);
    expect(result.enemy.hp).toBe(15);
  });

  test('player block and damage cards damage the enemy and reduce incoming damage', () => {
    const result = resolveRound({
      player: { id: 'player', name: 'Player', hp: 20, maxHp: 20, armor: 0, statuses: [] },
      enemy: { id: 'enemy', name: 'Enemy', hp: 20, maxHp: 20, armor: 0, statuses: [] },
      playerAction: { actor: 'player', kind: 'card', card: shieldBash },
      enemyAction: { actor: 'enemy', kind: 'card', card: slow },
    });

    expect(result.player.hp).toBe(14);
    expect(result.enemy.hp).toBe(17);
  });

  test('punch uses the configured base damage', () => {
    const result = resolveRound({
      player: { id: 'player', name: 'Player', hp: 20, maxHp: 20, armor: 0, statuses: [] },
      enemy: { id: 'enemy', name: 'Enemy', hp: 10, maxHp: 10, armor: 0, statuses: [] },
      playerAction: { actor: 'player', kind: 'punch' },
      enemyAction: { actor: 'enemy', kind: 'none' },
    });

    expect(result.enemy.hp).toBe(7);
    expect(result.log).toContain('Enemy takes 3 damage');
  });

  test('gross player heal is reported even when enemy damage cancels it out', () => {
    const result = resolveRound({
      player: { id: 'player', name: 'Player', hp: 10, maxHp: 20, armor: 0, statuses: [] },
      enemy: { id: 'enemy', name: 'Enemy', hp: 20, maxHp: 20, armor: 0, statuses: [] },
      playerAction: { actor: 'player', kind: 'card', card: heal },
      enemyAction: { actor: 'enemy', kind: 'card', card: strike },
    });

    expect(result.player.hp).toBe(9);
    expect(result.playerHpChange).toEqual({ damage: 6, heal: 5 });
  });

  test('gross enemy damage and heal are both reported for mixed cards', () => {
    const result = resolveRound({
      player: { id: 'player', name: 'Player', hp: 20, maxHp: 20, armor: 0, statuses: [] },
      enemy: { id: 'enemy', name: 'Enemy', hp: 10, maxHp: 20, armor: 0, statuses: [] },
      playerAction: { actor: 'player', kind: 'none' },
      enemyAction: { actor: 'enemy', kind: 'card', card: vampiricStrike },
    });

    expect(result.playerHpChange).toEqual({ damage: 4, heal: 0 });
    expect(result.enemyHpChange).toEqual({ damage: 0, heal: 5 });
  });

  test('poison tick damage is included in gross damage', () => {
    const poisoned = resolveRound({
      player: { id: 'player', name: 'Player', hp: 20, maxHp: 20, armor: 0, statuses: [] },
      enemy: { id: 'enemy', name: 'Enemy', hp: 20, maxHp: 20, armor: 0, statuses: [] },
      playerAction: { actor: 'player', kind: 'card', card: poison },
      enemyAction: { actor: 'enemy', kind: 'none' },
    });

    const ticked = resolveRound({
      player: poisoned.player,
      enemy: poisoned.enemy,
      playerAction: { actor: 'player', kind: 'none' },
      enemyAction: { actor: 'enemy', kind: 'none' },
    });

    expect(ticked.enemyHpChange.damage).toBe(2);
  });

  test('stunned player action is replaced with none and stun is consumed', () => {
    const result = resolveRound({
      player: {
        id: 'player',
        name: 'Player',
        hp: 20,
        maxHp: 20,
        armor: 0,
        statuses: [{ type: 'stun', amount: 1, remainingTurns: 1 }],
      },
      enemy: { id: 'enemy', name: 'Enemy', hp: 20, maxHp: 20, armor: 0, statuses: [] },
      playerAction: { actor: 'player', kind: 'card', card: strike },
      enemyAction: { actor: 'enemy', kind: 'card', card: slow },
    });

    expect(result.player.hp).toBe(10);
    expect(result.enemy.hp).toBe(20);
    expect(result.log).toContain('Player is stunned');
    expect(result.player.statuses).toEqual([]);
  });
});

describe('resolveRound open resolution seam (U2)', () => {
  const cinderHex = makeCard({
    id: 'cinder-hex',
    name: 'Cinder Hex',
    type: 'status',
    tier: 1,
    speed: 9,
    color: 0,
    description: 'Deal 2, burn 2 for 2',
    effects: [
      { kind: 'damage', amount: 2 },
      { kind: 'status', status: 'burn', amount: 2, duration: 2 },
    ],
  });

  test('a multi-effect card applies each effect in authored order through the registry', () => {
    const result = resolveRound({
      player: { id: 'player', name: 'Player', hp: 20, maxHp: 20, armor: 0, statuses: [] },
      enemy: { id: 'enemy', name: 'Enemy', hp: 20, maxHp: 20, armor: 0, statuses: [] },
      playerAction: { actor: 'player', kind: 'card', card: cinderHex },
      enemyAction: { actor: 'enemy', kind: 'none' },
    });

    expect(result.enemy.hp).toBe(18);
    expect(result.enemy.statuses).toEqual([{ type: 'burn', amount: 2, remainingTurns: 2 }]);
  });

  test('a custom effect kind resolves after registration alone — no applyAction edit (R1)', () => {
    const dispose = registerEffectHandler('siphon', (effect, { actor, target, log }) => {
      const amount = effect.amount ?? 0;
      target.hp = Math.max(0, target.hp - amount);
      actor.hp = Math.min(actor.maxHp, actor.hp + amount);
      log.push(`${actor.name} siphons ${amount}`);
    });

    try {
      const siphon = { kind: 'siphon', amount: 4 } as unknown as CardEffect;
      const result = resolveRound({
        player: { id: 'player', name: 'Player', hp: 10, maxHp: 20, armor: 0, statuses: [] },
        enemy: { id: 'enemy', name: 'Enemy', hp: 20, maxHp: 20, armor: 0, statuses: [] },
        playerAction: {
          actor: 'player',
          kind: 'special',
          name: 'Siphon',
          speed: 9,
          effects: [siphon],
        },
        enemyAction: { actor: 'enemy', kind: 'none' },
      });

      expect(result.enemy.hp).toBe(16);
      expect(result.player.hp).toBe(14);
      expect(result.log).toContain('Player siphons 4');
    } finally {
      dispose();
    }
  });

  test('an unregistered effect kind reaching the resolver throws (fail-fast)', () => {
    const bogus = { kind: 'unregistered_verb', amount: 1 } as unknown as CardEffect;
    expect(() =>
      resolveRound({
        player: { id: 'player', name: 'Player', hp: 20, maxHp: 20, armor: 0, statuses: [] },
        enemy: { id: 'enemy', name: 'Enemy', hp: 20, maxHp: 20, armor: 0, statuses: [] },
        playerAction: {
          actor: 'player',
          kind: 'special',
          name: 'Bogus',
          speed: 9,
          effects: [bogus],
        },
        enemyAction: { actor: 'enemy', kind: 'none' },
      }),
    ).toThrow(/no effect handler/);
  });
});

describe('resolveRound family matchup payoff', () => {
  test('omitting payoff data preserves existing resolution even for winning families', () => {
    const result = resolveRound({
      player: { id: 'player', name: 'Player', hp: 20, maxHp: 20, armor: 0, statuses: [] },
      enemy: { id: 'enemy', name: 'Enemy', hp: 20, maxHp: 20, armor: 0, statuses: [] },
      playerAction: { actor: 'player', kind: 'card', card: guard },
      enemyAction: { actor: 'enemy', kind: 'card', card: slow },
    });

    expect(result.enemy.hp).toBe(20);
    expect(result.enemyHpChange.damage).toBe(0);
    expect(result.log).not.toContain(
      `Player exploits the read for ${MATCHUP_BONUS_DAMAGE} bonus damage`,
    );
  });

  test('defense beating an attack intent awards player-only bonus damage', () => {
    const playerAction = { actor: 'player' as const, kind: 'card' as const, card: guard };
    const payoff = matchupPayoffForAction(playerAction, 'attack');
    const result = resolveRound({
      player: { id: 'player', name: 'Player', hp: 20, maxHp: 20, armor: 0, statuses: [] },
      enemy: { id: 'enemy', name: 'Enemy', hp: 20, maxHp: 20, armor: 0, statuses: [] },
      playerAction,
      enemyAction: { actor: 'enemy', kind: 'card', card: slow },
      playerMatchupPayoff: payoff,
    });

    expect(payoff).toMatchObject({
      damage: MATCHUP_BONUS_DAMAGE,
      outcome: 'win',
      playerFamily: 'block',
      enemyFamily: 'attack',
    });
    expect(result.enemy.hp).toBe(20 - MATCHUP_BONUS_DAMAGE);
    expect(result.enemyHpChange.damage).toBe(MATCHUP_BONUS_DAMAGE);
    expect(result.log).toContain(
      `Player exploits the read for ${MATCHUP_BONUS_DAMAGE} bonus damage`,
    );
    expect(result.log).toContain(`Enemy takes ${MATCHUP_BONUS_DAMAGE} damage`);
  });

  test('losing, tied, mixed, and special matchups do not create payoff data', () => {
    expect(
      matchupPayoffForAction({ actor: 'player', kind: 'card', card: quick }, 'block'),
    ).toBeNull();
    expect(
      matchupPayoffForAction({ actor: 'player', kind: 'card', card: quick }, 'attack'),
    ).toBeNull();
    expect(
      matchupPayoffForAction({ actor: 'player', kind: 'card', card: shieldBash }, 'attack'),
    ).toBeNull();
    expect(
      matchupPayoffForAction({ actor: 'player', kind: 'card', card: guard }, 'special'),
    ).toBeNull();
  });

  test('enemy never receives a mirror bonus from a winning family', () => {
    const result = resolveRound({
      player: { id: 'player', name: 'Player', hp: 20, maxHp: 20, armor: 0, statuses: [] },
      enemy: { id: 'enemy', name: 'Enemy', hp: 20, maxHp: 20, armor: 0, statuses: [] },
      playerAction: { actor: 'player', kind: 'card', card: quick },
      enemyAction: { actor: 'enemy', kind: 'card', card: guard },
      playerMatchupPayoff: matchupPayoffForAction(
        { actor: 'player', kind: 'card', card: quick },
        'block',
      ),
    });

    expect(result.player.hp).toBe(20);
    expect(result.enemy.hp).toBe(16);
    expect(result.log.some((line) => line.includes('exploits the read'))).toBe(false);
  });

  test('stunned player action does not receive a provided payoff', () => {
    const result = resolveRound({
      player: {
        id: 'player',
        name: 'Player',
        hp: 20,
        maxHp: 20,
        armor: 0,
        statuses: [{ type: 'stun', amount: 1, remainingTurns: 1 }],
      },
      enemy: { id: 'enemy', name: 'Enemy', hp: 20, maxHp: 20, armor: 0, statuses: [] },
      playerAction: { actor: 'player', kind: 'card', card: guard },
      enemyAction: { actor: 'enemy', kind: 'card', card: slow },
      playerMatchupPayoff: {
        damage: MATCHUP_BONUS_DAMAGE,
        outcome: 'win',
        playerFamily: 'block',
        enemyFamily: 'attack',
      },
    });

    expect(result.enemy.hp).toBe(20);
    expect(result.log).toContain('Player is stunned');
    expect(result.log.some((line) => line.includes('exploits the read'))).toBe(false);
  });

  test('bonus damage is reduced by existing armor and round block', () => {
    const playerAction = { actor: 'player' as const, kind: 'card' as const, card: heal };
    const result = resolveRound({
      player: { id: 'player', name: 'Player', hp: 18, maxHp: 20, armor: 0, statuses: [] },
      enemy: { id: 'enemy', name: 'Enemy', hp: 20, maxHp: 20, armor: 1, statuses: [] },
      playerAction,
      enemyAction: { actor: 'enemy', kind: 'card', card: lowBlock },
      playerMatchupPayoff: matchupPayoffForAction(playerAction, 'block'),
    });

    expect(result.player.hp).toBe(20);
    expect(result.enemy.hp).toBe(19);
    expect(result.enemyHpChange.damage).toBe(1);
    expect(result.log).toContain('Enemy gains 1 block');
    expect(result.log).toContain('Enemy takes 1 damage');
  });
});
