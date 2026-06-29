import { Card, CardEffect, randomCard, randomCardOfTier, randomOffensiveCard } from './cards';
import { MAX_DEPTH } from '../config';
import { GameRng } from '../game/rng';
import type { ActiveStatusEffect } from '../game/combat';
import type { RoomThreatProfileId } from '../dungeon/roomThreat';

export type EnemyTier = 'weak' | 'medium' | 'strong';

export interface BossSpecial {
  name: string;
  telegraph: string;
  interval: number;
  speed: number;
  effects: CardEffect[];
}

export type EnemyCombatPreference =
  | 'fast_damage'
  | 'damage'
  | 'block_damage'
  | 'status'
  | 'block'
  | 'heal';

export type EnemyCombatArchetype = 'tempo_pressure' | 'status_pressure' | 'block_pressure';

export interface EnemyCombatScript {
  archetype: EnemyCombatArchetype;
  pattern: EnemyCombatPreference[][];
}

export interface EnemyDef {
  id: string;
  name: string;
  texture: string;
  baseHp: number;
  tier?: EnemyTier;
  boss: boolean;
  dungeonThreatProfile: RoomThreatProfileId;
  combatScript?: EnemyCombatScript;
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
  {
    id: 'rat',
    name: 'Rat',
    texture: 'bat',
    baseHp: 8,
    tier: 'weak',
    boss: false,
    dungeonThreatProfile: 'ignore',
  },
  {
    id: 'slime',
    name: 'Slime',
    texture: 'slime',
    baseHp: 10,
    tier: 'weak',
    boss: false,
    dungeonThreatProfile: 'patrol',
  },
  {
    id: 'skeleton',
    name: 'Skeleton',
    texture: 'skeleton',
    baseHp: 12,
    tier: 'weak',
    boss: false,
    dungeonThreatProfile: 'patrol',
  },
  {
    id: 'bandit',
    name: 'Bandit',
    texture: 'skeleton',
    baseHp: 16,
    tier: 'medium',
    boss: false,
    dungeonThreatProfile: 'alert_chase',
    combatScript: {
      archetype: 'tempo_pressure',
      pattern: [
        ['fast_damage', 'damage'],
        ['damage', 'fast_damage'],
        ['damage', 'fast_damage'],
      ],
    },
  },
  {
    id: 'cultist',
    name: 'Cultist',
    texture: 'bat',
    baseHp: 17,
    tier: 'medium',
    boss: false,
    dungeonThreatProfile: 'alert_chase',
    combatScript: {
      archetype: 'status_pressure',
      pattern: [['status'], ['status', 'damage'], ['status', 'damage']],
    },
  },
  {
    id: 'armored_goblin',
    name: 'Armored Goblin',
    texture: 'slime',
    baseHp: 19,
    tier: 'medium',
    boss: false,
    dungeonThreatProfile: 'alert_chase',
    combatScript: {
      archetype: 'block_pressure',
      pattern: [
        ['block_damage', 'damage'],
        ['damage', 'block_damage'],
        ['block_damage', 'damage', 'block'],
      ],
    },
  },
  {
    id: 'knight',
    name: 'Knight',
    texture: 'skeleton',
    baseHp: 23,
    tier: 'strong',
    boss: false,
    dungeonThreatProfile: 'alert_chase',
    // Relentless tempo: leads fast, then disciplined pressure with a guarded swing.
    combatScript: {
      archetype: 'tempo_pressure',
      pattern: [
        ['fast_damage', 'damage'],
        ['damage', 'block_damage'],
        ['fast_damage', 'damage'],
      ],
    },
  },
  {
    id: 'necromancer',
    name: 'Necromancer',
    texture: 'bat',
    baseHp: 24,
    tier: 'strong',
    boss: false,
    dungeonThreatProfile: 'alert_chase',
    // Status-first attrition: stacks afflictions, then converts them into damage.
    combatScript: {
      archetype: 'status_pressure',
      pattern: [['status', 'damage'], ['status'], ['status', 'damage']],
    },
  },
  {
    id: 'ogre',
    name: 'Ogre',
    texture: 'slime',
    baseHp: 27,
    tier: 'strong',
    boss: false,
    dungeonThreatProfile: 'alert_chase',
    // Block-pressure bruiser: braces hard, then unloads a heavy, guarded smash.
    combatScript: {
      archetype: 'block_pressure',
      pattern: [
        ['block', 'damage'],
        ['block_damage', 'damage'],
        ['damage', 'block'],
      ],
    },
  },
];

