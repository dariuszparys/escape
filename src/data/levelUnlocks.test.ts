import { describe, expect, test } from 'vitest';
import {
  LEVEL_UNLOCKS,
  isArchetypeLevelEligible,
  isRelicLevelEligible,
  unlocksForLevel,
} from './levelUnlocks';

describe('level unlocks', () => {
  test('fresh profiles start neutral-only with no loadout relic slot', () => {
    expect(unlocksForLevel(1)).toEqual({
      archetypeIds: [],
      startingRelicSlots: 0,
      starterCardVariety: false,
      relicIds: [],
    });
  });

  test('unlocks are monotonic as levels rise', () => {
    let previous = unlocksForLevel(1);
    for (let level = 2; level <= 12; level++) {
      const current = unlocksForLevel(level);
      expect(current.startingRelicSlots).toBeGreaterThanOrEqual(previous.startingRelicSlots);
      expect(current.archetypeIds).toEqual(expect.arrayContaining(previous.archetypeIds));
      expect(current.relicIds).toEqual(expect.arrayContaining(previous.relicIds));
      if (previous.starterCardVariety) expect(current.starterCardVariety).toBe(true);
      previous = current;
    }
  });

  test('archetypes and relics are level-gated by the table', () => {
    expect(isArchetypeLevelEligible(1, 'barbarian')).toBe(false);
    expect(isArchetypeLevelEligible(3, 'barbarian')).toBe(true);
    expect(isRelicLevelEligible(1, 'spark_coil')).toBe(false);
    expect(isRelicLevelEligible(5, 'spark_coil')).toBe(true);
  });

  test('the table has one entry per unlock level', () => {
    const levels = LEVEL_UNLOCKS.map((entry) => entry.level);
    expect(new Set(levels).size).toBe(levels.length);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
  });
});
