import { describe, expect, test } from 'vitest';
import { hpChange } from './combatFeedback';

describe('hpChange', () => {
  test('reports damage when health decreases', () => {
    expect(hpChange(18, 11)).toEqual({ damage: 7, heal: 0 });
  });

  test('reports healing when health increases', () => {
    expect(hpChange(10, 15)).toEqual({ damage: 0, heal: 5 });
  });

  test('reports no change when health is unchanged', () => {
    expect(hpChange(12, 12)).toEqual({ damage: 0, heal: 0 });
  });
});