export const BOSSES: EnemyDef[] = [
  {
    id: 'iron_warden',
    name: 'The Iron Warden',
    texture: 'boss_minotaur',
    baseHp: 44,
    boss: true,
    dungeonThreatProfile: 'boss_pressure',
    special: {
      name: 'Warhammer',
      telegraph: 'The Iron Warden braces behind iron plates...',
      interval: 5,
      speed: 4,
      effects: [
        { kind: 'block', amount: 3 },
        { kind: 'damage', amount: 6 },
      ],
    },
  },
  {
    id: 'bone_oracle',
    name: 'The Bone Oracle',
    texture: 'boss_lich',
    baseHp: 40,
    boss: true,
    dungeonThreatProfile: 'boss_pressure',
    special: {
      name: 'Bone Staff',
      telegraph: 'The Bone Oracle raises a staff of splintered bone...',
      interval: 4,
      speed: 6,
      effects: [{ kind: 'status', status: 'poison', amount: 1, duration: 2 }],
    },
  },
  {
    id: 'flame_tyrant',
    name: 'The Flame Tyrant',
    texture: 'boss_demon',
    baseHp: 42,
    boss: true,
    dungeonThreatProfile: 'boss_pressure',
    special: {
      name: 'Flame Axe',
      telegraph: 'The Flame Tyrant gathers heat around its axe...',
      interval: 5,
      speed: 5,
      effects: [
        { kind: 'damage', amount: 5 },
        { kind: 'status', status: 'burn', amount: 1, duration: 2 },
      ],
    },
  },
];

export function getEnemyTierForDepth(depth: number): EnemyTier {
  if (depth <= 3) return 'weak';
  if (depth <= 6) return 'medium';
  return 'strong';
}

export function getEnemyThreatProfile(def: EnemyDef): RoomThreatProfileId {
  return def.dungeonThreatProfile;
}

/**
 * Per-depth HP slope past the first stratum. The base run keeps the original
 * `baseHp + depth`; deeper strata still climb (R10) but at a gentler slope so the
 * delve stays winnable rather than a DPS wall. Tuned against the U7 harness (KTD8).
 */
const DEEP_HP_SLOPE = 0.3;

/** Enemy HP for a depth: linear through stratum 1, gentler past it. */
export function enemyHpForDepth(baseHp: number, depth: number): number {
  if (depth <= MAX_DEPTH) return baseHp + depth;
  return baseHp + MAX_DEPTH + Math.round((depth - MAX_DEPTH) * DEEP_HP_SLOPE);
}

/**
 * Enemy deck quality is capped at the late-base-run tier curve. The deep tier-shift
 * (U8) is meant to enrich the player's chest rewards, not arm enemies with a tier-3
 * flood — uncapped, deep enemies out-DPS any deck and make the delve unwinnable
 * (found via the U7 harness). Their HP still scales with depth (R10).
 */
const ENEMY_DECK_DEPTH_CAP = 6;

/** Enemy mirrors the player combat hand size, capped to keep fights readable. */
export function spawnEnemy(rng: GameRng, depth: number, playerHandSize: number): EnemyInstance {
  const tier = getEnemyTierForDepth(depth);
  const def = rng.pick(ENEMIES.filter((enemy) => enemy.tier === tier));
  const hp = enemyHpForDepth(def.baseHp, depth);
  const cardDepth = Math.min(depth, ENEMY_DECK_DEPTH_CAP);
  const handSize = Math.min(Math.max(playerHandSize, 2), 5);
  const cards: Card[] = [];
  const minOffense = Math.max(1, Math.floor(handSize / 2));
  for (let i = 0; i < handSize; i++) {
    cards.push(i < minOffense ? randomOffensiveCard(rng, cardDepth) : randomCard(rng, cardDepth));
  }
  return { def, hp, maxHp: hp, armor: 0, statuses: [], cards };
}

/** Extra boss HP per depth past the first stratum boundary, so deeper bosses escalate (R10). */
const BOSS_HP_PER_DEPTH_BEYOND_FIRST = 1;

export function spawnBoss(rng: GameRng, depth: number = MAX_DEPTH): EnemyInstance {
  const def = rng.pick(BOSSES);
  // Anchored at MAX_DEPTH so the stratum-1 boss is unchanged; deeper strata add HP.
  const hp = def.baseHp + Math.max(0, depth - MAX_DEPTH) * BOSS_HP_PER_DEPTH_BEYOND_FIRST;
  const cards: Card[] = [];
  for (let i = 0; i < 5; i++) {
    cards.push(i < 1 ? randomOffensiveCard(rng, depth) : randomCardOfTier(rng, [1, 2, 3]));
  }
  return { def, hp, maxHp: hp, armor: 0, statuses: [], cards };
}
