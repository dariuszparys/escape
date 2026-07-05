import { describe, expect, test } from 'vitest';
import {
  buyRelicPathUnlock,
  buyRelicUnlock,
  buyStarterCardVarietyUnlock,
  formatArchetypeProgressionLine,
  formatArchetypeSelectionSummary,
  formatRelicProgressionLine,
  formatRelicProgressionSummary,
  formatStarterCardProgressionSummary,
  setActiveArchetype,
  setActiveStartingRelic,
  type ProgressionState,
} from './progression';

describe('starter card progression', () => {
  test('buys the starter-card variety unlock for four embers', () => {
    const state: ProgressionState = {
      embers: 4,
      progression: {
        starterCardVarietyUnlocked: false,
        migrationBonusGranted: false,
      },
    };

    expect(buyStarterCardVarietyUnlock(state)).toEqual({
      ok: true,
      state: {
        embers: 0,
        progression: {
          starterCardVarietyUnlocked: true,
          migrationBonusGranted: false,
        },
      },
    });
  });

  test('rejects unaffordable and duplicate starter-card unlock purchases', () => {
    const unaffordable = {
      embers: 3,
      progression: {
        starterCardVarietyUnlocked: false,
        migrationBonusGranted: false,
      },
    };
    const unlocked = {
      embers: 9,
      progression: {
        starterCardVarietyUnlocked: true,
        migrationBonusGranted: true,
      },
    };

    expect(buyStarterCardVarietyUnlock(unaffordable)).toEqual({
      ok: false,
      reason: 'Not enough Embers.',
      state: unaffordable,
    });
    expect(buyStarterCardVarietyUnlock(unlocked)).toEqual({
      ok: false,
      reason: 'Starter variety already unlocked.',
      state: unlocked,
    });
  });

  test('formats progression and migration bonus without new currency names', () => {
    const summary = formatStarterCardProgressionSummary({
      embers: 0,
      progression: {
        starterCardVarietyUnlocked: true,
        migrationBonusGranted: true,
      },
    });

    expect(summary).toBe(
      [
        'Embers: 0',
        'Starter variety: unlocked - four opening card options.',
        'Migration bonus: starter variety granted for old Ember progress.',
        'Relic path: locked - spend 5 Embers to unlock relic progression.',
        'Starting relic: none selected.',
      ].join('\n'),
    );
    expect(summary).not.toMatch(/Ash|Kindling/);
  });

  test('does not expose retired starter-kit progression text', () => {
    const summary = formatStarterCardProgressionSummary({
      embers: 8,
      progression: {
        starterCardVarietyUnlocked: true,
        migrationBonusGranted: false,
      },
    });

    expect(summary).not.toMatch(/Starter kit|Duelist|Warden|Hexbinder/);
  });
});

describe('archetype selection', () => {
  const base = (): ProgressionState => ({
    embers: 5,
    progression: {
      starterCardVarietyUnlocked: false,
      migrationBonusGranted: false,
      activeArchetypeId: null,
    },
  });

  test('selects an archetype for free (no ember cost, no unlock gate)', () => {
    const result = setActiveArchetype(base(), 'barbarian');
    expect(result.ok).toBe(true);
    expect(result.state.embers).toBe(5);
    expect(result.state.progression.activeArchetypeId).toBe('barbarian');
  });

  test('clears back to the neutral pool with null', () => {
    const active = base();
    active.progression.activeArchetypeId = 'ranger';
    const result = setActiveArchetype(active, null);
    expect(result.ok).toBe(true);
    expect(result.state.progression.activeArchetypeId).toBeNull();
  });

  test('rejects an unknown archetype and leaves state untouched', () => {
    const state = base();
    expect(setActiveArchetype(state, 'necrolord' as never)).toEqual({
      ok: false,
      reason: 'Unknown archetype.',
      state,
    });
  });

  test('summaries reflect the active archetype', () => {
    expect(formatArchetypeSelectionSummary(base())).toContain('Archetype: none');
    const active = base();
    active.progression.activeArchetypeId = 'necromancer';
    expect(formatArchetypeSelectionSummary(active)).toContain('Necromancer');
    expect(formatArchetypeProgressionLine(active, 'necromancer')).toContain('active');
    expect(formatArchetypeProgressionLine(active, 'barbarian')).toContain('Opens with');
  });
});

