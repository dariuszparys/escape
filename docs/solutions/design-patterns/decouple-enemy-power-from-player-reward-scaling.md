---
title: Decouple Enemy Power from Player-Reward Scaling in Difficulty Curves
date: 2026-06-29
last_refreshed: 2026-07-06
category: design-patterns
module: dungeon-loop
problem_type: design_pattern
component: tooling
severity: high
applies_when:
  - 'Extending a depth/level/difficulty scaling function past its previously-tested range, including fixed long arcs or endless modes.'
  - 'One scaling function feeds both enemy stats and player rewards.'
  - 'Retiring one economy or run structure while preserving the underlying scaling lesson.'
  - 'Building roguelite escalation where difficulty and reward scale with the same progress variable and must be validated by a harness.'
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

# Decouple Enemy Power from Player-Reward Scaling in Difficulty Curves

## Context

We added an "Endless Descent" mode to the Phaser 3 + TypeScript roguelite _Escape the card dungeon_. Historically the dungeon ended at depth 10; the new feature lets the run continue past that point as repeating "strata," each capped by a boss "gate." At every gate the player makes a push-your-luck decision: **BANK** their unbanked Gold into permanent Embers and win, or **DELVE** one stratum deeper for a richer payout while forfeiting all carried Gold on death. The design goal (requirement R14) was that neither extreme — always-bank nor always-push — should be the strictly correct line; the gate should be a genuine choice.

The problem was a _scaling seam_ we extended past its tested range. The dungeon's difficulty had only ever been exercised across depths 1–10. Two depth-scaled systems sat behind a single function, `randomCard(rng, depth)` in `src/data/cards.ts`:

- the player's **chest rewards** (better cards as you go deeper), and
- **enemy deck generation** in `spawnEnemy` (`src/data/enemies.ts`), which builds each enemy's hand from the same card pool.

Endless Descent quietly pushed `depth` well past 10 for the first time, and a separate enrichment change (unit U8) added a "deep tier shift" (`deepTierWeights`) to bias card tiers toward tier‑3 past depth 9. The intent was to make the _player's_ deep chests more exciting. Because the seam was shared, the same tier‑3 flood also armed every deep _enemy_. Nobody anticipated this, because no consumer audit was done before extending the curve into untested depth.

Current status (2026-07-06): Endless Descent, banking, Embers,
`src/game/delve.ts`, and `src/game/metaRewards.ts` are retired. The incident
still documents the durable rule: enemy-power curves and player-reward curves
must be audited independently, and their coupled constants must be validated by
the active balance harness. The current game is a fixed 100-room escape whose
survival bands live in `src/game/balanceSimulator.test.ts`.

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

The same principle now applies to the rest of the 100-room difficulty curve:
"harder" should stay monotonic without turning the later decades into a wall.
Enemy HP and intent pressure are structurally separate from card rewards, but
they still form one balance surface with pack HP, elite/boss scaling, scenario
modifiers, and rest/reward policy.

```ts
export function enemyHpForDepth(baseHp: number, depth: number): number {
  if (depth <= MAX_DEPTH) return baseHp + depth;
  return baseHp + MAX_DEPTH + Math.round((depth - MAX_DEPTH) * DEEP_HP_SLOPE);
}

export function cardTierWeightsForDepth(depth: number): [number, number, number] {
  if (depth <= 3) return [8, 2, 0];
  if (depth <= 6) return [4, 5, 1];
  if (depth <= 9) return [2, 5, 3];
  const beyondFirst = Math.max(0, Math.floor((depth - 1) / BOSS_ROOM_INTERVAL));
  const tier2 = Math.max(1, 5 - beyondFirst);
  return [0, tier2, 10 - tier2];
}
```

**(c) Validate the active difficulty model against a headless balance harness before shipping.** The old Endless model used a "no dominant line" assertion across `cautious`, `moderate`, and `aggressive` delve strategies. The current fixed arc uses survival-band assertions instead: bare level-1 loadouts almost never escape, strong access loadouts land in the earned escape band, mid-tier loadouts usually die in the middle arc, and per-decade survival decreases across the 100 rooms. Both models serve the same purpose: turn balance intent into deterministic tests instead of relying on feel.

```ts
const summary = simulateLoadoutTierSummary('strong', 400);

expect(summary.winRate).toBeGreaterThanOrEqual(0.15);
expect(summary.winRate).toBeLessThanOrEqual(0.35);
expect(summary.decadeSurvivalRates).toHaveLength(10);
```

