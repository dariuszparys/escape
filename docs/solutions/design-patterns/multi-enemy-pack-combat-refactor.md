---
title: Multi-Enemy Pack Combat via Collection-of-One Refactor
date: 2026-07-04
category: design-patterns
module: combat-engine
problem_type: design_pattern
component: frontend_stimulus
severity: high
applies_when:
  - 'Generalizing a single-target system to N targets without changing single-target behavior (model the solo case as a one-element collection).'
  - 'A deterministic test/reference/signature harness must pass byte-identically to prove a refactor changed shape, not math.'
  - 'Routing per-entity events by id, where duplicate ids of the same type would collide and mis-route telegraphs or damage.'
  - 'Adding difficulty or content that must stay budget-anchored to a co-tuned economy rather than being a free power addition.'
symptoms:
  - 'A single enemy/intent shape cannot express a pack of foes that each telegraph and act on their own cycle.'
  - 'Focus-fire lets a player pick pack members off one at a time, so a naive multi-enemy fight is easier than the solo it replaces.'
root_cause: logic_error
resolution_type: code_fix
related_components:
  - testing_framework
  - tooling
tags:
  - combat-engine
  - multi-enemy
  - collection-of-one
  - determinism
  - balance-anchoring
  - focus-fire
  - refactor
  - escape
---

# Multi-Enemy Pack Combat via Collection-of-One Refactor

A reusable pattern for widening a rules engine from "one X" to "many X" while the
existing determinism/golden-test suite doubles as the proof of correctness — plus
the balance technique (budget-anchoring) that let a whole new encounter shape ship
without moving the game's tuned difficulty band.

## Context

The turn-based battle engine (`src/game/turnEngine.ts`) was built around exactly one
enemy. `TurnBattleState` carried a single `enemy: TurnCombatant` and a single
battle-level `intent: IntentState`; every rule read or wrote `state.enemy` /
`state.intent` directly; the balance simulator, the reference-deck determinism gate,
and the `runSignature` snapshot all fought solo enemies. That single-enemy assumption
was baked into the whole stack — the engine, the sim policy, the presentation scene,
and every test fixture.

The product goal was run variety: normal encounters should _sometimes_ be a pack of
2–3 weak minions instead of a lone foe. That is a data/content change on the surface,
but underneath it demands the engine model _many_ enemies — each telegraphing and
beating on its own cycle, each a distinct click target — and it demands that adding
those encounters not quietly soften (or wall) a difficulty curve that had been tuned
across many prior units against a competent-policy win-rate harness.

The naive path — fork a `MultiEnemyBattleState`, migrate callers one at a time, keep
the two engines in sync during a transition — was exactly the kind of parallel
migration that rots. The work instead generalized the _single_ shape into the _N_
shape in one move, and leaned on a property the codebase already had: a dense,
deterministic test suite that pins the math.

## Guidance

Three practices carried this change. They're separable and each reusable on its own.

### 1. Behavior-preserving generalization: "spawn stays single, the existing tests are the proof"

When you widen a 1-to-1 relationship into 1-to-N, make **the solo case a
one-element collection** and keep _every existing call site spawning exactly one
element_. The N-capable engine then runs the old scenarios as a degenerate pack of
size 1. If the pre-existing determinism/golden tests pass **byte-identically, with
zero changes to expected values**, you have a mechanical proof that the refactor
changed _shape_, not _math_.

Concretely: `state.enemy` + `state.intent` became `state.enemies: EnemyCombatant[]`,
where each `EnemyCombatant` carries its own `intent`. Victory flipped from
"`enemy.hp <= 0`" to "every enemy dead". But `createBattle`, the Dungeon, the sim,
and the reference harness were all still handed a single enemy, wrapped in a
one-element array. The balance/reference/`runSignature` assertions passed unchanged —
no expected win-rate moved, no snapshot rebaselined. That's the signal that solo
combat is preserved to the bit.

The discipline that makes this honest: **do not touch the golden numbers in the same
change that generalizes the shape.** If you find yourself editing an expected win rate
or a determinism snapshot "because the refactor made it drift," the refactor is not
behavior-preserving and you've lost your proof. Any real behavior change (spawning
actual packs, rebalancing) comes in a _separate, later_ commit where moving the
numbers is the explicit, reviewable point.

### 2. Budget-anchoring: add content by re-expressing an existing tuned unit

