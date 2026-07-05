import { describe, expect, test } from 'vitest';
import { evaluateContract } from '../data/contracts';
import { applyContractCompletions, evaluateNewContracts } from './contracts';
import { createDefaultMetaState } from '../meta';

describe('contracts', () => {
  test('escape_with_3_relics requires escape and three relics', () => {
    expect(
      evaluateContract('escape_with_3_relics', {
        escaped: true,
        depth: 3,
        relicCount: 3,
        elitesDefeated: 0,
      }),
    ).toBe(true);
    expect(
      evaluateContract('escape_with_3_relics', {
        escaped: false,
        depth: 9,
        relicCount: 4,
        elitesDefeated: 1,
      }),
    ).toBe(false);
  });

  test('evaluateNewContracts awards once and unlocks relic', () => {
    const meta = createDefaultMetaState();
    const completions = evaluateNewContracts(meta.progression, {
      escaped: false,
      depth: 6,
      relicCount: 0,
      elitesDefeated: 0,
    });
    expect(completions).toHaveLength(1);
    expect(completions[0]?.contractId).toBe('reach_depth_6');

    const updated = applyContractCompletions(meta, completions);
    expect(updated.progression.completedContractIds).toContain('reach_depth_6');
    expect(updated.progression.unlockedRelicIds).toContain('wanderers_flask');
    expect(updated.embers).toBeGreaterThan(meta.embers);
  });
});
