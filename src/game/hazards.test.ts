import { describe, expect, test } from 'vitest';
import { applyTrapDamage } from './hazards';

describe('applyTrapDamage', () => {
  test('deals normal trap damage without killing', () => {
    const run = { hp: 10 };

    expect(applyTrapDamage(run)).toEqual({
      amount: 3,
      hpBefore: 10,
      hpAfter: 7,
      died: false,
    });
    expect(run.hp).toBe(7);
  });

  test('reports death when the hit is lethal', () => {
    const run = { hp: 3 };

    expect(applyTrapDamage(run)).toEqual({
      amount: 3,
      hpBefore: 3,
      hpAfter: 0,
      died: true,
    });
    expect(run.hp).toBe(0);
  });

  test('clamps overkill damage at zero instead of going negative', () => {
    const run = { hp: 1 };

    expect(applyTrapDamage(run)).toEqual({
      amount: 3,
      hpBefore: 1,
      hpAfter: 0,
      died: true,
    });
    expect(run.hp).toBe(0);
  });
});
