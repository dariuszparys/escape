import { MAX_ARMOR, MAX_HAND, MAX_INVENTORY, PLAYER_MAX_HP } from './config';
import { Card } from './data/cards';
import { InventoryItem, makeItem } from './data/items';
import { selectCombatHand } from './game/cardSelection';

/** Mutable state of the current run, shared across scenes. */
export class RunState {
  seed: string;
  hp = PLAYER_MAX_HP;
  maxHp = PLAYER_MAX_HP;
  cardCollection: Card[] = [];
  combatHand: Card[] = [];
  inventory: InventoryItem[] = [];
  gold = 0;
  armor = 0; // each point = 1 flat damage reduction in battle
  depth = 1;
  bossDefeated = false;

  constructor(seed = String(Math.random())) {
    this.seed = seed;
  }

  get hand(): Card[] {
    return this.combatHand;
  }

  set hand(cards: Card[]) {
    this.cardCollection = [...cards];
    this.refreshCombatHand();
  }

  get potions(): number {
    return this.inventory.filter((item) => item.kind === 'heal').length;
  }

  set potions(count: number) {
    const nonPotions = this.inventory.filter((item) => item.kind !== 'heal');
    const potions = Array.from({ length: Math.max(0, count) }, () => makeItem('small_potion'));
    this.inventory = [...nonPotions, ...potions].slice(0, MAX_INVENTORY);
  }

  get handFull(): boolean {
    return this.combatHand.length >= MAX_HAND;
  }

  get inventoryFull(): boolean {
    return this.inventory.length >= MAX_INVENTORY;
  }

  addCard(card: Card): boolean {
    this.cardCollection.push(card);
    this.refreshCombatHand();
    return true;
  }

  refreshCombatHand(): void {
    this.combatHand = selectCombatHand(this.cardCollection);
  }

  addItem(item: InventoryItem): boolean {
    if (this.inventoryFull) return false;
    this.inventory.push(item);
    return true;
  }

  removeItem(uid: number): InventoryItem | null {
    const index = this.inventory.findIndex((item) => item.uid === uid);
    if (index < 0) return null;
    const [item] = this.inventory.splice(index, 1);
    return item;
  }

  firstUsablePotion(): InventoryItem | null {
    return this.inventory.find((item) => item.kind === 'heal' && item.usableInDungeon) ?? null;
  }

  addGold(amount: number): void {
    this.gold += amount;
  }

  heal(amount: number): void {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  addArmor(): boolean {
    if (this.armor >= MAX_ARMOR) return false;
    this.armor++;
    return true;
  }
}

let current = new RunState();

export function getRun(): RunState {
  return current;
}

export function newRun(seed = String(Math.random())): RunState {
  current = new RunState(seed);
  return current;
}
