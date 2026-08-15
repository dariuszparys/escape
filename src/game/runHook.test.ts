import { describe, expect, test } from 'vitest';
import { BOSS_ROOM_INTERVAL, RUN_LENGTH } from '../config';
import { createDefaultProfileState, xpForLevel } from '../profile';
import {
  formatCampfireRunGoal,
  formatChapterDeathLine,
  formatChapterGoal,
  formatDeathHookLines,
  formatNextFantasyLine,
  formatPathPrompt,
  formatUnlockHookLine,
  suggestedNextArchetype,
} from './runHook';
import { nextChargeContract } from './contracts';
import { DECADE_CHAPTERS, formatHudChapterText, nextGateRoom } from '../dungeon/rooms';

describe('chapter goals', () => {
  test('names one chapter per decade', () => {
    expect(DECADE_CHAPTERS).toHaveLength(RUN_LENGTH / BOSS_ROOM_INTERVAL);
    expect(new Set(DECADE_CHAPTERS.map((chapter) => chapter.name)).size).toBe(
      DECADE_CHAPTERS.length,
    );
  });

  test('the first summit is the First Gate, then the next unreached boss', () => {
    expect(nextGateRoom(0)).toBe(10);
    expect(nextGateRoom(7)).toBe(10);
    expect(nextGateRoom(10)).toBe(20);
    expect(nextGateRoom(99)).toBe(100);
    expect(nextGateRoom(100)).toBe(100);
    expect(formatChapterGoal(0)).toBe('Reach the First Gate (room 10).');
    expect(formatChapterGoal(10)).toBe('Reach the Drowned Crypt (room 20).');
    expect(formatChapterGoal(100)).toBe('Escape the dungeon again.');
  });

  test('HUD progress is chapter-local, not a 100-room commute', () => {
    expect(formatHudChapterText(4)).toBe('Gate Halls\n4/10');
    expect(formatHudChapterText(10)).toBe('Gate Halls\n10/10');
    expect(formatHudChapterText(11)).toBe('Drowned Crypt\n1/10');
  });
});

describe('death and campfire hooks', () => {
  test('death names the chapter and sells a different path', () => {
    expect(formatChapterDeathLine(7)).toBe('The Gate Halls claimed you in room 7.');
    expect(suggestedNextArchetype(null)).toBe('barbarian');
    expect(suggestedNextArchetype('barbarian')).toBe('ranger');
    expect(suggestedNextArchetype('ranger')).toBe('necromancer');
    expect(suggestedNextArchetype('necromancer')).toBe('barbarian');
    expect(formatNextFantasyLine(null)).toContain('pick a path at the fire');
    expect(formatNextFantasyLine('barbarian')).toContain('Ranger');
  });

  test('fresh campfire charge is Deep Delver, not the late relic hoard', () => {
    expect(nextChargeContract([])?.id).toBe('reach_depth_6');
    expect(formatCampfireRunGoal(0, [])).toContain('First Gate');
    expect(formatCampfireRunGoal(0, [])).toContain('Deep Delver');
    expect(formatPathPrompt(null)).toBe('PICK A PATH');
    expect(formatPathPrompt('barbarian')).toBe('PATH - Barbarian');
  });

  test('death hook prefers the next charge over a generic unlock line', () => {
    const profile = { ...createDefaultProfileState(), xp: 70 };
    const lines = formatDeathHookLines(7, null, profile, []);
    expect(lines[0]).toContain('Gate Halls');
    expect(lines.join('\n')).toContain('pick a path');
    expect(lines.join('\n')).toContain('Deep Delver');
    expect(lines.join('\n')).not.toContain('starting relic');
  });

  test('unlock hook names the First Gate relic before starter variety', () => {
    expect(formatUnlockHookLine(createDefaultProfileState())).toContain('starting relic');
    expect(formatUnlockHookLine({ ...createDefaultProfileState(), xp: xpForLevel(2) })).toContain(
      'level 4',
    );
    expect(formatUnlockHookLine({ ...createDefaultProfileState(), xp: xpForLevel(4) })).toBeNull();
  });
});
