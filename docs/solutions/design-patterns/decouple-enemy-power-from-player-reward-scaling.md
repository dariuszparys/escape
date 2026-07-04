---
title: Decouple Enemy Power from Player-Reward Scaling in Endless Difficulty Curves
date: 2026-06-29
last_refreshed: 2026-07-04
category: design-patterns
module: dungeon-loop
problem_type: design_pattern
component: tooling
severity: high
applies_when:
  - 'Extending a depth/level/difficulty scaling function past its previously-tested range (endless or procedurally-unbounded modes).'
  - 'One scaling function feeds both enemy stats and player rewards.'
  - 'Designing a push-your-luck / risk-reward loop where "no dominant line" must hold.'
  - 'Building roguelite escalation where difficulty and reward scale with the same progress variable.'
related_components:
  - testing_framework
tags:
  - escape
  - dungeon-loop
  - balance-simulator
  - difficulty-scaling
  - push-your-luck
  - roguelite
  - game-balance
  - determinism
---

# Decouple Enemy Power from Player-Reward Scaling in Endless Difficulty Curves

## Context

We added an "Endless Descent" mode to the Phaser 3 + TypeScript roguelite _Escape the card dungeon_. Historically the dungeon ended at depth 10; the new feature lets the run continue past that point as repeating "strata," each capped by a boss "gate." At every gate the player makes a push-your-luck decision: **BANK** their unbanked Gold into permanent Embers and win, or **DELVE** one stratum deeper for a richer payout while forfeiting all carried Gold on death. The design goal (requirement R14) was that neither extreme — always-bank nor always-push — should be the strictly correct line; the gate should be a genuine choice.

The problem was a _scaling seam_ we extended past its tested range. The dungeon's difficulty had only ever been exercised across depths 1–10. Two depth-scaled systems sat behind a single function, `randomCard(rng, depth)` in `src/data/cards.ts`:

- the player's **chest rewards** (better cards as you go deeper), and
- **enemy deck generation** in `spawnEnemy` (`src/data/enemies.ts`), which builds each enemy's hand from the same card pool.

Endless Descent quietly pushed `depth` well past 10 for the first time, and a separate enrichment change (unit U8) added a "deep tier shift" (`deepTierWeights`) to bias card tiers toward tier‑3 past depth 9. The intent was to make the _player's_ deep chests more exciting. Because the seam was shared, the same tier‑3 flood also armed every deep _enemy_. Nobody anticipated this, because no consumer audit was done before extending the curve into untested depth.

## Guidance

**(a) Audit every consumer of a scaling/difficulty seam before extending it.** A function parameterized by `depth`, `level`, or `difficulty` is a contract with _every_ caller. Before you push its input past the range it was validated against — or change its output curve — enumerate who reads it. Here, one grep for `randomCard(` would have shown it feeding both `spawnEnemy` (enemy power) and the chest-reward path (player reward). A change framed as "make player rewards better at depth" was, mechanically, also "make enemies deadlier at depth."

```ts
// src/data/cards.ts — the shared seam, consumed by BOTH sides:
export function randomCard(rng: GameRng, depth: number): Card {
  const t =
    depth <= 9
      ? /* base-run tier weights */ baseTierWeights(rng, depth)
      : pickWeighted(rng, deepTierWeights(depth)); // tier-3 flood past depth 9
  // ...
}
```

```ts
// src/data/enemies.ts — enemy decks were built from the same call:
function spawnEnemy(rng: GameRng, depth: number): EnemyInstance {
  // ...one card per hand slot, all at the run's depth:
  cards.push(randomCard(rng, depth)); // deep tier-3 cards => 12-damage swings
}
```

**(b) Decouple enemy-power curves from player-reward curves.** They serve opposite purposes and should not share an uncapped scaling input. The original fix (2026-06-29) capped the depth that enemy card-hands saw (`ENEMY_DECK_DEPTH_CAP`), so enemy quality plateaued at the end of the base run while the player's chest enrichment kept climbing.

