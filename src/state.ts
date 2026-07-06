import { MAX_ARMOR, MAX_INVENTORY, PLAYER_MAX_HP } from './config';
import { CARD_DEFS, Card, reserveCardUids, type ArchetypeId } from './data/cards';
import { InventoryItem, ITEM_DEFS, makeItem, reserveItemUids } from './data/items';
import {
  MAX_RELICS_PER_RUN,
  RELIC_DEFS,
  type RelicId,
  type Relic,
  allRelicPool,
  reserveRelicUids,
} from './data/relics';
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

export interface SerializedRunState {
  seed: string;
  runId: string;
  hp: number;
  maxHp: number;
  cardCollection: Card[];
  inventory: InventoryItem[];
  gold: number;
  armor: number;
  depth: number;
  enemiesDefeated: number;
  relics: Relic[];
  maxArmor: number;
  relicPool: RelicId[];
  startingCardChoices: number;
  startingCardPicks: number;
  startingCardsTaken: number;
  scenarioId: ScenarioId | null;
  archetypeId: ArchetypeId | null;
  scoutCharges: number;
  bossDefeated: boolean;
  eliteOfferedForDecade: number | null;
  escaped: boolean;
  isDaily: boolean;
  dailyKey: string | null;
  elitesDefeated: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function finiteInteger(value: unknown, fallback: number): number {
  return Math.floor(finiteNumber(value, fallback));
}

const CARD_IDS = new Set(CARD_DEFS.map((card) => card.id));
const ITEM_IDS = new Set(ITEM_DEFS.map((item) => item.id));
const RELIC_IDS = new Set<string>(RELIC_DEFS.map((relic) => relic.id));

function cloneCards(value: unknown): Card[] | null {
  if (!Array.isArray(value)) return null;
  const cards: Card[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== 'string' || !CARD_IDS.has(item.id)) return null;
    if (typeof item.uid !== 'number' || !Number.isFinite(item.uid)) return null;
    cards.push(item as unknown as Card);
  }
  return cards;
}

function cloneItems(value: unknown): InventoryItem[] | null {
  if (!Array.isArray(value)) return null;
  const items: InventoryItem[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== 'string' || !ITEM_IDS.has(item.id)) return null;
    if (typeof item.uid !== 'number' || !Number.isFinite(item.uid)) return null;
    items.push(item as unknown as InventoryItem);
  }
  return items.slice(0, MAX_INVENTORY);
}

function cloneRelics(value: unknown): Relic[] | null {
  if (!Array.isArray(value)) return null;
  const relics: Relic[] = [];
  const seen = new Set<RelicId>();
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== 'string' || !RELIC_IDS.has(item.id)) return null;
    if (typeof item.uid !== 'number' || !Number.isFinite(item.uid)) return null;
    const relicId = item.id as RelicId;
    if (seen.has(relicId)) continue;
    seen.add(relicId);
    relics.push(item as unknown as Relic);
  }
  return relics.slice(0, MAX_RELICS_PER_RUN);
}

function cloneRelicPool(value: unknown): ReadonlySet<RelicId> | null {
  if (!Array.isArray(value)) return null;
  const relicIds: RelicId[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !RELIC_IDS.has(item)) return null;
    const relicId = item as RelicId;
    if (!relicIds.includes(relicId)) relicIds.push(relicId);
  }
  return new Set(relicIds);
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

  toJSON(): SerializedRunState {
    return {
      seed: this.seed,
      runId: this.runId,
      hp: this.hp,
      maxHp: this.maxHp,
      cardCollection: this.cardCollection,
      inventory: this.inventory,
      gold: this.gold,
      armor: this.armor,
      depth: this.depth,
      enemiesDefeated: this.enemiesDefeated,
      relics: this.relics,
      maxArmor: this.maxArmor,
      relicPool: [...this.relicPool],
      startingCardChoices: this.startingCardChoices,
      startingCardPicks: this.startingCardPicks,
      startingCardsTaken: this.startingCardsTaken,
      scenarioId: this.scenarioId,
      archetypeId: this.archetypeId,
      scoutCharges: this.scoutCharges,
      bossDefeated: this.bossDefeated,
      eliteOfferedForDecade: this.eliteOfferedForDecade,
      escaped: this.escaped,
      isDaily: this.isDaily,
      dailyKey: this.dailyKey,
      elitesDefeated: this.elitesDefeated,
    };
  }

  static fromJSON(value: unknown): RunState | null {
    if (!isRecord(value) || typeof value.seed !== 'string' || typeof value.runId !== 'string') {
      return null;
    }

    const cardCollection = cloneCards(value.cardCollection);
    const inventory = cloneItems(value.inventory);
    const relics = cloneRelics(value.relics);
    const relicPool = cloneRelicPool(value.relicPool);
    if (!cardCollection || !inventory || !relics || !relicPool) return null;

    const run = new RunState(value.seed, value.runId);
    run.hp = Math.max(0, finiteInteger(value.hp, PLAYER_MAX_HP));
    run.maxHp = Math.max(1, finiteInteger(value.maxHp, PLAYER_MAX_HP));
    run.cardCollection = cardCollection;
    run.inventory = inventory;
    run.gold = Math.max(0, finiteInteger(value.gold, 0));
    run.armor = Math.max(0, finiteInteger(value.armor, 0));
    run.depth = Math.max(1, finiteInteger(value.depth, 1));
    run.enemiesDefeated = Math.max(0, finiteInteger(value.enemiesDefeated, 0));
    run.relics = relics;
    run.maxArmor = Math.max(MAX_ARMOR, finiteInteger(value.maxArmor, MAX_ARMOR));
    run.relicPool = relicPool;
    run.startingCardChoices = Math.max(1, finiteInteger(value.startingCardChoices, 3));
    run.startingCardPicks = Math.max(1, finiteInteger(value.startingCardPicks, 2));
    run.startingCardsTaken = Math.max(0, finiteInteger(value.startingCardsTaken, 0));
    run.scenarioId = typeof value.scenarioId === 'string' ? (value.scenarioId as ScenarioId) : null;
    run.archetypeId =
      typeof value.archetypeId === 'string' ? (value.archetypeId as ArchetypeId) : null;
    run.scoutCharges = Math.max(0, finiteInteger(value.scoutCharges, 0));
    run.bossDefeated = value.bossDefeated === true;
    run.eliteOfferedForDecade =
      typeof value.eliteOfferedForDecade === 'number' &&
      Number.isFinite(value.eliteOfferedForDecade)
        ? Math.floor(value.eliteOfferedForDecade)
        : null;
    run.escaped = value.escaped === true;
    run.isDaily = value.isDaily === true;
    run.dailyKey = typeof value.dailyKey === 'string' ? value.dailyKey : null;
    run.elitesDefeated = Math.max(0, finiteInteger(value.elitesDefeated, 0));

    reserveCardUids(run.cardCollection);
    reserveItemUids(run.inventory);
    reserveRelicUids(run.relics);
    return run;
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

export function setRun(run: RunState): RunState {
  current = run;
  return current;
}
