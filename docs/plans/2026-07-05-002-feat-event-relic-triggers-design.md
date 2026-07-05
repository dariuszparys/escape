---
title: 'design: Event-triggered relics on the combat event bus'
type: design
date: 2026-07-05
artifact_contract: ce-unified-plan/v1
artifact_readiness: needs-decision
origin: plans/009-event-relic-spike (design spike, no product_contract_source)
---

# design: Event-triggered relics on the combat event bus

> **Status**: design spike output, not an implementation-ready plan. This document
> recommends an architecture and demonstrates its lifecycle with a proof-of-concept test
> (`src/game/relicTriggers.spike.test.ts`), but ships no relic content and makes no shipping-code
> change. If the maintainer accepts the recommendation, the build-out (registry entries + driver
> wiring + band validation) becomes a normal feature plan against `docs/plans/`.

## The context problem

`src/game/combatEvents.ts` already emits `damageDealt` and `statusApplied` live during
resolution (from `src/game/effectHandlers.ts`'s `damage`/`status` handlers), but **neither event
carries the run's owned relic ids** — they carry only combatant ids and effect magnitudes. The
one real subscriber, `battleWon → vampiric_blade` (`src/game/relicBehaviors.ts`), works because
`emitBattleWon(relicIds)` is a **driver-constructed, once-per-battle** call: the driver already
has the relic list in hand when it calls it. `damageDealt`/`statusApplied` are emitted from deep
inside effect resolution, which has no run context at all — closing that gap is the actual
design problem this spike addresses.

A second, non-obvious fact surfaced by reading the code (not in the original problem framing):
**there are two distinct events for one damage instance.** `effectHandlers.ts`'s `damage` handler
emits `damageDealt` live (`{sourceId, targetId, amount}`, guarded by
`hasCombatEventSubscribers('damageDealt')`) _during_ `dispatchEffect`. Separately,
`turnEngine.ts`'s `applyEffect` unconditionally pushes a richer `damageResolved` event
(`{sourceId, targetId, amount, blockAbsorbed, hpAfter, blockAfter}`) into `rt.events`, which
`finish()` mirrors onto the bus _after_ the whole command resolves. An on-kill relic needs
`hpAfter`, which only `damageResolved` carries — so the two "on-hit" events are not
interchangeable, and a relic spec must pick the right one deliberately (see `grave_ledger` below).

### Candidate architectures

**(a) Battle-scoped subscriptions.** The driver (scene or simulator) registers relic-specific
subscribers via the existing `subscribeCombatEvent` at battle start, with the run's relic ids
closed over in the subscriber's closure, and disposes them at battle end. No bus, engine, or
effect-handler change. **This is the PoC's approach and the default hypothesis.**

**(b) Enriching events with a context object (bus API change).** Thread a `BattleContext`
(relic ids, maybe more) through every `emitCombatEvent` call so subscribers can stay global and
stateless, mirroring how `battleWon` already carries `relicIds`. Rejected as the primary
recommendation: it requires editing every emit call site in `effectHandlers.ts` and
`turnEngine.ts` (the exact shipping files this spike is barred from touching, and which the
keystone plan (`docs/plans/2026-07-01-001-...`) deliberately kept minimal per its KTD1/KTD2). It
also doesn't remove the need for _some_ per-battle registration/dedup story — a global
`ensureXWired()`-style subscriber would still need the battle's relic ids from somewhere, which
is exactly what battle-scoping supplies for free.

**(c) Engine-internal relic hooks (bypass the bus).** Add relic lookups directly inside
`turnEngine.ts`'s dispatch (the way `relicRegistry.ts`'s `relicBattleSetup` already does for
setup-time modifiers). Rejected: it reintroduces the imperative, per-call-site coupling the
combat event bus was built to retire, and — because `turnEngine.ts` is shared by both drivers
already — doesn't even buy anything (b) or (a) don't; it only trades "subscriber accumulator" for
"direct engine mutation," which is a strictly bigger, riskier diff against the most-tested file
in the codebase for no architectural benefit.

**Recommendation: (a).** The PoC (`src/game/relicTriggers.spike.test.ts`) proves battle-scoped
subscriptions work end-to-end against a real engine-driven battle with zero shipping-code
changes: a subscriber fires on `statusApplied`, its disposer fully un-registers it, and two
independent runs under the same deterministic `SequenceRng` setup produce byte-identical tallies.
See "Re-entrancy" below for the one failure mode it also caught empirically.

### Who owns registration for both drivers (R4-style dedup)

`relicBehaviors.ts`'s current pattern — module-global `wired` boolean, `ensureRelicBehaviorsWired()`
— does not extend to battle-scoped triggers, because "wired" would need to mean "wired **for this
battle's relic ids**," and a boolean can't express that. The replacement: a single exported
function, e.g. `wireBattleRelicTriggers(relicIds: readonly RelicId[]): () => void`, that:

