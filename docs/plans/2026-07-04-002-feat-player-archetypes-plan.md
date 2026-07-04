# Player Archetypes

Status: shipped (2026-07-04). 419 tests pass; typecheck, lint (`eslint src`), and
production build clean. Verified end-to-end in-app: Progression ARCHETYPE section
renders all three archetypes with active/select states and pick lists; a Barbarian
run opens with the "Barbarian — Rage & Might" banner and Cleave/Warpath/Frenzy
picks; clearing to None returns the neutral Slash/Guard/Quick Jab picks.

## Notes discovered during implementation

- The card-lint in `cards.test.ts` compares ALL non-`starterKitOnly` cards (neutral
  **plus every archetype**) as one strict-domination pool — stricter than any real
  run's offer (which is only neutral + one archetype). New archetype cards must be
  non-dominated sidegrades vs every same tier+cost peer, including cross-archetype
  ones. This constrained several designs (e.g. Cleave leads Strength not raw so it
  doesn't dominate Strike; Mark Prey is tier-1 cost-1 to dodge the crowded t2c1
  Vulnerable bucket owned by Expose/Bash; multi-hits carry a rider so they don't
  dominate Heavy Strike / Riving Cut).
- The balance sim's play policy only reads DIRECT damage for its lethal/attack
  decisions, so it under-pilots DoT (Necromancer) and mark/multi-hit (Ranger) —
  those decks plateau ~0.34–0.44 on the hardest fights where a strength Barbarian
  (which the policy pilots well) hits 0.78–0.97, matching neutral decks. So the
  archetype reference-deck floor is 0.30 (viability guard), NOT neutral's 0.5
  (difficulty anchor). LEAN/SCALING stay the strict, untouched difficulty anchor.

## Goal

Let the player choose an **archetype** — Barbarian, Necromancer, or Ranger — on the
Progression screen. Selecting one reshapes the whole run's card identity, not just a
single signature card: the starting picks **and** every card reward/chest draw come
from the archetype's pool. With **no archetype selected**, only the standard (neutral)
cards appear — exactly today's behavior.

This supersedes the "starter kit adds one card" idea in scope while keeping starter
kits working (they still add their one signature card on top, orthogonally).

## Design

### What an archetype changes

| Surface                     | No archetype (today)                      | Archetype active                                |
| --------------------------- | ----------------------------------------- | ----------------------------------------------- |
| Starting picks (start room) | neutral: slash/guard/quick_jab/minor_heal | archetype pick pool (4 fully-archetypal cards)  |
| Chest card reward           | `randomCard` over neutral pool            | `randomCard` over neutral **+** archetype cards |
| Victory card offers         | neutral pool                              | neutral **+** archetype cards                   |
| Starting deck **pad**       | 2 Strike, 2 Guard                         | unchanged (universal body, like StS basics)     |

The pad stays neutral on purpose: it guarantees a functional body (baseline block) so
the archetype picks can be fully offensive/thematic, and it keeps the reference-deck
balance anchor (STARTER) valid.

### Why this is balance-safe

- Archetype cards carry an `archetype` tag and are **excluded from the neutral pool**.
  When no archetype is active the draw pool is byte-identical to today, so the
  `runSignature` golden (seed 7) and the neutral emphasis-dominance gate are untouched.
- Enemies use authored intent patterns, **not** card decks, so the only player-facing
  `randomCard` site is `rewards.ts`. Archetype cards can never arm an enemy.
- All 18 archetype cards reuse existing effect kinds (`damage`/`block`/`heal`/`status`/
  `strength`/`draw`/`energy`) → no engine, tooltip, or keyword work.
- Difficulty for archetype runs is certified by **new reference decks** (fixed,
  hand-authored) asserting the same HP-cost band + no-stalemate guard the neutral decks
  use. Neutral balance is frozen; archetype balance is anchored separately.

### Archetype rosters (all additive, existing effects only)

**Barbarian** — rage & might: Strength scaling, big reckless hits.

- cleave (atk t1 c1): Deal 7
- warpath (util t2 c1): Deal 4, gain 1 Strength
- frenzy (atk t2 c2): Deal 4 three times
- rampage (atk t3 c2): Deal 9, gain 2 Strength
- bloodlust (util t3 c1, exhaust): Gain 4 Strength. Exhaust
- savage_blow (atk t3 c2, exhaust): Deal 16. Exhaust
- picks: cleave, warpath, frenzy, rampage

**Necromancer** — rot & drain: poison/burn DoT, life-drain, sustain.

- wither (status t1 c1): Deal 2, poison 2 for 2
- siphon_life (util t2 c1): Deal 4, restore 3 HP
- blight (status t2 c1): Deal 3, burn 2 for 2
- ossify (block t2 c1): Gain 7 block, restore 2 HP
- plague (status t3 c1): Deal 2, poison 3 for 3
- soul_leech (atk t3 c2): Deal 8, restore 4 HP
- picks: wither, blight, siphon_life, ossify

**Ranger** — precision & tempo: multi-hit, draw, mark (vulnerable).

- quickshot (atk t1 c1): Deal 4, draw 1
- mark_prey (status t2 c1): Deal 3, apply Vulnerable (2)
- volley (atk t2 c2): Deal 3 four times
- evasion (util t2 c1): Gain 6 block, draw 1
- called_shot (atk t3 c2): Deal 10, draw 1
- rapid_fire (atk t3 c2): Deal 4 three times, draw 1
- picks: quickshot, mark_prey, volley, evasion

### Selection model

- Archetypes are **free to select** on the Progression screen (a horizontal playstyle
  choice, not a power unlock). Default is **None** → neutral cards, today's behavior.
- Daily Descent **ignores** archetype (comparability), like starter kits.
- Persisted as `meta.progression.activeArchetypeId`. Additive optional field with a
  null default, so no economy-version bump is needed; old saves normalize to null.

## Touch points

- `src/data/cards.ts` — ArchetypeId, `archetype?` tag, 18 cards, neutral-pool filter,
  `cardPoolForArchetype`, archetype-aware `randomCard`.
- `src/game/startingCards.ts` — archetype pick pools; run-aware selection.
- `src/meta.ts` — `activeArchetypeId` + normalize/migrate.
- `src/game/progression.ts` — `setActiveArchetype`, formatting.
- `src/state.ts` / `src/game/campfirePrep.ts` — `run.archetypeId` set from progression.
- `src/game/rewards.ts` / `src/scenes/Dungeon.ts` — archetype-aware draws + start banner.
- `src/game/balanceSimulator.ts` — scenario archetype threading.
- `src/game/progressionLayout.ts` / `src/scenes/Progression.ts` — ARCHETYPE section.
- `src/game/campfireSummary.ts` — show active archetype.
- Tests: `referenceDecks.test.ts` (+3 archetype decks), `cards.test.ts`,
  `startingCards.test.ts`, `meta.test.ts`, `progression.test.ts`.
- `CONCEPTS.md` — Archetype concept.

## Verification

1. `npx tsc --noEmit` clean.
2. `npm test` green — especially `runSignature` golden unchanged and the new archetype
   reference decks in band.
3. Drive the app: select each archetype, confirm archetypal starting picks and rewards;
   confirm None → neutral.
   </content>
   </invoke>
