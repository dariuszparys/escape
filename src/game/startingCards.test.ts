import { describe, expect, test } from 'vitest';
import { startingCardIdsForChoiceCount } from './startingCards';

describe('startingCardIdsForChoiceCount', () => {
  test('defaults to the current two-card offer', () => {
    expect(startingCardIdsForChoiceCount(2)).toEqual(['slash', 'guard']);
  });

  test('adds quick jab as the third temporary-prep choice', () => {
    expect(startingCardIdsForChoiceCount(3)).toEqual(['slash', 'guard', 'quick_jab']);
  });

  test('clamps invalid counts to the supported range', () => {
    expect(startingCardIdsForChoiceCount(0)).toEqual(['slash', 'guard']);
    expect(startingCardIdsForChoiceCount(Number.NaN)).toEqual(['slash', 'guard']);
    expect(startingCardIdsForChoiceCount(99)).toEqual(['slash', 'guard', 'quick_jab']);
  });
});
