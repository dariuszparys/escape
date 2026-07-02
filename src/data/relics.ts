import { GameRng } from '../game/rng';

export type RelicId = 'swift_boots' | 'iron_will' | 'lucky_coin' | 'vampiric_blade';

export interface RelicDef {
  id: RelicId;
  name: string;
  description: string;
  color: number;
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
  },
  { id: 'iron_will', name: 'Iron Will', description: 'Max armor raised to 4.', color: 0x90d8e8 },
  { id: 'lucky_coin', name: 'Lucky Coin', description: 'Gain 50% more gold.', color: 0xf1c40f },
  {
    id: 'vampiric_blade',
    name: 'Vampiric Blade',
    description: 'Heal 2 HP after each victorious fight.',
    color: 0xc0392b,
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

/** Return a relic the run does not already own, or null if all are owned. */
export function randomRelic(rng: GameRng, ownedIds: ReadonlySet<RelicId>): Relic | null {
  const available = RELIC_DEFS.filter((relic) => !ownedIds.has(relic.id));
  if (available.length === 0) return null;
  return makeRelic(rng.pick(available).id);
}
