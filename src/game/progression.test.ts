import { describe, expect, test } from 'vitest';
import {
  buyStarterCardVarietyUnlock,
  buyStarterKitUnlock,
  formatStarterCardProgressionSummary,
  formatStarterKitProgressionLine,
  setActiveStarterKit,
  type ProgressionState,
} from './progression';

describe('starter card progression', () => {
  test('buys the starter-card variety unlock for four embers', () => {
    const state: ProgressionState = {
      embers: 4,
      progression: {
        starterCardVarietyUnlocked: false,
        migrationBonusGranted: false,
        unlockedStarterKitIds: [],
        activeStarterKitId: null,
      },
    };

    expect(buyStarterCardVarietyUnlock(state)).toEqual({
      ok: true,
      state: {
        embers: 0,
        progression: {
          starterCardVarietyUnlocked: true,
          migrationBonusGranted: false,
          unlockedStarterKitIds: [],
          activeStarterKitId: null,
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
        unlockedStarterKitIds: [],
        activeStarterKitId: null,
      },
    };
    const unlocked = {
      embers: 9,
      progression: {
        starterCardVarietyUnlocked: true,
        migrationBonusGranted: true,
        unlockedStarterKitIds: [],
        activeStarterKitId: null,
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
        unlockedStarterKitIds: [],
        activeStarterKitId: null,
      },
    });

    expect(summary).toBe(
      [
        'Embers: 0',
        'Starter variety: unlocked - four opening card options.',
        'Migration bonus: starter variety granted for old Ember progress.',
        'Starter kit: none selected.',
      ].join('\n'),
    );
    expect(summary).not.toMatch(/Ash|Kindling/);
  });

  test('formats locked starter kits with cost and signature-card identity', () => {
    const state: ProgressionState = {
      embers: 6,
      progression: {
        starterCardVarietyUnlocked: true,
        migrationBonusGranted: false,
        unlockedStarterKitIds: [],
        activeStarterKitId: null,
      },
    };

    expect(formatStarterKitProgressionLine(state, 'duelist')).toBe(
      'Duelist: locked - 6 Embers | Riposte: Deal 5, gain 2 block | Aggression',
    );
  });

  test('formats unlocked inactive and active starter kits distinctly', () => {
    const state: ProgressionState = {
      embers: 6,
      progression: {
        starterCardVarietyUnlocked: true,
        migrationBonusGranted: false,
        unlockedStarterKitIds: ['duelist', 'warden'],
        activeStarterKitId: 'warden',
      },
    };

    expect(formatStarterKitProgressionLine(state, 'duelist')).toBe(
      'Duelist: unlocked - select for next normal run | Riposte: Deal 5, gain 2 block | Aggression',
    );
    expect(formatStarterKitProgressionLine(state, 'warden')).toBe(
      'Warden: active - selected for next normal run | Field Dressing: Gain 5 block, restore 2 HP | Defense / sustain',
    );
  });

  test('buys a starter kit only after starter variety is unlocked', () => {
    const locked = {
      embers: 20,
      progression: {
        starterCardVarietyUnlocked: false,
        migrationBonusGranted: false,
        unlockedStarterKitIds: [],
        activeStarterKitId: null,
      },
    };
    const ready = {
      embers: 6,
      progression: {
        starterCardVarietyUnlocked: true,
        migrationBonusGranted: false,
        unlockedStarterKitIds: [],
        activeStarterKitId: null,
      },
    };

    expect(buyStarterKitUnlock(locked, 'duelist')).toEqual({
      ok: false,
      reason: 'Starter variety must be unlocked first.',
      state: locked,
    });
    expect(buyStarterKitUnlock(ready, 'duelist')).toEqual({
      ok: true,
      state: {
        embers: 0,
        progression: {
          starterCardVarietyUnlocked: true,
          migrationBonusGranted: false,
          unlockedStarterKitIds: ['duelist'],
          activeStarterKitId: 'duelist',
        },
      },
    });
  });

  test('rejects unaffordable, duplicate, and unknown starter kit purchases', () => {
    const unaffordable = {
      embers: 5,
      progression: {
        starterCardVarietyUnlocked: true,
        migrationBonusGranted: false,
        unlockedStarterKitIds: [],
        activeStarterKitId: null,
      },
    };
    const unlocked: ProgressionState = {
      embers: 12,
      progression: {
        starterCardVarietyUnlocked: true,
        migrationBonusGranted: false,
        unlockedStarterKitIds: ['duelist'],
        activeStarterKitId: 'duelist',
      },
    };

    expect(buyStarterKitUnlock(unaffordable, 'warden')).toEqual({
      ok: false,
      reason: 'Not enough Embers.',
      state: unaffordable,
    });
    expect(buyStarterKitUnlock(unlocked, 'duelist')).toEqual({
      ok: false,
      reason: 'Starter kit already unlocked.',
      state: unlocked,
    });
    expect(buyStarterKitUnlock(unlocked, 'bad-kit')).toEqual({
      ok: false,
      reason: 'Unknown starter kit.',
      state: unlocked,
    });
  });

  test('sets and clears the active starter kit without mutating locked selections', () => {
    const state: ProgressionState = {
      embers: 3,
      progression: {
        starterCardVarietyUnlocked: true,
        migrationBonusGranted: false,
        unlockedStarterKitIds: ['duelist', 'warden'],
        activeStarterKitId: 'duelist',
      },
    };

    expect(setActiveStarterKit(state, 'warden')).toEqual({
      ok: true,
      state: {
        embers: 3,
        progression: {
          starterCardVarietyUnlocked: true,
          migrationBonusGranted: false,
          unlockedStarterKitIds: ['duelist', 'warden'],
          activeStarterKitId: 'warden',
        },
      },
    });
    expect(setActiveStarterKit(state, null)).toEqual({
      ok: true,
      state: {
        embers: 3,
        progression: {
          starterCardVarietyUnlocked: true,
          migrationBonusGranted: false,
          unlockedStarterKitIds: ['duelist', 'warden'],
          activeStarterKitId: null,
        },
      },
    });
    expect(formatStarterCardProgressionSummary(setActiveStarterKit(state, null).state)).toContain(
      'Starter kit: none selected.',
    );
    expect(setActiveStarterKit(state, 'hexbinder')).toEqual({
      ok: false,
      reason: 'Starter kit is locked.',
      state,
    });
    expect(setActiveStarterKit(state, 'bad-kit')).toEqual({
      ok: false,
      reason: 'Unknown starter kit.',
      state,
    });
  });
});
