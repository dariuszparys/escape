import { MAX_DEPTH } from '../config';
import { GameRng } from '../game/rng';
import type { ActiveStatusEffect } from '../game/combat';
import { empowerPattern, type IntentPattern } from '../game/intentPatterns';
import { shouldDoubleNormalEncounters } from '../game/scenarioRules';
import type { ScenarioId } from './scenarios';

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

/**
 * Map spawned enemy instances to the turn engine's per-enemy config, assigning a
 * UNIQUE id to each pack member (`goblin#0`, `goblin#1`) so same-type duplicates
 * don't collide when the engine/scene address enemies by id. A solo enemy keeps
 * its bare def id, so single-enemy battles are byte-identical to before packs.
 */
export function toEngineEnemies(pack: EnemyInstance[]): {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  armor: number;
  pattern: IntentPattern;
}[] {
  return pack.map((enemy, index) => ({
    id: pack.length === 1 ? enemy.def.id : `${enemy.def.id}#${index}`,
    name: enemy.def.name,
    hp: enemy.hp,
    maxHp: enemy.maxHp,
    armor: enemy.armor,
    pattern: enemy.pattern,
  }));
}

export const ENEMIES: EnemyDef[] = [
  {
    id: 'rat',
    name: 'Rat',
    texture: 'rat',
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
    texture: 'bandit',
    baseHp: 26,
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
    texture: 'cultist',
    baseHp: 27,
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
          telegraph:
            'carves a sigil that festers with rot and creeping flame, sapping your strength...',
          effects: [
            { kind: 'status', status: 'poison', amount: 3, duration: 3 },
            { kind: 'status', status: 'burn', amount: 3, duration: 2 },
            { kind: 'status', status: 'weak', amount: 1, duration: 1 },
          ],
        },
      ],
    },
  },
  {
    id: 'armored_goblin',
    name: 'Armored Goblin',
    texture: 'goblin',
    baseHp: 30,
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
    texture: 'knight',
    baseHp: 40,
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
          telegraph: 'advances behind its blade, hammering your guard brittle...',
          effects: [
            { kind: 'block', amount: 6 },
            { kind: 'damage', amount: 7 },
            { kind: 'status', status: 'frail', amount: 1, duration: 1 },
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
    texture: 'necromancer',
    baseHp: 41,
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
          name: 'Withering Hex',
          telegraph: 'traces a searing sigil that leaves you exposed...',
          effects: [
            { kind: 'damage', amount: 5 },
            { kind: 'status', status: 'burn', amount: 3, duration: 2 },
            // Duration 2: an enemy-applied Vulnerable must survive the player's turn to boost the
            // enemy's NEXT hit. Withering Hex sits right before Dark Bolt in the cycle so the mark
            // actually lands on that hit (a damage-less beat here would waste it — B4 timing).
            { kind: 'status', status: 'vulnerable', amount: 1, duration: 2 },
          ],
        },
        {
          name: 'Dark Bolt',
          telegraph: 'shadow coils around its hand...',
          effects: [{ kind: 'damage', amount: 10 }],
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
    texture: 'ogre',
    baseHp: 46,
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
    baseHp: 60,
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
      // Ritual boss (B3): the Warhammer hits, then the Warden's iron resolve hardens — a permanent
      // Strength gain that grows its whole kit over the long boss fight. Damage before the buff so
      // the folded-Strength telegraph stays honest. Single-hit throughout, so the ramp is a race,
      // not an unblockable multi-hit wall.
      special: {
        interval: 5,
        entry: {
          name: 'Warhammer',
          telegraph: 'The Iron Warden brings the hammer down, iron resolve hardening...',
          effects: [
            { kind: 'block', amount: 4 },
            { kind: 'damage', amount: 8 },
            { kind: 'strength', amount: 2 },
          ],
        },
      },
    },
  },
  {
    id: 'bone_oracle',
    name: 'The Bone Oracle',
    texture: 'boss_lich',
    baseHp: 55,
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
    baseHp: 57,
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
          telegraph: 'The Flame Tyrant gathers heat around its axe, searing your guard away...',
          effects: [
            { kind: 'damage', amount: 7 },
            { kind: 'status', status: 'burn', amount: 2, duration: 2 },
            // Duration 2 so the mark survives to boost the Tyrant's next heavy swing (B4).
            { kind: 'status', status: 'vulnerable', amount: 1, duration: 2 },
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
    texture: 'orc',
    baseHp: 54,
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
      // Ritual bruiser (B3): Frenzy hits AND permanently swells the Berserker's Strength, so its
      // whole kit grows every cycle. Damage resolves BEFORE the Strength gain so the telegraph
      // (which folds current Strength) stays exactly honest. A race check — turtle and you eat an
      // ever-larger Frenzy; the only relief is stunning the beat to deny both the hit and the ramp.
      special: {
        interval: 3,
        entry: {
          name: 'Frenzy',
          telegraph: 'its rage boils over, muscles swelling with every unanswered blow...',
          effects: [
            { kind: 'damage', amount: 12 },
            { kind: 'strength', amount: 2 },
          ],
        },
      },
    },
  },
  {
    id: 'elite_stalker',
    name: 'The Stalker',
    texture: 'gargoyle',
    baseHp: 50,
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
    texture: 'witch',
    baseHp: 52,
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
    texture: 'imp',
    baseHp: 53,
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
    texture: 'wraith',
    baseHp: 49,
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
          telegraph: 'spins into a flourish that leaves your guard in tatters...',
          effects: [
            { kind: 'block', amount: 3 },
            { kind: 'damage', amount: 9 },
            { kind: 'status', status: 'frail', amount: 1, duration: 1 },
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
    texture: 'cultist',
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
  // Weak tier (depths 1-3) stays gentle so the opener is winnable; from the medium tier on, an
  // extra +2 on the heaviest hit turns each fight into a real HP cost, so a stratum accumulates
  // attrition and clearing it is an achievement (combat-depth rebaseline, 2026-07-04).
  const stratumOnePunch = depth >= 4 ? 2 : 0;
  if (depth <= MAX_DEPTH) return Math.floor(depth / 2) + stratumOnePunch;
  // Slope more than halved for U12 alongside DEEP_HP_SLOPE — same reason (see above).
  return Math.floor(MAX_DEPTH / 2) + 2 + Math.round((depth - MAX_DEPTH) * 0.03);
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
 * Pack-only minions (multi-enemy): low-HP grunts that never spawn solo. Their
 * per-hit damage is small so that a pack of 2-3 sums to roughly one solo enemy's
 * output — the pack budget is anchored in `spawnMinionPack`, not here.
 */
export const MINIONS: EnemyDef[] = [
  {
    id: 'goblin_grunt',
    name: 'Goblin',
    texture: 'goblin',
    baseHp: 8,
    tier: 'weak',
    boss: false,
    pattern: {
      cycle: [
        {
          name: 'Jab',
          telegraph: 'jabs with a rusty knife...',
          effects: [{ kind: 'damage', amount: 3 }],
        },
        { name: 'Hack', telegraph: 'hacks wildly...', effects: [{ kind: 'damage', amount: 4 }] },
      ],
    },
  },
  {
    id: 'giant_rat',
    name: 'Giant Rat',
    texture: 'rat',
    baseHp: 6,
    tier: 'weak',
    boss: false,
    pattern: {
      cycle: [
        { name: 'Bite', telegraph: 'bares its teeth...', effects: [{ kind: 'damage', amount: 3 }] },
        { name: 'Cower', telegraph: 'shrinks back...', effects: [{ kind: 'block', amount: 2 }] },
      ],
    },
  },
  {
    id: 'cave_bat',
    name: 'Cave Bat',
    texture: 'bat',
    baseHp: 5,
    tier: 'weak',
    boss: false,
    pattern: {
      cycle: [
        {
          name: 'Screech',
          telegraph: 'lets out a screech...',
          effects: [{ kind: 'damage', amount: 2 }],
        },
        {
          name: 'Dive',
          telegraph: 'folds its wings to dive...',
          effects: [{ kind: 'damage', amount: 4 }],
        },
      ],
    },
  },
  {
    id: 'imp_whelp',
    name: 'Imp',
    texture: 'imp',
    baseHp: 7,
    tier: 'weak',
    boss: false,
    pattern: {
      cycle: [
        {
          name: 'Scratch',
          telegraph: 'rakes with tiny claws...',
          effects: [{ kind: 'damage', amount: 3 }],
        },
        {
          name: 'Ember',
          telegraph: 'spits a small ember...',
          effects: [{ kind: 'status', status: 'burn', amount: 2, duration: 2 }],
        },
      ],
    },
  },
  {
    id: 'gargoyle_whelp',
    name: 'Gargoyle',
    texture: 'gargoyle',
    baseHp: 10,
    tier: 'weak',
    boss: false,
    pattern: {
      cycle: [
        {
          name: 'Chip',
          telegraph: 'swings a stone fist...',
          effects: [{ kind: 'damage', amount: 3 }],
        },
        {
          name: 'Harden',
          telegraph: 'its skin turns to stone...',
          effects: [{ kind: 'block', amount: 4 }],
        },
      ],
    },
  },
];

/** Fraction of eligible encounters that stay a clean 1v1 (packs are weighted low). */
export const PACK_SOLO_CHANCE = 0.6;
/** Among the packs, the fraction that are size 3 (the rest are size 2). */
export const PACK_TRIPLE_CHANCE = 0.35;
const PACK_MIN_MEMBER_HP = 6;
/**
 * A pack carries MORE total HP than the solo it stands in for: because the player
 * focus-fires and picks members off (cutting the pack's incoming damage each turn),
 * an equal-HP pack is strictly easier than a solo that keeps hitting at full. This
 * multiplier restores the tuned attrition — the pack survives ~a turn longer, so more
 * of its (multi-attacker) damage lands. Tuned against the balance harness so packs
 * neither soften the roguelike-hard band nor wall the weak-tier floor.
 */
const PACK_HP_MULTIPLIER = 1.3;

/** The HP a pack should carry in total: a solo enemy of this depth's tier, scaled up (budget anchor). */
function packHpBudget(depth: number): number {
  const tier = getEnemyTierForDepth(depth);
  const baseHp = tier === 'weak' ? 10 : tier === 'medium' ? 28 : 43;
  return Math.round(enemyHpForDepth(baseHp, depth) * PACK_HP_MULTIPLIER);
}

/**
 * Build a pack of `size` minions whose COMBINED HP and per-turn damage ≈ one solo
 * enemy of this depth: total HP is split across members, and the tier's per-turn
 * damage bump is spread across them (each member gets `bonus / size`) so the pack's
 * scaling tracks a solo enemy's rather than multiplying it by the member count.
 */
export function spawnMinionPack(rng: GameRng, depth: number, size: number): EnemyInstance[] {
  const perHp = Math.max(PACK_MIN_MEMBER_HP, Math.round(packHpBudget(depth) / size));
  const perMemberBonus = Math.floor(intentBonusForDepth(depth) / size);
  return Array.from({ length: size }, () => {
    const def = rng.pick(MINIONS);
    const pattern = empowerPattern(def.pattern, perMemberBonus);
    return { def, hp: perHp, maxHp: perHp, armor: 0, statuses: [], pattern };
  });
}

/**
 * A normal-encounter spawn: mostly a single enemy, sometimes a budget-anchored pack
 * of 2-3 minions (multi-enemy). Gated off the first two depths so the opener stays a
 * clean 1v1, and weighted low so packs stay a change of pace. Bosses/elites never pack.
 */
export function spawnEncounter(rng: GameRng, depth: number): EnemyInstance[] {
  if (depth <= 2 || rng.frac() < PACK_SOLO_CHANCE) return [spawnEnemy(rng, depth)];
  const size = rng.frac() < PACK_TRIPLE_CHANCE ? 3 : 2;
  return spawnMinionPack(rng, depth, size);
}

export type ScenarioEncounterKind = 'normal' | 'elite' | 'boss';

/**
 * Scenario-aware encounter shape. "Enemies Are Doubled" only doubles normal
 * encounter rooms; elites and bosses stay authored single targets.
 */
export function spawnScenarioEncounter(
  rng: GameRng,
  depth: number,
  kind: ScenarioEncounterKind,
  scenarioId: ScenarioId | null,
): EnemyInstance[] {
  if (kind === 'boss') return [spawnBoss(rng, depth)];
  if (kind === 'elite') return [spawnElite(rng, depth)];
  if (shouldDoubleNormalEncounters(scenarioId))
    return [spawnEnemy(rng, depth), spawnEnemy(rng, depth)];
  return spawnEncounter(rng, depth);
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