1. Registers one `subscribeCombatEvent` call per trigger-relic kind the run owns (only for ids
   actually present, mirroring `relicBattleSetup`'s per-id switch), closing over `relicIds` and a
   fresh per-battle accumulator.
2. Returns a single disposer that unsubscribes everything it registered.

Both the TurnBattle scene and the balance simulator call this **once, at battle start**, and call
the returned disposer **once, at battle end** — this is the R4 precedent (one shared definition,
both drivers) preserved without a process-lifetime flag. There is deliberately no module-global
"already wired" state left: re-entrancy is scoped to the battle object, not the process.

### Re-entrancy (battle restart, `?battle=slice` dev entry)

Because registration is per-battle rather than per-process, a restarted battle is safe **as long
as the previous battle's disposer actually ran**. The risk case is a battle that ends without the
normal teardown path executing (a dev hot-entry that jumps straight into a second `createBattle`,
or a scene destroyed without emitting through its own cleanup) — the old subscriber leaks and
silently double-counts triggers in the _next_ battle. This is not hypothetical: an early draft of
the PoC's determinism test called `runOnce()` twice without disposing the first run's subscriber,
and the second run's tally silently included the first run's subscriber's leaked accumulation
(2 entries where 1 was expected) — caught only because the test asserted exact tally contents. The
recommendation for the build-out: tie disposal to the `battleEnded` event itself (subscribe once,
internally, to un-register everything else when `battleEnded` fires) rather than trusting every
driver call site to remember to call the disposer — belt-and-suspenders against exactly this leak.

## The mutation surface

Modeled on `BattleWonResult` (`combatEvents.ts:10-12`), a per-battle accumulator a trigger
subscriber writes into and the driver reads back:

```ts
export interface BattleTriggerResult {
  /** Extra poison stacks to apply, keyed by target id (multi-enemy safe). */
  bonusPoisonStacks: Record<string, number>;
  /** Retaliation damage to apply, keyed by target id. */
  retaliateDamage: Record<string, number>;
  /** Flat block to grant the player. */
  bonusBlock: number;
  /** Flat energy to grant the player (next turn or immediately, per relic spec). */
  bonusEnergy: number;
}
```

**When the driver applies it is forced by the engine's structure, not a free design choice.**
Subscribers only ever receive a read-only `event`; they have no reference to the engine's private
`EngineRuntime` (`rt`), so they cannot mutate `state` or `rt.events` mid-command even if the
mutation surface allowed it — the earliest point _any_ code outside `turnEngine.ts` regains
control is when `playCard`/`endTurn`/`useItem` returns its sealed `TurnCommandResult`. So:

- **"Immediately per event" is not achievable by the driver** for `damageDealt`/`statusApplied`
  triggers — those fire live, mid-command, and the driver isn't running code at that instant.
- **"End-of-action batch" is the only option, and it falls out for free for `damageResolved`**
  (and `battleWon`) triggers, since those are mirrored at `finish()` time — by the time the driver
  sees them, the command has already resolved. For live `damageDealt`/`statusApplied` triggers,
  "end of action" just means "read the accumulator after the same `playCard`/`endTurn` call that
  caused it," which is the natural place drivers already read `events`/`state` today.

**The presentation-queue implication (the real cost this spike surfaces):** the triggering
command's own `events` array is fully built before the driver ever sees the accumulator, so a
trigger's visible consequence (a block-gain popup, a bonus-poison tick) **cannot be interleaved**
into the same per-effect animation sequence the command already produced — it can only be
appended as a synthetic follow-up event (e.g., a driver-synthesized `blockGained`) tacked onto the
end of that beat, or exposed as its own separate mini-beat the driver queues right after. Getting
a trigger's animation to land _between_ two of the triggering card's own effects (e.g., "poison
lands, THEN the ring's bonus stack lands, THEN the card's second effect resolves") is not possible
under architecture (a) without an engine change — that would require architecture (b) or (c). This
is a real, deferred cost of choosing (a); flagged rather than hidden, since it isn't the PoC's job
to average it away.

## Relic specs (RNG-free, ids not reused from `src/data/relics.ts`)

| Relic             | Trigger event                                                                                            | Accumulator field                  | Cap / anti-loop rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Balance rationale                                                                                                                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `thorned_ring`    | `damageDealt` where `targetId === 'player'` (an enemy just hit the player)                               | `retaliateDamage[sourceId] += 1`   | **Structural, not counted:** the subscriber only fires when the player is the _target_; the retaliation it produces makes the player the _source_ against an enemy, which can never satisfy the same filter. One hop, provably non-recursive.                                                                                                                                                                                                                                                                                                                                                                                                    | Punishes tanking lightly, rewards trading hits over full-block play — an attrition-build enabler distinct from `stone_heart`'s block-retention angle.                                      |
| `coiled_momentum` | `statusApplied` where `status === 'poison' && targetId !== 'player'` (the player just poisoned an enemy) | `bonusPoisonStacks[targetId] += 1` | **Structural:** the driver applies the accumulated bonus by mutating `state`/HP fields directly (never re-entering `dispatchEffect`/`emitCombatEvent`), so the bonus application cannot itself emit a second `statusApplied` and re-trigger the subscriber — termination by construction, not by a counter.                                                                                                                                                                                                                                                                                                                                      | Gives a poison-stacking line its own itemized payoff, distinct from `venom_ring`'s flat per-application bonus — rewards committing to poison over spreading debuffs thin.                  |
| `grave_ledger`    | `damageResolved` where `targetId !== 'player' && hpAfter <= 0`                                           | `bonusEnergy += 1` (next turn)     | **Requires local closure state, not just the event:** `damageResolved` only carries `hpAfter`, not a before/after transition, and the engine does **not** guard against a second damage effect landing on an already-dead corpse within the same command (only `enemyKillDraw`'s own inline check does, at `turnEngine.ts:346-353`, and that's specific to that feature). The subscriber must keep a per-battle `Set<targetId>` and only fire the first time a given enemy id crosses `hpAfter <= 0` — bounded by "at most once per enemy in the pack," which terminates because enemy ids are finite and each is added to the set at most once. | A soft economy payoff for closing fights rather than dragging them — nudges the energy curve up a notch without being a direct damage buff.                                                |
| `warded_hearth`   | `statusApplied` where `targetId === 'player'` (the player just received any debuff)                      | `bonusBlock += 2`                  | **Structural:** the consequence (`bonusBlock`, a block gain) is never expressed as a `status` effect, so applying it can never re-emit a `statusApplied` event — the trigger and consequence event types are disjoint, ruling out recursion by type mismatch alone.                                                                                                                                                                                                                                                                                                                                                                              | Softens a scripted enemy's opening debuff swing without touching `vulnerable`/`weak`/`frail` values directly — a mitigation lever that doesn't require rebalancing the debuffs themselves. |

All four are read-only observers plus a driver-applied, capped, one-shot-per-trigger patch; none
consumes RNG (`subscribeCombatEvent`'s dispatch signature threads none, per KTD2 in the keystone
plan); none is a partial/percentage effect that would need a rounding or repeat-application policy.

## Open questions for the maintainer

- **Balance-band process for trigger relics.** The existing relics are scored by their
  `relicBattleSetup`/`relicBattleWonHeal` deltas against the balance simulator's dominance gate
  (`docs/solutions/design-patterns/decouple-enemy-power-from-player-reward-scaling.md`'s "no
  dominant line" discipline). A per-hit/per-status trigger's effective value scales with fight
  length and pack size in a way a flat setup-time bonus doesn't — does the band process need a
  new axis (e.g., "expected triggers per fight" at a given stratum) before any of these four ship?
- **Whether the sim's policy needs to value them.** `balanceSimulator.ts`'s greedy play policy
  (per the repo's "tuned against a COMPETENT sim policy" methodology) currently has no concept of
  "play the card that feeds a trigger relic" — it optimizes for lethal/survival directly. Do
  `coiled_momentum`/`thorned_ring` need the policy taught to value them, or is it acceptable that
  the sim under-uses them (making its balance numbers a conservative floor rather than a realistic
  estimate)?
- **UI telegraphing of triggers in the battle log.** The four specs each imply a visible
  consequence (a bonus poison tick, a retaliation hit, a block gain, an energy tick) that the
  presentation-queue finding above says must render as an appended or separate beat, not an
  interleaved one. Does the log/HUD need a distinct visual treatment (an icon, a relic-attributed
  log line) so a player can tell "my card did that" from "my relic did that," given they're
  visually adjacent but causally distinct?

Additional questions this spike surfaced while grounding the design in the actual code (not
originally asked for, included because they block a clean build-out):

- **Where does `wireBattleRelicTriggers`'s disposal actually live?** The re-entrancy section
  above recommends tying it to `battleEnded` rather than trusting every driver call site — does
  the maintainer want that as a hard requirement of the build-out plan, given the PoC caught a real
  leak from a bare "remember to call the disposer" pattern?
- **Does the build-out need a new `turnEngine.ts` entry point** to apply an accumulated
  `BattleTriggerResult` as a state-mutating patch (mirroring how `finish()`/commands already clone
  before mutating), rather than each driver hand-rolling its own patch of the returned
  `TurnBattleState`? Two drivers hand-rolling the same patch independently is exactly the
  duplication R4 already paid down once for `vampiric_blade`.
