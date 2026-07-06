---
title: Scenario Balance Guardrails - Plan
type: fix
date: 2026-07-06
topic: scenario-balance
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Scenario Balance Guardrails - Plan

## Goal Capsule

- **Objective:** Make hard Scenarios playable-but-hard in the current 100-room model by budget-anchoring Enemies Are Doubled, tightening Lost Left Arm's no-block content support, and adding explicit simulator bands that fail on dead-mode outcomes.
- **Product authority:** This plan follows the existing Scenario product shape and the confirmed 100-room escape model. It changes balance implementation and guardrails, not Scenario selection, XP progression, room count, or the core run terminus.
- **Execution profile:** Land the simulator measurement surface first, then tune the two active problem Scenarios, then lock the resulting bands and update visible wording.
- **Stop conditions:** Stop before changing Scenario names/backstories, adding bonus rewards, changing Daily Descent comparability, changing XP/Level behavior, or globally retuning the whole 100-room enemy curve to hide a Scenario-specific problem.
- **Tail ownership:** Implementation must satisfy the Verification Contract, preserve deterministic run signatures except for documented intentional changes, and complete the browser smoke for visible Scenario text.

---

## Product Contract

### Summary

This plan targets the balance defects exposed by current simulator measurements: Enemies Are Doubled has a 0% finish rate across tested loadouts, Lost Left Arm is viable only for some archetype/loadout routes, and the hard-Scenario regression test allows any non-negative win rate to pass. The fix keeps the Scenario roster and 100-room shape intact while turning hard Scenario balance into an explicit, deterministic contract.

### Problem Frame

The current Scenario implementation is mechanically complete but under-guarded. In a 5,000-seed planning probe, Enemies Are Doubled finished at 0.0% for bare, mid, and strong loadouts, with the strong loadout reaching the first boss only about 11%. That is not a hard mode; it is a dead mode.

Lost Left Arm has a different problem. The no-block rule is coherent, but the current "strong" harness profile is Necromancer plus Iron Will, which performs badly without block while Barbarian plus Iron Will remains viable. That is useful archetype texture, but the harness currently presents one fixed strong loadout as if it were universal.

The active test in `src/game/balanceSimulator.test.ts` only checks hard Scenarios are deterministic and at or below baseline. A Scenario with 0% finish rate satisfies that assertion. The balance harness needs lower bounds, scenario-supported profiles, and diagnostics that distinguish "hard but viable" from "not finishable."

### Requirements

**Scenario playability**

- R1. Enemies Are Doubled must stop spawning two full solo normal encounters; it must remain a two-enemy normal encounter while sharing a tuned encounter budget.
- R2. Enemies Are Doubled must keep elites and bosses as single authored fights.
- R3. Lost Left Arm must preserve the no-block rule while keeping opening choices, reward offers, and archetype identity from collapsing because block cards were filtered out.
- R4. Poisoned must remain nonzero and below the clean supported profile without receiving unrelated buffs.

**Harness guardrails**

- R5. The balance simulator must expose scenario-supported high-access profiles in addition to the existing bare/mid/strong access tiers.
- R6. Hard Scenario tests must assert explicit lower and upper bands; a 0% finish rate must fail unless a Scenario is deliberately marked impossible, which this plan does not allow.
- R7. The harness must keep deterministic double-run checks for every player Scenario profile it reports.
- R8. Existing 100-room global guardrails must continue to pass: bare near-zero escape, clean strong in the Earned band, mid deaths in the middle arc, and monotonic per-decade survival.

**Player-facing wording**

- R9. Visible copy for Enemies Are Doubled must stop promising "two full-strength normal enemies" once the implementation becomes budget-anchored.
- R10. README and CONCEPTS vocabulary must describe the new hard-Scenario balance truth without reintroducing retired Ember, banking, or stratum language.

### Acceptance Examples

