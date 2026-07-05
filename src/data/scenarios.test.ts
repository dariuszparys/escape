import { describe, expect, test } from 'vitest';
import { SCENARIOS, scenarioDef } from './scenarios';

describe('scenarios', () => {
  test('defines the four v1 scenarios with stable ids and readable copy', () => {
    expect(SCENARIOS.map((scenario) => scenario.id)).toEqual([
      'escape_the_dungeon',
      'im_poisoned',
      'lost_left_arm',
      'enemies_doubled',
    ]);
    expect(SCENARIOS.map((scenario) => scenario.name)).toEqual([
      'Escape the Dungeon',
      "I'm Poisoned",
      'I Lost My Left Arm',
      'Enemies Are Doubled',
    ]);

    for (const scenario of SCENARIOS) {
      expect(scenario.backstory.trim().length).toBeGreaterThan(20);
      expect(scenario.ruleSummary.trim().length).toBeGreaterThan(20);
    }
  });

  test('looks up scenario definitions and rejects unknown ids', () => {
    expect(scenarioDef('lost_left_arm').name).toBe('I Lost My Left Arm');

    expect(() => scenarioDef('unknown-scenario' as never)).toThrow(
      'Unknown scenario: unknown-scenario',
    );
  });
});
