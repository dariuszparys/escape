import { Card, randomCard, randomCardOfTier, randomOffensiveCard } from './cards';

export interface BossSpecial {
  name: string;
  telegraph: string;
  damage: number;
  ignoresBlock: boolean;
  selfHeal: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  texture: string;
  baseHp: number;
  boss: boolean;
  special?: BossSpecial;
}

export interface EnemyInstance {
  def: EnemyDef;
  hp: number;
  maxHp: number;
  cards: Card[];
}

export const ENEMIES: EnemyDef[] = [
  { id: 'slime',    name: 'Slime',        texture: 'slime',    baseHp: 9,  boss: false },
  { id: 'bat',      name: 'Cave Bat',     texture: 'bat',      baseHp: 8,  boss: false },
  { id: 'skeleton', name: 'Skeleton',     texture: 'skeleton', baseHp: 13, boss: false },
];

export const BOSSES: EnemyDef[] = [
  {
    id: 'minotaur', name: 'Minotaur', texture: 'boss_minotaur', baseHp: 42, boss: true,
    special: { name: 'Axe Sweep', telegraph: 'The Minotaur raises its great axe...', damage: 5, ignoresBlock: true, selfHeal: 0 },
  },
  {
    id: 'lich', name: 'The Lich', texture: 'boss_lich', baseHp: 38, boss: true,
    special: { name: 'Soul Drain', telegraph: 'The Lich begins a dark incantation...', damage: 4, ignoresBlock: false, selfHeal: 4 },
  },
  {
    id: 'demon', name: 'Demon King', texture: 'boss_demon', baseHp: 45, boss: true,
    special: { name: 'Hellfire', telegraph: 'Flames gather around the Demon King...', damage: 7, ignoresBlock: false, selfHeal: 0 },
  },
];

/** Enemy always holds one card more than the player (capped at 6). */
export function spawnEnemy(
  rng: Phaser.Math.RandomDataGenerator,
  depth: number,
  playerHandSize: number,
): EnemyInstance {
  const def = rng.pick(ENEMIES);
  const hp = def.baseHp + Math.floor(depth * 1.5);
  const handSize = Math.min(playerHandSize + 1, 6);
  const cards: Card[] = [];
  const minOffense = Math.ceil(handSize / 2);
  for (let i = 0; i < handSize; i++) {
    cards.push(i < minOffense ? randomOffensiveCard(rng, depth) : randomCard(rng, depth));
  }
  return { def, hp, maxHp: hp, cards };
}

export function spawnBoss(rng: Phaser.Math.RandomDataGenerator): EnemyInstance {
  const def = rng.pick(BOSSES);
  const cards: Card[] = [];
  for (let i = 0; i < 6; i++) {
    cards.push(i < 3 ? randomOffensiveCard(rng, 10) : randomCardOfTier(rng, [2, 3]));
  }
  return { def, hp: def.baseHp, maxHp: def.baseHp, cards };
}