- AE1. **Covers R1-R2.** Given an Enemies Are Doubled normal encounter at depth 5, when the encounter is spawned, then it contains exactly two normal-themed enemies whose combined pressure is budget-anchored rather than two full solo encounters; when an elite or boss spawns, it remains a single authored fight.
- AE2. **Covers R3.** Given a Lost Left Arm run with each archetype, when starting cards and rewards are generated, then no block-granting card, item, or relic is offered, and the offer counts remain at their normal sizes when enough safe content exists.
- AE3. **Covers R5-R7.** Given the simulator runs its Scenario matrix twice for the same seed window, when the summaries are compared, then every reported Scenario/profile result is identical and hard Scenarios have nonzero lower-bound assertions.
- AE4. **Covers R6-R8.** Given Enemies Are Doubled regresses to a 0% supported-profile finish rate, when `src/game/balanceSimulator.test.ts` runs, then the hard-Scenario band test fails.
- AE5. **Covers R9-R10.** Given a player reads Scenario selection, README, or CONCEPTS, when they inspect Enemies Are Doubled, then the rule text describes a doubled encounter budget rather than two full-strength solo enemies.

### Scope Boundaries

- Daily Descent remains separate from Scenario selection and keeps its current loadout-comparability policy.
- XP, Level, Discovery, Loadout, Suspend, and the 100-room run structure are not part of this plan.
- No new Scenarios, bonus rewards, difficulty selectors, heat ladders, or meta-progression purchases are included.
- This is not a global enemy-curve rebalance. Enemy HP, intent pressure, reward pacing, and room tables should move only where Scenario-specific tuning proves they must.
- This plan does not try to make every archetype equally good in every hard Scenario. It requires at least one supported high-access route per hard Scenario and clear diagnostics for route mismatch.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Scenario balance is measured with supported profiles plus fixed-tier profiles.** The current bare/mid/strong tiers stay as access baselines, but the hard-Scenario contract uses scenario-supported high-access profiles so the harness does not mistake a bad archetype matchup for a whole Scenario being dead.
- KTD2. **Enemies Are Doubled uses normal enemy identity with pack-budget discipline.** The pair should look like two normal enemies, not minions, but its combined HP and intent pressure should follow the budget-anchoring pattern from Enemy Packs rather than doubling a solo encounter.
- KTD3. **Lost Left Arm gets content support, not a global enemy nerf.** Preserve the no-block rule through filters and runtime guardrails, then improve safe backfill and reward composition so blocked-out cards do not shrink or distort the run.
- KTD4. **Bands encode product intent, not exact measured snapshots.** Tests should use broad ranges that catch dead modes and runaway buffs while allowing future playtest tuning. The starting planning targets are: clean supported high-access around 20-35%, Poisoned around 10-25%, Lost Left Arm around 10-25% for its supported route, and Enemies Are Doubled around 3-12%.
- KTD5. **Determinism remains a first-class balance signal.** Any new scenario matrix helper must be deterministic for fixed seeds and must preserve the existing run-signature discipline unless a rebaseline is intentional and documented.

### High-Level Technical Design

```mermaid
flowchart TB
  S[Scenario id on RunState] --> RULES[scenarioRules predicates]
  RULES --> SPAWN[scenario-aware encounter spawning]
  RULES --> FILTERS[scenario-safe cards, relics, items]
  SPAWN --> BATTLE[Turn Engine over enemies[]]
  FILTERS --> RUN[Run deck, relics, inventory]
  RUN --> SIM[balanceSimulator]
  BATTLE --> SIM
  SIM --> MATRIX[Scenario profile matrix]
  MATRIX --> BANDS[hard-Scenario band assertions]
  BANDS --> COPY[player-facing wording and docs]
```

The plan keeps rule ownership in pure modules. Scenes should render Scenario text and launch runs; they should not decide encounter budgets, content filtering, or balance bands.

### Research Notes

- `src/data/enemies.ts` already contains budget-anchored minion packs with `PACK_HP_MULTIPLIER` and per-foe intent-bonus splitting. Enemies Are Doubled currently bypasses that discipline by returning two full `spawnEnemy` results.
- `docs/solutions/design-patterns/multi-enemy-pack-combat-refactor.md` records the reusable pattern: model solo as a one-element pack, budget-anchor new multi-enemy content, and let deterministic tests prove shape changes.
- `docs/solutions/design-patterns/decouple-enemy-power-from-player-reward-scaling.md` records the active rule for difficulty work: tune coupled survival constants as a set against the harness, not by isolated feel.
- `src/game/startingCards.test.ts` and `src/game/rewards.test.ts` already test Lost Left Arm filtering and offer counts for some paths; this plan extends those guards across archetypes and the simulator matrix.
- External research was skipped. This is an internal game-balance and harness problem with strong local patterns and no unsettled external technology choice.

