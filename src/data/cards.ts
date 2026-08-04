import { GameRng } from '../game/rng';

export type CardType = 'attack' | 'block' | 'heal' | 'utility' | 'status';

/**
 * A player class identity. Selecting one on the Progression screen reshapes the whole run:
 * the starting picks and every card reward/chest draw come from that archetype's pool
 * (archetype cards + the shared neutral pool). `null` — no archetype — means neutral only.
 */
export type ArchetypeId = 'barbarian' | 'necromancer' | 'ranger';

/**
 * Everything a combatant can carry. `poison`/`burn` tick damage at turn start; `stun` skips a
 * turn; `vulnerable`/`weak`/`frail` are timed damage/block modifiers; `strength` is a permanent
 * (per-battle), additive damage buff. The modifier statuses resolve through `combat.ts`'s
 * `modifiedDamage`/`modifiedBlock`.
 */
export type StatusEffectType =
  | 'poison'
  | 'burn'
  | 'stun'
  | 'vulnerable'
  | 'weak'
  | 'frail'
  | 'strength';

/**
 * The subset a `status` effect (a debuff applied to the TARGET) may carry. Strength is excluded
 * because it is a SELF-buff with its own actor-targeted `strength` effect kind — routing it
 * through the target-targeted `status` handler would buff the wrong combatant.
 */
export type DebuffStatusType = Exclude<StatusEffectType, 'strength'>;

/**
 * Which dead card a `shuffleCurse` beat slips into the Draw Pile.
 *
 * Curses are the counter-pressure to a thin deck: the full collection reshuffles every battle,
 * so a deck cut down to its best few cards feels a curse in a far larger share of its draws
 * than a broad one does. `leaden` costs more of the turn to clear and is reserved for late,
 * authored threats. The defs live in `../game/effectHandlers` and are deliberately kept out of
 * `CARD_DEFS` so no curse can ever surface as a reward.
 */
export type CurseId = 'festering' | 'leaden';

export type CardEffect =
  | { kind: 'damage'; amount: number }
  | { kind: 'block'; amount: number }
  | { kind: 'heal'; amount: number }
  | { kind: 'status'; status: DebuffStatusType; amount: number; duration: number }
  | { kind: 'strength'; amount: number }
  | { kind: 'draw'; amount: number }
  | { kind: 'energy'; amount: number }
  | { kind: 'shuffleCurse'; amount: number; curse?: CurseId };

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
  /**
   * Archetype gate: a tagged card only enters the draw/pick pool when its archetype is the
   * active one (see `cardPoolForArchetype`). Untagged cards are neutral — always available.
   */
  archetype?: ArchetypeId;
  /** Engine-routed pile flag (KTD1): a played exhaust card joins `exhaustPile` instead of the Discard Pile for the rest of the battle. Pure routing — no per-target resolution semantics. */
  exhaust?: boolean;
}

/**
 * Authoring ceiling for raw damage on a free (0-cost, non-exhaust) card, enforced by card-lint.
 *
 * The full collection reshuffles every battle, so a 0-cost attack is a permanent per-turn engine
 * that never competes for the turn's energy — it needs a bound that the original 0-cost lint
 * (Strength / energy+draw only) never provided.
 *
 * Set to Quick Jab's established value rather than below it. Quick Jab is load-bearing: dropping
 * it by a single point moved the LEAN reference deck's boss win rate from 0.60 to 0.48, because
 * that point decides whether the deck kills the boss a turn sooner. So this is a ceiling on
 * FUTURE authoring — no new free card may out-damage the one the game already balances around —
 * not a nerf to the current one.
 */
export const MAX_ZERO_COST_DAMAGE = 4;

