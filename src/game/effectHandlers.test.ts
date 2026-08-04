import { describe, expect, test } from 'vitest';
import { CARD_DEFS, type Card } from '../data/cards';
import type { MutableCombatant } from './combat';
import {
  type EffectContext,
  curseCardDef,
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

function context(
  overrides: {
    actor?: MutableCombatant;
    target?: MutableCombatant;
    shuffleIntoDrawPile?: EffectContext['shuffleIntoDrawPile'];
  } = {},
): {
  ctx: EffectContext;
} {
  return {
    ctx: {
      actor: overrides.actor ?? combatant({ id: 'actor', name: 'Actor' }),
      target: overrides.target ?? combatant({ id: 'target', name: 'Target' }),
      log: [],
      shuffleIntoDrawPile: overrides.shuffleIntoDrawPile,
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

describe('shuffleCurse (U5, hexer elite plumbing)', () => {
  test('shuffles a curse card into the pile via the hook, once per amount', () => {
    const shuffled: Card[] = [];
    const { ctx } = context({ shuffleIntoDrawPile: (card) => shuffled.push(card) });
    dispatchEffect({ kind: 'shuffleCurse', amount: 1 }, ctx);
    expect(shuffled).toHaveLength(1);
    expect(shuffled[0].name).toBe('Festering Curse');
    expect(shuffled[0].uid).toBeGreaterThan(0);
    expect(ctx.log).toContain('Target feels a curse slip into their deck');
  });

  test('a fresh Card is minted per shuffled curse (distinct uids for amount > 1)', () => {
    const shuffled: Card[] = [];
    const { ctx } = context({ shuffleIntoDrawPile: (card) => shuffled.push(card) });
    dispatchEffect({ kind: 'shuffleCurse', amount: 2 }, ctx);
    expect(shuffled).toHaveLength(2);
    expect(shuffled[0].uid).not.toBe(shuffled[1].uid);
  });

  test('no-ops gracefully when the hook is absent (round-based resolver has no piles)', () => {
    const { ctx } = context();
    expect(() => dispatchEffect({ kind: 'shuffleCurse', amount: 1 }, ctx)).not.toThrow();
    expect(ctx.log).toHaveLength(0);
  });

  test('the leaden variant costs more of the turn than the default curse', () => {
    const shuffled: Card[] = [];
    const { ctx } = context({ shuffleIntoDrawPile: (card) => shuffled.push(card) });
    dispatchEffect({ kind: 'shuffleCurse', amount: 1, curse: 'leaden' }, ctx);
    expect(shuffled).toHaveLength(1);
    expect(shuffled[0].name).toBe('Leaden Curse');
    expect(shuffled[0].cost).toBeGreaterThan(curseCardDef('festering').cost);
  });

  test('no curse def can leak into a reward pool', () => {
    // Curses must never be draftable. They live outside CARD_DEFS by construction; this
    // pins that so adding a variant cannot quietly make one offerable.
    for (const curse of ['festering', 'leaden'] as const) {
      const def = curseCardDef(curse);
      expect(def.effects).toHaveLength(0);
      expect(CARD_DEFS.some((c) => c.id === def.id)).toBe(false);
    }
  });

  test('no-ops when amount is zero or missing, even with the hook present', () => {
    const shuffled: Card[] = [];
    const { ctx } = context({ shuffleIntoDrawPile: (card) => shuffled.push(card) });
    dispatchEffect({ kind: 'shuffleCurse', amount: 0 }, ctx);
    dispatchEffect({ kind: 'shuffleCurse' }, ctx);
    expect(shuffled).toHaveLength(0);
  });
});

describe('effect registry regression: unregistered kinds still throw (U5 sanity check)', () => {
  test('shuffleCurse is registered by default (built-in, not test-registered)', () => {
    expect(hasEffectHandler('shuffleCurse')).toBe(true);
  });

  test('an unrelated unregistered kind still throws', () => {
    const { ctx } = context();
    expect(() => dispatchEffect({ kind: 'still_unregistered' }, ctx)).toThrow(/no effect handler/);
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
