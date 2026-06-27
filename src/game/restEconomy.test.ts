import { describe, expect, test } from 'vitest';
import { canUseRestAction, payRestAction } from './restEconomy';

describe('rest economy', () => {
  test('charges twelve gold for an upgrade action', () => {
    const run = {
      gold: 12,
      cardCollection: [{}],
    };

    expect(canUseRestAction(run, 'upgrade')).toEqual({ ok: true, cost: 12 });
    expect(payRestAction(run, 'upgrade')).toEqual({ ok: true, cost: 12 });
    expect(run.gold).toBe(0);
  });

  test('charges ten gold for a remove action', () => {
    const run = {
      gold: 10,
      cardCollection: [{}, {}],
    };

    expect(canUseRestAction(run, 'remove')).toEqual({ ok: true, cost: 10 });
    expect(payRestAction(run, 'remove')).toEqual({ ok: true, cost: 10 });
    expect(run.gold).toBe(0);
  });

  test('rejects unaffordable rest actions without charging', () => {
    const run = {
      gold: 9,
      cardCollection: [{}, {}],
    };

    expect(payRestAction(run, 'remove')).toEqual({
      ok: false,
      reason: 'Not enough Gold.',
    });
    expect(run.gold).toBe(9);
  });

  test('rejects removing the last card without charging', () => {
    const run = {
      gold: 99,
      cardCollection: [{}],
    };

    expect(payRestAction(run, 'remove')).toEqual({
      ok: false,
      reason: 'Cannot remove last card.',
    });
    expect(run.gold).toBe(99);
  });
});
