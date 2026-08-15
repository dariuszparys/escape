import {
  CONTRACT_DEFS,
  contractDef,
  evaluateContract,
  type ContractDef,
  type ContractId,
  type ContractRunSnapshot,
} from '../data/contracts';
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

/**
 * Display order for the campfire/death "this run" charge. First-session goals
 * sit in front of the late-run relic-hoarder contract even though evaluation
 * still walks CONTRACT_DEFS in table order.
 */
const CHARGE_PRIORITY: readonly ContractId[] = [
  'reach_depth_6',
  'first_elite_kill',
  'reach_room_20',
  'slayer_25',
  'escape_with_3_relics',
];

export function nextChargeContract(completedIds: readonly string[]): ContractDef | null {
  const done = new Set(completedIds);
  for (const id of CHARGE_PRIORITY) {
    if (!done.has(id)) return contractDef(id);
  }
  return null;
}

export function formatChargeLine(completedIds: readonly string[]): string | null {
  const contract = nextChargeContract(completedIds);
  if (!contract) return null;
  return `Charge: ${contract.name} - ${contract.description}`;
}