---

## Implementation Units

### U1. Scenario balance matrix and supported profiles

- **Goal:** Add a simulator-facing Scenario matrix that reports both existing access tiers and scenario-supported high-access profiles.
- **Requirements:** R5, R7.
- **Dependencies:** None.
- **Files:** `src/game/balanceSimulator.ts`, `src/game/balanceSimulator.test.ts`, `src/game/runSignature.ts`, `src/game/runSignature.test.ts`.
- **Approach:** Keep `BALANCE_LOADOUT_SCENARIOS` for bare/mid/strong access tiers. Add a separate table of named Scenario balance profiles, such as clean supported, poisoned supported, left-arm supported, and doubled supported. Each profile should name its intended archetype/relic assumptions and be consumed by a matrix helper that returns win rate, boss reach, median death room, average death room, and decade survival. Do not overload `BalanceScenario` naming to imply a player-facing Scenario and a harness profile are the same thing.
- **Profile seed table:** Start with explicit constants rather than ad hoc test setup: clean supported should mirror the existing strong high-access route, Poisoned should use the current Necromancer plus Iron Will route, Lost Left Arm should use Barbarian plus Iron Will, and Enemies Are Doubled should use the strongest named high-access candidate found in the U1 characterization sweep before U2 tuning. Once selected, keep these as named profile data so final band tests cannot dynamically choose whichever route happens to pass.
- **Execution note:** Start with characterization tests around the current matrix shape so later tuning has a stable reporting surface before numbers move.
- **Patterns to follow:** Existing `simulateScenarioSummary`, `simulateLoadoutTierSummary`, `assessCardEmphasisDominance`, and `runSignature(seed, scenario)` helpers.
- **Test scenarios:**
  - Given the matrix helper is called for all player Scenarios, it returns a row for each selected profile with runs, win rate, boss reach, median death depth, and deterministic decade survival.
  - Given the matrix helper is called twice with the same run count and profiles, the returned summaries are deeply equal.
  - Given a non-default profile uses a player Scenario and archetype, `runSignature(seed, profile)` is stable across double runs for a seed spread.
  - Given the legacy bare/mid/strong helpers are called, their output remains available for the existing 100-room global bands.
- **Verification:** The simulator exposes a deterministic Scenario matrix without changing encounter math yet.

### U2. Budget-anchored Enemies Are Doubled encounters

- **Goal:** Replace two full solo normal enemies with a two-enemy normal encounter whose combined budget is tuned like an encounter shape, not like two rooms at once.
- **Requirements:** R1, R2, AE1.
- **Dependencies:** U1 for measurement, though the spawn helper can be implemented independently.
- **Files:** `src/data/enemies.ts`, `src/data/enemies.test.ts`, `src/game/balanceSimulator.ts`, `src/game/balanceSimulator.test.ts`.
- **Approach:** Add a dedicated doubled-normal spawn path that chooses two normal enemy definitions, scales each foe from an encounter-level HP budget, and splits post-first-decade intent pressure across the pair. Reuse the Enemy Pack reasoning: total HP may be modestly above one solo because focus fire removes attackers, but it must not approach two full solo HP bars with two full intent bonuses. Keep normal enemy definitions for identity; do not switch the Scenario to minion packs. Bosses and elites keep the existing single-spawn path.
- **Patterns to follow:** `spawnMinionPack`, `packHpBudget`, `intentBonusForDepth`, `toEngineEnemies`, and the `scenario encounter spawning` tests in `src/data/enemies.test.ts`.
- **Test scenarios:**
  - Given Enemies Are Doubled normal spawn at weak, medium, and strong depths, the pack has exactly two enemies and neither enemy comes from the minion roster.
  - Given the doubled pair is spawned at the same depth as a solo, its combined HP is in a documented budget range around one solo plus focus-fire correction, and clearly below two full solo enemies.
  - Given intent pressure is empowered for a doubled pair, each foe receives only the pair-scaled post-depth bonus, not the full solo bonus.
  - Given Enemies Are Doubled is active for elite and boss encounter kinds, the spawned pack has length one and uses the existing elite/boss functions.
  - Given a scripted RNG sequence, two doubled spawns with the same sequence produce identical enemy ids, HP, and pattern views.
