import { describe, expect, test } from 'vitest';
import { CARD_DEFS } from '../data/cards';
import { tierBorder } from './cardTier';

describe('tierBorder', () => {
  test('every tier gets a distinct colour', () => {
    const colors = [1, 2, 3].map((tier) => tierBorder(tier).color);
    expect(new Set(colors).size).toBe(3);
  });

  test('tiers stay distinguishable without colour', () => {
    // Colour alone fails in a dim palette, at hand-fan scale, and for colour-blind players.
    // Each tier must differ from its neighbour on at least one non-colour cue.
    const cue = (tier: number) => {
      const { width, doubleFrame } = tierBorder(tier);
      return `${width}/${doubleFrame}`;
    };
    expect(cue(1)).not.toBe(cue(2));
    expect(cue(2)).not.toBe(cue(3));
    expect(cue(1)).not.toBe(cue(3));
  });

  test('the top tier carries the strongest, most redundant treatment', () => {
    expect(tierBorder(3).doubleFrame).toBe(true);
    expect(tierBorder(1).doubleFrame).toBe(false);
    expect(tierBorder(3).width).toBeGreaterThanOrEqual(tierBorder(1).width);
  });

  test('borders never get thinner as tier rises', () => {
    expect(tierBorder(2).width).toBeGreaterThanOrEqual(tierBorder(1).width);
    expect(tierBorder(3).width).toBeGreaterThanOrEqual(tierBorder(2).width);
  });

  test('every authored card resolves to a real border', () => {
    for (const def of CARD_DEFS) {
      const border = tierBorder(def.tier);
      expect(border.width, `${def.id} border width`).toBeGreaterThan(0);
    }
  });

  test('an out-of-range tier falls back rather than rendering nothing', () => {
    expect(tierBorder(0)).toEqual(tierBorder(1));
    expect(tierBorder(9)).toEqual(tierBorder(1));
  });
});
