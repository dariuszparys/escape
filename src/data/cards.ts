import { GameRng } from '../game/rng';
import { stratumForDepth } from '../game/strata';

export type CardType = 'attack' | 'block' | 'heal' | 'utility' | 'status';
export type StatusEffectType = 'poison' | 'burn' | 'stun';

export type CardEffect =
  | { kind: 'damage'; amount: number }
  | { kind: 'block'; amount: number }
  | { kind: 'heal'; amount: number }
  | { kind: 'status'; status: StatusEffectType; amount: number; duration: number }
  | { kind: 'draw'; amount: number }
  | { kind: 'energy'; amount: number };

export interface CardDef {
  id: string;
  name: string;
  type: CardType;
  tier: 1 | 2 | 3;
  /** Energy cost in the turn battle (R2). Authored on every def (U8). */
  cost: number;
  color: number;
  description: string;
  effects: CardEffect[];
  starterKitOnly?: boolean;
  /** Engine-routed pile flag (KTD1): a played exhaust card joins `exhaustPile` instead of the Discard Pile for the rest of the battle. Pure routing — no per-target resolution semantics. */
  exhaust?: boolean;
}

export interface Card extends CardDef {
  uid: number;
}

let nextUid = 1;

export const CARD_DEFS: CardDef[] = [
  {
    id: 'strike',
    name: 'Strike',
    type: 'attack',
    tier: 1,
    cost: 1,
    color: 0xc0392b,
    description: 'Deal 5 damage',
    effects: [{ kind: 'damage', amount: 5 }],
  },
  {
    id: 'slash',
    name: 'Slash',
    type: 'attack',
    tier: 1,
    cost: 1,
    color: 0xc0392b,
    description: 'Deal 6 damage',
    effects: [{ kind: 'damage', amount: 6 }],
  },
  {
    id: 'guard',
    name: 'Guard',
    type: 'block',
    tier: 1,
    cost: 1,
    color: 0x2980b9,
    description: 'Gain 7 block',
    effects: [{ kind: 'block', amount: 7 }],
  },
  {
    id: 'quick_jab',
    name: 'Quick Jab',
    type: 'attack',
    tier: 1,
    cost: 0,
    color: 0xe67e22,
    description: 'Deal 4 damage',
    effects: [{ kind: 'damage', amount: 4 }],
  },
  {
    id: 'minor_heal',
    name: 'Minor Heal',
    type: 'heal',
    tier: 1,
    cost: 1,
    color: 0x27ae60,
    description: 'Restore 5 HP',
    effects: [{ kind: 'heal', amount: 5 }],
  },
  {
    id: 'riposte',
    name: 'Riposte',
    type: 'utility',
    tier: 1,
    cost: 1,
    color: 0xe67e22,
    description: 'Deal 5, gain 2 block',
    starterKitOnly: true,
    effects: [
      { kind: 'damage', amount: 5 },
      { kind: 'block', amount: 2 },
    ],
  },
  {
    id: 'field_dressing',
    name: 'Field Dressing',
    type: 'heal',
    tier: 1,
    cost: 1,
    color: 0x27ae60,
    description: 'Gain 5 block, restore 2 HP',
    starterKitOnly: true,
    effects: [
      { kind: 'block', amount: 5 },
      { kind: 'heal', amount: 2 },
    ],
  },
  {
    id: 'cinder_hex',
    name: 'Cinder Hex',
    type: 'status',
    tier: 1,
    cost: 1,
    color: 0xd35400,
    description: 'Deal 2, burn 2 for 2 turns',
    starterKitOnly: true,
    effects: [
      { kind: 'damage', amount: 2 },
      { kind: 'status', status: 'burn', amount: 2, duration: 2 },
    ],
  },
  {
    id: 'scavenge',
    name: 'Scavenge',
    type: 'utility',
    tier: 1,
    cost: 0,
    color: 0x16a085,
    description: 'Draw 1, gain 2 block',
    effects: [
      { kind: 'draw', amount: 1 },
      { kind: 'block', amount: 2 },
    ],
  },
  {
    id: 'battle_focus',
    name: 'Battle Focus',
    type: 'utility',
    tier: 1,
    cost: 1,
    color: 0xf39c12,
    description: 'Gain 1 energy, gain 3 block',
    effects: [
      { kind: 'energy', amount: 1 },
      { kind: 'block', amount: 3 },
    ],
  },
  {
    id: 'heavy_strike',
    name: 'Heavy Strike',
    type: 'attack',
    tier: 2,
    cost: 2,
    color: 0xc0392b,
    description: 'Deal 10 damage',
    effects: [{ kind: 'damage', amount: 10 }],
  },
  {
    id: 'poison_dagger',
    name: 'Poison Dagger',
    type: 'status',
    tier: 2,
    cost: 1,
    color: 0x8e44ad,
    description: 'Deal 3 and poison',
    effects: [
      { kind: 'damage', amount: 3 },
      { kind: 'status', status: 'poison', amount: 2, duration: 3 },
    ],
  },
  {
    id: 'fire_spark',
    name: 'Fire Spark',
    type: 'status',
    tier: 2,
    cost: 2,
    color: 0xd35400,
    description: 'Deal 4 and burn',
    effects: [
      { kind: 'damage', amount: 4 },
      { kind: 'status', status: 'burn', amount: 3, duration: 2 },
    ],
  },
  {
    id: 'shield_bash',
    name: 'Shield Bash',
    type: 'utility',
    tier: 2,
    cost: 1,
    color: 0x3498db,
    description: 'Deal 3, gain 4 block',
    effects: [
      { kind: 'damage', amount: 3 },
      { kind: 'block', amount: 4 },
    ],
  },
  {
    id: 'iron_wall',
    name: 'Iron Wall',
    type: 'block',
    tier: 2,
    cost: 2,
    color: 0x2980b9,
    description: 'Gain 10 block',
    effects: [{ kind: 'block', amount: 10 }],
  },
  {
    id: 'ransack',
    name: 'Ransack',
    type: 'utility',
    tier: 2,
    cost: 1,
    color: 0x16a085,
    description: 'Draw 2 cards, exhaust',
    exhaust: true,
    effects: [{ kind: 'draw', amount: 2 }],
  },
  {
    id: 'overcharge',
    name: 'Overcharge',
    type: 'utility',
    tier: 2,
    cost: 1,
    color: 0xf39c12,
    description: 'Gain 2 energy, exhaust',
    exhaust: true,
    effects: [{ kind: 'energy', amount: 2 }],
  },
  {
    id: 'rally_strike',
    name: 'Rally Strike',
    type: 'utility',
    tier: 2,
    cost: 1,
    color: 0xc0392b,
    description: 'Deal 4, gain 1 energy',
    effects: [
      { kind: 'damage', amount: 4 },
      { kind: 'energy', amount: 1 },
    ],
  },
  {
    id: 'riving_cut',
    name: 'Riving Cut',
    type: 'utility',
    tier: 2,
    cost: 2,
    color: 0xc0392b,
    description: 'Deal 7, draw 1',
    effects: [
      { kind: 'damage', amount: 7 },
      { kind: 'draw', amount: 1 },
    ],
  },
  {
    id: 'thunder',
    name: 'Thunder',
    type: 'attack',
    tier: 3,
    cost: 2,
    color: 0xf39c12,
    description: 'Deal 12 damage',
    effects: [{ kind: 'damage', amount: 12 }],
  },
  {
    id: 'aegis',
    name: 'Aegis',
    type: 'block',
    tier: 3,
    cost: 2,
    color: 0x3498db,
    description: 'Gain 14 block',
    effects: [{ kind: 'block', amount: 14 }],
  },
  {
    id: 'stunning_blow',
    name: 'Stunning Blow',
    type: 'status',
    tier: 3,
    cost: 2,
    color: 0xf1c40f,
    description: 'Deal 6 and stun',
    effects: [
      { kind: 'damage', amount: 6 },
      { kind: 'status', status: 'stun', amount: 1, duration: 1 },
    ],
  },
  {
    id: 'last_stand',
    name: 'Last Stand',
    type: 'block',
    tier: 3,
    cost: 2,
    color: 0x2980b9,
    description: 'Gain 20 block, exhaust',
    exhaust: true,
    effects: [{ kind: 'block', amount: 20 }],
  },
  {
    id: 'second_wind',
    name: 'Second Wind',
    type: 'utility',
    tier: 3,
    cost: 2,
    color: 0x16a085,
    description: 'Draw 2, restore 3 HP',
    effects: [
      { kind: 'draw', amount: 2 },
      { kind: 'heal', amount: 3 },
    ],
  },
];

