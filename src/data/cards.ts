import { GameRng } from '../game/rng';

export type CardType = 'attack' | 'block' | 'heal' | 'utility' | 'status';
export type StatusEffectType = 'poison' | 'burn' | 'stun';

export type CardEffect =
  | { kind: 'damage'; amount: number }
  | { kind: 'block'; amount: number }
  | { kind: 'heal'; amount: number }
  | { kind: 'status'; status: StatusEffectType; amount: number; duration: number };

export interface CardDef {
  id: string;
  name: string;
  type: CardType;
  tier: 1 | 2 | 3;
  cost: number;
  speed: number;
  color: number;
  description: string;
  effects: CardEffect[];
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
    cost: 0,
    speed: 5,
    color: 0xc0392b,
    description: 'Deal 5 damage',
    effects: [{ kind: 'damage', amount: 5 }],
  },
  {
    id: 'slash',
    name: 'Slash',
    type: 'attack',
    tier: 1,
    cost: 0,
    speed: 5,
    color: 0xc0392b,
    description: 'Deal 6 damage',
    effects: [{ kind: 'damage', amount: 6 }],
  },
  {
    id: 'guard',
    name: 'Guard',
    type: 'block',
    tier: 1,
    cost: 0,
    speed: 6,
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
    speed: 8,
    color: 0xe67e22,
    description: 'Deal 4 damage first',
    effects: [{ kind: 'damage', amount: 4 }],
  },
  {
    id: 'minor_heal',
    name: 'Minor Heal',
    type: 'heal',
    tier: 1,
    cost: 0,
    speed: 4,
    color: 0x27ae60,
    description: 'Restore 5 HP',
    effects: [{ kind: 'heal', amount: 5 }],
  },
  {
    id: 'heavy_strike',
    name: 'Heavy Strike',
    type: 'attack',
    tier: 2,
    cost: 0,
    speed: 1,
    color: 0xc0392b,
    description: 'Deal 10 damage, slower',
    effects: [{ kind: 'damage', amount: 10 }],
  },
  {
    id: 'poison_dagger',
    name: 'Poison Dagger',
    type: 'status',
    tier: 2,
    cost: 0,
    speed: 6,
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
    cost: 0,
    speed: 5,
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
    cost: 0,
    speed: 5,
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
    cost: 0,
    speed: 6,
    color: 0x2980b9,
    description: 'Gain 10 block',
    effects: [{ kind: 'block', amount: 10 }],
  },
  {
    id: 'thunder',
    name: 'Thunder',
    type: 'attack',
    tier: 3,
    cost: 0,
    speed: 6,
    color: 0xf39c12,
    description: 'Deal 12 damage',
    effects: [{ kind: 'damage', amount: 12 }],
  },
  {
    id: 'aegis',
    name: 'Aegis',
    type: 'block',
    tier: 3,
    cost: 0,
    speed: 7,
    color: 0x3498db,
    description: 'Gain 14 block',
    effects: [{ kind: 'block', amount: 14 }],
  },
  {
    id: 'stunning_blow',
    name: 'Stunning Blow',
    type: 'status',
    tier: 3,
    cost: 0,
    speed: 4,
    color: 0xf1c40f,
    description: 'Deal 6 and stun',
    effects: [
      { kind: 'damage', amount: 6 },
      { kind: 'status', status: 'stun', amount: 1, duration: 1 },
    ],
  },
];

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

/** Random card, tier odds shifting with dungeon depth (1..10). */
export function randomCard(rng: GameRng, depth: number): Card {
  const t =
    depth <= 3
      ? pickWeighted(rng, [8, 2, 0])
      : depth <= 6
        ? pickWeighted(rng, [4, 5, 1])
        : depth <= 9
          ? pickWeighted(rng, [2, 5, 3])
          : pickWeighted(rng, [0, 5, 5]);
  const pool = CARD_DEFS.filter((c) => c.tier === t);
  return makeCard(rng.pick(pool));
}

export function randomCardOfTier(rng: GameRng, tiers: number[]): Card {
  const pool = CARD_DEFS.filter((c) => tiers.includes(c.tier));
  return makeCard(rng.pick(pool));
}

/** Random damage-dealing card, tiered by depth. Keeps enemy decks from stalemating. */
export function randomOffensiveCard(rng: GameRng, depth: number): Card {
  for (let i = 0; i < 20; i++) {
    const card = randomCard(rng, depth);
    if (cardEffectAmount(card, 'damage') > 0) return card;
  }
  return makeCard(CARD_DEFS[0]);
}