- **Verification:** Enemies Are Doubled no longer measures as a 0% supported-profile scenario once U4 bands are applied, and existing normal pack behavior remains unchanged for non-doubled Scenarios.

### U3. Lost Left Arm content support and route diagnostics

- **Goal:** Preserve the no-block rule while making Lost Left Arm's safe content and simulator diagnostics robust across archetypes.
- **Requirements:** R3, R5, AE2.
- **Dependencies:** U1.
- **Files:** `src/game/scenarioRules.ts`, `src/game/scenarioRules.test.ts`, `src/game/startingCards.ts`, `src/game/startingCards.test.ts`, `src/game/rewards.ts`, `src/game/rewards.test.ts`, `src/game/turnEngine.ts`, `src/game/turnEngine.test.ts`, `src/game/balanceSimulator.ts`, `src/game/balanceSimulator.test.ts`.
- **Approach:** Keep `cardGrantsBlock`, `isScenarioAllowedCard`, `isScenarioAllowedItem`, and `isScenarioAllowedRelic` as the rule seam. Preserve the existing `preventPlayerBlock` Turn Engine guard as the runtime backstop for any missed block effect path. Extend scenario-safe backfill so each archetype's blocked-out opening choices are replaced by non-block cards that preserve a playable mix of damage, sustain, draw, or disruption where possible. Extend reward tests so victory and chest offers stay full-sized under Lost Left Arm across neutral, Barbarian, Necromancer, and Ranger pools. In the harness, record the poor fixed-Necromancer matchup as a diagnostic while the supported Lost Left Arm profile uses the route that the game currently makes viable.
- **Patterns to follow:** `startingCardIdsForChoiceCount`, `startingDeckPadIdsForScenario`, `rollVictoryCardOffers`, `rollChestReward`, and existing Left Arm tests.
- **Test scenarios:**
  - Given Lost Left Arm and each archetype, opening choices and starting deck pad contain no block-granting cards and keep expected counts when enough safe content exists.
  - Given Lost Left Arm reward generation at shallow, mid, and deep depths, victory offers and chest card rewards exclude block cards and do not shrink below their intended offer counts.
  - Given a runtime missed block effect reaches the Turn Engine under Lost Left Arm, player block gained remains zero while enemy block and armor continue to work.
  - Given the Scenario matrix reports Lost Left Arm, it includes both the supported route and the fixed strong-loadout diagnostic so reviewers can see route mismatch instead of hiding it.
- **Verification:** Lost Left Arm's supported profile lands in its hard band after U4 without relaxing the no-block rule.

### U4. Explicit hard-Scenario survival bands

- **Goal:** Replace the broad "hard Scenarios are at or below baseline" test with concrete hard-but-viable bands.
- **Requirements:** R4, R6, R8, AE3, AE4.
- **Dependencies:** U1, U2, U3.
- **Files:** `src/game/balanceSimulator.test.ts`, `src/game/balanceSimulator.ts`.
- **Approach:** Add table-driven assertions over the Scenario matrix. Keep clean/Escape tied to baseline. Assert Poisoned remains nonzero and below the clean supported route. Assert Lost Left Arm's supported route is nonzero and below or near clean while keeping the fixed-loadout diagnostic visible. Assert Enemies Are Doubled lands in a deliberately low but nonzero band. Keep the existing global bare/mid/strong survival block, weak-tier floor, elite engagement checks, no-dominant-emphasis check, and determinism gate.
- **Patterns to follow:** Existing `simulationTest` timeout wrapper and deterministic double-summary checks.
- **Test scenarios:**
  - Given clean supported high-access runs, win rate remains inside the existing Earned neighborhood and deterministic double-runs match.
  - Given Poisoned supported high-access runs, win rate is greater than zero, lower than clean supported, and median death depth stays beyond the opening rooms.
  - Given Lost Left Arm supported high-access runs, win rate is greater than zero, lower than or near clean supported, and offer-count tests from U3 remain green.
  - Given Enemies Are Doubled supported high-access runs, win rate is greater than zero and less than the other hard Scenario bands.
  - Given a hard Scenario's supported-profile win rate is 0%, the test fails with a message that names the Scenario/profile row.
- **Verification:** `src/game/balanceSimulator.test.ts` fails on the current full-strength doubled implementation and passes only after U2/U3 tuning lands.

### U5. Player-facing wording and current vocabulary sweep