describe('relic progression', () => {
  const base = (): ProgressionState => ({
    embers: 10,
    progression: {
      starterCardVarietyUnlocked: false,
      migrationBonusGranted: false,
      activeArchetypeId: null,
      relicPathUnlocked: false,
      unlockedRelicIds: [],
      activeStartingRelicId: null,
    },
  });

  test('unlocks the relic path for 5 Embers', () => {
    const result = buyRelicPathUnlock(base());
    expect(result.ok).toBe(true);
    expect(result.state.embers).toBe(5);
    expect(result.state.progression.relicPathUnlocked).toBe(true);
  });

  test('rejects an unaffordable or duplicate relic-path purchase', () => {
    const unaffordable = { ...base(), embers: 4 };
    expect(buyRelicPathUnlock(unaffordable)).toEqual({
      ok: false,
      reason: 'Not enough Embers.',
      state: unaffordable,
    });

    const alreadyUnlocked = base();
    alreadyUnlocked.progression.relicPathUnlocked = true;
    expect(buyRelicPathUnlock(alreadyUnlocked)).toEqual({
      ok: false,
      reason: 'Relic path already unlocked.',
      state: alreadyUnlocked,
    });
  });

  test('buying a paid relic requires the relic path to be unlocked first', () => {
    const state = base();
    expect(buyRelicUnlock(state, 'spark_coil')).toEqual({
      ok: false,
      reason: 'Unlock the relic path first.',
      state,
    });
  });

  test('buys a paid relic once the path is unlocked, and rejects buying it twice', () => {
    const state = base();
    state.progression.relicPathUnlocked = true;
    const result = buyRelicUnlock(state, 'spark_coil');
    expect(result.ok).toBe(true);
    expect(result.state.embers).toBe(5); // 10 - spark_coil's 5-Ember unlock cost
    expect(result.state.progression.unlockedRelicIds).toEqual(['spark_coil']);

    expect(buyRelicUnlock(result.state, 'spark_coil')).toEqual({
      ok: false,
      reason: 'Relic already unlocked.',
      state: result.state,
    });
  });

  test('rejects buying a starter (cost-0) relic — it is always available, never purchased', () => {
    const state = base();
    state.progression.relicPathUnlocked = true;
    expect(buyRelicUnlock(state, 'swift_boots')).toEqual({
      ok: false,
      reason: 'Starter relics are always available.',
      state,
    });
  });

  // Regression coverage for a bug found in review: `setActiveStartingRelic` let a player select
  // a cost-0 starter relic (unconditionally "unlocked") without ever unlocking the relic path.
  test('selecting a starting relic requires the relic path to be unlocked, even for a cost-0 relic', () => {
    const state = base();
    expect(setActiveStartingRelic(state, 'swift_boots')).toEqual({
      ok: false,
      reason: 'Unlock the relic path first.',
      state,
    });
  });

  test('selects a starting relic once the path is unlocked, and clears it with null', () => {
    const state = base();
    state.progression.relicPathUnlocked = true;
    const result = setActiveStartingRelic(state, 'swift_boots');
    expect(result.ok).toBe(true);
    expect(result.state.progression.activeStartingRelicId).toBe('swift_boots');

    const cleared = setActiveStartingRelic(result.state, null);
    expect(cleared.ok).toBe(true);
    expect(cleared.state.progression.activeStartingRelicId).toBeNull();
  });

  test('rejects a starting relic that cannot start a run, or is not yet unlocked', () => {
    const state = base();
    state.progression.relicPathUnlocked = true;

    // stone_heart is not `startingRelicEligible`.
    expect(setActiveStartingRelic(state, 'stone_heart')).toEqual({
      ok: false,
      reason: 'This relic cannot start a run.',
      state,
    });
    // vital_charm IS startingRelicEligible but costs Embers and hasn't been bought yet.
    expect(setActiveStartingRelic(state, 'vital_charm')).toEqual({
      ok: false,
      reason: 'Relic is locked.',
      state,
    });
  });

  test('formats the relic progression summary and per-relic status lines', () => {
    const locked = base();
    expect(formatRelicProgressionSummary(locked)).toBe(
      [
        'Relic path: locked - spend 5 Embers to unlock relic progression.',
        'Starting relic: none selected.',
      ].join('\n'),
    );
    expect(formatRelicProgressionLine(locked, 'swift_boots')).toContain(
      'locked - unlock relic path first',
    );

    const unlocked = base();
    unlocked.progression.relicPathUnlocked = true;
    unlocked.progression.activeStartingRelicId = 'swift_boots';
    expect(formatRelicProgressionSummary(unlocked)).toBe(
      [
        'Relic path: unlocked - chests and elites can drop relics from your pool.',
        'Starting relic: Swift Boots.',
      ].join('\n'),
    );
    expect(formatRelicProgressionLine(unlocked, 'swift_boots')).toContain(
      'active - starts next normal run',
    );
    expect(formatRelicProgressionLine(unlocked, 'stone_heart')).toContain('locked - 5 Embers');
  });
});
