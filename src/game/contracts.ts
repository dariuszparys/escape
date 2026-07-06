import type { ContractId } from '../data/contracts';
import { CONTRACT_DEFS, evaluateContract, type ContractRunSnapshot } from '../data/contracts';
import type { RelicId } from '../data/relics';
import type { MetaProgressionState, MetaState } from '../meta';
import { discoverRelic, type ProfileState } from '../profile';

export interface ContractCompletion {
  contractId: ContractId;
  unlockedRelicId: RelicId | null;
}

export function evaluateNewContracts(
  progression: MetaProgressionState,
  run: ContractRunSnapshot,
): ContractCompletion[] {
  const completed = new Set(progression.completedContractIds ?? []);
  const completions: ContractCompletion[] = [];

  for (const contract of CONTRACT_DEFS) {
    if (completed.has(contract.id)) continue;
    if (!evaluateContract(contract.id, run)) continue;
    completions.push({
      contractId: contract.id,
      unlockedRelicId: contract.unlockRelicId ?? null,
    });
  }

  return completions;
}

export function applyContractCompletions(
  meta: MetaState,
  completions: ContractCompletion[],
): MetaState {
  if (completions.length === 0) return meta;

  const completedContractIds = [...(meta.progression.completedContractIds ?? [])];

  for (const completion of completions) {
    if (completedContractIds.includes(completion.contractId)) continue;
    completedContractIds.push(completion.contractId);
  }

  return {
    ...meta,
    progression: {
      ...meta.progression,
      completedContractIds,
    },
  };
}

export function applyContractDiscoveries(
  profile: ProfileState,
  completions: ContractCompletion[],
): ProfileState {
  let next = profile;
  for (const completion of completions) {
    if (completion.unlockedRelicId) next = discoverRelic(next, completion.unlockedRelicId);
  }
  return next;
}
