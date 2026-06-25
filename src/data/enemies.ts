import { Card, CardEffect, randomCard, randomCardOfTier, randomOffensiveCard } from './cards';
import { GameRng } from '../game/rng';
import type { ActiveStatusEffect } from '../game/combat';

export type EnemyTier = 'weak' | 'medium' | 'strong';

export interface BossSpecial {
  name: string;
  telegraph: string;
  interval: number;
  speed: number;
  effects: CardEffect[];
}

export interface EnemyDef {
  id: string;
  name: string;
  texture: string;
  baseHp: number;
  tier?: EnemyTier;
  boss: boolean;
  special?: BossSpecial;
}

export interface EnemyInstance {
  def: EnemyDef;
  hp: number;
  maxHp: number;
  armor: number;
  statuses: ActiveStatusEffect[];
  cards: Card[];
}

export const ENEMIES: EnemyDef[] = [
  { id: 'rat', name: 'Rat', texture: 'bat', baseHp: 10, tier: 'weak', boss: false },
  { id: 'slime', name: 'Slime', texture: 'slime', baseHp: 12, tier: 'weak', boss: false },
  { id: 'skeleton', name: 'Skeleton', texture: 'skeleton', baseHp: 14, tier: 'weak', boss: false },
  { id: 'bandit', name: 'Bandit', texture: 'skeleton', baseHp: 20, tier: 'medium', boss: false },
  { id: 'cultist', name: 'Cultist', texture: 'bat', baseHp: 18, tier: 'medium', boss: false },
  { id: 'armored_goblin', name: 'Armored Goblin', texture: 'slime', baseHp: 23, tier: 'medium', boss: false },
  { id: 'knight', name: 'Knight', texture: 'skeleton', baseHp: 31, tier: 'strong', boss: false },
  { id: 'necromancer', name: 'Necromancer', texture: 'bat', baseHp: 28, tier: 'strong', boss: false },
  { id: 'ogre', name: 'Ogre', texture: 'slime', baseHp: 35, tier: 'strong', boss: false },
];

export const BOSSES: EnemyDef[] = [
  {
    id: 'iron_warden',
    name: 'The Iron Warden',
    texture: 'boss_minotaur',
    baseHp: 66,
    boss: true,
    special: {
      name: 'Warhammer',
      telegraph: 'The Iron Warden braces behind iron plates...',
      interval: 3,
      speed: 4,
      effects: [{ kind: 'block', amount: 5 }, { kind: 'damage', amount: 12 }],
    },
  },
  {
    id: 'bone_oracle',
    name: 'The Bone Oracle',
    texture: 'boss_lich',
    baseHp: 58,
    boss: true,
    special: {
      name: 'Bone Staff',
      telegraph: 'The Bone Oracle raises a staff of splintered bone...',
      interval: 2,
      speed: 6,
      effects: [{ kind: 'status', status: 'poison', amount: 3, duration: 3 }],
    },
  },
  {
    id: 'flame_tyrant',
    name: 'The Flame Tyrant',
    texture: 'boss_demon',
    baseHp: 62,
    boss: true,
    special: {
      name: 'Flame Axe',
      telegraph: 'The Flame Tyrant gathers heat around its axe...',
      interval: 3,
      speed: 5,
      effects: [{ kind: 'damage', amount: 9 }, { kind: 'status', status: 'burn', amount: 4, duration: 2 }],
    },
  },
];

export function getEnemyTierForDepth(depth: number): EnemyTier {
  if (depth <= 3) return 'weak';
  if (depth <= 6) return 'medium';
  return 'strong';
}

/** Enemy always holds one card more than the player combat hand (capped at 6). */
export function spawnEnemy(
  rng: GameRng,
  depth: number,
  playerHandSize: number,
): EnemyInstance {
  const tier = getEnemyTierForDepth(depth);
  const def = rng.pick(ENEMIES.filter((enemy) => enemy.tier === tier));
  const hp = def.baseHp + Math.floor(depth * 1.5);
  const handSize = Math.min(playerHandSize + 1, 6);
  const cards: Card[] = [];
  const minOffense = Math.ceil(handSize / 2);
  for (let i = 0; i < handSize; i++) {
    cards.push(i < minOffense ? randomOffensiveCard(rng, depth) : randomCard(rng, depth));
  }
  return { def, hp, maxHp: hp, armor: 0, statuses: [], cards };
}

export function spawnBoss(rng: GameRng): EnemyInstance {
  const def = rng.pick(BOSSES);
  const cards: Card[] = [];
  for (let i = 0; i < 6; i++) {
    cards.push(i < 3 ? randomOffensiveCard(rng, 10) : randomCardOfTier(rng, [2, 3]));
  }
  return { def, hp: def.baseHp, maxHp: def.baseHp, armor: 0, statuses: [], cards };
}
