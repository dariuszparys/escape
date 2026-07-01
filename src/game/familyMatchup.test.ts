import { describe, expect, test } from 'vitest';
import type { CardEffect } from '../data/cards';
import {
  counterRoleFor,
  familyForEffects,
  matchupResult,
  roleBeats,
  roleForFamily,
} from './familyMatchup';

function family(effects: readonly CardEffect[]) {
  return familyForEffects(effects);
}

describe('family matchup classification', () => {
  test('maps pure action families to matchup roles', () => {
    expect(family([{ kind: 'damage', amount: 5 }])).toBe('attack');
    expect(roleForFamily('attack')).toBe('aggression');

    expect(family([{ kind: 'block', amount: 7 }])).toBe('block');
    expect(roleForFamily('block')).toBe('defense');

    expect(family([{ kind: 'status', status: 'poison', amount: 2, duration: 2 }])).toBe('status');
    expect(roleForFamily('status')).toBe('disruption');

    expect(family([{ kind: 'heal', amount: 5 }])).toBe('heal');
    expect(roleForFamily('heal')).toBe('disruption');
  });

  test('keeps mixed and special families neutral', () => {
    expect(
      family([
        { kind: 'damage', amount: 3 },
        { kind: 'block', amount: 4 },
      ]),
    ).toBe('mixed');
    expect(
      family([
        { kind: 'damage', amount: 3 },
        { kind: 'status', status: 'poison', amount: 2, duration: 2 },
      ]),
    ).toBe('mixed');
    expect(
      family([
        { kind: 'block', amount: 4 },
        { kind: 'heal', amount: 2 },
      ]),
    ).toBe('mixed');

    expect(roleForFamily('mixed')).toBeNull();
    expect(roleForFamily('special')).toBeNull();
    expect(matchupResult('block', 'mixed').outcome).toBe('neutral');
    expect(matchupResult('block', 'special').outcome).toBe('neutral');
  });

  test('role wheel is directional and non-reflexive', () => {
    expect(counterRoleFor('aggression')).toBe('defense');
    expect(counterRoleFor('defense')).toBe('disruption');
    expect(counterRoleFor('disruption')).toBe('aggression');

    expect(roleBeats('defense', 'aggression')).toBe(true);
    expect(roleBeats('aggression', 'disruption')).toBe(true);
    expect(roleBeats('disruption', 'defense')).toBe(true);

    expect(roleBeats('aggression', 'aggression')).toBe(false);
    expect(matchupResult('block', 'attack').outcome).toBe('win');
    expect(matchupResult('attack', 'block').outcome).toBe('lose');
    expect(matchupResult('attack', 'attack').outcome).toBe('tie');
  });
});