export interface Card extends CardDef {
  uid: number;
  /**
   * Times this instance has been upgraded, capped by `MAX_CARD_UPGRADES`. Optional so runs
   * suspended before the cap shipped restore without a snapshot migration — treat a missing
   * value as 0 (see `upgradeCount` in `../game/cardUpgrade`).
   */
  upgrades?: number;
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
    // The repeatable basic: pure, reliable damage. Distinct role from Slash (below), which
    // trades raw for utility — neither strictly dominates the other now (de-dominated, D2).
    description: 'Deal 6 damage',
    effects: [{ kind: 'damage', amount: 6 }],
  },
  {
    id: 'slash',
    name: 'Slash',
    type: 'attack',
    tier: 1,
    cost: 1,
    color: 0xc0392b,
    // Lower raw than Strike, but softens the enemy's next hit — a defensive tempo sidegrade.
    description: 'Deal 4, apply Weak',
    effects: [
      { kind: 'damage', amount: 4 },
      { kind: 'status', status: 'weak', amount: 1, duration: 1 },
    ],
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
    // Free damage every turn, so it sits at the MAX_ZERO_COST_DAMAGE ceiling and defines it.
    // Deliberately NOT reduced: the reference-deck anchor showed a single point off this card
    // swings LEAN's boss win rate ~12 points (it decides a kill turn), and the snowball this
    // rebalance targets came from unbounded upgrades on one card, not from free chip damage.
    // It also cannot simply cost 1 — Strike is tier 1 / cost 1 / 6 damage and would dominate it.
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
    // The raw single-hit nuke — highest block-agnostic burst, distinct from Sunder's split+setup.
    description: 'Deal 14 damage',
    effects: [{ kind: 'damage', amount: 14 }],
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
  // --- Combat-depth pool (2026-07-04): scaling, tactical debuffs, single-card payoffs, and
  // trade-off cards. Build identity comes from WHICH of these you curate into the collection
  // (you cannot thin a reshuffled full deck, so payoffs are self-contained, never 2-card combos).
  {
    id: 'empower',
    name: 'Empower',
    type: 'utility',
    tier: 2,
    cost: 1,
    color: 0xe67e22,
    // The scaling engine: recurs through the reshuffle so it ramps over a long fight — but the
    // Strength cap (+8) and the fact that long fights hurt keep it a build-around, not a runaway.
    description: 'Gain 2 Strength',
    effects: [{ kind: 'strength', amount: 2 }],
  },
  {
    id: 'war_cry',
    name: 'War Cry',
    type: 'utility',
    tier: 3,
    cost: 1,
    color: 0xf39c12,
    // A burst of scaling, rationed by Exhaust so it can't be recycled every reshuffle.
    description: 'Gain 3 Strength. Exhaust',
    exhaust: true,
    effects: [{ kind: 'strength', amount: 3 }],
  },
  {
    id: 'bash',
    name: 'Bash',
    type: 'attack',
    tier: 2,
    cost: 1,
    color: 0x8e44ad,
    // A cheap setup attack — the Vulnerable it leaves boosts every later hit this fight.
    description: 'Deal 5, apply Vulnerable',
    effects: [
      { kind: 'damage', amount: 5 },
      { kind: 'status', status: 'vulnerable', amount: 1, duration: 1 },
    ],
  },
  {
    id: 'expose',
    name: 'Expose',
    type: 'status',
    tier: 2,
    cost: 1,
    color: 0x9b59b6,
    description: 'Apply Vulnerable (2 turns)',
    effects: [{ kind: 'status', status: 'vulnerable', amount: 1, duration: 2 }],
  },
  {
    id: 'enfeeble',
    name: 'Enfeeble',
    type: 'status',
    tier: 2,
    cost: 1,
    color: 0x8e44ad,
    // Answers a heavy telegraph: the enemy's next two hits land for a quarter less.
    description: 'Apply Weak (2 turns)',
    effects: [{ kind: 'status', status: 'weak', amount: 1, duration: 2 }],
  },
  {
    id: 'sunder',
    name: 'Sunder',
    type: 'attack',
    tier: 3,
    cost: 2,
    color: 0xc0392b,
    // Self-contained setup+payoff in ONE card (B6): the second strike lands into the Vulnerable
    // the first half applied, and the debuff lingers to boost follow-ups. Lower raw than Thunder
    // (its distinct role is the utility, not the burst) so neither dominates the other.
    description: 'Deal 4, Vulnerable, then Deal 4',
    effects: [
      { kind: 'damage', amount: 4 },
      { kind: 'status', status: 'vulnerable', amount: 1, duration: 2 },
      { kind: 'damage', amount: 4 },
    ],
  },
  {
    id: 'whirlwind',
    name: 'Whirlwind',
    type: 'attack',
    tier: 3,
    cost: 2,
    color: 0xc0392b,
    // Three small hits plus a Weak rider — the Strength/Vulnerable payoff card: each hit scales, so
    // it rewards a built-up scaling deck and shreds partial block, while the Weak keeps it worth
    // taking (a defensive tempo tool) even before the deck is built, so it is never a trap pick.
    description: 'Deal 3 three times, apply Weak',
    effects: [
      { kind: 'damage', amount: 3 },
      { kind: 'damage', amount: 3 },
      { kind: 'damage', amount: 3 },
      { kind: 'status', status: 'weak', amount: 1, duration: 1 },
    ],
  },
  {
    id: 'reckless_swing',
    name: 'Reckless Swing',
    type: 'attack',
    tier: 2,
    cost: 1,
    color: 0xc0392b,
    // A big burst you spend once — the trade-off is Exhaust, so it can't anchor a turtle.
    description: 'Deal 12. Exhaust',
    exhaust: true,
    effects: [{ kind: 'damage', amount: 12 }],
  },
  // --- Archetype pools (2026-07-04). Each card is gated to one archetype and only enters the
  // draw/pick pool when that archetype is active; the neutral pool never sees them, so neutral
  // runs (and the runSignature golden) are unaffected. All reuse existing effect kinds, so no
  // engine/tooltip work. They sit roughly on-power with their neutral tier peers — identity, not
  // power creep — since an archetype run also draws the whole neutral pool.

  // Barbarian — rage & might: Strength scaling and big reckless hits.
  {
    id: 'cleave',
    name: 'Cleave',
    type: 'attack',
    tier: 1,
    cost: 1,
    color: 0xa93226,
    archetype: 'barbarian',
    // The class basic: it swings AND plants the first point of Strength, so the barbarian's scaling
    // starts from turn one. Distinct from Strike (leads raw) — neither dominates the other.
    description: 'Deal 5, gain 1 Strength',
    effects: [
      { kind: 'damage', amount: 5 },
      { kind: 'strength', amount: 1 },
    ],
  },
  {
    id: 'warpath',
    name: 'Warpath',
    type: 'utility',
    tier: 2,
    cost: 1,
    color: 0xd35400,
    archetype: 'barbarian',
    // A strength-builder that also swings hard — unlike neutral Empower, it never wastes a turn on
    // pure setup, and it recurs through the reshuffle so it ramps over a long fight.
    description: 'Deal 6, gain 1 Strength',
    effects: [
      { kind: 'damage', amount: 6 },
      { kind: 'strength', amount: 1 },
    ],
  },
  {
    id: 'frenzy',
    name: 'Frenzy',
    type: 'attack',
    tier: 2,
    cost: 2,
    color: 0xc0392b,
    archetype: 'barbarian',
    // Three hits plus a point of Strength: every built point lands three times, and it shreds
    // partial block. The Strength rider is also what keeps it from dominating single-hit Heavy Strike.
    description: 'Deal 3 three times, gain 1 Strength',
    effects: [
      { kind: 'damage', amount: 3 },
      { kind: 'damage', amount: 3 },
      { kind: 'damage', amount: 3 },
      { kind: 'strength', amount: 1 },
    ],
  },
  {
    id: 'rampage',
    name: 'Rampage',
    type: 'attack',
    tier: 3,
    cost: 2,
    color: 0xa93226,
    archetype: 'barbarian',
    description: 'Deal 9, gain 2 Strength',
    effects: [
      { kind: 'damage', amount: 9 },
      { kind: 'strength', amount: 2 },
    ],
  },
  {
    id: 'bloodlust',
    name: 'Bloodlust',
    type: 'attack',
    tier: 3,
    cost: 1,
    color: 0xe74c3c,
    archetype: 'barbarian',
    // A rage nova: a real hit that also spikes Strength, rationed by Exhaust so it cannot be
    // recycled every reshuffle. Leads on damage where neutral War Cry leads on raw Strength.
    description: 'Deal 6, gain 2 Strength. Exhaust',
    exhaust: true,
    effects: [
      { kind: 'damage', amount: 6 },
      { kind: 'strength', amount: 2 },
    ],
  },
  {
    id: 'savage_blow',
    name: 'Savage Blow',
    type: 'attack',
    tier: 3,
    cost: 2,
    color: 0xc0392b,
    archetype: 'barbarian',
    // A once-per-battle finisher; Exhaust keeps it from anchoring a turtle.
    description: 'Deal 16. Exhaust',
    exhaust: true,
    effects: [{ kind: 'damage', amount: 16 }],
  },

  // Necromancer — rot & drain: poison/burn damage-over-time and life-steal sustain.
  {
    id: 'wither',
    name: 'Wither',
    type: 'status',
    tier: 1,
    cost: 1,
    color: 0x7d3c98,
    archetype: 'necromancer',
    description: 'Deal 2, poison 2 for 2 turns',
    effects: [
      { kind: 'damage', amount: 2 },
      { kind: 'status', status: 'poison', amount: 2, duration: 2 },
    ],
  },
  {
    id: 'siphon_life',
    name: 'Siphon Life',
    type: 'utility',
    tier: 2,
    cost: 1,
    color: 0x884ea0,
    archetype: 'necromancer',
    // The drain that makes the attrition gauntlet survivable — chip damage that pays HP back.
    description: 'Deal 4, restore 3 HP',
    effects: [
      { kind: 'damage', amount: 4 },
      { kind: 'heal', amount: 3 },
    ],
  },
  {
    id: 'blight',
    name: 'Blight',
    type: 'status',
    tier: 2,
    cost: 1,
    color: 0xaf601a,
    archetype: 'necromancer',
    // Burn leans on a bigger up-front bite than neutral Poison Dagger's slower poison — the two
    // trade raw-vs-DoT rather than one dominating the other.
    description: 'Deal 4, burn 2 for 2 turns',
    effects: [
      { kind: 'damage', amount: 4 },
      { kind: 'status', status: 'burn', amount: 2, duration: 2 },
    ],
  },
  {
    id: 'ossify',
    name: 'Ossify',
    type: 'block',
    tier: 2,
    cost: 1,
    color: 0x6c3483,
    archetype: 'necromancer',
    // Bone armor: the necromancer's defensive beat, with a sliver of self-repair.
    description: 'Gain 7 block, restore 2 HP',
    effects: [
      { kind: 'block', amount: 7 },
      { kind: 'heal', amount: 2 },
    ],
  },
  {
    id: 'plague',
    name: 'Plague',
    type: 'status',
    tier: 3,
    cost: 1,
    color: 0x6c3483,
    archetype: 'necromancer',
    // The heavy rot clock: nine total poison over three turns, ignoring block. Rewards the slow
    // fights the class already sustains through.
    description: 'Deal 2, poison 3 for 3 turns',
    effects: [
      { kind: 'damage', amount: 2 },
      { kind: 'status', status: 'poison', amount: 3, duration: 3 },
    ],
  },
  {
    id: 'soul_leech',
    name: 'Soul Leech',
    type: 'attack',
    tier: 3,
    cost: 2,
    color: 0x7d3c98,
    archetype: 'necromancer',
    description: 'Deal 8, restore 4 HP',
    effects: [
      { kind: 'damage', amount: 8 },
      { kind: 'heal', amount: 4 },
    ],
  },

  // Ranger — precision & tempo: multi-hit volleys, card draw, and marking prey Vulnerable.
  {
    id: 'quickshot',
    name: 'Quick Shot',
    type: 'attack',
    tier: 1,
    cost: 1,
    color: 0x1e8449,
    archetype: 'ranger',
    // A cantrip attack — cheap chip that replaces itself, the class's tempo basic.
    description: 'Deal 4, draw 1',
    effects: [
      { kind: 'damage', amount: 4 },
      { kind: 'draw', amount: 1 },
    ],
  },
  {
    id: 'mark_prey',
    name: 'Mark Prey',
    type: 'status',
    tier: 1,
    cost: 1,
    color: 0x239b56,
    archetype: 'ranger',
    // The class setup basic: a cheap marking shot whose lingering Vulnerable boosts every follow-up
    // this fight. At tier 1 it seeds the ranger's whole mark-then-volley chain from the opening hand.
    description: 'Deal 3, apply Vulnerable (2 turns)',
    effects: [
      { kind: 'damage', amount: 3 },
      { kind: 'status', status: 'vulnerable', amount: 1, duration: 2 },
    ],
  },
  {
    id: 'volley',
    name: 'Volley',
    type: 'attack',
    tier: 2,
    cost: 2,
    color: 0x1e8449,
    archetype: 'ranger',
    // A pinning spray: three arrows that cash in the Mark's Vulnerable on every hit and leave the
    // target Vulnerable for follow-ups. The Vulnerable rider (not raw) is what keeps it a genuine
    // sidegrade to single-hit Heavy Strike and draw-carrying Riving Cut rather than a strict upgrade.
    description: 'Deal 3 three times, apply Vulnerable (1 turn)',
    effects: [
      { kind: 'damage', amount: 3 },
      { kind: 'damage', amount: 3 },
      { kind: 'damage', amount: 3 },
      { kind: 'status', status: 'vulnerable', amount: 1, duration: 1 },
    ],
  },
  {
    id: 'evasion',
    name: 'Evasion',
    type: 'utility',
    tier: 2,
    cost: 1,
    color: 0x117a65,
    archetype: 'ranger',
    description: 'Gain 6 block, draw 1',
    effects: [
      { kind: 'block', amount: 6 },
      { kind: 'draw', amount: 1 },
    ],
  },
  {
    id: 'called_shot',
    name: 'Called Shot',
    type: 'attack',
    tier: 3,
    cost: 2,
    color: 0x196f3d,
    archetype: 'ranger',
    // A precise heavy hit that refunds energy to keep the turn rolling — the tempo nuke, distinct
    // from Rapid Fire's card draw so neither dominates the other.
    description: 'Deal 10, gain 1 energy',
    effects: [
      { kind: 'damage', amount: 10 },
      { kind: 'energy', amount: 1 },
    ],
  },
  {
    id: 'rapid_fire',
    name: 'Rapid Fire',
    type: 'attack',
    tier: 3,
    cost: 2,
    color: 0x1e8449,
    archetype: 'ranger',
    // The capstone volley: three scaling hits that also refill the hand to keep the tempo going.
    description: 'Deal 4 three times, draw 1',
    effects: [
      { kind: 'damage', amount: 4 },
      { kind: 'damage', amount: 4 },
      { kind: 'damage', amount: 4 },
      { kind: 'draw', amount: 1 },
    ],
  },
];

