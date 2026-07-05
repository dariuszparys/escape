import { MAX_INVENTORY } from '../config';
import type { CampfireCurseId } from './campfireBargains';
import type { InventoryItemDef } from './items';

export type CampfirePurchaseId =
  | 'small_potion'
  | 'smoke_bomb'
  | 'bomb'
  | 'extra_starting_choice'
  | 'scout_flame'
  | 'relic_charm';

export interface PendingPrep {
  itemIds: InventoryItemDef['id'][];
  extraStartingChoice: boolean;
  scoutFlame: boolean;
  curseIds?: CampfireCurseId[];
  /** Roll a random unlocked relic at run start (Relic Charm purchase). */
  pendingRelicRoll?: boolean;
}

interface CampfirePurchaseBase {
  id: CampfirePurchaseId;
  name: string;
  cost: number;
  description: string;
}

export type CampfirePurchaseDef =
  | (CampfirePurchaseBase & {
      kind: 'item';
      itemId: InventoryItemDef['id'];
    })
  | (CampfirePurchaseBase & {
      kind: 'extra_starting_choice' | 'scout_flame' | 'relic_charm';
      itemId?: never;
    });

export interface CampfirePurchaseState {
  embers: number;
  pendingPrep: PendingPrep;
}

export type PurchaseCheck = { ok: true } | { ok: false; reason: string };

export type PurchaseResult =
  | { ok: true; state: CampfirePurchaseState }
  | { ok: false; reason: string; state: CampfirePurchaseState };

export const CAMPFIRE_PURCHASES: CampfirePurchaseDef[] = [
  {
    id: 'small_potion',
    name: 'Small Potion',
    cost: 4,
    description: 'Start the next run with one small potion.',
    kind: 'item',
    itemId: 'small_potion',
  },
  {
    id: 'smoke_bomb',
    name: 'Smoke Bomb',
    cost: 6,
    description: 'Start the next run with one smoke bomb.',
    kind: 'item',
    itemId: 'smoke_bomb',
  },
  {
    id: 'bomb',
    name: 'Bomb',
    cost: 8,
    description: 'Start the next run with one combat bomb.',
    kind: 'item',
    itemId: 'bomb',
  },
  {
    id: 'extra_starting_choice',
    name: 'Extra Opening Pick',
    cost: 10,
    description: 'Choose three opening cards instead of two.',
    kind: 'extra_starting_choice',
  },
  {
    id: 'scout_flame',
    name: 'Scout Flame',
    cost: 6,
    description: 'Reveal the next room outcome behind each door once.',
    kind: 'scout_flame',
  },
  {
    id: 'relic_charm',
    name: 'Relic Charm',
    cost: 8,
    description: 'Start the next run with a random unlocked relic.',
    kind: 'relic_charm',
  },
];

export function createDefaultPendingPrep(): PendingPrep {
  return {
    itemIds: [],
    extraStartingChoice: false,
    scoutFlame: false,
    curseIds: [],
    pendingRelicRoll: false,
  };
}

export function getCampfirePurchase(id: CampfirePurchaseId): CampfirePurchaseDef {
  const purchase = CAMPFIRE_PURCHASES.find((candidate) => candidate.id === id);
  if (!purchase) throw new Error(`Unknown campfire purchase: ${id}`);
  return purchase;
}

export function canBuyCampfirePurchase(
  state: CampfirePurchaseState,
  purchaseId: CampfirePurchaseId,
): PurchaseCheck {
  const purchase = getCampfirePurchase(purchaseId);
  if (state.embers < purchase.cost) {
    return { ok: false, reason: 'Not enough embers.' };
  }

  if (purchase.kind === 'item') {
    if (state.pendingPrep.itemIds.length >= MAX_INVENTORY) {
      return { ok: false, reason: 'Inventory is full.' };
    }
    return { ok: true };
  }

  if (purchase.kind === 'extra_starting_choice' && state.pendingPrep.extraStartingChoice) {
    return { ok: false, reason: 'Already prepared.' };
  }

  if (purchase.kind === 'scout_flame' && state.pendingPrep.scoutFlame) {
    return { ok: false, reason: 'Already prepared.' };
  }

  if (purchase.kind === 'relic_charm' && state.pendingPrep.pendingRelicRoll) {
    return { ok: false, reason: 'Already prepared.' };
  }

  return { ok: true };
}

export function buyCampfirePurchase(
  state: CampfirePurchaseState,
  purchaseId: CampfirePurchaseId,
): PurchaseResult {
  const check = canBuyCampfirePurchase(state, purchaseId);
  if (!check.ok) return { ...check, state };

  const purchase = getCampfirePurchase(purchaseId);
  const pendingPrep: PendingPrep = {
    itemIds: [...state.pendingPrep.itemIds],
    extraStartingChoice: state.pendingPrep.extraStartingChoice,
    scoutFlame: state.pendingPrep.scoutFlame,
    curseIds: [...(state.pendingPrep.curseIds ?? [])],
    pendingRelicRoll: state.pendingPrep.pendingRelicRoll === true,
  };

  if (purchase.kind === 'item') {
    pendingPrep.itemIds.push(purchase.itemId);
  } else if (purchase.kind === 'extra_starting_choice') {
    pendingPrep.extraStartingChoice = true;
  } else if (purchase.kind === 'scout_flame') {
    pendingPrep.scoutFlame = true;
  } else {
    pendingPrep.pendingRelicRoll = true;
  }

  return {
    ok: true,
    state: {
      embers: state.embers - purchase.cost,
      pendingPrep,
    },
  };
}
