import { describe, expect, test } from 'vitest';
import { spawnBoss, spawnElite, spawnEnemy } from '../data/enemies';
import { simulateReferenceDeck } from './balanceSimulator';

/**
 * The EXTERNAL difficulty anchor (B5, from the combat-depth design review). These gates run FIXED,
 * hand-authored reference decks — not the emergent reward bot — against representative fights, so
 * they certify difficulty independently of the reward/curation policy the aggregate band uses.
 * Tuning enemies to satisfy these cannot be gamed by moving the bot.
 *
 * KEY: difficulty here is ATTRITION, not per-fight walls. A competent deck at FULL HP legitimately
 * wins most individual fights — the run is hard because ~5 fights drain the 34-HP pool before the
 * boss (that is the aggregate band's job). So the anti-"make it easy again" teeth here are the
 * HP-COST band, NOT a win-rate ceiling: if a regression makes enemies feeble, avgHpLostOnWin drops
 * below the floor and this fails; if it makes them one-shot-unfair, it exceeds the ceiling.
 * Measured 2026-07-04 at 300 fights/cell.
 */

const LEAN = [
  'quick_jab',
  'strike',
  'slash',
  'guard',
  'heavy_strike',
  'thunder',
  'iron_wall',
  'shield_bash',
  'bash',
  'minor_heal',
];
const SCALING = [
  'empower',
  'empower',
  'quick_jab',
  'strike',
  'whirlwind',
  'sunder',
  'guard',
  'bash',
  'heavy_strike',
  'minor_heal',
];
const DEFENSIVE = [
  'guard',
  'guard',
  'iron_wall',
  'aegis',
  'shield_bash',
  'enfeeble',
  'minor_heal',
  'second_wind',
  'strike',
  'heavy_strike',
];
// The real fresh opener — small deck, no picks yet. Its early-elite behavior is the tell for the
// turn-cap-stalemate artifact the harness must never inflate difficulty with.
const STARTER = ['strike', 'strike', 'guard', 'guard', 'slash', 'quick_jab'];

const FIGHTS = [
  { label: 'medium@5', depth: 5, spawn: spawnEnemy },
  { label: 'strong@8', depth: 8, spawn: spawnEnemy },
  { label: 'elite@6', depth: 6, spawn: spawnElite },
  { label: 'boss@10', depth: 10, spawn: spawnBoss },
] as const;

/** HP-cost band on the hard fights: floor catches "enemies got feeble", ceiling catches "unfair spikes". */
const HP_COST_MIN = 12;
const HP_COST_MAX = 34;

describe('reference-deck anchor (competent, built decks)', () => {
  for (const deckName of ['LEAN', 'SCALING'] as const) {
    const deck = deckName === 'LEAN' ? LEAN : SCALING;

    test(`${deckName}: clears the opener, wins the hard fights but pays real HP, ends by a kill`, () => {
      const byLabel = Object.fromEntries(
        FIGHTS.map((f) => [f.label, simulateReferenceDeck(deck, f.spawn, f.depth, 300)] as const),
      );

      // The weak/medium opener is reliably winnable for a built deck.
      expect(byLabel['medium@5'].winRate).toBeGreaterThanOrEqual(0.9);

      for (const label of ['strong@8', 'elite@6', 'boss@10'] as const) {
        const s = byLabel[label];
        // Winnable (a change that made it unwinnable-hard would trip this floor).
        expect(s.winRate, `${deckName} ${label} winRate floor`).toBeGreaterThanOrEqual(0.5);
        // Costs real HP — the attrition teeth. A feeble-enemy regression drops below the floor.
        expect(s.avgHpLostOnWin, `${deckName} ${label} HP-cost band`).toBeGreaterThanOrEqual(
          HP_COST_MIN,
        );
        expect(s.avgHpLostOnWin, `${deckName} ${label} HP-cost band`).toBeLessThanOrEqual(
          HP_COST_MAX,
        );
        // A competent deck finishes by killing, never by hitting the turn cap.
        expect(s.cappedRate, `${deckName} ${label} stalemate rate`).toBeLessThanOrEqual(0.05);
      }
    });
  }

  test('the fresh STARTER deck never turn-cap-stalemates an early elite (no fabricated difficulty)', () => {
    // The exact artifact the review caught: a weak 6-card starter looping to the 60-turn cap at full
    // HP against a heal/block elite, scored as a death. The anti-stalemate racing rule must hold.
    for (const [depth, spawn] of [
      [2, spawnElite],
      [6, spawnElite],
      [10, spawnBoss],
    ] as const) {
      const s = simulateReferenceDeck(STARTER, spawn, depth, 300);
      expect(s.cappedRate, `STARTER stalemate rate @${depth}`).toBeLessThanOrEqual(0.05);
    }
  });

  test('pure turtling is punished — a defensive deck is not a free safe line into the boss', () => {
    const lean = simulateReferenceDeck(LEAN, spawnBoss, 10, 300);
    const defensive = simulateReferenceDeck(DEFENSIVE, spawnBoss, 10, 300);
    // Blocking has a role, but out-lasting a ritual/heal boss is not the easy path.
    expect(defensive.winRate).toBeLessThan(lean.winRate);
  });
});

