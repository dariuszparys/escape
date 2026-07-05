import type { ContractId } from '../data/contracts';
import { CONTRACT_DEFS, evaluateContract, type ContractRunSnapshot } from '../data/contracts';
import type { RelicId } from '../data/relics';
import type { MetaProgressionState, MetaState } from '../meta';

export interface ContractCompletion {
  contractId: ContractId;
  emberReward: number;
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
      emberReward: contract.emberReward ?? 0,
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
  const unlockedRelicIds = [...(meta.progression.unlockedRelicIds ?? [])];
  let embers = meta.embers;

  for (const completion of completions) {
    if (completedContractIds.includes(completion.contractId)) continue;
    completedContractIds.push(completion.contractId);
    embers += completion.emberReward;
    if (completion.unlockedRelicId && !unlockedRelicIds.includes(completion.unlockedRelicId)) {
      unlockedRelicIds.push(completion.unlockedRelicId);
    }
  }

  return {
    ...meta,
    embers,
    progression: {
      ...meta.progression,
      completedContractIds,
      unlockedRelicIds,
    },
  };
}
