---
title: Combat Depth & Balance Rework - Plan
type: feat
date: 2026-07-04
topic: combat-depth-balance
execution: code
---

# Combat Depth & Balance Rework - Plan

## Goal Capsule

- **Objective:** Make combat a decision the player wins, not a stat race they out-number.
  Add the genre's missing status/scaling levers, give cards build identity and real
  trade-offs, rebuild enemies to _force answers_, and rebaseline the balance harness
  against _competent_ play (not the current deliberately-weak sim deck) so the
  roguelike-hard band means "hard even when you build well."
- **Owner complaint (verbatim):** "the game is way too easy to play. It doesn't feel like
  a roguelike where it is a pleasure to defeat a stratum. Also cards are not balanced,
  pretty boring gameplay."

## Diagnosis (measured, 2026-07-04)

The prior roguelike-difficulty rework (U1–U12) certified a 25% first-stratum clear rate
in the simulator — but that number is an **artifact of the sim's conservative deckbuilding**
(`chooseRewardCard` declines any card below the deck's average, keeping a lean ~6-card
deck). A per-fight probe with a representative _built_ 10-card deck (strike/slash/heavy_strike/
thunder/aegis/etc.) measured:

| fight    | win rate | avg HP lost (on win) |
| -------- | -------- | -------------------- |
| medium@5 | 100%     | 4                    |
| strong@8 | 99%      | 15                   |
| strong@9 | 99%      | 16                   |
| elite@6  | 99%      | 13                   |
| boss@10  | 98%      | 16                   |

So once a human assembles a competent deck — which happens naturally by taking rewards —
**every fight is a ~99% auto-win costing ~15 HP.** With the +20 gate heal and potions,
attrition rarely bites. Two root causes:

1. **Power has no downside.** More/better cards is strictly stronger; adding Thunder/Aegis
   trivializes fights. There is no reason not to take every strong card.
2. **Combat has one axis: race the HP bar.** No scaling (strength), no player debuffs
   (vulnerable/weak/frail), no block retention. "Play your highest-value cards" is always
   correct — no sequencing puzzle, no build identity, several strictly-dominated cards
   (Slash>Strike; Iron Wall 5 block/e < Guard 7/e; Heavy Strike 5 dmg/e < Thunder 6/e).

## Design (revised after a 4-lens adversarial design review, 2026-07-04)

Keep: full-collection deck, instant encounters, turn engine, telegraph honesty, the
effect-handler registry, and the balance-harness methodology. Add depth _through the
registry_ — the exact seam it was built for. The review killed three traps in the first
draft; the resolved decisions (B1–B7) are recorded below and are binding.

### D1 — One damage resolver + modifier statuses (new StatusEffectType members)

A single pure helper `modifiedDamage(raw, actor, target)` in `combat.ts` is the ONLY source
of the resolved damage number; the damage handler (HP), the engine's block depletion, and
the `damageResolved` event all read it, so they can never desync (B1). **Pinned order:**
`+strength (additive)` → `weak ×0.75` → `vulnerable ×1.5` → single `floor` → _then_ armor +
block subtract. Strength/vulnerable sit on raw so partial block keeps value.
**Strength/vulnerable apply once per card/intent, not per damage sub-hit** — multi-hit
entries (Riposte Flurry 4/4/4, Twin Strike) must not scale 2–3× (B1).

New members of `StatusEffectType`:

- **strength** — its own actor-targeted effect kind `{kind:'strength'}` (a self-buff, unlike
  the target-targeted `status` debuffs). Permanent within a battle, never ticks, **stacks
  additively with a hard +8 per-battle cap** (B2). Per-battle only — resets because
  `createBattle` rebuilds `player.statuses` empty (documented invariant; no relic may seed it).
- **vulnerable** (timed): this combatant takes `×1.5` damage.
- **weak** (timed): this combatant deals `×0.75` damage.
- **frail** (timed): this combatant gains `×0.75` block. Kept only if paired with a
  block-retention payoff; otherwise cut (B-adjust).

