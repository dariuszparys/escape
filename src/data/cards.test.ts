import { describe, expect, test } from 'vitest';
import { CARD_DEFS, randomCard } from './cards';
import { SequenceRng } from '../game/test-rng';

describe('randomCard deep-stratum tier weights', () => {
  // pickWeighted consumes one frac to choose the tier, then rng.pick consumes a
  // second frac to choose within the tier pool. A frac of 0 on the second pick
  // deterministically selects the first card of the chosen tier.

  test('tier odds keep shifting toward tier 3 past depth 9 instead of freezing', () => {
    // r = 0.35 * 10 = 3.5. In stratum 2 weights [0,4,6] that lands in tier 2;
    // in stratum 3 weights [0,3,7] the same roll lands in tier 3.
    const stratum2 = randomCard(new SequenceRng([0.35, 0]), 15).tier;
    const stratum3 = randomCard(new SequenceRng([0.35, 0]), 25).tier;

    expect(stratum2).toBe(2);
    expect(stratum3).toBe(3);
  });

  test('depth 10 keeps the depth-9 baseline ([0,5,5]) so the base run is unchanged', () => {
    // r = 0.45 * 10 = 4.5 → tier 2 boundary at 5, so tier 2 for [0,5,5].
    expect(randomCard(new SequenceRng([0.45, 0]), 10).tier).toBe(2);
    // r = 0.55 * 10 = 5.5 → past the tier-2 boundary, so tier 3.
    expect(randomCard(new SequenceRng([0.55, 0]), 10).tier).toBe(3);
  });

  test('deep tiers never produce tier-1 cards', () => {
    for (const depth of [12, 22, 42, 99]) {
      for (const roll of [0, 0.1, 0.5, 0.9, 0.99]) {
        expect(randomCard(new SequenceRng([roll, 0]), depth).tier).not.toBe(1);
      }
    }
  });

  test('tier selection is deterministic for a fixed seed and depth', () => {
    const a = randomCard(new SequenceRng([0.42, 0.3]), 33);
    const b = randomCard(new SequenceRng([0.42, 0.3]), 33);
    expect(a.tier).toBe(b.tier);
    expect(a.id).toBe(b.id);
  });
});

describe('card costs (U8, R2/R6)', () => {
  test('every def carries an explicit cost within the legal range', () => {
    for (const def of CARD_DEFS) {
      expect(def.cost, `${def.id} must have an authored cost`).toBeDefined();
      expect(def.cost).toBeGreaterThanOrEqual(0);
      expect(def.cost).toBeLessThanOrEqual(3);
    }
  });

  test('higher tiers never cost less than a zero-cost trick would suggest', () => {
    // Structural sanity, not tuning: tier 1 stays 0-1, tiers 2-3 stay 1-2.
    for (const def of CARD_DEFS) {
      if (def.tier === 1) expect(def.cost).toBeLessThanOrEqual(1);
      else expect(def.cost).toBeGreaterThanOrEqual(1);
    }
  });
});
