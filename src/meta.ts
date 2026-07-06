import type {
  CampfirePurchaseDef,
  CampfirePurchaseState,
  PendingPrep,
} from './data/campfirePurchases';
import { MAX_INVENTORY } from './config';
import { CAMPFIRE_BARGAINS } from './data/campfireBargains';
import type { CampfireCurseId } from './data/campfireBargains';
import { CAMPFIRE_PURCHASES, createDefaultPendingPrep } from './data/campfirePurchases';
import { ARCHETYPES } from './data/archetypes';
import type { ArchetypeId } from './data/cards';
import type { RelicId } from './data/relics';
import {
  normalizeActiveStartingRelicId,
  normalizeContractIds,
  normalizeUnlockedRelicIds,
  type ContractId,
} from './data/contracts';
import { META_STORAGE_KEY } from './storageKeys';

export { META_STORAGE_KEY } from './storageKeys';
export const META_ECONOMY_VERSION = 4;

/** The selectable player archetype ids, derived from the one canonical `ARCHETYPES` list so a new
 * archetype can never be added there yet silently rejected here by save normalization. */
export const ARCHETYPE_IDS: ArchetypeId[] = ARCHETYPES.map((archetype) => archetype.id);
const ARCHETYPE_ID_SET = new Set<string>(ARCHETYPE_IDS);

export interface MetaProgressionState {
  starterCardVarietyUnlocked: boolean;
  migrationBonusGranted: boolean;
  /**
   * The archetype whose cards shape the next normal run, or null/undefined for the neutral
   * (standard) pool. Optional so it reads as an additive field: pre-archetype saves and older
   * test fixtures normalize/default to the neutral pool. The normalizer always writes it, so
   * runtime state carries a concrete value.
   */
  activeArchetypeId?: ArchetypeId | null;
  relicPathUnlocked?: boolean;
  unlockedRelicIds?: RelicId[];
  activeStartingRelicId?: RelicId | null;
  completedContractIds?: ContractId[];
}

export interface MetaState extends CampfirePurchaseState {
  economyVersion: typeof META_ECONOMY_VERSION;
  embers: number;
  progression: MetaProgressionState;
  pendingPrep: PendingPrep;
  lastAwardedRunId: string | null;
}

export function createDefaultMetaState(): MetaState {
  return {
    economyVersion: META_ECONOMY_VERSION,
    embers: 0,
    progression: createDefaultProgressionState(),
    pendingPrep: createDefaultPendingPrep(),
    lastAwardedRunId: null,
  };
}

export function createDefaultProgressionState(): MetaProgressionState {
  return {
    starterCardVarietyUnlocked: false,
    migrationBonusGranted: false,
    activeArchetypeId: null,
    relicPathUnlocked: false,
    unlockedRelicIds: [],
    activeStartingRelicId: null,
    completedContractIds: [],
  };
}

function normalizeArchetypeId(value: unknown): ArchetypeId | null {
  return typeof value === 'string' && ARCHETYPE_ID_SET.has(value) ? (value as ArchetypeId) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCampfireItemPurchase(
  purchase: CampfirePurchaseDef,
): purchase is Extract<CampfirePurchaseDef, { kind: 'item' }> {
  return purchase.kind === 'item';
}

const CAMPFIRE_ITEM_IDS = new Set<PendingPrep['itemIds'][number]>(
  CAMPFIRE_PURCHASES.filter(isCampfireItemPurchase).map((purchase) => purchase.itemId),
);
const CAMPFIRE_CURSE_IDS = new Set<string>(CAMPFIRE_BARGAINS.map((bargain) => bargain.curseId));

function normalizeItemIds(value: unknown): PendingPrep['itemIds'] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is PendingPrep['itemIds'][number] =>
        typeof item === 'string' && CAMPFIRE_ITEM_IDS.has(item),
    )
    .slice(0, MAX_INVENTORY);
}

function normalizeCurseIds(value: unknown): CampfireCurseId[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((curseId): curseId is CampfireCurseId => {
      return typeof curseId === 'string' && CAMPFIRE_CURSE_IDS.has(curseId);
    })
    .slice(0, 1);
}

function normalizeEmbers(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function normalizeProgression(value: unknown): MetaProgressionState {
  if (!isRecord(value)) return createDefaultProgressionState();

  const migrationBonusGranted = value.migrationBonusGranted === true;
  const starterCardVarietyUnlocked =
    value.starterCardVarietyUnlocked === true || migrationBonusGranted;
  // Kept independent of `relicPathUnlocked` (contracts can unlock a relic id before the path
  // purchase — see the "Deep Delver"-style rewards) so buying the path later doesn't require
  // re-earning contract rewards. Whether an unlocked id actually appears in-run is still gated by
  // `relicPoolForRun`, which checks `relicPathUnlocked` on its own.
  const relicPathUnlocked = value.relicPathUnlocked === true;
  const unlockedRelicIds = normalizeUnlockedRelicIds(value.unlockedRelicIds);
  const activeStartingRelicId = normalizeActiveStartingRelicId(
    value.activeStartingRelicId,
    relicPathUnlocked,
    unlockedRelicIds,
  );

  return {
    starterCardVarietyUnlocked,
    migrationBonusGranted,
    activeArchetypeId: normalizeArchetypeId(value.activeArchetypeId),
    relicPathUnlocked,
    unlockedRelicIds,
    activeStartingRelicId,
    completedContractIds: normalizeContractIds(value.completedContractIds),
  };
}

export function normalizeMetaState(value: unknown): MetaState {
  if (!isRecord(value)) return createDefaultMetaState();

  const hasEconomyVersion = Object.prototype.hasOwnProperty.call(value, 'economyVersion');
  if (!hasEconomyVersion || value.economyVersion !== META_ECONOMY_VERSION) {
    return createDefaultMetaState();
  }

  const pending = isRecord(value.pendingPrep) ? value.pendingPrep : {};

  return {
    economyVersion: META_ECONOMY_VERSION,
    embers: normalizeEmbers(value.embers),
    progression: normalizeProgression(value.progression),
    pendingPrep: {
      itemIds: normalizeItemIds(pending.itemIds),
      extraStartingChoice: pending.extraStartingChoice === true,
      scoutFlame: pending.scoutFlame === true,
      curseIds: normalizeCurseIds(pending.curseIds),
      pendingRelicRoll: pending.pendingRelicRoll === true,
    },
    lastAwardedRunId: typeof value.lastAwardedRunId === 'string' ? value.lastAwardedRunId : null,
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
