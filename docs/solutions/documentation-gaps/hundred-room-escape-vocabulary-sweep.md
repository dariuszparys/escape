---
title: Hundred-Room Escape Vocabulary Sweep
date: 2026-07-06
category: documentation-gaps
module: hundred-room-escape
problem_type: documentation_gap
component: documentation
severity: medium
applies_when:
  - 'Replacing a central game model rather than adding a narrow mechanic.'
  - 'Repository instructions, README copy, shared vocabulary, tests, or harness guidance still mention retired concepts.'
  - 'Balance validation moves from an economy or win-rate target to a fixed-run survival target.'
symptoms:
  - 'AGENTS.md still described the old Endless Descent bank/delve modules and win-rate harness.'
  - 'README.md and CONCEPTS.md still used Stratum, Gate, Delve, Bank, and Ember language after the 100-room model landed.'
  - 'Ember reward code and tests remained in src/game even though XP and Level progression replaced the meta currency.'
  - 'Balance guidance still needed to move from bank/delve outcomes to bare, mid, and strong 100-room survival bands.'
root_cause: inadequate_documentation
resolution_type: documentation_update
related_components:
  - testing_framework
  - tooling
  - development_workflow
tags:
  - escape
  - hundred-room-escape
  - progression
  - balance-simulator
  - vocabulary
  - dead-code
  - documentation
  - survival-curve
---

# Hundred-Room Escape Vocabulary Sweep

## Context

Escape replaced its endless Stratum / Gate / Bank / Delve loop and Ember economy with a fixed
100-room escape model. The new model has one successful terminus: defeat the room-100 boss.
Every other terminus is death or abandon, and every finished run awards lifetime XP. XP derives
Level; Level and Discovery gate access to Loadout choices, never stats or persistent currency.

The terminal sweep was a separate cleanup unit after the functional work landed. The preceding
commits added suspend / resume / abandon through a pure `RunState` snapshot and single
`escape.run.v1` slot, then re-tuned the balance simulator from bank/delve economy assertions to
100-room survival bands. The final sweep aligned the repo with the new model: it deleted
`src/game/metaRewards.ts` and its Ember reward tests, removed `emberReward` / `convertedEmbers`
from chronicle writes, rewrote `AGENTS.md`, `README.md`, and `CONCEPTS.md`, and moved balance
guidance from the Endless Descent economy to the 100-room survival curve.

The durable practice is not "update docs after a feature." It is: when a core loop and economy
are replaced, ship a final vocabulary and dead-code sweep as its own verified unit.

## Guidance

Make the terminal sweep explicit in the implementation plan and treat it as a correctness gate,
not a polish task. For a core-loop migration, close four surfaces together:

- **Code surface:** delete obsolete calculators, handlers, imports, tests, and stored fields from
  the retired model. Do not keep "deprecated" helpers around when the old product concept is
  invalid.
- **Harness surface:** re-key automated policy language and assertions to the new design
  invariant. Here, the balance simulator stopped measuring Gold-to-Ember conversion and
  bank/delve dominance, and now measures bare / mid / strong loadout survival, median death room,
  and per-decade survival across the fixed arc.
- **Vocabulary surface:** rewrite `CONCEPTS.md` and player-facing docs so current terms are
  canonical. Retire old nouns, add new ones, and update neighboring entries that would otherwise
  keep implying the old model.
- **Agent / maintainer surface:** update `AGENTS.md` or equivalent instructions so future work
  validates the new invariant. Here, guidance moved from "Endless Descent economy" and win-rate
  bands to the "100-room difficulty curve" and survival bands.

Use repo-wide greps for retired terms, but treat them as triage filters rather than as a blind
pass/fail. Runtime source should have no active dependency on the retired model. Historical plans
and older solution docs may still mention retired terms as history, and broad words such as "gate"
may remain legitimate in "level-gated" or "determinism gate" language. The important gate is
semantic: active implementation, current instructions, and current player vocabulary must not route
future work through the old model.

Do not claim validation that was not observed. The durable checklist is: run the full suite and
build when available, run the focused harness for the new invariant, and triage the retired-term
grep. Record actual gates from CI, logs, or local commands; otherwise only say the tests or
assertions exist in source.

## Why This Matters

A core economy leaves fossils. If `calculateEmberReward` survives "just in case," a future run-end
change has a tempting wrong abstraction. If Ember reward tests survive, the test suite keeps
teaching a retired payout model. If `AGENTS.md` still says to tune the Endless Descent economy,
every future agent starts from the wrong invariant. If `CONCEPTS.md` still defines Bank or Delve as
current nouns, product discussion drifts back toward a mechanic that was intentionally removed.

Deleting old code and tests lets TypeScript and imports prove there is no active dependency on the
retired model. Rewriting the vocabulary lets people, docs, and agents converge on the same product
contract: Escape is a 100-room run, Gold is run-local, XP is lifetime progress, Level gates access
only, Discovery unlocks deliberate relic access, Loadout changes starting shape, and Suspend is a
persisted run snapshot.