const STANDARD_CARD_DEFS = CARD_DEFS.filter((card) => !card.starterKitOnly);

export function makeCard(def: CardDef): Card {
  return { ...def, uid: nextUid++ };
}

export function primaryCardValue(card: Pick<CardDef, 'effects'>): number {
  const damage = cardEffectAmount(card, 'damage');
  if (damage > 0) return damage;
  return card.effects.reduce((sum, effect) => sum + effect.amount, 0);
}

export function cardEffectAmount(card: Pick<CardDef, 'effects'>, kind: CardEffect['kind']): number {
  return card.effects
    .filter((effect) => effect.kind === kind)
    .reduce((sum, effect) => sum + effect.amount, 0);
}

function pickWeighted(rng: GameRng, weights: [number, number, number]): 1 | 2 | 3 {
  const total = weights[0] + weights[1] + weights[2];
  const r = rng.frac() * total;
  if (r < weights[0]) return 1;
  if (r < weights[0] + weights[1]) return 2;
  return 3;
}

/**
 * Tier weights past depth 9. The depth-9 baseline is [0, 5, 5]; each stratum beyond
 * the first shifts one point from tier 2 toward tier 3 (clamped so a sliver of tier 2
 * always remains), so deeper strata keep improving card quality rather than freezing.
 * Deterministic in depth — Daily reproducibility holds (KTD4).
 */
function deepTierWeights(depth: number): [number, number, number] {
  const beyondFirst = Math.max(0, stratumForDepth(depth) - 1);
  const tier2 = Math.max(1, 5 - beyondFirst);
  return [0, tier2, 10 - tier2];
}

/** Random card, tier odds shifting with dungeon depth and continuing to climb across strata. */
export function randomCard(rng: GameRng, depth: number): Card {
  const t =
    depth <= 3
      ? pickWeighted(rng, [8, 2, 0])
      : depth <= 6
        ? pickWeighted(rng, [4, 5, 1])
        : depth <= 9
          ? pickWeighted(rng, [2, 5, 3])
          : pickWeighted(rng, deepTierWeights(depth));
  const pool = STANDARD_CARD_DEFS.filter((c) => c.tier === t);
  return makeCard(rng.pick(pool));
}

export function randomCardOfTier(rng: GameRng, tiers: number[]): Card {
  const pool = STANDARD_CARD_DEFS.filter((c) => tiers.includes(c.tier));
  return makeCard(rng.pick(pool));
}

/** Random damage-dealing card, tiered by depth. Keeps enemy decks from stalemating. */
export function randomOffensiveCard(rng: GameRng, depth: number): Card {
  for (let i = 0; i < 20; i++) {
    const card = randomCard(rng, depth);
    if (cardEffectAmount(card, 'damage') > 0) return card;
  }
  return makeCard(STANDARD_CARD_DEFS[0]);
}
