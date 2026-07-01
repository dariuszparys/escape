import { describe, expect, test } from 'vitest';
import type { MutableCombatant } from './combat';
import {
  type EffectContext,
  dispatchEffect,
  hasEffectHandler,
  registerEffectHandler,
} from './effectHandlers';

function combatant(overrides: Partial<MutableCombatant> = {}): MutableCombatant {
  return {
    id: 'c',
    name: 'C',
    hp: 20,
    maxHp: 20,
    armor: 0,
    statuses: [],
    roundBlock: 0,
    ...overrides,
  };
}

function context(overrides: { actor?: MutableCombatant; target?: MutableCombatant } = {}): {
  ctx: EffectContext;
} {
  return {
    ctx: {
      actor: overrides.actor ?? combatant({ id: 'actor', name: 'Actor' }),
      target: overrides.target ?? combatant({ id: 'target', name: 'Target' }),
      log: [],
    },
  };
}

describe('built-in effect handlers', () => {
  test('block accumulates round block on the actor', () => {
    const { ctx } = context();
    dispatchEffect({ kind: 'block', amount: 7 }, ctx);
    expect(ctx.actor.roundBlock).toBe(7);
    expect(ctx.log).toContain('Actor gains 7 block');
  });

  test('heal restores the actor but caps at maxHp and reports the gross amount', () => {
    const actor = combatant({ id: 'actor', name: 'Actor', hp: 18, maxHp: 20 });
    const { ctx } = context({ actor });
    dispatchEffect({ kind: 'heal', amount: 5 }, ctx);
    expect(ctx.actor.hp).toBe(20);
    expect(ctx.log).toContain('Actor heals 2 HP');
  });

  test('damage is reduced by the target armor plus this round block', () => {
    const target = combatant({ id: 'target', name: 'Target', hp: 20, armor: 2, roundBlock: 3 });
    const { ctx } = context({ target });
    dispatchEffect({ kind: 'damage', amount: 10 }, ctx);
    expect(ctx.target.hp).toBe(15); // 10 - (2 + 3) = 5 dealt
    expect(ctx.log).toContain('Target takes 5 damage');
  });

  test('fully absorbed damage logs a block instead of a hit', () => {
    const target = combatant({ id: 'target', name: 'Target', hp: 20, armor: 12 });
    const { ctx } = context({ target });
    dispatchEffect({ kind: 'damage', amount: 4 }, ctx);
    expect(ctx.target.hp).toBe(20);
    expect(ctx.log).toContain('Target blocks the hit');
  });

  test('status applies and then refreshes to the stronger amount/duration', () => {
    const target = combatant({ id: 'target', name: 'Target' });
    const { ctx } = context({ target });
    dispatchEffect({ kind: 'status', status: 'poison', amount: 2, duration: 2 }, ctx);
    dispatchEffect({ kind: 'status', status: 'poison', amount: 3, duration: 1 }, ctx);
    expect(ctx.target.statuses).toEqual([{ type: 'poison', amount: 3, remainingTurns: 2 }]);
  });
});

describe('effect registry', () => {
  test('dispatching an unregistered kind throws (fail-fast, per Assumptions)', () => {
    const { ctx } = context();
    expect(() => dispatchEffect({ kind: 'no_such_kind' }, ctx)).toThrow(/no effect handler/);
  });

  test('registerEffectHandler opens a new kind and its disposer closes it again', () => {
    const { ctx } = context();
    expect(hasEffectHandler('custom_burn_actor')).toBe(false);

    const dispose = registerEffectHandler('custom_burn_actor', (effect, c) => {
      c.actor.hp -= effect.amount ?? 0;
    });
    expect(hasEffectHandler('custom_burn_actor')).toBe(true);
    dispatchEffect({ kind: 'custom_burn_actor', amount: 3 }, ctx);
    expect(ctx.actor.hp).toBe(17);

    dispose();
    expect(hasEffectHandler('custom_burn_actor')).toBe(false);
    expect(() => dispatchEffect({ kind: 'custom_burn_actor', amount: 3 }, ctx)).toThrow();
  });
});