- **Goal:** Align visible Scenario text and current docs with the new budgeted hard-Scenario behavior.
- **Requirements:** R9, R10, AE5.
- **Dependencies:** U2, U4.
- **Files:** `src/data/scenarios.ts`, `README.md`, `CONCEPTS.md`, `src/data/scenarios.test.ts`.
- **Approach:** Update Enemies Are Doubled rule text to say normal encounters contain two enemies sharing a harder encounter budget, not two full-strength solo enemies. Keep the idea clear to players: there are two threats, elites and bosses stay single, and the Scenario is still the harshest route. Update README and CONCEPTS to match. Add or extend scenario data tests so every Scenario still has a non-empty name, backstory, and rule summary after the wording change.
- **Patterns to follow:** Existing `SCENARIOS` data and README/CONCEPTS vocabulary for Run, Scenario, Enemy Pack, XP, and Level.
- **Test scenarios:**
  - Given Scenario data is loaded, every rule summary is non-empty and Enemies Are Doubled no longer contains "full-strength" wording.
  - Given README and CONCEPTS are swept, active docs describe doubled normal encounters consistently with the budgeted implementation.
  - Test expectation for rendered Scenario text: manual browser smoke because Phaser layout/readability is scene-owned.
- **Verification:** Scenario selection still renders all four Scenarios with readable rule summaries, and docs no longer promise two full solo enemies.

---

## Verification Contract

| Gate                          | Scope                                                                                                                                                    | Done signal                                                                                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Scenario rules and data tests | `src/game/scenarioRules.test.ts`, `src/game/startingCards.test.ts`, `src/game/rewards.test.ts`, `src/data/enemies.test.ts`, `src/data/scenarios.test.ts` | Scenario predicates, no-block filters, doubled spawn budgets, and Scenario copy are covered.                                                                       |
| Balance harness               | `src/game/balanceSimulator.test.ts`                                                                                                                      | Clean, Poisoned, Lost Left Arm, and Enemies Are Doubled have deterministic summaries and explicit nonzero bands.                                                   |
| Determinism gate              | `src/game/runSignature.test.ts` plus existing determinism tests                                                                                          | Any intentional signature change is rebaselined with a comment; accidental drift fails.                                                                            |
| Full suite                    | `npm test`                                                                                                                                               | All Vitest suites pass after tuning.                                                                                                                               |
| Build                         | `npm run build`                                                                                                                                          | TypeScript and Vite build pass.                                                                                                                                    |
| Browser smoke                 | `npm run dev` and Scenario selection                                                                                                                     | Scenario text renders without overlap; Enemies Are Doubled description matches the budgeted rule; starting the affected Scenarios reaches Dungeon/Battle normally. |

---

## Definition of Done

- Enemies Are Doubled no longer uses two full solo normal enemies for normal rooms, and elite/boss spawning remains single.
- Hard Scenario simulator tests fail on 0% supported-profile finish rates.
- Lost Left Arm preserves no-block behavior while maintaining scenario-safe opening/reward counts across archetypes.
- Scenario matrix output distinguishes supported profiles from fixed access tiers so archetype mismatch is visible.
- README, CONCEPTS, and Scenario rule text no longer describe obsolete full-strength doubled enemies.
- `npm test` and `npm run build` pass.
- Browser smoke confirms Scenario selection and run launch still render and route correctly.
- Any abandoned tuning experiments or temporary reporting scripts are removed before handoff.

---

## Appendix

### Current Planning Measurements

These measurements were gathered before writing the plan to frame the problem. They are not the final validation bands.

| Scenario            | Bare finish | Mid finish | Strong finish | Strong median death |
| ------------------- | ----------: | ---------: | ------------: | ------------------: |
| Escape the Dungeon  |        1.4% |      28.4% |         27.8% |                  68 |
| I'm Poisoned        |        0.6% |      13.5% |         17.4% |                  60 |
| I Lost My Left Arm  |        0.2% |      23.9% |          4.2% |                  11 |
| Enemies Are Doubled |        0.0% |       0.0% |          0.0% |                   7 |

The same planning probe found Barbarian plus Iron Will around 29% in clean runs and around 25% in Lost Left Arm, while Necromancer plus Iron Will was the better Poisoned route. That supports KTD1: hard Scenario balance should report supported routes and fixed profiles separately.
