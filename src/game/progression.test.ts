import { describe, expect, test } from 'vitest';
import { createDefaultProgressionState, type MetaState } from '../meta';
import { createDefaultProfileState, xpForLevel, type ProfileState } from '../profile';
import {
  eligibleStartingRelics,
  formatArchetypeProgressionLine,
  formatArchetypeSelectionSummary,
  formatRelicProgressionLine,
  formatRelicProgressionSummary,
  formatStarterCardProgressionSummary,
  hasStarterCardVariety,
  isArchetypeUnlocked,
  isStartingRelicEligible,
  setActiveArchetype,
  setActiveStartingRelic,
  type ProgressionState,
} from './progression';

function profileAtLevel(
  level: number,
  discoveredRelicIds: ProfileState['discoveredRelicIds'] = [],
) {
  return {
    ...createDefaultProfileState(),
    xp: xpForLevel(level),
    discoveredRelicIds,
  };
}

function state(): ProgressionState {
  return {
    progression: createDefaultProgressionState(),
  };
}

describe('level-gated archetype selection', () => {
  test('fresh profiles start neutral-only', () => {
    const profile = profileAtLevel(1);

    expect(isArchetypeUnlocked(profile, 'barbarian')).toBe(false);
    expect(setActiveArchetype(state(), profile, 'barbarian')).toEqual({
      ok: false,
      reason: 'Archetype requires level 3.',
      state: state(),
    });
  });

  test('selects and clears an archetype once its level gate is met', () => {
    const selected = setActiveArchetype(state(), profileAtLevel(3), 'barbarian');

    expect(selected.ok).toBe(true);
    expect(selected.state.progression.activeArchetypeId).toBe('barbarian');

    const cleared = setActiveArchetype(selected.state, profileAtLevel(3), null);
    expect(cleared.ok).toBe(true);
    expect(cleared.state.progression.activeArchetypeId).toBeNull();
  });

  test('rejects an unknown archetype and leaves state untouched', () => {
    const base = state();
    expect(setActiveArchetype(base, profileAtLevel(20), 'necrolord' as never)).toEqual({
      ok: false,
      reason: 'Unknown archetype.',
      state: base,
    });
  });

  test('summaries reflect active and locked archetypes without currency copy', () => {
    const profile = profileAtLevel(3);
    const active = state();
    active.progression.activeArchetypeId = 'barbarian';

    expect(formatArchetypeSelectionSummary(state())).toContain('Archetype: none');
    expect(formatArchetypeSelectionSummary(active)).toContain('Barbarian');
    expect(formatArchetypeProgressionLine(active, profile, 'barbarian')).toContain('active');
    expect(formatArchetypeProgressionLine(state(), profileAtLevel(1), 'barbarian')).toContain(
      'locked - level 3',
    );
    expect(formatArchetypeProgressionLine(active, profile, 'barbarian')).not.toMatch(/Ember/);
  });
});

describe('starter card variety', () => {
  test('is unlocked by level rather than purchase', () => {
    expect(hasStarterCardVariety(profileAtLevel(3))).toBe(false);
    expect(hasStarterCardVariety(profileAtLevel(4))).toBe(true);
    expect(formatStarterCardProgressionSummary(profileAtLevel(4))).toContain(
      'Starter variety: unlocked',
    );
    expect(formatStarterCardProgressionSummary(profileAtLevel(1))).not.toMatch(/Ember|spend/i);
  });
});

describe('relic loadout access', () => {
  test('requires discovery, level eligibility, and a starting-relic slot', () => {
    expect(isStartingRelicEligible(profileAtLevel(1, ['swift_boots']), 'swift_boots')).toBe(false);
    expect(isStartingRelicEligible(profileAtLevel(2), 'swift_boots')).toBe(false);
    expect(isStartingRelicEligible(profileAtLevel(2, ['swift_boots']), 'swift_boots')).toBe(true);
    expect(isStartingRelicEligible(profileAtLevel(4, ['spark_coil']), 'spark_coil')).toBe(false);
    expect(isStartingRelicEligible(profileAtLevel(5, ['spark_coil']), 'spark_coil')).toBe(true);
    expect(isStartingRelicEligible(profileAtLevel(8, ['stone_heart']), 'stone_heart')).toBe(false);
  });

  test('lists only discovered and eligible starting relics', () => {
    const eligible = eligibleStartingRelics(profileAtLevel(5, ['swift_boots', 'spark_coil']));

    expect(eligible.map((relic) => relic.id)).toEqual(['swift_boots', 'spark_coil']);
  });

  test('selects and clears an eligible starting relic', () => {
    const selected = setActiveStartingRelic(
      state(),
      profileAtLevel(2, ['swift_boots']),
      'swift_boots',
    );

    expect(selected.ok).toBe(true);
    expect(selected.state.progression.activeStartingRelicId).toBe('swift_boots');

    const cleared = setActiveStartingRelic(
      selected.state,
      profileAtLevel(2, ['swift_boots']),
      null,
    );
    expect(cleared.ok).toBe(true);
    expect(cleared.state.progression.activeStartingRelicId).toBeNull();
  });

  test('rejects undiscovered, under-leveled, or run-only relics', () => {
    const base = state();

    expect(setActiveStartingRelic(base, profileAtLevel(2), 'swift_boots')).toEqual({
      ok: false,
      reason: 'Relic is not discovered.',
      state: base,
    });
    expect(setActiveStartingRelic(base, profileAtLevel(4, ['spark_coil']), 'spark_coil')).toEqual({
      ok: false,
      reason: 'Relic requires level 5.',
      state: base,
    });
    expect(setActiveStartingRelic(base, profileAtLevel(8, ['stone_heart']), 'stone_heart')).toEqual(
      {
        ok: false,
        reason: 'This relic cannot start a run.',
        state: base,
      },
    );
  });

  test('formats relic status lines and summaries without purchase language', () => {
    const active: MetaState = {
      economyVersion: 4,
      progression: {
        ...createDefaultProgressionState(),
        activeStartingRelicId: 'swift_boots',
      },
    };
    const profile = profileAtLevel(5, ['swift_boots', 'spark_coil']);

    expect(formatRelicProgressionSummary(active, profile)).toContain('Discovered relics: 2/12');
    expect(formatRelicProgressionSummary(active, profile)).toContain('Starting relic: Swift Boots');
    expect(formatRelicProgressionLine(active, profile, 'swift_boots')).toContain('active');
    expect(formatRelicProgressionLine(active, profileAtLevel(1), 'spark_coil')).toContain(
      'undiscovered',
    );
    expect(formatRelicProgressionLine(active, profile, 'spark_coil')).toContain(
      'available - select',
    );
    expect(formatRelicProgressionSummary(active, profile)).not.toMatch(/Ember|buy|spend/i);
  });
});
