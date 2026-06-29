---
date: 2026-06-29
topic: reading-the-enemy-combat
origin: docs/ideation/2026-06-29-escape-next-directions-ideation.html
---

# Reading the Enemy: Making the Card Duel a Mind-Game

## Summary

Reshape Card Battle so reading the enemy is the player's central skill. Four layers ship as one initiative in dependency order: script the currently-random strong enemies, add a player-only family matchup triangle that rewards countering the enemy's true action, introduce deceiver enemies that show a false intent with a learnable tell, and let players spend Gold to pierce one round's intent to the truth.

## Problem Frame

Escape's combat is a simultaneous double-blind card duel, and the recently shipped Card Battle Planning Board previews enemy intent, speed order, and status before the player commits. But the board is a passive readout, and against the hardest fights it previews noise: the three strong non-boss enemies (knight, necromancer, ogre) carry no combat script, so the intent planner falls through to weighted-random card selection. The difficulty curve is inverted — fights get statistically harder but mechanically dumber, and the readability feature goes dark exactly when stakes peak.

Reading the opponent also earns nothing today. Combat resolves card effects with no relationship between action families, so a correct prediction only means "didn't get hit" — there is no payoff that makes the read itself the skill. The simultaneous-choice / Yomi niche the genre leaves open stays unclaimed because the duel has neither honest information worth reading nor a reason to read it.

## Key Decisions

- **Family matchup triangle as the payoff model.** Reading is rewarded through a rock-paper-scissors relationship among action families, layered on the existing intent-family taxonomy. Legibility first — a base the player can learn at a glance, with depth coming from how it interacts with bluffs and scripts. Chosen over a Yomi block-counter model (fires only on one axis) and an explicit declare-your-read input (adds a step each round).
- **Player-only payoff.** The triangle rewards the player for beating the enemy's true family. The enemy never receives a mirror bonus; its pressure comes from its script and its bluffs. This keeps the system balanceable and keeps the focus on reading as the player's edge. Symmetric and boss-only-symmetric variants were rejected.
- **Bluffing is owned by a deceiver archetype with a learnable tell.** Deception is not global. Specific enemies are deceivers, the board marks them as such, and each shows a subtle, consistent tell that distinguishes feint from real. Fair because identity warns the player and the tell is masterable.
- **Gold buy-down is the primary bluff counter.** Spending Gold pierces one round's intent to its true value, which both confirms a read and defeats a bluff. Layers 3 and 4 are intentionally coupled: the buy-down is the paid counter-play to deception, not a standalone information sink.
- **Full four-layer scope, sequenced.** The initiative ships all four layers; the build order (scripts → triangle → deceivers → buy-down) is the risk control, since each layer depends on the one before it having something to stand on.

## Requirements

### Layer 1 — Script the strong enemies

- R1. Every non-boss enemy resolves its turn from a defined combat behavior, not weighted-random fallback. The strong enemies (knight, necromancer, ogre) gain combat scripts so the planning board previews a real, predictable intent.
- R2. Each strong enemy reads as a distinct, learnable threat identity (its script expresses a recognizable pattern a returning player can anticipate), rather than a generically harder version of a weak enemy.
- R3. Weighted-random fallback remains only as a safety net for an enemy with no script and no usable card, never as the intended behavior of a shipped enemy.

### Layer 2 — Family matchup triangle (player-only)

- R4. Action families relate to each other in a cyclic matchup so that one family beats another. The starting wheel is aggression beats disruption, defense beats aggression, disruption beats defense (mapping of the existing attack / block / heal / status families into these roles is an Outstanding Question).
- R5. When the player's committed action beats the enemy's true action family for the round, the player earns a matchup bonus. The bonus is awarded to the player only; the enemy never receives a matchup bonus for beating the player.
- R6. The matchup relationship and the consequence of winning it are surfaced on the planning board so the read is legible before the player commits — the player can see what beats the shown intent.
- R7. The matchup outcome is computed against the enemy's true action, so a bluff (Layer 3) that misrepresents the family causes a player who trusts the false intent to miss the bonus.

### Layer 3 — Deceiver enemies

- R8. A deceiver enemy can present an intent summary that describes a different action family than the one it will actually resolve, without changing how the round resolves mechanically.
- R9. The planning board marks deceiver enemies as such, so the player knows deception is possible before committing.
- R10. Each deceiver shows a consistent, learnable tell that distinguishes a feint from an honest intent. The tell is deterministic for a given situation so it is masterable, not a coin flip.
- R11. A deceiver's feint is constrained so the deception is fair: the player who correctly reads the tell and counters the true family gets the normal matchup payoff.

### Layer 4 — Gold buy-down

- R12. The player can spend Gold during a battle to reveal one round's true intent (its real family and consequence), which both confirms an honest read and pierces a bluff.
- R13. The buy-down resolves the intent for the round it is purchased and does not persist to later rounds.
- R14. The buy-down is presented as a deliberate cost decision in the battle UI, consistent with the existing spend-to-preview precedent (the dungeon scout), not an always-on reveal.

### Cross-cutting

- R15. All new combat behavior (scripts, matchup resolution, bluff selection, buy-down effect) lives in pure, unit-tested logic; Phaser scenes only render and sync it.
- R16. Every new decision derives deterministically from the explicit seeded RNG and does not perturb the random sequence on paths that are not taken, so Daily Descents remain comparable across players and replays.

## Key Flow

