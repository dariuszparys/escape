---
title: Contract Goal Layer Roster - Design Proposal
type: design
date: 2026-07-05
topic: contract-goal-layer-roster
artifact_contract: ce-unified-plan/v1
artifact_readiness: needs-maintainer-decision
product_contract_source: ce-brainstorm
execution: design
---

# Contract Goal Layer Roster - Design Proposal

## Goal Capsule

- **Objective:** Propose a roster of 6-8 further contracts for the maintainer to accept, reject,
  or edit, plus name the design questions this slice deliberately did not answer.
- **Origin:** The 2026-06-27 ideation ("I3. Chronicle Unlock Contracts", confidence 84%) designed
  a run-feat achievement layer that unlocks future content pools. This slice (the "Contracts goal
  layer" plan) widened `ContractRunSnapshot` with `enemiesDefeated` and `stratum`, and shipped two
  contracts (`slayer_25`, `delve_past_first_gate`) as the first increment.
- **Status:** This document is a proposal, not an implementation plan. Nothing here is built. Each
  roster entry needs a maintainer decision before it becomes a `CONTRACT_DEFS` entry.
- **Guardrail (binding on any future contract, not just this slice):** the Ember faucet was
  deliberately tightened (escape award + a conversion cap in `src/game/metaRewards.ts`; difficulty
  tuned to a hard band). New contracts should lean on **content unlocks and recognition, not Ember
  income** — cap any single contract's `emberReward` at 1, prefer 0.

## Current mechanism recap

- `src/data/contracts.ts` — `ContractRunSnapshot` (post-slice) is
  `{ escaped, depth, relicCount, elitesDefeated, enemiesDefeated, stratum }`. `evaluateContract` is
  an exhaustive switch over `ContractId`; adding a contract without a case is a compile error. This
  is the intended extension mechanism — keep it exhaustive.
- `src/scenes/End.ts` (`awardContractsOnce`) is the only producer of a `ContractRunSnapshot` today,
  built once per run in `create()`.
- Contract evaluation is gated by `shouldResolveProgressionRewards` (`src/game/runCompletion.ts`):
  it returns `true` unconditionally for Daily Descent runs, and for normal runs it defers to
  `shouldAwardProgressionRewards(scenarioId)` (`src/game/scenarioRules.ts`), which is `false` only
  for the `'escape_the_dungeon'` premise. In practice: **contracts already evaluate on Daily
  Descent runs and on all three "hard" Scenarios; they never fire for the clean/default
  `escape_the_dungeon` premise.** Any scenario- or daily-gated contract proposed below is reachable
  today without touching that gate — it only needs the relevant field added to the snapshot.
- Contracts evaluate a **single run's snapshot**. There is no chronicle (cross-run) input into
  `evaluateContract` today — see Open Question 1.
- Unused-but-available `RunState` fields at the `End.ts` call site: `gold`, `scenarioId`,
  `archetypeId`. (`enemiesDefeated`, `stratum` are now wired as of this slice.) `run.isDaily` is
  also available but not yet in the snapshot.
- Relic unlock inventory (`src/data/relics.ts`): three relics are contract-gated already
  (`merchants_seal`, `hoarders_map`, `wanderers_flask`); this slice added a fourth
  (`spark_coil`, via `delve_past_first_gate`). Remaining Ember-cost-gated, not-yet-contract-gated
  relics: `stone_heart` (5), `venom_ring` (6), `hunter_charm` (6), `vital_charm` (5). These are the
  unlock candidates below; once they're all spoken for, further content-unlock contracts need a
  new content pool (new relic, starting-card pack, room variant, etc. — a maintainer decision, not
  a shortage this doc should paper over).

## Proposed roster (6-8 contracts, for accept/reject)

| id                      | name                    | predicate (over the widened snapshot)                 | reward                                                                                       | new snapshot field needed                                                                                                                                    |
| ----------------------- | ----------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `three_gates_deep`      | Three Gates Deep        | `run.stratum >= 3`                                    | 0 embers, unlock `stone_heart`                                                               | none — `stratum` already lands in this slice                                                                                                                 |
| `elite_hunter_3`        | Elite Hunter            | `run.elitesDefeated >= 3`                             | 0 embers, unlock `venom_ring`                                                                | none                                                                                                                                                         |
| `frugal_escape`         | Frugal Escape           | `run.escaped && run.goldSpent === 0`                  | 0 embers, recognition only                                                                   | `goldSpent: number` (not currently tracked anywhere on `RunState`; would need a new counter incremented at every gold-spending site — shops, bargains, etc.) |
| `gold_hoarder_100`      | Gold Hoarder            | `run.escaped && run.gold >= 100`                      | 1 ember, unlock `hunter_charm`                                                               | `gold: number` (already on `RunState`, just unused in the snapshot)                                                                                          |
| `toxic_survivor`        | Toxic Survivor          | `run.escaped && run.scenarioId === 'im_poisoned'`     | 0 embers, unlock `vital_charm` (thematic: HP relic for the HP-drain scenario)                | `scenarioId: ScenarioId \| null`                                                                                                                             |
| `one_armed_escape`      | One-Armed and Dangerous | `run.escaped && run.scenarioId === 'lost_left_arm'`   | 0 embers, recognition only                                                                   | `scenarioId` (shared with the row above — one field serves all scenario contracts)                                                                           |
| `double_trouble_escape` | Double or Nothing       | `run.escaped && run.scenarioId === 'enemies_doubled'` | 1 ember, recognition only (no relics left to spare after the two above and existing unlocks) | `scenarioId` (shared)                                                                                                                                        |
| `daily_champion`        | Daily Champion          | `run.escaped && run.isDaily`                          | 0 embers, recognition only                                                                   | `isDaily: boolean`                                                                                                                                           |

Notes on the table:

- `three_gates_deep` and `elite_hunter_3` are pure escalations of contracts this slice already
  shipped (`delve_past_first_gate`, `first_elite_kill`) — no design risk, just more of the same
  mechanism at a harder threshold. Good candidates to ship first among these eight.
- `frugal_escape` is the one entry that needs new run-state plumbing, not just a snapshot field —
  flagging it so it isn't accidentally scoped as "just add a field."
- The three scenario contracts (`toxic_survivor`, `one_armed_escape`, `double_trouble_escape`)
  share one new field (`scenarioId`). Because the `escape_the_dungeon` premise already suppresses
  all contract evaluation (see mechanism recap), there's no risk of them firing on the "no
  progression rewards" premise — they only need the field, not a new gate.
- `daily_champion` reuses the fact that Daily Descent already flows through contract evaluation
  today; it only needs `isDaily` threaded into the snapshot. Whether a Daily-specific contract is
  _wanted_ (dailies are meant to be a fixed, comparable format) is exactly Open Question 3 below —
  this row is a proposal, not a recommendation.
- Ember total across all 8 rows as proposed: 2 (both capped at 1, most at 0), respecting the
  guardrail. If any row's reward is escalated by the maintainer, keep it capped at 1.

## Open questions (explicitly deferred, not resolved by this slice)

1. **Cross-run (chronicle-fed) contracts.** `src/chronicle.ts` already tracks `runsCompleted`,
   `escapes`, `bestDepth`, `bestGold`, `bestEnemiesDefeated`, and a rolling window of recent run
   entries — durable, cross-run data that today never reaches `evaluateContract`. Feats like
   "escape 3 times" or "clear 5 Daily Descents" need this. Doing it requires deciding: does
   `evaluateContract`/`ContractRunSnapshot` grow a second input (the chronicle), or does a
   parallel `evaluateChronicleContracts` function exist alongside it? Either changes the
   "one flat snapshot object" shape noted in the plan's maintenance notes.
2. **Per-archetype contracts.** `archetypeId` (`'barbarian' | 'necromancer' | 'ranger'`) is
   available on `RunState` and could be added to the snapshot cheaply for single-run predicates
   (e.g. "escape as Necromancer"). A completionist variant ("escape with all three archetypes")
   is a cross-run question and folds into Open Question 1 instead.
3. **Daily-specific goals.** As noted above, Daily runs already flow through contract evaluation
   unconditionally. The open question is whether that's desired product behavior (a Daily-only
   contract rewarding content unlocks) or an oversight that should be tightened — daily runs are
   meant to be a fixed, comparable format, and unlocking permanent content from them is a
   different kind of incentive than the current "Daily has its own leaderboard, no persistent
   reward" design.
