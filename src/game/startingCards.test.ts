import { describe, expect, test } from 'vitest';
import { startingCardIdsForChoiceCount } from './startingCards';

describe('startingCardIdsForChoiceCount', () => {
  test('defaults to the three-card opening offer', () => {
    expect(startingCardIdsForChoiceCount(3)).toEqual(['slash', 'guard', 'quick_jab']);
  });

  test('adds a fourth support option for the prep upgrade', () => {
    expect(startingCardIdsForChoiceCount(4)).toEqual(['slash', 'guard', 'quick_jab', 'minor_heal']);
  });

  test('clamps invalid counts to the supported range', () => {
    expect(startingCardIdsForChoiceCount(0)).toEqual(['slash', 'guard', 'quick_jab']);
    expect(startingCardIdsForChoiceCount(Number.NaN)).toEqual(['slash', 'guard', 'quick_jab']);
    expect(startingCardIdsForChoiceCount(99)).toEqual(['slash', 'guard', 'quick_jab', 'minor_heal']);
  });
});