The harness rewrite matters because balance tests encode product philosophy. The old "no dominant
bank-or-push line" was correct for an endless risk/reward economy. Keeping that language after the
migration would make the simulator optimize for a mechanic that no longer exists. The new survival
bands encode the actual promise: bare level-1 loadouts almost never escape, strong access loadouts
sit in an Earned escape band, and mid-tier deaths cluster in the middle rooms.

## When to Apply

Apply this pattern whenever a feature replaces a core loop, economy, progression model,
persistence contract, or win condition rather than merely extending it.

It is especially useful when:

- Old and new models use different nouns for the same user journey.
- The old model had its own calculators, tests, stored fields, or balance harness.
- The new product contract explicitly forbids a retired behavior, such as no banking, no early
  exit, or no persistent currency.
- Future agents or maintainers rely on repo-local instructions and glossary docs to choose
  validation commands.
- Some old terms are still valid in historical docs, so the team needs a precise triage rule
  instead of blind global replacement.

Do the sweep after behavior, persistence, and balance are implemented, but before calling the
migration done. If it happens too early, docs can promise behavior that code has not proven. If it
happens too late, stale tests and instructions start pulling follow-up work back toward the old
model.

## Examples

**Retire obsolete economy code rather than wrapping it.**

The final sweep deleted the Ember reward module and its tests:

```ts
// Retired shape.
calculateEmberReward({
  depth,
  enemiesDefeated,
  gold,
  escaped,
  convertGold,
});
```

That was the right terminal move because Gold no longer converts into anything persistent. The
replacement model pays XP through `src/game/runCompletion.ts` at run end; no Gold-to-meta
conversion helper should remain available.

**Remove retired fields from current records.**

The End scene stopped writing Ember fields into chronicle entries. Current chronicle entries keep
run facts that still matter under the fixed-arc model:

```ts
recordRunChronicleEntry(chronicle, {
  runId: run.runId,
  completedAt: new Date().toISOString(),
  seed: run.seed,
  dailyKey: run.isDaily ? run.dailyKey : null,
  escaped: this.victory,
  depth: run.depth,
  enemiesDefeated: run.enemiesDefeated,
  gold: run.gold,
});
```

This matters because historical records are often copied into UI, analytics, or tests. Keeping
`emberReward` or `convertedEmbers` as zero-valued fields would keep the retired economy visible as
if it still existed.

**Re-key the harness around the new product invariant.**

The balance tests now speak in survival terms:

```ts
const strong = simulateLoadoutTierSummary('strong', 400);
expect(strong.winRate).toBeGreaterThanOrEqual(0.15);
expect(strong.winRate).toBeLessThanOrEqual(0.35);

const mid = simulateLoadoutTierSummary('mid', 400);
expect(mid.medianDeathDepth).toBeGreaterThanOrEqual(40);
expect(mid.medianDeathDepth).toBeLessThanOrEqual(80);
```

This is not a cosmetic rename from win rate to survival rate. It changes what the simulator is
allowed to optimize: escaping a fixed 100-room arc, not maximizing expected Ember yield at a bank
point.

**Rewrite project vocabulary in clusters.**

The `CONCEPTS.md` sweep did not only delete obsolete entries. It rewrote neighboring concepts so
they no longer implied the old economy:

- `Run` now names the 100-room length, suspended snapshot, and room-100 victory.
- `Gold` is explicitly run-local with no conversion path.
- `Scenario` and `Daily Descent` now say every run type awards XP.
- `Campfire` became the loadout hub with resume / abandon when a suspended run exists.
- `XP`, `Level`, `Discovery`, `Loadout`, `Suspend`, and `Escape` became first-class terms.

That cluster rewrite is the durable move. Adding `XP` while leaving `Bank` and `Ember` as current
concepts would produce a contradictory glossary.

**Triage broad grep results semantically.**

A narrow `rg -i 'stratum|ember' src/` can prove that the most specific retired terms left runtime
source, but a broader sweep is still needed for model drift. For example, `delve`, `bank`, and
`gate` can surface unused theme tokens, historical comments, generic "gated" wording, or real
stale copy. Review each hit against the current product contract instead of mechanically deleting
everything.

This catches misses that do not share the exact retired noun. A current-rule contradiction like
"earn no progression rewards" can survive a noun-only grep even though `shouldResolveProgressionRewards`
now returns true for every run type.

## Related

- `docs/plans/2026-07-06-001-feat-hundred-room-escape-plan.md` - product contract, U8 cleanup
  unit, verification contract, and definition of done for the 100-room migration.
- `docs/solutions/design-patterns/decouple-enemy-power-from-player-reward-scaling.md` -
  historical balance-harness predecessor. Refresh alongside this learning because its bank/delve,
  Ember, `src/game/delve.ts`, and deleted `src/game/metaRewards.ts` examples are now retired.
- `docs/solutions/design-patterns/room-threat-system.md` - related dungeon-loop
  simulator-assumption doc. Check for stale bank-or-delve and room-threat semantics during a
  targeted refresh.
- `docs/solutions/design-patterns/multi-enemy-pack-combat-refactor.md` - related
  balance-harness / coupled-constant doc with narrow stale economy and starter-kit wording.
- `docs/solutions/ui-bugs/phaser-screen-layout-readability-regressions.md` - relevant when
  vocabulary changes lengthen UI copy; visible Phaser screens still need browser smoke beyond pure
  tests.
