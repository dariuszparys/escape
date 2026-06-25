export type InventoryItemKind = 'heal' | 'damage' | 'shield' | 'skip_attack';

export interface InventoryItemDef {
  id: string;
  name: string;
  kind: InventoryItemKind;
  amount: number;
  usableInDungeon: boolean;
  usableInCombat: boolean;
  description: string;
}

export interface InventoryItem extends InventoryItemDef {
  uid: number;
}

let nextItemUid = 1;

export const ITEM_DEFS: InventoryItemDef[] = [
  {
    id: 'small_potion',
    name: 'Small Potion',
    kind: 'heal',
    amount: 8,
    usableInDungeon: true,
    usableInCombat: true,
    description: 'Restore 8 HP',
  },
  {
    id: 'large_potion',
    name: 'Large Potion',
    kind: 'heal',
    amount: 15,
    usableInDungeon: true,
    usableInCombat: true,
    description: 'Restore 15 HP',
  },
  {
    id: 'iron_armor',
    name: 'Iron Armor',
    kind: 'shield',
    amount: 5,
    usableInDungeon: false,
    usableInCombat: true,
    description: 'Reduce the next 5 damage',
  },
  {
    id: 'smoke_bomb',
    name: 'Smoke Bomb',
    kind: 'skip_attack',
    amount: 1,
    usableInDungeon: false,
    usableInCombat: true,
    description: 'Skip one enemy attack',
  },
  {
    id: 'bomb',
    name: 'Bomb',
    kind: 'damage',
    amount: 12,
    usableInDungeon: false,
    usableInCombat: true,
    description: 'Deal 12 damage to the enemy',
  },
];

export function makeItem(id: string): InventoryItem {
  const def = ITEM_DEFS.find((item) => item.id === id);
  if (!def) throw new Error(`Unknown item: ${id}`);
  return { ...def, uid: nextItemUid++ };
}

export function randomItemIdForDepth(depth: number): string {
  if (depth >= 7) return 'large_potion';
  return 'small_potion';
}
