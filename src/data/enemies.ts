import { MAX_DEPTH } from '../config';
import { GameRng } from '../game/rng';
import type { ActiveStatusEffect } from '../game/combat';
import { empowerPattern, type IntentPattern } from '../game/intentPatterns';

export type EnemyTier = 'weak' | 'medium' | 'strong' | 'elite';

export interface EnemyDef {
  id: string;
  name: string;
  texture: string;
  baseHp: number;
  tier?: EnemyTier;
  boss: boolean;
  /** Authored turn-battle behavior (R6): an intent cycle, boss specials folded in as interval entries. */
  pattern: IntentPattern;
}

export interface EnemyInstance {
  def: EnemyDef;
  hp: number;
  maxHp: number;
  armor: number;
  statuses: ActiveStatusEffect[];
  /** The def's pattern empowered for spawn depth (R10's second axis under the turn model). */
  pattern: IntentPattern;
}

export const ENEMIES: EnemyDef[] = [
  {
    id: 'rat',
    name: 'Rat',
    texture: 'bat',
    baseHp: 8,
    tier: 'weak',
    boss: false,
    pattern: {
      cycle: [
        {
          name: 'Scratch',
          telegraph: 'bares tiny claws...',
          effects: [{ kind: 'damage', amount: 3 }],
        },
        {
          name: 'Gnaw',
          telegraph: 'snaps its yellowed teeth...',
          effects: [{ kind: 'damage', amount: 4 }],
        },
        {
          name: 'Skitter',
          telegraph: 'darts between shadows...',
          effects: [{ kind: 'block', amount: 3 }],
        },
      ],
    },
  },
  {
    id: 'slime',
    name: 'Slime',
    texture: 'slime',
    baseHp: 10,
    tier: 'weak',
    boss: false,
    pattern: {
      cycle: [
        {
          name: 'Ooze Slap',
          telegraph: 'a pseudopod rears back...',
          effects: [{ kind: 'damage', amount: 4 }],
        },
        {
          name: 'Congeal',
          telegraph: 'its surface hardens...',
          effects: [{ kind: 'block', amount: 4 }],
        },
        {
          name: 'Engulf',
          telegraph: 'it swells and looms...',
          effects: [{ kind: 'damage', amount: 5 }],
        },
      ],
    },
  },
  {
    id: 'skeleton',
    name: 'Skeleton',
    texture: 'skeleton',
    baseHp: 12,
    tier: 'weak',
    boss: false,
    pattern: {
      cycle: [
        {
          name: 'Bone Slash',
          telegraph: 'raises a jagged blade...',
          effects: [{ kind: 'damage', amount: 5 }],
        },
        {
          name: 'Rattle Guard',
          telegraph: 'pulls its ribs in tight...',
          effects: [
            { kind: 'block', amount: 4 },
            { kind: 'damage', amount: 2 },
          ],
        },
        {
          name: 'Heavy Swing',
          telegraph: 'winds up a two-handed swing...',
          effects: [{ kind: 'damage', amount: 7 }],
        },
      ],
    },
  },
  {
    id: 'bandit',
    name: 'Bandit',
    texture: 'skeleton',
    baseHp: 23,
    tier: 'medium',
    boss: false,
    // Fast/bursty: Twin Strike splits its damage into two hits so half-invested
    // block doesn't fully absorb it (block depletes per-effect, not per-turn),
    // teaching that partial block loses value against multi-hit turns.
    pattern: {
      cycle: [
        {
          name: 'Quick Slash',
          telegraph: 'a knife flashes...',
          effects: [{ kind: 'damage', amount: 8 }],
        },
        {
          name: 'Twin Strike',
          telegraph: 'twin blades flicker in, one after the other...',
          effects: [
            { kind: 'damage', amount: 4 },
            { kind: 'damage', amount: 5 },
          ],
        },
        {
          name: 'Feint',
          telegraph: 'circles behind a raised cloak...',
          effects: [
            { kind: 'damage', amount: 5 },
            { kind: 'block', amount: 4 },
          ],
        },
        {
          name: 'Lunge',
          telegraph: 'coils for a deep lunge...',
          effects: [{ kind: 'damage', amount: 11 }],
        },
      ],
    },
  },
  {
    id: 'cultist',
    name: 'Cultist',
    texture: 'bat',
    baseHp: 24,
    tier: 'medium',
    boss: false,
    // Status-heavy: Blood Sigil stacks two DoTs in one turn with no direct damage,
    // pressuring the player to race the kill rather than trade hits at leisure.
    pattern: {
      cycle: [
        {
          name: 'Ember Curse',
          telegraph: 'chants a smoldering curse...',
          effects: [{ kind: 'status', status: 'burn', amount: 3, duration: 2 }],
        },
        {
          name: 'Talon Rake',
          telegraph: 'circles with bared talons...',
          effects: [{ kind: 'damage', amount: 7 }],
        },
        {
          name: 'Venom Spit',
          telegraph: 'gathers a mouthful of venom...',
          effects: [
            { kind: 'damage', amount: 4 },
            { kind: 'status', status: 'poison', amount: 3, duration: 2 },
          ],
        },
        {
          name: 'Blood Sigil',
          telegraph: 'carves a sigil that festers with rot and creeping flame...',
          effects: [
            { kind: 'status', status: 'poison', amount: 3, duration: 3 },
            { kind: 'status', status: 'burn', amount: 3, duration: 2 },
          ],
        },
      ],
    },
  },
  {
    id: 'armored_goblin',
    name: 'Armored Goblin',
    texture: 'slime',
    baseHp: 27,
    tier: 'medium',
    boss: false,
    // Block-then-smash, extended with a scaling special: every 3rd turn the
    // turtling goblin converts its guard into a heavier crushing blow than its
    // normal Crush, punishing players who let its cycle run unpressured.
    pattern: {
      cycle: [
        {
          name: 'Shield Up',
          telegraph: 'hunkers behind its shield...',
          effects: [{ kind: 'block', amount: 8 }],
        },
        {
          name: 'Shield Slam',
          telegraph: 'braces to slam shield-first...',
          effects: [
            { kind: 'damage', amount: 7 },
            { kind: 'block', amount: 4 },
          ],
        },
        {
          name: 'Crush',
          telegraph: 'hefts its mace overhead...',
          effects: [{ kind: 'damage', amount: 10 }],
        },
      ],
      special: {
        interval: 3,
        entry: {
          name: 'Shield Bash',
          telegraph: 'plants its shield and drives its full weight through a crushing blow...',
          effects: [
            { kind: 'block', amount: 4 },
            { kind: 'damage', amount: 11 },
          ],
        },
      },
    },
  },
  {
    id: 'knight',
    name: 'Knight',
    texture: 'skeleton',
    baseHp: 34,
    tier: 'strong',
    boss: false,
    // Duelist multi-hit: two different combo granularities (a 2-hit Sword Combo
    // and a 3-hit Riposte Flurry) both shred partial block, contrasted against
    // Heavy Blade's single hit that a full block cleanly stops.
    pattern: {
      cycle: [
        {
          name: 'Sword Combo',
          telegraph: 'settles into a dueling stance...',
          effects: [
            { kind: 'damage', amount: 6 },
            { kind: 'damage', amount: 6 },
          ],
        },
        {
          name: 'Guarded Cut',
          telegraph: 'advances behind its blade...',
          effects: [
            { kind: 'block', amount: 6 },
            { kind: 'damage', amount: 7 },
          ],
        },
        {
          name: 'Riposte Flurry',
          telegraph: 'blade flickers through a three-beat combination...',
          effects: [
            { kind: 'damage', amount: 4 },
            { kind: 'damage', amount: 4 },
            { kind: 'damage', amount: 4 },
          ],
        },
        {
          name: 'Heavy Blade',
          telegraph: 'raises its blade high...',
          effects: [{ kind: 'damage', amount: 14 }],
        },
      ],
    },
  },
  {
    id: 'necromancer',
    name: 'Necromancer',
    texture: 'bat',
    baseHp: 35,
    tier: 'strong',
    boss: false,
    // Status/poison pressure, extended with a scaling special: every 4th turn
    // channels a heavier strike-plus-poison combo than its normal hits, rewarding
    // players who race the kill instead of trading at leisure.
    pattern: {
      cycle: [
        {
          name: 'Soul Rot',
          telegraph: 'whispers a rotting litany...',
          effects: [{ kind: 'status', status: 'poison', amount: 4, duration: 2 }],
        },
        {
          name: 'Dark Bolt',
          telegraph: 'shadow coils around its hand...',
          effects: [{ kind: 'damage', amount: 10 }],
        },
        {
          name: 'Withering Hex',
          telegraph: 'traces a searing sigil...',
          effects: [
            { kind: 'damage', amount: 5 },
            { kind: 'status', status: 'burn', amount: 3, duration: 2 },
          ],
        },
        {
          name: 'Bone Ward',
          telegraph: 'raises a lattice of bone to ward off retaliation while the curse lingers...',
          effects: [
            { kind: 'block', amount: 5 },
            { kind: 'status', status: 'poison', amount: 3, duration: 2 },
          ],
        },
      ],
      special: {
        interval: 4,
        entry: {
          name: 'Reap',
          telegraph: 'shadows coalesce into a reaping strike, the poison sinking deep...',
          effects: [
            { kind: 'damage', amount: 8 },
            { kind: 'status', status: 'poison', amount: 4, duration: 3 },
          ],
        },
      },
    },
  },
  {
    id: 'ogre',
    name: 'Ogre',
    texture: 'slime',
    baseHp: 40,
    tier: 'strong',
    boss: false,
    // Block-then-big-hit, extended with a scaling special: every 5th turn its
    // brace-and-swing rhythm culminates in a single overhead blow that dwarfs
    // its normal Smash, testing whether the player timed their defenses to it.
    pattern: {
      cycle: [
        {
          name: 'Brace Up',
          telegraph: 'plants its feet and tenses...',
          effects: [{ kind: 'block', amount: 10 }],
        },
        {
          name: 'Smash',
          telegraph: 'drags its club back...',
          effects: [{ kind: 'damage', amount: 13 }],
        },
        {
          name: 'Guarded Smash',
          telegraph: 'swings from behind a raised arm...',
          effects: [
            { kind: 'block', amount: 5 },
            { kind: 'damage', amount: 10 },
          ],
        },
      ],
      special: {
        interval: 5,
        entry: {
          name: 'Earthbreaker',
          telegraph: 'rears back with both fists locked, ready to bring the ground itself down...',
          effects: [{ kind: 'damage', amount: 17 }],
        },
      },
    },
  },
];