/**
 * The neutral pool: cards with no archetype tag. This is the shared pool used when no archetype
 * is active, while archetype runs widen it with their class cards.
 */
const STANDARD_CARD_DEFS = CARD_DEFS.filter((card) => !card.archetype);

/**
 * The draw/pick pool for a run: the neutral pool, plus the active archetype's cards. `null`
 * (no archetype) yields the neutral pool alone. Archetype cards are appended after the neutral
 * ones so a null run keeps the original ordering.
 */
export function cardPoolForArchetype(archetype: ArchetypeId | null): CardDef[] {
  if (!archetype) return STANDARD_CARD_DEFS;
  return [...STANDARD_CARD_DEFS, ...CARD_DEFS.filter((card) => card.archetype === archetype)];
}

export function makeCard(def: CardDef): Card {
  return { ...def, uid: nextUid++ };
}

export function reserveCardUids(cards: readonly Pick<Card, 'uid'>[]): void {
  const maxUid = cards.reduce((max, card) => Math.max(max, card.uid), 0);
  nextUid = Math.max(nextUid, maxUid + 1);
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
 * Hard ceiling on the tier-3 share of a reward roll, out of 10.
 *
 * Tier is the game's rarity axis, so tier 3 has to stay seldom at every depth for a tier-3
 * offer to read as a find. The previous curve shifted a point from tier 2 into tier 3 every
 * decade, ending the run near [0, 1, 9] — tier 3 became the common case exactly where the
 * run should be at its most selective, and it fed the late-run power spike.
 */
export const MAX_TIER3_WEIGHT = 3;

/**
 * Tier weights for the 100-room arc. Depth improves offers by letting tier 1 fade out, not by
 * flooding tier 3: tier 3 climbs to its `MAX_TIER3_WEIGHT` ceiling and stays there, so deep
 * rewards get more consistent without getting rarer-in-name-only.
 * Deterministic in depth — Daily reproducibility holds (KTD4).
 */
export function cardTierWeightsForDepth(depth: number): [number, number, number] {
  if (depth <= 3) return [8, 2, 0];
  if (depth <= 6) return [5, 4, 1];
  if (depth <= 9) return [3, 5, 2];
  return [2, 5, MAX_TIER3_WEIGHT];
}

/**
 * Random card, tier odds shifting with dungeon depth and continuing to climb across the run.
 * `archetype` widens the pool to that class's cards; `null` (the default) draws neutral only,
 * preserving the pre-archetype RNG draw order exactly.
 */
export function randomCard(
  rng: GameRng,
  depth: number,
  archetype: ArchetypeId | null = null,
  predicate: (card: CardDef) => boolean = () => true,
): Card {
  const t = pickWeighted(rng, cardTierWeightsForDepth(depth));
  const fullPool = cardPoolForArchetype(archetype).filter(predicate);
  const pool = fullPool.filter((c) => c.tier === t);
  if (pool.length === 0) return makeCard(rng.pick(fullPool));
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
