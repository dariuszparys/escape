import { ARCHETYPES } from './data/archetypes';
import type { ArchetypeId } from './data/cards';
import {
  normalizeActiveStartingRelicId,
  normalizeContractIds,
  type ContractId,
} from './data/contracts';
import type { RelicId } from './data/relics';
import { META_STORAGE_KEY } from './storageKeys';

export { META_STORAGE_KEY } from './storageKeys';
export const META_ECONOMY_VERSION = 4;

/** The selectable player archetype ids, derived from the one canonical `ARCHETYPES` list. */
export const ARCHETYPE_IDS: ArchetypeId[] = ARCHETYPES.map((archetype) => archetype.id);
const ARCHETYPE_ID_SET = new Set<string>(ARCHETYPE_IDS);

export interface MetaProgressionState {
  activeArchetypeId: ArchetypeId | null;
  activeStartingRelicId: RelicId | null;
  completedContractIds: ContractId[];
}

export interface MetaState {
  economyVersion: typeof META_ECONOMY_VERSION;
  progression: MetaProgressionState;
}

export function createDefaultMetaState(): MetaState {
  return {
    economyVersion: META_ECONOMY_VERSION,
    progression: createDefaultProgressionState(),
  };
}

export function createDefaultProgressionState(): MetaProgressionState {
  return {
    activeArchetypeId: null,
    activeStartingRelicId: null,
    completedContractIds: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeArchetypeId(value: unknown): ArchetypeId | null {
  return typeof value === 'string' && ARCHETYPE_ID_SET.has(value) ? (value as ArchetypeId) : null;
}

function normalizeProgression(value: unknown): MetaProgressionState {
  if (!isRecord(value)) return createDefaultProgressionState();

  return {
    activeArchetypeId: normalizeArchetypeId(value.activeArchetypeId),
    activeStartingRelicId: normalizeActiveStartingRelicId(value.activeStartingRelicId),
    completedContractIds: normalizeContractIds(value.completedContractIds),
  };
}

export function normalizeMetaState(value: unknown): MetaState {
  if (!isRecord(value)) return createDefaultMetaState();

  const hasEconomyVersion = Object.prototype.hasOwnProperty.call(value, 'economyVersion');
  if (!hasEconomyVersion || value.economyVersion !== META_ECONOMY_VERSION) {
    return createDefaultMetaState();
  }

  return {
    economyVersion: META_ECONOMY_VERSION,
    progression: normalizeProgression(value.progression),
  };
}

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadMetaState(storage: Storage | null = browserStorage()): MetaState {
  if (!storage) return createDefaultMetaState();
  try {
    const raw = storage.getItem(META_STORAGE_KEY);
    return raw ? normalizeMetaState(JSON.parse(raw)) : createDefaultMetaState();
  } catch {
    return createDefaultMetaState();
  }
}

export function saveMetaState(meta: MetaState, storage: Storage | null = browserStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(META_STORAGE_KEY, JSON.stringify(normalizeMetaState(meta)));
  } catch {
    // In-memory state remains usable when browser storage is unavailable.
  }
}

let current = loadMetaState();

export function getMeta(): MetaState {
  return current;
}

export function setMeta(next: MetaState): MetaState {
  current = normalizeMetaState(next);
  saveMetaState(current);
  return current;
}