export const BOSSES: EnemyDef[] = [
  {
    id: 'iron_warden',
    name: 'The Iron Warden',
    texture: 'boss_minotaur',
    baseHp: 52,
    boss: true,
    pattern: {
      cycle: [
        {
          name: 'Hammer Swing',
          telegraph: 'the hammer starts its arc...',
          effects: [{ kind: 'damage', amount: 9 }],
        },
        {
          name: 'Iron Guard',
          telegraph: 'iron plates grind together...',
          effects: [
            { kind: 'block', amount: 9 },
            { kind: 'damage', amount: 5 },
          ],
        },
        {
          name: 'Crush',
          telegraph: 'both hands find the haft...',
          effects: [{ kind: 'damage', amount: 13 }],
        },
      ],
      special: {
        interval: 5,
        entry: {
          name: 'Warhammer',
          telegraph: 'The Iron Warden braces behind iron plates...',
          effects: [
            { kind: 'block', amount: 4 },
            { kind: 'damage', amount: 8 },
          ],
        },
      },
    },
  },
  {
    id: 'bone_oracle',
    name: 'The Bone Oracle',
    texture: 'boss_lich',
    baseHp: 47,
    boss: true,
    pattern: {
      cycle: [
        {
          name: 'Bone Bolt',
          telegraph: 'splinters swirl into a dart...',
          effects: [{ kind: 'damage', amount: 8 }],
        },
        {
          name: 'Siphon',
          telegraph: 'a pale thread reaches for you...',
          effects: [
            { kind: 'damage', amount: 6 },
            { kind: 'heal', amount: 4 },
          ],
        },
        {
          name: 'Splinter Guard',
          telegraph: 'bones knit into a lattice...',
          effects: [
            { kind: 'block', amount: 7 },
            { kind: 'damage', amount: 4 },
          ],
        },
      ],
      special: {
        interval: 4,
        entry: {
          name: 'Bone Staff',
          telegraph: 'The Bone Oracle raises a staff of splintered bone...',
          effects: [{ kind: 'status', status: 'poison', amount: 2, duration: 2 }],
        },
      },
    },
  },
  {
    id: 'flame_tyrant',
    name: 'The Flame Tyrant',
    texture: 'boss_demon',
    baseHp: 49,
    boss: true,
    pattern: {
      cycle: [
        {
          name: 'Axe Swing',
          telegraph: 'the axe head glows dull red...',
          effects: [{ kind: 'damage', amount: 10 }],
        },
        {
          name: 'Cinder Guard',
          telegraph: 'ash whirls into a shroud...',
          effects: [
            { kind: 'block', amount: 7 },
            { kind: 'damage', amount: 4 },
          ],
        },
        {
          name: 'Overhead Chop',
          telegraph: 'it heaves the axe skyward...',
          effects: [{ kind: 'damage', amount: 13 }],
        },
      ],
      special: {
        interval: 5,
        entry: {
          name: 'Flame Axe',
          telegraph: 'The Flame Tyrant gathers heat around its axe...',
          effects: [
            { kind: 'damage', amount: 7 },
            { kind: 'status', status: 'burn', amount: 2, duration: 2 },
          ],
        },
      },
    },
  },
];

