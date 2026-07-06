import { describe, expect, test } from 'vitest';
import { createDefaultRunChronicle } from '../chronicle';
import { createDefaultProgressionState } from '../meta';
import { createDefaultProfileState, xpForLevel } from '../profile';
import {
  formatChronicleLine,
  formatCampfireProgressionSummary,
  formatDailyRecordLine,
  formatProfileProgressLine,
} from './campfireSummary';

describe('campfire summary formatting', () => {
  test('formats profile level and next threshold', () => {
    expect(formatProfileProgressLine({ ...createDefaultProfileState(), xp: 120 })).toBe(
      'Level 2 - 120/250 XP',
    );
  });

  test('formats compact loadout status for the campfire overview', () => {
    const summary = formatCampfireProgressionSummary(createDefaultProgressionState(), {
      ...createDefaultProfileState(),
      xp: xpForLevel(4),
      discoveredRelicIds: ['swift_boots'],
      personalBestRoom: 47,
    });

    expect(summary).toBe(
      [
        'Archetype: none',
        'Starter variety: unlocked',
        'Discovered relics: 1',
        'Starting relic choices: 1',
        'Starting relic: none',
        'Personal best: room 47',
      ].join('\n'),
    );
    expect(summary).not.toMatch(/Migration bonus|purchase/i);
  });

  test('names the active archetype and starting relic in the campfire overview', () => {
    const progression = {
      ...createDefaultProgressionState(),
      activeArchetypeId: 'necromancer' as const,
      activeStartingRelicId: 'swift_boots' as const,
    };
    const summary = formatCampfireProgressionSummary(progression, {
      ...createDefaultProfileState(),
      xp: xpForLevel(7),
      discoveredRelicIds: ['swift_boots'],
    });

    expect(summary).toContain('Archetype: Necromancer');
    expect(summary).toContain('Starting relic: Swift Boots');
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
