import type { RelicId } from './relics';
import { RELIC_DEFS } from './relics';

export type ContractId =
  | 'escape_with_3_relics'
  | 'first_elite_kill'
  | 'reach_depth_6'
  | 'slayer_25'
  | 'reach_room_20';

export interface ContractDef {
  id: ContractId;
  name: string;
  description: string;
  /** Relic discovery granted on first completion. */
  unlockRelicId?: RelicId;
}

export const CONTRACT_DEFS: ContractDef[] = [
  {
    id: 'escape_with_3_relics',
    name: 'Relic Hoarder',
    description: 'Escape with 3 or more relics.',
    unlockRelicId: 'hoarders_map',
  },
  {
    id: 'first_elite_kill',
    name: 'Elite Slayer',
    description: 'Defeat an elite enemy in a run.',
    unlockRelicId: 'merchants_seal',
  },
  {
    id: 'reach_depth_6',
    name: 'Deep Delver',
    description: 'Reach room 6 in a single run.',
    unlockRelicId: 'wanderers_flask',
  },
  {
    id: 'slayer_25',
    name: 'Slayer',
    description: 'Defeat 25 enemies in a single run.',
  },
  {
    id: 'reach_room_20',
    name: 'Into the Depths',
    description: 'Reach room 20 in a single run.',
    unlockRelicId: 'spark_coil',
  },
];

const CONTRACT_IDS = new Set<string>(CONTRACT_DEFS.map((contract) => contract.id));
const RELIC_IDS = new Set<string>(RELIC_DEFS.map((relic) => relic.id));

export function contractDef(id: ContractId): ContractDef {
  const def = CONTRACT_DEFS.find((candidate) => candidate.id === id);
  if (!def) throw new Error(`Unknown contract: ${id}`);
  return def;
}

export interface ContractRunSnapshot {
  escaped: boolean;
  depth: number;
  relicCount: number;
  elitesDefeated: number;
  enemiesDefeated: number;
}

export function evaluateContract(id: ContractId, run: ContractRunSnapshot): boolean {
  switch (id) {
    case 'escape_with_3_relics':
      return run.escaped && run.relicCount >= 3;
    case 'first_elite_kill':
      return run.elitesDefeated >= 1;
    case 'reach_depth_6':
      return run.depth >= 6;
    case 'slayer_25':
      return run.enemiesDefeated >= 25;
    case 'reach_room_20':
      return run.depth >= 20;
    default: {
      const _exhaustive: never = id;
      throw new Error(`Unhandled contract: ${String(_exhaustive)}`);
    }
  }
}

export function normalizeContractIds(value: unknown): ContractId[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((id): id is ContractId => {
    if (typeof id !== 'string' || !CONTRACT_IDS.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function normalizeActiveStartingRelicId(value: unknown): RelicId | null {
  if (typeof value !== 'string' || !RELIC_IDS.has(value)) return null;
  const id = value as RelicId;
  const def = RELIC_DEFS.find((relic) => relic.id === id);
  if (!def?.startingRelicEligible) return null;
  return id;
}