/**
 * Elite encounter class (U5/R2): a dedicated roster, not a rung on the normal
 * weak/medium/strong depth-tier ladder. Room-triggered (U7 wires the room type) —
 * `spawnElite` picks from this array directly, never through `getEnemyTierForDepth`.
 * Each elite carries exactly ONE signature mechanic teaching a specific counterplay
 * lesson; HP is elite-grade (clearly above strong-tier's 34-40 baseHp, U12) and
 * scales with a steeper-than-normal depth slope (see `eliteHpForDepth`).
 */
export const ELITES: EnemyDef[] = [
  {
    id: 'elite_berserker',
    name: 'The Berserker',
    texture: 'skeleton',
    baseHp: 46,
    tier: 'elite',
    boss: false,
    // Bruiser: Frenzy is a scaling special that dwarfs the cycle's normal hits every
    // 3rd turn. A race check — the longer the player turtles through the cycle, the
    // more Frenzy beats they eat, so slow/defensive play is directly punished.
    pattern: {
      cycle: [
        {
          name: 'Reckless Swing',
          telegraph: 'hefts its axe with wild abandon...',
          effects: [{ kind: 'damage', amount: 9 }],
        },
        {
          name: 'Bloodrage Guard',
          telegraph: 'thumps its chest, blood boiling...',
          effects: [
            { kind: 'block', amount: 6 },
            { kind: 'damage', amount: 5 },
          ],
        },
        {
          name: 'Cleave',
          telegraph: 'swings low in a wide arc...',
          effects: [{ kind: 'damage', amount: 11 }],
        },
      ],
      special: {
        interval: 3,
        entry: {
          name: 'Frenzy',
          telegraph: 'its rage builds to a boiling crescendo...',
          effects: [{ kind: 'damage', amount: 18 }],
        },
      },
    },
  },
  {
    id: 'elite_stalker',
    name: 'The Stalker',
    texture: 'slime',
    baseHp: 42,
    tier: 'elite',
    boss: false,
    // Lurker: two guarded-dormancy turns (block, near-no-op) followed by one huge
    // burst. Enemy block only expires at ITS next beat, so the Stalker still carries
    // its dormancy block through the player's following turn — it is only truly
    // undefended the player turn right after Ambush resolves. Rewards reading the
    // pattern and saving burst damage for that vulnerable window instead of trading
    // chip damage into a guarded target.
    pattern: {
      cycle: [
        {
          name: 'Coil',
          telegraph: 'coils low, patient and still...',
          effects: [{ kind: 'block', amount: 10 }],
        },
        {
          name: 'Feign Stillness',
          telegraph: 'holds its breath, unmoving...',
          effects: [{ kind: 'block', amount: 3 }],
        },
        {
          name: 'Ambush',
          telegraph: 'erupts from hiding in a single devastating strike...',
          effects: [{ kind: 'damage', amount: 24 }],
        },
      ],
    },
  },
  {
    id: 'elite_hexweaver',
    name: 'The Hexweaver',
    texture: 'bat',
    baseHp: 44,
    tier: 'elite',
    boss: false,
    // Hexer: fights the deck itself. Curse Weaving pairs an honestly-telegraphed
    // poison hit (so the intent still reads truthfully as a status move) with a
    // shuffleCurse rider that slips a dead Festering Curse card into the Draw Pile —
    // the one elite that needs the new engine-routed effect kind (U5 plumbing).
    pattern: {
      cycle: [
        {
          name: 'Withering Glare',
          telegraph: 'fixes you with a withering glare, poison gathering...',
          effects: [{ kind: 'status', status: 'poison', amount: 3, duration: 3 }],
        },
        {
          name: 'Bone Dart',
          telegraph: 'flings a shard of jagged bone...',
          effects: [{ kind: 'damage', amount: 8 }],
        },
        {
          name: 'Curse Weaving',
          telegraph:
            'weaves a curse that festers into your very deck, alongside a sickly poison...',
          effects: [
            { kind: 'status', status: 'poison', amount: 2, duration: 2 },
            { kind: 'shuffleCurse', amount: 1 },
          ],
        },
      ],
    },
  },
  {
    id: 'elite_bloodleech',
    name: 'The Bloodleech',
    texture: 'slime',
    baseHp: 45,
    tier: 'elite',
    boss: false,
    // Leech: heals itself on hit (reusing the existing `heal` effect, self-targeted —
    // the enemy is the actor, so `heal` routes to it exactly like the boss Bone
    // Oracle's Siphon). Punishes chip damage/turtling: sustained small hits lose the
    // race against its self-heal, rewarding burst that outpaces the regen.
    pattern: {
      cycle: [
        {
          name: 'Puncture',
          telegraph: 'jabs with a hollow proboscis...',
          effects: [{ kind: 'damage', amount: 7 }],
        },
        {
          name: 'Siphon Strike',
          telegraph: 'sinks fangs deep, drawing your blood into itself...',
          effects: [
            { kind: 'damage', amount: 6 },
            { kind: 'heal', amount: 5 },
          ],
        },
        {
          name: 'Gorge',
          telegraph: 'gorges greedily, growing fat on stolen vitality...',
          effects: [
            { kind: 'damage', amount: 4 },
            { kind: 'heal', amount: 8 },
          ],
        },
      ],
    },
  },
  {
    id: 'elite_duelist',
    name: 'The Duelist',
    texture: 'skeleton',
    baseHp: 41,
    tier: 'elite',
    boss: false,
    // Duelist: every entry mixes block-and-strike in the same beat, so the Duelist
    // is never undefended — chip damage keeps bouncing off a fresh guard. Rewards
    // block-piercing bursts (a single big hit that clears the guard and still lands)
    // and energy management to afford that burst on the turn it counts.
    pattern: {
      cycle: [
        {
          name: 'Parry Riposte',
          telegraph: 'settles into a guarded stance, blade ready to counter...',
          effects: [
            { kind: 'block', amount: 5 },
            { kind: 'damage', amount: 6 },
          ],
        },
        {
          name: 'Feinting Slash',
          telegraph: 'feints low then slashes across...',
          effects: [
            { kind: 'block', amount: 4 },
            { kind: 'damage', amount: 7 },
          ],
        },
        {
          name: 'Flourish Strike',
          telegraph: 'spins into a flourish, blade singing...',
          effects: [
            { kind: 'block', amount: 3 },
            { kind: 'damage', amount: 9 },
          ],
        },
      ],
    },
  },
];