When you add a new content _shape_ that must not shift a tuned difficulty band, don't
author its numbers from scratch — **anchor them to the encounter it replaces** and
split/scale that budget across the new shape's parts. A pack doesn't get invented HP
and damage; it gets _a solo enemy's_ budget, divided among its members:

- **Damage budget:** the tier's per-turn damage bump is spread across members
  (`bonus / size`), so a pack of 3 telegraphs roughly one solo's total incoming per
  turn, not 3×.
- **HP budget:** total pack HP = one solo's HP × a single tunable multiplier
  (`PACK_HP_MULTIPLIER = 1.3`), then divided across members.

The 1.3× is not padding — it's a _correction for a structural advantage_. A player
focus-fires and kills pack members one at a time; each kill removes an attacker, so a
pack's incoming damage decays turn over turn in a way a full-HP solo's never does. An
equal-HP pack is therefore strictly _easier_ than the solo it replaced. The multiplier
buys back roughly the turn of attrition the player skips, restoring the tuned pressure.
Crucially, the anchor + multiplier were **tuned against the existing win-rate harness**,
not eyeballed: the base run held its roguelike-hard band (~0.36 win) after packs landed.

### 3. Focus-target with fallback: player input that degrades gracefully

Player-facing targeting for N enemies should have a _sensible default_ so the 1-enemy
case needs no UI and the N-enemy case needs no mandatory clicks. `playCard` / `useItem`
gained an optional `targetId`. The resolver picks: **the caller's focus if it's still
alive, else the weakest living enemy.** Recomputing it _per effect_ gives free combo
spill-over — a multi-hit card that overkills its focus lands its remaining hits on the
next-weakest target instead of hammering a corpse. In the UI, a click sets focus (a
gold ring, shown _only when there's a genuine choice_ — i.e. a pack of >1), and focus
slides to the next living enemy automatically when its target dies.

## Why This Matters

- **The proof is free and mechanical.** Behavior-preserving generalization means the
  reviewer doesn't have to reason about whether solo combat still works — the unchanged
  golden suite already answered that. No parallel engine, no migration window, no
  "we'll delete the old path once we trust the new one" debt.

- **The pattern composes forward.** The same trick generalizes the _next_ 1-to-N step
  cheaply. A future multi-character party (player side) is the mirror image of this
  enemy-side change: make `player` a one-element `players[]`, keep every current spawn
  handing over a single hero, and the same golden suite proves the solo-hero game is
  untouched. `resolveOffensiveTarget`'s focus-with-fallback shape is directly reusable
  for choosing _which ally_ an effect helps.

- **Difficulty stayed stable despite a brand-new encounter shape.** Because packs are a
  _re-expression of an existing tuned unit_ rather than fresh content with invented
  numbers, the game's carefully-tuned difficulty curve didn't need re-tuning. One
  multiplier, validated by the harness, was the entire balance surface — instead of
  hand-adjusting minion stats until "it feels right."

- **Balance was re-validated, not re-guessed.** The win-rate simulator was generalized
  (policy focuses the weakest living enemy; incoming damage is summed across the pack)
  so the _same_ harness that tuned every prior unit measured the new one. Content
  additions get a numeric verdict, not a vibe.

## When to Apply

Reach for this pattern when **all** of these hold:

- You're generalizing a **1-to-1 rules relationship into 1-to-N** (one enemy → many;
  one player → a party; one document → a batch) in a system whose correctness is
  pinned by a **determinism/golden/snapshot test suite** you trust.
- The pre-existing behavior **must be preserved exactly** and you'd rather prove it
  mechanically than by hand-review.
- You can keep every current call site producing a **single element** through the
  refactor (the degenerate case is natural, not contorted).

And reach for **budget-anchoring** specifically when:

- You're adding **player-facing content** (a new encounter/enemy/level shape) that
  **must not shift a difficulty band** that was tuned by a measurable harness.
- The new shape can be expressed as a **redistribution of an existing tuned unit's
  budget** rather than as freshly-authored numbers.

Don't force it when the "solo" and "pack" cases have genuinely divergent _rules_
(not just cardinality) — then a one-element array hides real branching and the byte-
identical proof stops being meaningful.

## Examples

### The shape change: `enemy` + `intent` → `enemies[]`

The state's single foe and its battle-level intent collapsed into a per-enemy
collection. Each enemy now owns its intent, because in a pack each member telegraphs
and beats independently:

```ts
// before
export interface TurnBattleState {
  player: TurnCombatant;
  enemy: TurnCombatant;
  intent: IntentState;
  // ...
}

// after
export interface EnemyCombatant extends TurnCombatant {
  intent: IntentState; // each pack member telegraphs/beats on its own cycle
}
export interface TurnBattleState {
  player: TurnCombatant;
  /** Solo fight is a one-element array; victory is when every enemy is dead. */
  enemies: EnemyCombatant[];
  // ...
}
```

Victory and the enemy beat generalized to iterate the pack, with a corpse taking no
beat and a mid-pack lethal on the player stopping the rest:

```ts
function checkTerminal(rt: EngineRuntime): boolean {
  if (rt.state.phase === 'decided') return true;
  if (rt.state.enemies.every((enemy) => enemy.hp <= 0)) {
    // was: state.enemy.hp <= 0
    rt.state.phase = 'decided';
    rt.state.outcome = 'victory';
    return true;
  }
  // ...
}

// endTurn: each living enemy beats in pack order
for (const enemy of state.enemies) {
  if (enemy.hp <= 0) continue;
  enemyBeat(rt, enemy);
  if (checkTerminal(rt)) break;
}
```

**Spawn stayed single everywhere.** The Dungeon, the sim, and every test fixture kept
handing over one enemy — the config field just became an array with one element — so
the solo game is byte-identical. Fixtures changed shape only:

```ts
// test fixture, before → after (values identical, shape wrapped)
- enemy: { id: 'foe', name: 'Foe', hp: 20, maxHp: 20, armor: 0, block: 0, statuses: [] },
- intent,
+ enemies: [
+   { id: 'foe', name: 'Foe', hp: 20, maxHp: 20, armor: 0, block: 0, statuses: [], intent },
+ ],
```

### Focus-target with fallback and combo spill-over

```ts
/**
 * The living enemy a player's offensive effect lands on: the caller's focus if it is
 * still alive, otherwise the weakest living enemy (hp+block) — so a combo that overkills
 * its focus spills onto the next-nearest kill instead of a corpse.
 */
export function resolveOffensiveTarget(state: TurnBattleState, focusId?: string): EnemyCombatant {
  const living = livingEnemies(state);
  if (living.length === 0) return state.enemies[0];
  const focused = focusId ? living.find((enemy) => enemy.id === focusId) : undefined;
  if (focused) return focused;
  return [...living].sort((a, b) => a.hp + a.block - (b.hp + b.block))[0];
}

// playCard: recomputed PER effect, so a multi-hit combo spills onto the next kill
for (const effect of played.effects) {
  applyEffect(rt, effect, state.player, resolveOffensiveTarget(state, targetId));
  if (checkTerminal(rt)) break;
}
```

In the scene, focus is a single `focusId`, the ring shows only for a real choice, and
it slides to the next living foe on death:

```ts
/** When the current focus dies mid-pack, slide focus to the next living enemy. */
private refocusToLiving(): void {
  if ((this.enemyViews.get(this.focusId)?.shownHp ?? 0) > 0) return;
  const next = this.displays.find((d) => (this.enemyViews.get(d.id)?.shownHp ?? 0) > 0);
  if (next) this.setFocus(next.id);
  this.redrawFocusRings();
}
// focus ring drawn only when `this.enemyViews.size > 1` — no ring in a 1v1.
```

### Budget-anchoring the pack

A pack's combined HP and damage are derived from the solo it replaces, not authored:

```ts
/** Total HP a pack should carry: a solo enemy of this depth's tier, scaled up (budget anchor). */
function packHpBudget(depth: number): number {
  const tier = getEnemyTierForDepth(depth);
  const baseHp = tier === 'weak' ? 10 : tier === 'medium' ? 28 : 43;
  return Math.round(enemyHpForDepth(baseHp, depth) * PACK_HP_MULTIPLIER); // 1.3x
}

export function spawnMinionPack(rng: GameRng, depth: number, size: number): EnemyInstance[] {
  const perHp = Math.max(PACK_MIN_MEMBER_HP, Math.round(packHpBudget(depth) / size));
  const perMemberBonus = Math.floor(intentBonusForDepth(depth) / size); // damage split, not multiplied
  return Array.from({ length: size }, () => {
    const def = rng.pick(MINIONS);
    const pattern = empowerPattern(def.pattern, perMemberBonus);
    return { def, hp: perHp, maxHp: perHp, armor: 0, statuses: [], pattern };
  });
}

/** Mostly solo; sometimes a budget-anchored pack. Gated off the opener; bosses/elites never pack. */
export function spawnEncounter(rng: GameRng, depth: number): EnemyInstance[] {
  if (depth <= 2 || rng.frac() < PACK_SOLO_CHANCE) return [spawnEnemy(rng, depth)];
  const size = rng.frac() < PACK_TRIPLE_CHANCE ? 3 : 2;
  return spawnMinionPack(rng, depth, size);
}
```