**(d) Tune coupled difficulty constants as a set against the harness, not individually.** The retired Endless set was deep HP slope, stratum-clear heal, boss HP escalation, the conversion guard, and the enemy deck cap. The current set is different: enemy HP slope, intent bonus slope, card-tier rewards, boss/elite scaling, scenario modifiers, reward/rest pacing, and `PACK_HP_MULTIPLIER`. The membership changes as the game changes, but the rule does not: if a knob affects survival, rewards, or attrition, re-run the full harness and interpret it as part of a set.

## Why This Matters

Without the harness, this feature would have shipped unplayable. Delving would have been a guaranteed death sentence — a full‑HP player lost single deep encounters because tier‑3-armed enemies out-DPSed any deck a marginal gate-1 survivor could field — making BANK the only viable play and collapsing the entire push-your-luck loop into a non-choice. The feature's whole reason to exist would have been broken on arrival, and likely shipped, because every encounter _looked_ survivable on paper (the player was at full HP).

The **"no dominant line" assertion** was the mechanism that surfaced the
historical push-your-luck bug. In the current fixed arc, the equivalent failure
is a survival curve that lets bare loadouts escape too often, makes strong
loadouts fail almost always, or produces non-monotonic decade survival. The test
shape changed because the run structure changed; the discipline is the same.

The coupled-constants point matters because these values **drift apart if edited
one at a time.** Raise pack HP without re-checking intent pressure and strong
loadouts may wall before the final boss; enrich deep card tiers without
re-checking enemy scaling and later rooms may flatten. They only express a
balanced design _as a set_, validated together.

## When to Apply

Reach for this guidance whenever you:

- **Extend any depth / level / difficulty scaling past its previously-tested range.** Fixed long arcs and procedurally-unbounded modes both trigger the same audit.
- **Reuse one scaling function for both enemy stats and player rewards.** This is the seam to be suspicious of. Audit its consumers and consider decoupling.
- **Design any push-your-luck / risk-reward loop** (banking, ante-up, greed mechanics). The core invariant is "no dominant line" — encode it as an automated assertion, not a vibe.
- **Build any roguelite escalation** where difficulty and reward both scale with the same progress variable.

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

**Historical harness signal — before vs. after (400 seeds, deterministic).**

- **Before fix:** all three strategies died in stratum 2, even at full HP. `cautious` strictly dominated — highest expected Ember yield _and_ zero risk. The R14 "no dominant line" assertion failed.
- **After fix:** `cautious` EV ≈ 2 Embers (safe), `moderate` ≈ 1 Ember (a real gamble — ~23% bank deeper for more, ~77% die forfeiting everything, landing inside the 1.5-Ember dominance margin), `aggressive` ≈ 0 (pushing forever is correctly punished). No strategy dominates.

That Ember conversion guard no longer exists in the codebase. Keep it as
historical evidence for why the harness needs to encode the design invariant, not
as an implementation pointer.

**Current harness signal (fixed 100-room model).** `simulateLoadoutTierSummary`
is now the shared survival harness. It asserts the first-boss reach band, the
near-zero bare escape band, the earned strong-loadout escape band, the mid-arc
death band, and monotonic per-decade survival. Any difficulty/reward curve change
should be judged against those tests before interpreting a local number as safe.

## Related

- [Hundred-Room Escape Vocabulary Sweep](../documentation-gaps/hundred-room-escape-vocabulary-sweep.md)
  — current terminal vocabulary and active reward/run-shape model.
- [Multi-Enemy Pack Combat via Collection-of-One Refactor](multi-enemy-pack-combat-refactor.md) — `PACK_HP_MULTIPLIER` extends this doc's KTD8 coupled-constant set (rule d) and reuses its enemy-power-anchoring principle for a new encounter shape.
- `docs/plans/2026-06-29-002-feat-endless-descent-banking-plan.md` — historical implementation plan (units U1–U8) this learning came out of; KTD8 records the retired coupled-constant tuning.
- `docs/brainstorms/2026-06-29-push-your-luck-banking-requirements.md` — historical product framing and the R14 "no dominant line" requirement.
- `docs/plans/2026-06-29-001-feat-reading-the-enemy-combat-plan.md` — sibling initiative sharing the enemy combat-script work (`src/data/enemies.ts`).