/**
 * Slice-only enemies for the turn-battle playground (U3/U7). Authored intent
 * cycles replace preference-matrix scripts; the run-loop enemies migrate to
 * this shape in Milestone 2 (U9). Not referenced by the live game path.
 */
export interface SliceEnemyDef {
  id: string;
  name: string;
  texture: string;
  hp: number;
  armor: number;
  pattern: IntentPattern;
}

export const SLICE_ENEMIES: SliceEnemyDef[] = [
  {
    id: 'slice_skeleton',
    name: 'Restless Skeleton',
    texture: 'skeleton',
    hp: 30,
    armor: 0,
    // Tempo pressure: readable rhythm of pokes, a guarded swing, and a heavy hit to block against.
    pattern: {
      cycle: [
        {
          name: 'Bone Slash',
          telegraph: 'raises a jagged blade...',
          effects: [{ kind: 'damage', amount: 7 }],
        },
        {
          name: 'Rattle Guard',
          telegraph: 'pulls its ribs in tight...',
          effects: [
            { kind: 'block', amount: 6 },
            { kind: 'damage', amount: 3 },
          ],
        },
        {
          name: 'Heavy Swing',
          telegraph: 'winds up a two-handed swing...',
          effects: [{ kind: 'damage', amount: 11 }],
        },
      ],
    },
  },
  {
    id: 'slice_cultist',
    name: 'Ashen Cultist',
    texture: 'bat',
    hp: 34,
    armor: 0,
    // Status pressure plus an interval special, exercising ticks and the boss-style telegraph.
    pattern: {
      cycle: [
        {
          name: 'Ember Curse',
          telegraph: 'chants a smoldering curse...',
          effects: [{ kind: 'status', status: 'burn', amount: 2, duration: 2 }],
        },
        {
          name: 'Talon Rake',
          telegraph: 'circles with bared talons...',
          effects: [{ kind: 'damage', amount: 5 }],
        },
        {
          name: 'Venom Spit',
          telegraph: 'gathers a mouthful of venom...',
          effects: [
            { kind: 'damage', amount: 3 },
            { kind: 'status', status: 'poison', amount: 2, duration: 2 },
          ],
        },
      ],
      special: {
        interval: 4,
        entry: {
          name: 'Ash Storm',
          telegraph: 'the air fills with burning ash...',
          effects: [
            { kind: 'damage', amount: 8 },
            { kind: 'status', status: 'burn', amount: 2, duration: 2 },
          ],
        },
      },
    },
  },
];

