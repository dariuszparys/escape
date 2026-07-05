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
        enemiesDefeated: 0,
        stratum: 1,
      }),
    ).toBe(true);
    expect(
      evaluateContract('escape_with_3_relics', {
        escaped: false,
        depth: 9,
        relicCount: 4,
        elitesDefeated: 1,
        enemiesDefeated: 0,
        stratum: 1,
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
      enemiesDefeated: 0,
      stratum: 1,
    });
    expect(completions).toHaveLength(1);
    expect(completions[0]?.contractId).toBe('reach_depth_6');

    const updated = applyContractCompletions(meta, completions);
    expect(updated.progression.completedContractIds).toContain('reach_depth_6');
    expect(updated.progression.unlockedRelicIds).toContain('wanderers_flask');
    expect(updated.embers).toBeGreaterThan(meta.embers);
  });

  test('re-applying the same completions is a no-op', () => {
    const meta = createDefaultMetaState();
    const completions = evaluateNewContracts(meta.progression, {
      escaped: false,
      depth: 6,
      relicCount: 0,
      elitesDefeated: 0,
      enemiesDefeated: 0,
      stratum: 1,
    });

    const once = applyContractCompletions(meta, completions);
    const twice = applyContractCompletions(once, completions);

    expect(twice.embers).toBe(once.embers);
    expect(twice.progression.completedContractIds?.length).toBe(
      once.progression.completedContractIds?.length,
    );
    expect(twice.progression.unlockedRelicIds?.length).toBe(
      once.progression.unlockedRelicIds?.length,
    );
  });

  test('duplicate completions within one call count once', () => {
    const meta = createDefaultMetaState();
    const [completion] = evaluateNewContracts(meta.progression, {
      escaped: false,
      depth: 6,
      relicCount: 0,
      elitesDefeated: 0,
      enemiesDefeated: 0,
      stratum: 1,
    });
    expect(completion).toBeDefined();

    const updated = applyContractCompletions(meta, [completion!, completion!]);

    expect(updated.embers).toBe(meta.embers + completion!.emberReward);
    expect(updated.progression.completedContractIds?.length).toBe(
      (meta.progression.completedContractIds?.length ?? 0) + 1,
    );
    expect(updated.progression.unlockedRelicIds?.length).toBe(
      (meta.progression.unlockedRelicIds?.length ?? 0) + 1,
    );
  });

  test('first_elite_kill awards ember and unlocks merchants_seal', () => {
    const meta = createDefaultMetaState();
    const completions = evaluateNewContracts(meta.progression, {
      escaped: false,
      depth: 1,
      relicCount: 0,
      elitesDefeated: 1,
      enemiesDefeated: 0,
      stratum: 1,
    });

    expect(completions).toHaveLength(1);
    expect(completions[0]?.contractId).toBe('first_elite_kill');

    const updated = applyContractCompletions(meta, completions);
    expect(updated.progression.unlockedRelicIds).toContain('merchants_seal');
    expect(updated.embers).toBe(meta.embers + 1);
  });

  test('slayer_25 requires at least 25 enemies defeated', () => {
    expect(
      evaluateContract('slayer_25', {
        escaped: false,
        depth: 6,
        relicCount: 0,
        elitesDefeated: 0,
        enemiesDefeated: 24,
        stratum: 1,
      }),
    ).toBe(false);
    expect(
      evaluateContract('slayer_25', {
        escaped: false,
        depth: 6,
        relicCount: 0,
        elitesDefeated: 0,
        enemiesDefeated: 25,
        stratum: 1,
      }),
    ).toBe(true);
  });

  test('delve_past_first_gate requires reaching stratum 2', () => {
    expect(
      evaluateContract('delve_past_first_gate', {
        escaped: false,
        depth: 6,
        relicCount: 0,
        elitesDefeated: 0,
        enemiesDefeated: 0,
        stratum: 1,
      }),
    ).toBe(false);
    expect(
      evaluateContract('delve_past_first_gate', {
        escaped: false,
        depth: 6,
        relicCount: 0,
        elitesDefeated: 0,
        enemiesDefeated: 0,
        stratum: 2,
      }),
    ).toBe(true);
  });

  test('delve_past_first_gate awards no embers and unlocks spark_coil', () => {
    const meta = createDefaultMetaState();
    const completions = evaluateNewContracts(meta.progression, {
      escaped: false,
      depth: 1,
      relicCount: 0,
      elitesDefeated: 0,
      enemiesDefeated: 0,
      stratum: 2,
    });

    expect(completions).toHaveLength(1);
    expect(completions[0]?.contractId).toBe('delve_past_first_gate');
    expect(completions[0]?.emberReward).toBe(0);

    const updated = applyContractCompletions(meta, completions);
    expect(updated.progression.completedContractIds).toContain('delve_past_first_gate');
    expect(updated.progression.unlockedRelicIds).toContain('spark_coil');
    expect(updated.embers).toBe(meta.embers);
  });

  test('already-completed contracts are not re-evaluated', () => {
    const meta = createDefaultMetaState();
    meta.progression.completedContractIds = ['reach_depth_6'];

    const completions = evaluateNewContracts(meta.progression, {
      escaped: false,
      depth: 6,
      relicCount: 0,
      elitesDefeated: 0,
      enemiesDefeated: 0,
      stratum: 1,
    });

    expect(completions).toEqual([]);
  });
});
