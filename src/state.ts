import { MAX_ARMOR, MAX_INVENTORY, PLAYER_MAX_HP } from './config';
import { Card, type ArchetypeId } from './data/cards';
import { InventoryItem, makeItem } from './data/items';
import { MAX_RELICS_PER_RUN, type RelicId, type Relic, allRelicPool } from './data/relics';
import type { ScenarioId } from './data/scenarios';
import {
  RELIC_ON_ACQUIRE_FILLS_ARMOR,
  RELIC_ON_ACQUIRE_MAX_HP,
  relicGoldMultiplier,
  relicMaxArmor,
  relicRoomEnterHeal,
} from './game/relicRegistry';
import { DEFAULT_STARTING_CARD_CHOICES, DEFAULT_STARTING_CARD_PICKS } from './game/startingCards';
import { discoverRelic, getProfile, setProfile } from './profile';

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
  /** Relic ids eligible for in-run drops (set at run start from meta or daily rules). */
  relicPool: ReadonlySet<RelicId> = allRelicPool();
  startingCardChoices = DEFAULT_STARTING_CARD_CHOICES;
  startingCardPicks = DEFAULT_STARTING_CARD_PICKS;
  startingCardsTaken = 0;
  /** Player-facing Scenario selected for a normal run; null for daily and legacy run setup. */
  scenarioId: ScenarioId | null = null;
  /** The active archetype for this run (null = neutral pool). Drives starting picks and reward draws. */
  archetypeId: ArchetypeId | null = null;
  scoutCharges = 0;
  bossDefeated = false;
  /** The 0-based decade index (see `decadeForDepth`) an elite room has already been offered for (KTD3), or null if none yet this run. Comparing against the current depth's decade is the reset — no explicit boundary reset needed. */
  eliteOfferedForDecade: number | null = null;
  /** Run terminus: true once the player escapes by defeating the room-100 boss, false on death. Single source of truth (R1). */
  escaped = false;
  isDaily = false;
  dailyKey: string | null = null;
  /** Elite rooms defeated this run (for chronicle contracts). */
  elitesDefeated = 0;

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

  get relicIds(): RelicId[] {
    return this.relics.map((relic) => relic.id);
  }

  get atRelicCap(): boolean {
    return this.relics.length >= MAX_RELICS_PER_RUN;
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
    return relicGoldMultiplier(this.relicIds);
  }

  hasRelic(id: RelicId): boolean {
    return this.relics.some((relic) => relic.id === id);
  }

  addRelic(relic: Relic): boolean {
    if (this.hasRelic(relic.id) || this.atRelicCap) return false;

    this.relics.push(relic);
    const profile = getProfile();
    if (!profile.discoveredRelicIds.includes(relic.id)) {
      setProfile(discoverRelic(profile, relic.id));
    }
    this.maxArmor = relicMaxArmor(MAX_ARMOR, this.relicIds);
    if (RELIC_ON_ACQUIRE_FILLS_ARMOR.has(relic.id)) this.armor = this.maxArmor;
    const maxHpBonus = RELIC_ON_ACQUIRE_MAX_HP[relic.id] ?? 0;
    if (maxHpBonus > 0) {
      this.maxHp += maxHpBonus;
      this.hp += maxHpBonus;
    }
    return true;
  }

  /** Heal from room-enter relics (Wanderer's Flask). */
  onRoomEntered(): void {
    const heal = relicRoomEnterHeal(this.relicIds);
    if (heal > 0) this.heal(heal);
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