export function getEnemyTierForDepth(depth: number): EnemyTier {
  if (depth <= 3) return 'weak';
  if (depth <= 6) return 'medium';
  return 'strong';
}

/**
 * Per-depth HP slope past the first stratum. The base run keeps the original
 * `baseHp + depth`; deeper strata still climb (R10) but at a gentler slope so the
 * delve stays winnable rather than a DPS wall. Re-tuned for U12: the stratum-1
 * base numbers now carry most of the difficulty (roguelike-hard band), so this
 * slope was more than halved from its pre-U12 value (0.3) — stacking the old
 * slope on top of the harder base collapsed the moderate delve line's bank rate
 * to near zero, wrongly crowning "always bank at the first gate" as dominant.
 */
const DEEP_HP_SLOPE = 0.03;

/** Enemy HP for a depth: linear through stratum 1, gentler past it. */
export function enemyHpForDepth(baseHp: number, depth: number): number {
  if (depth <= MAX_DEPTH) return baseHp + depth;
  return baseHp + MAX_DEPTH + Math.round((depth - MAX_DEPTH) * DEEP_HP_SLOPE);
}

/**
 * Extra intent damage per depth. The old model scaled enemy pressure by rolling
 * depth-tiered decks; the turn model scales the authored intents instead. The
 * player's multi-card action economy outpaces flat intents entirely (U13 found
 * ~99% sim win rates without this axis). Same shape as HP: linear through the
 * first stratum, gentler beyond.
 */
