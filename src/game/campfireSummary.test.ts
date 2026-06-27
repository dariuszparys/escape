import { describe, expect, test } from 'vitest';
import { createDefaultPendingPrep } from '../data/campfirePurchases';
import { createDefaultRunChronicle } from '../chronicle';
import {
  formatChronicleLine,
  formatDailyRecordLine,
  formatPendingPrepSummary,
} from './campfireSummary';

describe('campfire summary formatting', () => {
  test('formats empty pending prep for hub status', () => {
    expect(formatPendingPrepSummary(createDefaultPendingPrep())).toBe(
      ['One-run prep: none (0/3)', 'Opening picks: 2 of 3', 'Scout flame: unlit'].join('\n'),
    );
  });

  test('formats pending prep with item names and one-off bonuses', () => {
    expect(
      formatPendingPrepSummary({
        itemIds: ['small_potion', 'bomb'],
        extraStartingChoice: true,
        scoutFlame: true,
      }),
    ).toBe(
      [
        'One-run prep: Small Potion, Bomb (2/3)',
        'Opening picks: 3 of 4',
        'Scout flame: ready',
      ].join('\n'),
    );
  });

  test('includes starter-card progression in opening choice summary without extra picks', () => {
    const summary = formatPendingPrepSummary(createDefaultPendingPrep(), {
      starterCardVarietyUnlocked: true,
      migrationBonusGranted: true,
    });

    expect(summary).toBe(
      ['One-run prep: none (0/3)', 'Opening picks: 2 of 4', 'Scout flame: unlit'].join('\n'),
    );
    expect(summary).not.toMatch(/Ash|Kindling/);
  });

  test('formats chronicle line for no completed runs', () => {
    expect(formatChronicleLine(createDefaultRunChronicle())).toBe('No completed runs yet');
  });

  test('formats chronicle line with personal records', () => {
    expect(
      formatChronicleLine({
        ...createDefaultRunChronicle(),
        runsCompleted: 2,
        escapes: 1,
        bestDepth: 8,
        bestGold: 14,
      }),
    ).toBe('Runs 2 | Escapes 1 | Best room 8 | Best gold 14');
  });

  test('formats daily record status', () => {
    expect(
      formatDailyRecordLine({
        date: '2026-06-27',
        seed: 'daily-2026-06-27',
        bestDepth: 8,
        escaped: false,
        attempts: 3,
      }),
    ).toBe('Daily 2026-06-27 - best room 8, escaped: no');
  });
});