`addStatus` forks by type: strength `+=` (capped, no duration); vulnerable/weak/frail
`max(amount)` + refresh duration; poison/burn/stun unchanged `max` (B2). Timed debuffs tick
**by what they modify** (B4): enemy-side debuffs at end of `enemyBeat` (all early-return
paths); player weak/frail at the _start_ of `endTurn` (spent in the card phase); player
vulnerable _after_ `enemyBeat` resolves (spent by the enemy's hit). Strength is excluded
from every tick path. DoTs (poison/burn) still tick at turn start (unchanged). `intentView`
folds the actor's strength into telegraphed magnitude so the telegraph stays honest (B-adjust).

### D2 — Card rebalance (narrow) + build identity via curation + single-card payoffs

The full-collection reshuffle means you cannot thin or concentrate copies, so **two-card
combos are structurally unreliable and are dropped** (B6). Build identity comes from
**deck-quality curation** (the one archetype this architecture rewards) plus self-contained
cards:

- Retire only **true same-tier/same-cost overlaps** (Strike vs Slash). Iron Wall vs Guard
  and Heavy Strike vs Thunder are NOT dominated in a draw-5 model (burst-per-card, rarity) —
  differentiate by role, don't flatten to per-energy parity (B-adjust).
- **Single-card payoffs**: e.g. "deal X, +Y if the target is already vulnerable" on ONE
  card; a capped strength finisher (cost ≥1 or exhaust; never a 0-cost card that nets
  strength or nets energy+draw — card-lint test, B-adjust).
- **Trade-off/drawback** cards (exhaust-for-payoff, self-damage-for-tempo) so bloat and
  greed have a cost.

### D3 — Enemies that force answers (the depth lever)

- Apply **weak/vulnerable** to the player on telegraphed moves — the player must answer
  (block, race, or eat it), not auto-solve.
- **Ritual strength as a turtle-punish** (B3): a strength STATUS the enemy applies to
  _itself_, growing **only on turns the player dealt it no damage** — so racing answers it
  and "block-and-grind" loses. Implemented as a status on the enemy combatant, **never** by
  mutating `IntentEntry.effects` (`cloneIntentState` is shallow — that would leak into the
  module-level `ENEMIES`).
- Retune HP/damage as a set.

### D4 — Harness = trustworthy oracle (break the circularity, B5)

- **External anchor:** promote the diagnosis probe into asserted **reference-deck gates** —
  fixed hand-authored decks (lean-attack, block-turtle, status/scaling) vs
  medium@5/strong@8/elite@6/boss@10, asserting win-rate AND HP-loss bands. Enemies are tuned
  so these land in band; the emergent-bot clear-rate is a _secondary_ sanity check.
- **Smarter play policy** (`pickCardToPlay`): detect **multi-card** lethal, fold
  actor-strength + target-vulnerable into its own damage accounting, sequence
  debuff-before-dump, block the telegraph. Assert fights end by **kill, not turn cap**.
- **Two reward policies:** keep deck-curation (decline by deck **size**, not just average)
  as the baseline; add greedy take-everything as a separate stress probe — the delta is the
  difficulty signal.
- Do **not** just extend `simCardScore` for scaling/vulnerable — those need context
  (fight-length, same-turn payoff) modeled in the policy, plus per-card unit probes.

### P1 — Attrition/heal economy (highest-leverage; in scope, B7)

Fights cost ~15/34 HP but heals wash it away. Lower `STRATUM_CLEAR_HEAL` and potion
over-availability so a stratum is a survival gauntlet and the boss is a real threat — **as a
coordinated rebaseline of the five co-tuned constants** (`STRATUM_CLEAR_HEAL`,
`DEEP_HP_SLOPE`, `ELITE_DEEP_HP_SLOPE`, `BOSS_HP_PER_DEPTH_BEYOND_FIRST`, delve conversion),
per the endless-descent-balance-coupling memory. A heal bump was reverted once (commit
7f7a37d) — this is load-bearing, validated via `assessDelveDominance`.

## Success Criteria

- Fights against a competently-built deck cost real, persistent HP and force
  telegraph-driven decisions; the reference-deck gates land in their win-rate AND HP-loss
  bands (fights that end by kill, not turn cap).
- No card is strictly dominated (same tier+cost); strength/vulnerable/weak create decisions
  without a single dominant line — both dominance gates (emphasis + delve) pass, re-derived.
- First-stratum clear rate sits in a roguelike-hard band under the smarter policy (secondary
  check); `npm test` green with intentionally-recorded rebaselined numbers; `npm run build`
  clean; `runSignature` re-goldened with an explicit determinism note.
- Playtest feel: clearing a stratum reads as _earned_.

## Scope Boundaries

- Not rewriting the full-collection deck model (load-bearing; documented pillar).
- Not adding multi-enemy battles or per-card targeting (deferred, own plan).
- Player strength is a bounded build-around, not a pillar — capped, costed, per-battle only.
- UI: new statuses need real (small) rendering work — strength shows a stack (not a timer),
  debuffs decrement off a tick event; not "free" on the existing path.

## Shipped (2026-07-04) — review outcomes & final numbers

Two adversarial review rounds ran (pre-code design review, post-code verification), each 4
independent lenses + synthesis. Pre-code review killed the first draft's three traps (they are the
binding B1–B7 above). Post-code verification confirmed the ENGINE correct — single `modifiedDamage`
resolver never desyncs, telegraphs stay honest under ritual Strength to the +8 cap, B4 tick timing
is exact, determinism holds — and caught four things that were then fixed:

