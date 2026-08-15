import { describe, expect, test } from 'vitest';
import {
  LEVEL_UNLOCKS,
  isArchetypeLevelEligible,
  isRelicLevelEligible,
  requiredLevelForArchetype,
  requiredLevelForRelic,
  unlocksForLevel,
} from './levelUnlocks';

describe('level unlocks', () => {
  test('fresh profiles start with all archetypes and no loadout relic slot', () => {
    expect(unlocksForLevel(1)).toEqual({
      archetypeIds: ['barbarian', 'ranger', 'necromancer'],
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

  test('archetypes are available at level 1; relics stay level-gated', () => {
    expect(isArchetypeLevelEligible(1, 'barbarian')).toBe(true);
    expect(isArchetypeLevelEligible(1, 'ranger')).toBe(true);
    expect(isArchetypeLevelEligible(1, 'necromancer')).toBe(true);
    expect(isRelicLevelEligible(1, 'swift_boots')).toBe(false);
    expect(isRelicLevelEligible(2, 'swift_boots')).toBe(true);
    expect(isRelicLevelEligible(4, 'spark_coil')).toBe(false);
    expect(isRelicLevelEligible(5, 'spark_coil')).toBe(true);
  });

  test('reports the first level that grants each unlock', () => {
    expect(requiredLevelForArchetype('barbarian')).toBe(1);
    expect(requiredLevelForRelic('swift_boots')).toBe(2);
    expect(requiredLevelForRelic('spark_coil')).toBe(5);
  });

  test('the table has one entry per unlock level', () => {
    const levels = LEVEL_UNLOCKS.map((entry) => entry.level);
    expect(new Set(levels).size).toBe(levels.length);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
  });
});
