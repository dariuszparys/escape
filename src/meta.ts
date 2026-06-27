import type {
  CampfirePurchaseDef,
  CampfirePurchaseState,
  PendingPrep,
} from './data/campfirePurchases';
import { MAX_INVENTORY } from './config';
import { CAMPFIRE_BARGAINS } from './data/campfireBargains';
import type { CampfireCurseId } from './data/campfireBargains';
import { CAMPFIRE_PURCHASES, createDefaultPendingPrep } from './data/campfirePurchases';

export const META_STORAGE_KEY = 'escape.meta.v1';
export const META_ECONOMY_VERSION = 2;

export interface MetaProgressionState {
  starterCardVarietyUnlocked: boolean;
  migrationBonusGranted: boolean;
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

function createDefaultProgressionState(): MetaProgressionState {
  return {
    starterCardVarietyUnlocked: false,
    migrationBonusGranted: false,
  };
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
  return {
    starterCardVarietyUnlocked: value.starterCardVarietyUnlocked === true || migrationBonusGranted,
    migrationBonusGranted,
  };
}

function createMigratedProgressionState(grantsStarterBonus: boolean): MetaProgressionState {
  return {
    starterCardVarietyUnlocked: grantsStarterBonus,
    migrationBonusGranted: grantsStarterBonus,
  };
}

export function normalizeMetaState(value: unknown): MetaState {
  if (!isRecord(value)) return createDefaultMetaState();

  const hasEconomyVersion = Object.prototype.hasOwnProperty.call(value, 'economyVersion');
  if (hasEconomyVersion && value.economyVersion !== META_ECONOMY_VERSION) {
    return createDefaultMetaState();
  }

  const legacyEmbers = normalizeEmbers(value.embers);
  const grantsStarterBonus = !hasEconomyVersion && legacyEmbers > 0;
  const pending = isRecord(value.pendingPrep) ? value.pendingPrep : {};

  return {
    economyVersion: META_ECONOMY_VERSION,
    embers: hasEconomyVersion ? legacyEmbers : 0,
    progression: hasEconomyVersion
      ? normalizeProgression(value.progression)
      : createMigratedProgressionState(grantsStarterBonus),
    pendingPrep: {
      itemIds: normalizeItemIds(pending.itemIds),
      extraStartingChoice: pending.extraStartingChoice === true,
      scoutFlame: pending.scoutFlame === true,
      curseIds: normalizeCurseIds(pending.curseIds),
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
