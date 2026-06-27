import { describe, expect, test } from 'vitest';
import { buyStarterCardVarietyUnlock, formatStarterCardProgressionSummary } from './progression';

describe('starter card progression', () => {
  test('buys the starter-card variety unlock for four embers', () => {
    const state = {
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
      ].join('\n'),
    );
    expect(summary).not.toMatch(/Ash|Kindling/);
  });
});