- F1. A combat round with the reading loop
  - **Trigger:** A new combat round begins and the planning board renders the enemy's intent.
  - **Board shows:** the intent family and consequence, the speed order, what family beats the shown intent (R6), and — if the enemy is a deceiver — the deceiver marker and any visible tell (R9, R10).
  - **Player options:** read the tell and commit a card; or spend Gold to pierce the intent to its true value first (R12), then commit.
  - **Resolve:** the round resolves on the true actions (R7). If the player's family beats the enemy's true family, the player gains the matchup bonus (R5). A player who trusted a feint and countered the false family gets no bonus and takes the real action.
  - **Outcome:** correct reads compound into an HP/tempo advantage over the fight; misreads do not.

## Acceptance Examples

- AE1. Covers R5, R7. Given the enemy's true action is an attack and the player commits a defense that beats aggression, when the round resolves, then the player receives the matchup bonus.
- AE2. Covers R7, R8. Given a deceiver shows a defense intent but will truly attack, when the player commits a card that would beat defense, then the round resolves against the true attack and the player receives no matchup bonus.
- AE3. Covers R10, R11. Given a deceiver is feinting and its tell is visible, when the player reads the tell and counters the true family, then the player receives the normal matchup payoff.
- AE4. Covers R12, R13. Given the player spends Gold to buy down a deceiver's intent, when the true intent is revealed for that round, then the displayed family matches what resolves, and the next round's intent is shown at normal fidelity again.
- AE5. Covers R16. Given two players run the same Daily seed and make identical choices, when either buys down an intent or faces a deceiver, then both runs produce the identical sequence of enemy actions.

## Success Criteria

- Skilled reads measurably improve outcomes: correct matchups and correct bluff calls correlate with HP retained and win rate, more than raw deck strength does.
- The strong-enemy fights stop feeling random — their outcomes become a function of reads and counters, not fallback variance.
- The planning board becomes a decision surface players engage with, not a readout they skip.
- The balance harness can validate the new content without a degenerate dominant line (e.g., one family or "always buy down" that wins regardless of reads).

## Scope Boundaries

### Deferred for later

- Plan-vs-plan / multi-round commit combat (committing a sequence of moves blind). A larger combat restructure; revisit as a variant once the single-round reading loop proves out.
- The combat event-bus / effect-registry refactor. The matchup bonus may require a contained touch to the resolver (see Dependencies); the broader architecture refactor that would make new effect verbs fully data-driven is a separate initiative.

### Outside this initiative

- Reworking auto-hand composition (giving the player control of which cards form the hand) — a separate ideation direction.
- Shareable / async Daily Descent comparison — a separate ideation direction. This initiative only preserves seed comparability (R16); it does not add sharing.

## Dependencies / Assumptions

- The matchup bonus (R5) is the one layer that likely reaches into combat resolution. `CardEffect` is a closed union and `applyAction` is a hardcoded branch, so expressing "won-matchup bonus" probably requires a contained resolver change or a wrapper around resolution; the scripting (R1), board marking (R9), and bluff summary (R8) do not.
- Bluffing reuses the existing separation between an enemy's resolved action and its displayed intent summary, plus the existing telegraph field as the home for the tell. Assumption: a new summary-override path is needed; flipping the existing summary/exact reveal mode alone is insufficient.
- Strong-enemy scripts reuse the existing combat-preference grammar and pattern structure; new archetype identities may be needed beyond the current three (tempo / status / block), including a deceiver archetype.
- Balancing the triangle leans on extending the balance simulator, which currently assumes fights are always taken and does not model the new matchup or buy-down dynamics.

## Outstanding Questions

Nothing blocks planning. The balance levers below are deliberately deferred — they are resolved during planning with the balance simulator, not pinned in this brief.

### Deferred to planning

- Family-to-role mapping for the triangle (R4): how the existing attack / block / heal / status families map onto the aggression / defense / disruption roles, and what beats what. This is the core balance lever.
- Form and magnitude of the matchup bonus (R5): bonus damage, damage mitigation, tempo/speed, or a combination — and how large before it dominates raw card stats.
- Buy-down cost and availability (R12): flat Gold cost vs scaling, and whether it is limited per fight, to keep it a real decision rather than an auto-purchase.
- Which strong enemies (and which bosses, if any) become deceivers, and how many deceiver archetypes exist at launch.
- The concrete visual form of the deceiver marker and the tell on the planning board (kept directional here; resolved during planning/implementation).
- Whether the matchup bonus is implemented inside the resolver or as a resolution wrapper.

## Sources / Research

- Originating ideation: `docs/ideation/2026-06-29-escape-next-directions-ideation.html` (idea I1).
- `src/game/enemyIntent.ts` — intent planning, the script-vs-fallback branch, the separate `action` / `summary` fields, and the `telegraph` field used by boss specials.
- `src/data/enemies.ts` — `EnemyTier`, `EnemyCombatPreference`, `EnemyCombatArchetype`, `EnemyCombatScript`; strong enemies (knight/necromancer/ogre) confirmed scriptless.
- `src/game/combat.ts` — `resolveRound`, the closed `CardEffect` union, and the hardcoded `applyAction` branch.
- `src/game/balanceSimulator.ts` — fight-taken-baseline policy; would need extension for matchup/buy-down tuning.
- External: Sirlin's Yomi (asymmetric payoffs that build intuition over lookup tables); Balatro (legible base plus deep modifiers); the sparse simultaneous-selection subgenre (Rogue Paper Scissors, Handmancers).