**That specific mechanism no longer exists** — a later combat rebuild replaced card-hand enemies entirely with authored intent patterns (see `spawnEnemy`'s comment: _"Enemy behavior is its authored intent pattern, empowered for depth; spawns roll no card decks"_). The decoupling this doc argues for is now enforced **by construction** rather than by a runtime cap: enemy power scales through `enemyHpForDepth`/`intentBonusForDepth`, functions that share no code path with `randomCard`/`deepTierWeights` (the player chest-reward side). There is no shared seam left to accidentally re-couple. This is a stronger version of the same lesson, not a different one — when you can, decouple by removing the shared function entirely rather than by capping one side's view of it.

```ts
// src/data/enemies.ts — enemy power scaling, structurally separate from player rewards:
function intentBonusForDepth(depth: number): number {
  /* ... */
}
export function enemyHpForDepth(baseHp: number, depth: number): number {
  /* ... */
}

export function spawnEnemy(rng: GameRng, depth: number): EnemyInstance {
  const pattern = empowerPattern(def.pattern, intentBonusForDepth(depth));
  // no randomCard(), no shared seam with the player chest-reward path
}
```

The same principle applied to the rest of the difficulty curve, which was softened so "harder" stayed monotonic without becoming a wall. The two constants below were re-tuned in a later "roguelike-hard" rebalance — current values, not the doc's original ones:

```ts
// src/data/enemies.ts
const DEEP_HP_SLOPE = 0.03; // was 0.3 at original authoring; more than halved for the roguelike-hard rebaseline
export function enemyHpForDepth(baseHp: number, depth: number): number {
  if (depth <= MAX_DEPTH) return baseHp + depth; // stratum 1: linear
  return baseHp + MAX_DEPTH + Math.round((depth - MAX_DEPTH) * DEEP_HP_SLOPE); // beyond: gentle
}

const BOSS_HP_PER_DEPTH_BEYOND_FIRST = 0.3; // was 1 at original authoring
```

```ts
// src/game/delve.ts — a gate-clear "breather" so each stratum starts recovered:
export const STRATUM_CLEAR_HEAL = 20;
export function commitDelve(run: RunState): RunState {
  run.stratum += 1;
  run.heal(STRATUM_CLEAR_HEAL); // run.heal caps at maxHp
  return run;
}
```

```ts
// src/game/metaRewards.ts — bounded Gold→Ember conversion so endless delving
// can't trivialize the meta economy:
export function convertGoldToEmbers(gold: number): number {
  const raw = gold / GOLD_PER_EMBER;
  // saturating hyperbolic guard: yield approaches CONVERSION_GUARD_CAP, never exceeds it
  return Math.floor((CONVERSION_GUARD_CAP * raw) / (raw + CONVERSION_GUARD_CAP));
}
```

**(c) Validate deep/endless difficulty against a headless balance harness with a "no dominant line" assertion before shipping.** The balance simulator (`src/game/balanceSimulator.ts`, unit U7) models three delve strategies — `cautious` (bank at gate 1), `moderate` (delve one stratum then bank), `aggressive` (push until death) — across many seeds, and asserts that no single strategy strictly dominates (requirement R14). This assertion is what caught the bug: it is the difference between "we think it's balanced" and "400 deterministic seeds say it's balanced."

**(d) Tune coupled difficulty constants as a set against the harness, not individually.** The original five constants are co-dependent: deep HP slope, stratum-clear heal, boss HP escalation, the conversion guard, and (at the time) the enemy deck cap. Changing one in isolation re-introduces a dominant line. They were co-tuned together against the harness (this set is recorded as KTD8), and any future change must re-run the harness over the full seed set before landing.

A later addition, `PACK_HP_MULTIPLIER` (the total-HP multiplier a multi-enemy pack carries over the solo encounter it replaces — see the [multi-enemy pack combat doc](multi-enemy-pack-combat-refactor.md)), joined this coupled set: it multiplies `enemyHpForDepth`'s output, the same curve `DEEP_HP_SLOPE` governs. A naive-seeming value for it broke a delve/gold-economy invariant that has nothing visibly to do with packs — the same "drift apart if edited one at a time" failure mode this rule warns about, just with a new member.

## Why This Matters

Without the harness, this feature would have shipped unplayable. Delving would have been a guaranteed death sentence — a full‑HP player lost single deep encounters because tier‑3-armed enemies out-DPSed any deck a marginal gate-1 survivor could field — making BANK the only viable play and collapsing the entire push-your-luck loop into a non-choice. The feature's whole reason to exist would have been broken on arrival, and likely shipped, because every encounter _looked_ survivable on paper (the player was at full HP).

The **"no dominant line" assertion** is the specific mechanism that surfaced it. A win-rate check alone would not have: the base run still won at expected rates. It was only when the simulator compared _strategies_ — and saw `cautious` post both the highest expected Ember yield _and_ zero risk — that the degeneracy became visible. A dominant strictly-better line is exactly the failure mode push-your-luck designs must avoid, and it is invisible to per-run pass/fail testing.

The coupled-constants point matters because these five values **drift apart if edited one at a time.** Raise the stratum-clear heal without re-checking the enemy deck cap and `aggressive` stops being punished; tighten the conversion guard without re-checking HP slopes and `moderate` collapses back into `cautious`. They only express a balanced design _as a set_, validated together.

## When to Apply

Reach for this guidance whenever you:

- **Extend any depth / level / difficulty scaling past its previously-tested range.** Endless and procedurally-unbounded modes are the classic trigger: the curve was validated on 1–10 and is now asked to behave at 30.
- **Reuse one scaling function for both enemy stats and player rewards.** This is the seam to be suspicious of. Audit its consumers and consider decoupling (e.g., capping the input one side sees).
- **Design any push-your-luck / risk-reward loop** (banking, ante-up, greed mechanics). The core invariant is "no dominant line" — encode it as an automated assertion, not a vibe.
- **Build any endless / roguelite escalation** where difficulty and reward both scale with the same progress variable.

## Examples

**Enemy arming — before vs. after (as originally fixed, 2026-06-29).**

```ts
// BEFORE: deep enemies inherit the player-reward tier-3 flood => unwinnable deep fights
cards.push(randomCard(rng, depth));

// AFTER (2026-06-29 fix): enemy decks plateau at late-base-run; player chests still enrich past it
const cardDepth = Math.min(depth, ENEMY_DECK_DEPTH_CAP); // MAX_DEPTH - 1
cards.push(randomCard(rng, cardDepth));
```

**Current state.** A later combat rebuild removed enemy card-hands entirely, so this
specific cap no longer exists in the code — `spawnEnemy` never calls `randomCard` at
all. Enemy power now scales through `enemyHpForDepth`/`intentBonusForDepth`, which
share no function with the player's `randomCard`/`deepTierWeights` reward path. The
seam this fix originally patched has been removed outright, which is the more durable
version of the same "decouple enemy power from player reward" lesson.

**Harness signal — before vs. after (400 seeds, deterministic).**

- **Before fix:** all three strategies died in stratum 2, even at full HP. `cautious` strictly dominated — highest expected Ember yield _and_ zero risk. The R14 "no dominant line" assertion failed.
- **After fix:** `cautious` EV ≈ 2 Embers (safe), `moderate` ≈ 1 Ember (a real gamble — ~23% bank deeper for more, ~77% die forfeiting everything, landing inside the 1.5-Ember dominance margin), `aggressive` ≈ 0 (pushing forever is correctly punished). No strategy dominates.

**Conversion guard — the harness as a guardrail.** Feeding the simulator an over-generous conversion (1 Ember per Gold, no cap) correctly _trips_ the dominance gate — endless delving becomes strictly best. The real bounded `convertGoldToEmbers` (rate `GOLD_PER_EMBER` plus the saturating `CONVERSION_GUARD_CAP`) passes. The assertion thus doubles as a regression guard against future economy tweaks.

**Side finding (test re-baseline).** The simulator originally awarded Gold from chests only, not from defeated enemies — diverging from the live game. It now calls `awardEnemyGold` on encounter and boss wins to match. Better-funded runs fund better rest-action decks, which nudged base-run win rates up and forced a re-baseline of the existing win-rate bands in `balanceSimulator.test.ts` (the shift is documented inline in those tests). Worth noting because it means simulator fidelity changes can legitimately move _unrelated_ baselines.

## Related

- `docs/solutions/design-patterns/room-threat-system.md` — sibling pattern in the same dungeon loop that also keeps pure deterministic game logic with the balance simulator as the tuning source of truth. (That doc already documents its own `BALANCE_ENCOUNTER_POLICY` constant removal — the note previously here claiming it as a refresh candidate was itself stale and has been removed.)
- [Multi-Enemy Pack Combat via Collection-of-One Refactor](multi-enemy-pack-combat-refactor.md) — `PACK_HP_MULTIPLIER` extends this doc's KTD8 coupled-constant set (rule d) and reuses its enemy-power-anchoring principle for a new encounter shape.
- `docs/plans/2026-06-29-002-feat-endless-descent-banking-plan.md` — the implementation plan (units U1–U8) this learning came out of; KTD8 records the coupled-constant tuning.
- `docs/brainstorms/2026-06-29-push-your-luck-banking-requirements.md` — product framing and the R14 "no dominant line" requirement.
- `docs/plans/2026-06-29-001-feat-reading-the-enemy-combat-plan.md` — sibling initiative sharing the enemy combat-script work (`src/data/enemies.ts`).