export function intentBonusForDepth(depth: number): number {
  if (depth <= MAX_DEPTH) return Math.floor(depth / 2);
  // Slope more than halved for U12 alongside DEEP_HP_SLOPE — same reason (see above).
  return Math.floor(MAX_DEPTH / 2) + Math.round((depth - MAX_DEPTH) * 0.03);
}

/** Enemy behavior is its authored intent pattern (U9), empowered for depth; spawns roll no card decks. */
export function spawnEnemy(rng: GameRng, depth: number): EnemyInstance {
  const tier = getEnemyTierForDepth(depth);
  const def = rng.pick(ENEMIES.filter((enemy) => enemy.tier === tier));
  const hp = enemyHpForDepth(def.baseHp, depth);
  const pattern = empowerPattern(def.pattern, intentBonusForDepth(depth));
  return { def, hp, maxHp: hp, armor: 0, statuses: [], pattern };
}

/**
 * Extra boss HP per depth past the first stratum boundary, so deeper bosses escalate
 * (R10). Softened for U12 (was 1) alongside the other deep-stratum slopes — see
 * `DEEP_HP_SLOPE`.
 */
const BOSS_HP_PER_DEPTH_BEYOND_FIRST = 0.3;

export function spawnBoss(rng: GameRng, depth: number = MAX_DEPTH): EnemyInstance {
  const def = rng.pick(BOSSES);
  // Anchored at MAX_DEPTH so the stratum-1 boss is unchanged; deeper strata add HP.
  const hp = def.baseHp + Math.max(0, depth - MAX_DEPTH) * BOSS_HP_PER_DEPTH_BEYOND_FIRST;
  const pattern = empowerPattern(def.pattern, intentBonusForDepth(depth));
  return { def, hp, maxHp: hp, armor: 0, statuses: [], pattern };
}