/**
 * Archetype viability + honesty guard (player-archetypes feature). These are competently-BUILT
 * archetype decks — each archetype's signature cards plus the neutral support a real archetype run
 * also draws — run through the same competent policy.
 *
 * This is deliberately NOT the difficulty anchor (LEAN/SCALING above own that with their strict
 * HP-band + 0.5 floor). Its job is narrower and specific to the new content:
 *   1. FUNCTIONAL — every archetype reliably clears the easy fight, so no archetype opens dead.
 *   2. HONEST — no archetype fabricates difficulty via a turn-cap stalemate; the anti-stalemate
 *      racing rule must keep holding for the new cards (this is the load-bearing assertion).
 *   3. WINNABLE — every archetype still wins the hard fights at a floor, so none is a trap pick.
 *   4. NOT UNFAIR — HP cost on a win stays under the spike ceiling.
 *
 * The hard-fight floor is lower than neutral's 0.5 BY DESIGN: the sim's lethal/attack policy only
 * reads DIRECT damage, so it under-pilots the DoT (Necromancer) and mark/multi-hit (Ranger) engines
 * — a human sequencing plague-then-race or mark-then-nuke wins far more. The strength-based
 * Barbarian, which the policy pilots well, lands near neutral win rates (spot-checked below).
 * Reference decks are deterministic (fixed seeds), so these floors are stable tripwires, not flaky.
 * Measured 2026-07-04 at 300 fights/cell.
 */
const ARCHETYPE_DECKS = {
  Barbarian: [
    'cleave',
    'warpath',
    'frenzy',
    'rampage',
    'bloodlust',
    'empower',
    'guard',
    'iron_wall',
    'heavy_strike',
    'minor_heal',
  ],
  Necromancer: [
    'blight',
    'plague',
    'siphon_life',
    'soul_leech',
    'poison_dagger',
    'bash',
    'thunder',
    'heavy_strike',
    'guard',
    'minor_heal',
  ],
  Ranger: [
    'mark_prey',
    'volley',
    'called_shot',
    'rapid_fire',
    'quickshot',
    'thunder',
    'heavy_strike',
    'sunder',
    'evasion',
    'minor_heal',
  ],
} as const;

const ARCHETYPE_HARD_FIGHT_FLOOR = 0.3; // min measured across archetypes is ~0.34 (Necromancer boss)

describe('archetype reference decks (functional, honest, winnable)', () => {
  for (const [name, deck] of Object.entries(ARCHETYPE_DECKS)) {
    test(`${name}: clears the easy fight, never stalemates, and stays winnable on the hard fights`, () => {
      const byLabel = Object.fromEntries(
        FIGHTS.map((f) => [f.label, simulateReferenceDeck(deck, f.spawn, f.depth, 300)] as const),
      );

      expect(byLabel['medium@5'].winRate, `${name} clears medium@5`).toBeGreaterThanOrEqual(0.9);

      for (const label of ['strong@8', 'elite@6', 'boss@10'] as const) {
        const s = byLabel[label];
        expect(s.winRate, `${name} ${label} winnable`).toBeGreaterThanOrEqual(
          ARCHETYPE_HARD_FIGHT_FLOOR,
        );
        // The honesty teeth: the new cards must never loop a fight to the turn cap.
        expect(s.cappedRate, `${name} ${label} no stalemate`).toBeLessThanOrEqual(0.05);
        // Not unfairly spiky — a win never costs more than the whole pool would allow.
        expect(s.avgHpLostOnWin, `${name} ${label} HP-cost ceiling`).toBeLessThanOrEqual(
          HP_COST_MAX,
        );
      }
    });
  }

  test('the strength-based Barbarian, which the policy pilots well, reaches near-neutral win rates', () => {
    // Anchors the claim in the block comment: the lower hard-fight floor is a policy limitation for
    // DoT/mark decks, not a sign archetypes are weak. A sim-friendly archetype clears the 0.5 bar.
    for (const [depth, spawn] of [
      [8, spawnEnemy],
      [10, spawnBoss],
    ] as const) {
      const s = simulateReferenceDeck(ARCHETYPE_DECKS.Barbarian, spawn, depth, 300);
      expect(s.winRate, `Barbarian @${depth} reaches the neutral floor`).toBeGreaterThanOrEqual(
        0.5,
      );
    }
  });
});
