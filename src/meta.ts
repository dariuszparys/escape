import type {
  CampfirePurchaseDef,
  CampfirePurchaseState,
  PendingPrep,
} from './data/campfirePurchases';
import { MAX_INVENTORY } from './config';
import {
  CAMPFIRE_PURCHASES,
  createDefaultPendingPrep,
} from './data/campfirePurchases';

export const META_STORAGE_KEY = 'escape.meta.v1';

export interface MetaState extends CampfirePurchaseState {
  embers: number;
  pendingPrep: PendingPrep;
  lastAwardedRunId: string | null;
}

export function createDefaultMetaState(): MetaState {
  return {
    embers: 0,
    pendingPrep: createDefaultPendingPrep(),
    lastAwardedRunId: null,
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
  CAMPFIRE_PURCHASES
    .filter(isCampfireItemPurchase)
    .map((purchase) => purchase.itemId),
);

function normalizeItemIds(value: unknown): PendingPrep['itemIds'] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is PendingPrep['itemIds'][number] => (
      typeof item === 'string' && CAMPFIRE_ITEM_IDS.has(item)
    ))
    .slice(0, MAX_INVENTORY);
}

export function normalizeMetaState(value: unknown): MetaState {
  if (!isRecord(value)) return createDefaultMetaState();

  const embers = typeof value.embers === 'number' && Number.isFinite(value.embers)
    ? Math.max(0, Math.floor(value.embers))
    : 0;
  const pending = isRecord(value.pendingPrep) ? value.pendingPrep : {};

  return {
    embers,
    pendingPrep: {
      itemIds: normalizeItemIds(pending.itemIds),
      extraStartingChoice: pending.extraStartingChoice === true,
      scoutFlame: pending.scoutFlame === true,
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

export function updateMeta(update: (meta: MetaState) => MetaState): MetaState {
  return setMeta(update(current));
}