/**
 * Per-depth HP slope for elites (U5): steeper than `enemyHpForDepth`'s normal-tier
 * shape at every stage, so elites read as clearly above-curve regardless of depth.
 * ELITE_DEEP_HP_SLOPE re-tuned for U12 (was 0.5) for the same reason as
 * `DEEP_HP_SLOPE`: stacked on top of the harder roguelike-hard base, the old slope
 * made a second stratum's elite an effective wall for the moderate delve line.
 */
const ELITE_HP_SLOPE = 1.5;
const ELITE_DEEP_HP_SLOPE = 0.05;

/** Elite HP for a depth: steeper linear term through stratum 1, steeper-than-normal gentling past it. */
export function eliteHpForDepth(baseHp: number, depth: number): number {
  if (depth <= MAX_DEPTH) return baseHp + Math.round(depth * ELITE_HP_SLOPE);
  return (
    baseHp +
    Math.round(MAX_DEPTH * ELITE_HP_SLOPE) +
    Math.round((depth - MAX_DEPTH) * ELITE_DEEP_HP_SLOPE)
  );
}

/**
 * Elites are a dedicated roster (R2), not a rung on the weak/medium/strong depth-tier
 * ladder — spawn shape mirrors `spawnBoss` exactly (pick/scale/empower/return), just
 * against `ELITES` and the steeper `eliteHpForDepth` slope. Room-triggered by a later
 * unit (U7); this unit only makes elites spawnable.
 */
export function spawnElite(rng: GameRng, depth: number): EnemyInstance {
  const def = rng.pick(ELITES);
  const hp = eliteHpForDepth(def.baseHp, depth);
  const pattern = empowerPattern(def.pattern, intentBonusForDepth(depth));
  return { def, hp, maxHp: hp, armor: 0, statuses: [], pattern };
}
