import { GameRng } from '../game/rng';

export type RelicFamily = 'combat' | 'economy' | 'survival' | 'utility';

export type RelicId =
  | 'swift_boots'
  | 'iron_will'
  | 'lucky_coin'
  | 'vampiric_blade'
  | 'spark_coil'
  | 'stone_heart'
  | 'venom_ring'
  | 'hunter_charm'
  | 'merchants_seal'
  | 'hoarders_map'
  | 'vital_charm'
  | 'wanderers_flask';

/** Maximum unique relics a run can hold. */
export const MAX_RELICS_PER_RUN = 6;

/** Starter relic pool — always available once the relic path is unlocked (and on daily runs). */
export const STARTER_RELIC_IDS: RelicId[] = [
  'swift_boots',
  'iron_will',
  'lucky_coin',
  'vampiric_blade',
];

export interface RelicDef {
  id: RelicId;
  name: string;
  description: string;
  color: number;
  family: RelicFamily;
  unlockCost: number;
  unlockRequires?: RelicId[];
  startingRelicEligible?: boolean;
}

export interface Relic extends RelicDef {
  uid: number;
}

let nextRelicUid = 1;

export const RELIC_DEFS: RelicDef[] = [
  {
    id: 'swift_boots',
    name: 'Swift Boots',
    description: 'Draw 6 cards each battle turn instead of 5.',
    color: 0x7fb2e8,
    family: 'combat',
    unlockCost: 0,
    startingRelicEligible: true,
  },
  {
    id: 'iron_will',
    name: 'Iron Will',
    description: 'Max armor raised to 4.',
    color: 0x90d8e8,
    family: 'survival',
    unlockCost: 0,
    startingRelicEligible: true,
  },
  {
    id: 'lucky_coin',
    name: 'Lucky Coin',
    description: 'Gain 50% more gold.',
    color: 0xf1c40f,
    family: 'economy',
    unlockCost: 0,
    startingRelicEligible: true,
  },
  {
    id: 'vampiric_blade',
    name: 'Vampiric Blade',
    description: 'Heal 2 HP after each victorious fight.',
    color: 0xc0392b,
    family: 'survival',
    unlockCost: 0,
    startingRelicEligible: true,
  },
  {
    id: 'spark_coil',
    name: 'Spark Coil',
    description: 'Start each battle with +1 energy on turn 1.',
    color: 0xf39c12,
    family: 'combat',
    unlockCost: 5,
    startingRelicEligible: true,
  },
  {
    id: 'stone_heart',
    name: 'Stone Heart',
    description: 'Retain up to 3 block between turns.',
    color: 0x95a5a6,
    family: 'combat',
    unlockCost: 5,
  },
  {
    id: 'venom_ring',
    name: 'Venom Ring',
    description: 'Poison you apply deals +1 damage.',
    color: 0x8e44ad,
    family: 'combat',
    unlockCost: 6,
  },
  {
    id: 'hunter_charm',
    name: "Hunter's Charm",
    description: 'Draw 1 card when an enemy dies.',
    color: 0x27ae60,
    family: 'combat',
    unlockCost: 6,
  },
  {
    id: 'merchants_seal',
    name: "Merchant's Seal",
    description: 'Gain +8 gold after defeating an elite.',
    color: 0xe67e22,
    family: 'economy',
    unlockCost: 5,
  },
  {
    id: 'hoarders_map',
    name: "Hoarder's Map",
    description: 'Chest gold rewards are 25% higher.',
    color: 0xd4ac0d,
    family: 'economy',
    unlockCost: 6,
  },
  {
    id: 'vital_charm',
    name: 'Vital Charm',
    description: 'Gain +5 max HP when acquired.',
    color: 0xe74c3c,
    family: 'survival',
    unlockCost: 5,
    startingRelicEligible: true,
  },
  {
    id: 'wanderers_flask',
    name: "Wanderer's Flask",
    description: 'Heal 1 HP when entering a new room.',
    color: 0x3498db,
    family: 'survival',
    unlockCost: 6,
  },
];

export function relicDef(id: RelicId): RelicDef {
  const def = RELIC_DEFS.find((candidate) => candidate.id === id);
  if (!def) {
    throw new Error(`Unknown relic: ${id}`);
  }

  return def;
}

export function makeRelic(id: RelicId): Relic {
  return { ...relicDef(id), uid: nextRelicUid++ };
}

export function starterRelicPool(): ReadonlySet<RelicId> {
  return new Set(STARTER_RELIC_IDS);
}

export function relicPoolFromUnlocked(unlockedIds: readonly RelicId[]): ReadonlySet<RelicId> {
  const pool = new Set<RelicId>(STARTER_RELIC_IDS);
  for (const id of unlockedIds) {
    if (RELIC_DEFS.some((def) => def.id === id)) pool.add(id);
  }
  return pool;
}

/** Return a relic the run does not already own from the pool, or null if none remain. */
export function randomRelic(
  rng: GameRng,
  ownedIds: ReadonlySet<RelicId>,
  poolIds: ReadonlySet<RelicId>,
): Relic | null {
  if (ownedIds.size >= MAX_RELICS_PER_RUN) return null;
  const available = RELIC_DEFS.filter((relic) => poolIds.has(relic.id) && !ownedIds.has(relic.id));
  if (available.length === 0) return null;
  return makeRelic(rng.pick(available).id);
}

/** Pick `count` distinct unowned relics from the pool for reward choice UI. */
export function rollRelicOffers(
  rng: GameRng,
  ownedIds: ReadonlySet<RelicId>,
  poolIds: ReadonlySet<RelicId>,
  count = 3,
): Relic[] {
  if (ownedIds.size >= MAX_RELICS_PER_RUN) return [];
  const available = RELIC_DEFS.filter((relic) => poolIds.has(relic.id) && !ownedIds.has(relic.id));
  const offers: Relic[] = [];
  const remaining = [...available];
  for (let i = 0; i < count && remaining.length > 0; i++) {
    const picked = rng.pick(remaining);
    offers.push(makeRelic(picked.id));
    const index = remaining.findIndex((candidate) => candidate.id === picked.id);
    remaining.splice(index, 1);
  }
  return offers;
}

export function formatRelicSummary(relics: readonly Relic[]): string {
  if (relics.length === 0) return 'No relics collected.';
  return relics.map((relic) => `${relic.name}: ${relic.description}`).join('\n');
}
