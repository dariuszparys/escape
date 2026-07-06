import { describe, expect, test } from 'vitest';
import { evaluateContract } from '../data/contracts';
import {
  applyContractCompletions,
  applyContractDiscoveries,
  evaluateNewContracts,
} from './contracts';
import { createDefaultMetaState } from '../meta';
import { createDefaultProfileState } from '../profile';

describe('contracts', () => {
  test('escape_with_3_relics requires escape and three relics', () => {
    expect(
      evaluateContract('escape_with_3_relics', {
        escaped: true,
        depth: 3,
        relicCount: 3,
        elitesDefeated: 0,
        enemiesDefeated: 0,
      }),
    ).toBe(true);
    expect(
      evaluateContract('escape_with_3_relics', {
        escaped: false,
        depth: 9,
        relicCount: 4,
        elitesDefeated: 1,
        enemiesDefeated: 0,
      }),
    ).toBe(false);
  });

  test('evaluateNewContracts awards once and force-discovers relic rewards', () => {
    const meta = createDefaultMetaState();
    const completions = evaluateNewContracts(meta.progression, {
      escaped: false,
      depth: 6,
      relicCount: 0,
      elitesDefeated: 0,
      enemiesDefeated: 0,
    });
    expect(completions).toEqual([
      { contractId: 'reach_depth_6', unlockedRelicId: 'wanderers_flask' },
    ]);

    const updated = applyContractCompletions(meta, completions);
    const profile = applyContractDiscoveries(createDefaultProfileState(), completions);

    expect(updated.progression.completedContractIds).toContain('reach_depth_6');
    expect(profile.discoveredRelicIds).toContain('wanderers_flask');
  });

  test('re-applying the same completions is a no-op for the contract ledger', () => {
    const meta = createDefaultMetaState();
    const completions = evaluateNewContracts(meta.progression, {
      escaped: false,
      depth: 6,
      relicCount: 0,
      elitesDefeated: 0,
      enemiesDefeated: 0,
    });

    const once = applyContractCompletions(meta, completions);
    const twice = applyContractCompletions(once, completions);

    expect(twice.progression.completedContractIds).toEqual(once.progression.completedContractIds);
  });

  test('duplicate completions within one call count once', () => {
    const meta = createDefaultMetaState();
    const [completion] = evaluateNewContracts(meta.progression, {
      escaped: false,
      depth: 6,
      relicCount: 0,
      elitesDefeated: 0,
      enemiesDefeated: 0,
    });
    expect(completion).toBeDefined();

    const updated = applyContractCompletions(meta, [completion, completion]);

    expect(updated.progression.completedContractIds).toEqual(['reach_depth_6']);
  });

  test('first_elite_kill discovers merchants_seal', () => {
    const meta = createDefaultMetaState();
    const completions = evaluateNewContracts(meta.progression, {
      escaped: false,
      depth: 1,
      relicCount: 0,
      elitesDefeated: 1,
      enemiesDefeated: 0,
    });

    expect(completions).toEqual([
      { contractId: 'first_elite_kill', unlockedRelicId: 'merchants_seal' },
    ]);
    expect(
      applyContractDiscoveries(createDefaultProfileState(), completions).discoveredRelicIds,
    ).toContain('merchants_seal');
  });

  test('slayer_25 requires at least 25 enemies defeated', () => {
    expect(
      evaluateContract('slayer_25', {
        escaped: false,
        depth: 6,
        relicCount: 0,
        elitesDefeated: 0,
        enemiesDefeated: 24,
      }),
    ).toBe(false);
    expect(
      evaluateContract('slayer_25', {
        escaped: false,
        depth: 6,
        relicCount: 0,
        elitesDefeated: 0,
        enemiesDefeated: 25,
      }),
    ).toBe(true);
  });

  test('reach_room_20 requires reaching room 20', () => {
    expect(
      evaluateContract('reach_room_20', {
        escaped: false,
        depth: 19,
        relicCount: 0,
        elitesDefeated: 0,
        enemiesDefeated: 0,
      }),
    ).toBe(false);
    expect(
      evaluateContract('reach_room_20', {
        escaped: false,
        depth: 20,
        relicCount: 0,
        elitesDefeated: 0,
        enemiesDefeated: 0,
      }),
    ).toBe(true);
  });

  test('reach_room_20 discovers spark_coil', () => {
    const meta = createDefaultMetaState();
    meta.progression.completedContractIds = ['reach_depth_6'];
    const completions = evaluateNewContracts(meta.progression, {
      escaped: false,
      depth: 20,
      relicCount: 0,
      elitesDefeated: 0,
      enemiesDefeated: 0,
    });

    expect(completions).toEqual([{ contractId: 'reach_room_20', unlockedRelicId: 'spark_coil' }]);

    const updated = applyContractCompletions(meta, completions);
    const profile = applyContractDiscoveries(createDefaultProfileState(), completions);
    expect(updated.progression.completedContractIds).toContain('reach_room_20');
    expect(profile.discoveredRelicIds).toContain('spark_coil');
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
    });

    expect(completions).toEqual([]);
  });
});
