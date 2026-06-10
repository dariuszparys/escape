export type CardType = 'attack' | 'block' | 'heal' | 'drain';

export interface CardDef {
  id: string;
  name: string;
  type: CardType;
  value: number;
  tier: 1 | 2 | 3;
  color: number;
  desc: string;
}

export interface Card extends CardDef {
  uid: number;
}

let nextUid = 1;

export const CARD_DEFS: CardDef[] = [
  { id: 'strike',   name: 'Strike',     type: 'attack', value: 3, tier: 1, color: 0xc0392b, desc: 'Deal 3 damage' },
  { id: 'slash',    name: 'Slash',      type: 'attack', value: 4, tier: 1, color: 0xc0392b, desc: 'Deal 4 damage' },
  { id: 'guard',    name: 'Guard',      type: 'block',  value: 3, tier: 1, color: 0x2980b9, desc: 'Block 3 damage' },
  { id: 'mend',     name: 'Mend',       type: 'heal',   value: 4, tier: 1, color: 0x27ae60, desc: 'Restore 4 HP' },
  { id: 'firebolt', name: 'Firebolt',   type: 'attack', value: 5, tier: 2, color: 0xd35400, desc: 'Deal 5 damage' },
  { id: 'heavy',    name: 'Heavy Blow', type: 'attack', value: 6, tier: 2, color: 0xc0392b, desc: 'Deal 6 damage' },
  { id: 'ironwall', name: 'Iron Wall',  type: 'block',  value: 6, tier: 2, color: 0x2980b9, desc: 'Block 6 damage' },
  { id: 'drain',    name: 'Drain',      type: 'drain',  value: 3, tier: 2, color: 0x8e44ad, desc: 'Deal 3, heal 3' },
  { id: 'thunder',  name: 'Thunder',    type: 'attack', value: 7, tier: 3, color: 0xf39c12, desc: 'Deal 7 damage' },
  { id: 'smite',    name: 'Smite',      type: 'attack', value: 8, tier: 3, color: 0xf1c40f, desc: 'Deal 8 damage' },
  { id: 'aegis',    name: 'Aegis',      type: 'block',  value: 8, tier: 3, color: 0x3498db, desc: 'Block 8 damage' },
  { id: 'siphon',   name: 'Siphon',     type: 'drain',  value: 5, tier: 3, color: 0x9b59b6, desc: 'Deal 5, heal 5' },
];

export function makeCard(def: CardDef): Card {
  return { ...def, uid: nextUid++ };
}

function pickWeighted(rng: Phaser.Math.RandomDataGenerator, weights: [number, number, number]): 1 | 2 | 3 {
  const total = weights[0] + weights[1] + weights[2];
  let r = rng.frac() * total;
  if ((r -= weights[0]) < 0) return 1;
  if ((r -= weights[1]) < 0) return 2;
  return 3;
}

/** Random card, tier odds shifting with dungeon depth (1..10). */
export function randomCard(rng: Phaser.Math.RandomDataGenerator, depth: number): Card {
  const t = depth <= 3 ? pickWeighted(rng, [8, 2, 0])
    : depth <= 6 ? pickWeighted(rng, [4, 5, 1])
    : depth <= 9 ? pickWeighted(rng, [2, 5, 3])
    : pickWeighted(rng, [0, 5, 5]);
  const pool = CARD_DEFS.filter((c) => c.tier === t);
  return makeCard(rng.pick(pool));
}

export function randomCardOfTier(rng: Phaser.Math.RandomDataGenerator, tiers: number[]): Card {
  const pool = CARD_DEFS.filter((c) => tiers.includes(c.tier));
  return makeCard(rng.pick(pool));
}

/** Random damage-dealing card (attack or drain), tiered by depth. Keeps enemy decks from stalemating. */
export function randomOffensiveCard(rng: Phaser.Math.RandomDataGenerator, depth: number): Card {
  for (let i = 0; i < 20; i++) {
    const card = randomCard(rng, depth);
    if (card.type === 'attack' || card.type === 'drain') return card;
  }
  return makeCard(CARD_DEFS[0]);
}