- **Reference gate had no teeth** (floor-only, a tautological `winRate<=1`). Fixed: the anchor now
  asserts an HP-COST band `[12, 34]` on hard fights (difficulty is attrition, so competent decks
  legitimately win at full HP — the HP cost, not win rate, is the difficulty proxy), a kill-not-cap
  guard, and a dedicated STARTER anti-stalemate gate.
- **~35% of "losses" were full-HP turn-cap stalemates** (weak starter vs heal/block elites) — fake
  difficulty. Fixed: an anti-stalemate racing rule in `pickCardToPlay` (after turn 8, race and only
  block a lethal incoming), so an unwinnable matchup ends in an honest death, not a fabricated one.
  The starter deck is now in the reference gate; its capped rate is ~0.
- **Fights ended in 2–3 turns**, so rituals/telegraph-debuffs never fired. Fixed: enemy HP raised
  across medium/strong/elite/boss so elite/boss fights run ~7 turns and the decision layer bites.
- **Thunder was strictly dominated by Sunder**, and **Whirlwind was a trap pick**. Fixed: Thunder →
  14 (raw nuke), Sunder → `4 / Vulnerable / 4` (utility role), Whirlwind gains a Weak rider. A new
  same-tier/same-cost domination lint (`cards.test.ts`) guards against regressions.

**Deviations from the plan, recorded honestly:** (1) Ritual Strength ships as a fixed-interval
telegraphed buff on single-hit bruisers/bosses rather than the B3 "grows only on turns the player
dealt no damage" conditional — the interval version still creates the race-or-stun-to-deny decision
now that fights last long enough, and avoids new engine state; the conditional is a deferred
refinement. (2) `frail` is kept as enemy-only pressure (it reinforces "turtling is punished")
rather than being paired with a player block-retention payoff or cut; it is marginal against aggro
but not harmful, and a block-retention archetype is deferred.

**Final measured numbers (400 seeds, competent policy + dilution-aware curation):** first-stratum
clear `winRate 0.333`, `bossReachRate 0.542`, `bossKillGivenReach 0.613`, `avgDeathDepth 8.3`
(deaths cluster at the end of the gauntlet — an attrition curve, not a room-1 wall). Reference
decks pay 17–24 HP per hard fight and never stalemate. Emphasis spread 0.117 (no dominant line);
delve economy non-dominant. `npm test` 402 green, `npm run build` clean, `runSignature` re-goldened.