4. **Where contracts surface outside the End screen.** This slice added a one-line
   `Contracts: X/Y complete` count on the End screen (`src/scenes/End.ts`) — deliberately minimal,
   per the ideation's own caveat ("the end screen must make progress visible"). Campfire and
   Progression screens still show nothing about contracts. Candidate follow-up, explicitly not
   attempted here: should Progression list locked/unlocked contract names (spoiling the goal) or
   only a count (matching the End screen's restraint)? Should completed contracts show a
   permanent badge anywhere durable, versus only appearing once on the run they complete?

## Sources / Research

- `docs/ideation/2026-06-27-escape-progression-economy-ideation.html` — "I3. Chronicle Unlock
  Contracts" (confidence 84%), the origin ideation for this goal layer, including its own noted
  downside ("the end screen must make progress visible").
- `src/data/contracts.ts`, `src/game/contracts.ts`, `src/game/contracts.test.ts` — current
  contract data, evaluation/apply mechanism, and test style this roster should follow.
- `src/chronicle.ts` — durable cross-run history available for Open Question 1.
- `src/state.ts` — `RunState` fields available to widen the snapshot further (`gold`, `scenarioId`,
  `archetypeId`, `isDaily`).
- `src/data/scenarios.ts`, `src/data/cards.ts` — `ScenarioId` and `ArchetypeId` value sets used in
  the roster predicates above.
- `src/game/runCompletion.ts`, `src/game/scenarioRules.ts` — the gate that decides whether a run's
  contracts (and Embers) resolve at all; documents why scenario/daily contracts are reachable
  without further gating changes.
- `src/data/relics.ts` — remaining Ember-cost-gated, not-yet-contract-gated relics used as unlock
  candidates above.