The simulator's one-line swap (`spawnEnemy` → `spawnEncounter`) plus a generalized
policy is what let the _existing_ harness re-validate the difficulty band rather than
anyone eyeballing minion stats.

## Gotchas discovered along the way

### The self-target aliasing bug (a bug class the generalization exposed)

`applyEffect` used to take an `actorSide: 'player' | 'enemy'` and derive `actor` and
`target` from it — for an enemy action, actor and target were always _different_
combatants. Generalizing the signature to explicit `(actor, target)` objects made it
possible for the two to be the **same** object — e.g. a heal/block _item_, where the
player is both actor and target. That immediately surfaced a latent aliasing bug: the
function makes a mutable copy of each and `writeBack`s both, so a self-targeted effect
wrote the target's copy, then **overwrote it with the actor's stale copy**, silently
reverting the gain to zero.

```ts
const actorM = toMutable(actor);
// A self-targeted effect (actor === target) must share ONE mutable, or the second
// writeBack below reverts the first from a stale copy (silently zeroing the gain).
const targetM = actor === target ? actorM : toMutable(target);
```

This is the general lesson: **generalizing aliasing-unsafe code is what exposes the
alias.** Code that "worked" only because actor and target were guaranteed distinct
becomes a bug the moment the guarantee is lifted. Watch for it whenever you widen a
signature so that two previously-distinct arguments can now be the same reference.

### Pack member ids must be unique

Combat events route by `sourceId` / `targetId` (a telegraph goes to _that_ enemy's
sprite, damage to _that_ enemy). Two `goblin` members would collide on the bare def id
and misroute. `toEngineEnemies` appends a `#index` suffix **only for packs**, leaving a
solo enemy's id bare (which is part of what keeps solo behavior byte-identical), and the
scene mirrors the exact convention in `displaysFromInstances`:

```ts
id: pack.length === 1 ? enemy.def.id : `${enemy.def.id}#${index}`,
```

### Pack fodder is a separate enemy pool

The five pack minions live in their own `MINIONS` array, never in `spawnEnemy`'s
weak/medium/strong tier ladder. If low-HP minions had been dropped into the normal
spawn tiers, they'd have perturbed solo-spawn odds and the reference-deck determinism
gates. Keeping the pool separate means adding pack content _cannot_ touch the solo
spawn distribution.

### `PACK_HP_MULTIPLIER` is a coupled constant — tune it against the whole harness

The multiplier looks like a local knob, but it isn't. A naive-seeming 1.7× _broke a
delve/gold-economy test_ that has nothing visibly to do with packs: a harder base run
banks less gold before a gate, which tightened an already-brittle economy guard
downstream. 1.3× keeps every balance invariant green. The lesson: **a difficulty
constant can be silently coupled to a far-away economy test** — tune it against the
full harness, never in isolation.

### Some player builds legitimately over-perform vs packs

Block-heavy starter kits synergize disproportionately with packs: one big block absorbs
a pack's turn-1 multi-hit salvo, and then the player picks members off with reduced
incoming. This widened the warden kit's expected win-rate cap in the balance test
(0.44 → 0.53). That's a real interaction, not a bug — the right response was to widen
the _expected band_, not to nerf the kit or the packs.

## Related

- [Decouple Enemy Power from Player-Reward Scaling](decouple-enemy-power-from-player-reward-scaling.md)
  — the coupled-constant / balance-harness sibling; `PACK_HP_MULTIPLIER` joins that
  doc's set of difficulty constants that must be tuned together against the harness,
  not in isolation.
- [Room Threat System](room-threat-system.md) — the pure-deterministic-logic,
  Battle-is-the-sole-combat-authority sibling; the `enemies[]` generalization lives
  entirely inside Battle, downstream of the dungeon → Battle handoff this doc describes.
- [Phaser Screen Layout & Readability Regressions](../ui-bugs/phaser-screen-layout-readability-regressions.md)
  — the canonical "browser-smoke actual Phaser screens" prevention rule, directly
  applicable to this work's combat-screen declutter, 12-sprite reskin, and
  click-to-focus targeting UI.
