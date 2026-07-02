import { MAX_ARMOR, MAX_INVENTORY, PLAYER_MAX_HP } from './config';
import { Card } from './data/cards';
import type { CampfireCurseId } from './data/campfireBargains';
import { InventoryItem, makeItem } from './data/items';
import { RelicId, Relic } from './data/relics';
import type { StarterKitId } from './data/starterKits';
import { DEFAULT_STARTING_CARD_CHOICES, DEFAULT_STARTING_CARD_PICKS } from './game/startingCards';

let nextRunId = 1;

function createRunId(): string {
  return `run-${Date.now()}-${nextRunId++}`;
}

/** Mutable state of the current run, shared across scenes. */
export class RunState {
  seed: string;
  runId: string;
  hp = PLAYER_MAX_HP;
  maxHp = PLAYER_MAX_HP;
  cardCollection: Card[] = [];
  inventory: InventoryItem[] = [];
  gold = 0;
  armor = 0; // each point = 1 flat damage reduction in battle
  depth = 1;
  enemiesDefeated = 0;
  relics: Relic[] = [];
  maxArmor = MAX_ARMOR;
  startingCardChoices = DEFAULT_STARTING_CARD_CHOICES;
  startingCardPicks = DEFAULT_STARTING_CARD_PICKS;
  startingCardsTaken = 0;
  starterKitId: StarterKitId | null = null;
  scoutCharges = 0;
  curseIds: CampfireCurseId[] = [];
  bossDefeated = false;
  /** Current stratum of the endless descent. Starts at 1, advances at each gate via commitDelve. */
  stratum = 1;
  /** Run terminus: true once the player banks and escapes, false on death. Single source of truth. */
  escaped = false;
  isDaily = false;
  dailyKey: string | null = null;

  constructor(seed = String(Math.random()), runId = createRunId()) {
    this.seed = seed;
    this.runId = runId;
  }

  get potions(): number {
    return this.inventory.filter((item) => item.kind === 'heal').length;
  }

  set potions(count: number) {
    const nonPotions = this.inventory.filter((item) => item.kind !== 'heal');
    const potions = Array.from({ length: Math.max(0, count) }, () => makeItem('small_potion'));
    this.inventory = [...nonPotions, ...potions].slice(0, MAX_INVENTORY);
  }

  get inventoryFull(): boolean {
    return this.inventory.length >= MAX_INVENTORY;
  }

  addCard(card: Card): boolean {
    this.cardCollection.push(card);
    return true;
  }

  removeCard(uid: number): boolean {
    if (this.cardCollection.length <= 1) return false;
    const index = this.cardCollection.findIndex((candidate) => candidate.uid === uid);
    if (index < 0) return false;
    this.cardCollection.splice(index, 1);
    return true;
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

  replaceItem(uid: number, item: InventoryItem): boolean {
    const index = this.inventory.findIndex((candidate) => candidate.uid === uid);
    if (index < 0) return false;
    this.inventory[index] = item;
    return true;
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
    if (this.armor >= this.maxArmor) return false;
    this.armor++;
    return true;
  }

  get goldMultiplier(): number {
    return this.hasRelic('lucky_coin') ? 1.5 : 1;
  }

  hasRelic(id: RelicId): boolean {
    return this.relics.some((relic) => relic.id === id);
  }

  addRelic(relic: Relic): void {
    if (this.hasRelic(relic.id)) return;

    this.relics.push(relic);
    this.maxArmor = this.hasRelic('iron_will') ? MAX_ARMOR + 1 : MAX_ARMOR;
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
