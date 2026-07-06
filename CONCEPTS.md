# Concepts

Shared domain vocabulary for Escape. Keep entries focused on player-facing
concepts and durable implementation boundaries.

## Dungeon Loop

### Instant Encounter

Entering an uncleared encounter or boss room starts the Card Battle
immediately — entry is commitment. A brief entry cue (a red exclamation,
camera shake, and hit sting) plays over locked input, then the battle launches.
There is no in-room monster phase to move through, no contact trigger, and no
way to slip back out to skip the fight; the monster is a static sprite that
fades on victory. Avoiding a fight means not entering the room, informed by the
Scout Charge reveal of adjacent room types.

### Scout Charge

A limited Run resource that reveals the event type of the adjacent unexplored
rooms behind the current room's open doors. The reveal fires at most once per
room and its text persists until the player moves on; Scout Charges are the
informed-routing tool for choosing which rooms to commit to.

### Trap Room

A dungeon room built around spike hazards and limited visibility. Trap rooms
should pressure movement rather than resolve through Card Battle: the player
crosses the room by reading safe gaps under fog, and a poor route can cost HP.
The moving-trap direction uses lane-drifting spikes and narrower safe corridors
so the opening layout cannot be memorized as a solved path.

### Elite

A hand-authored spike encounter placed before a decade's boss. Elite rooms are
their own room type — Scout Charge reveals them distinctly, so fighting one is
an informed opt-in for rewards clearly better than a normal encounter's. Each
elite carries a signature mechanic that teaches a specific counterplay lesson.
Each decade offers at most one Elite room; the offer is satisfied when the room
is generated and reachable, so routing around it does not re-offer one later in
that decade.

### Card Battle

The Slay-the-Spire-style combat phase entered when a dungeon encounter commits
the player to fight. Each player turn: statuses tick, energy resets, a hand
draws from the Draw Pile, and the next intent telegraphs — any block-kind
effect in it is raised immediately, before the player acts, so a "will block"
enemy already has to be fought through this same round, not the next one. The
player then plays any number of cards within energy and ends the turn, and the
enemy executes the REST of its telegraphed intent (damage/status/etc.) as one
fast beat. Rules resolve instantly; visuals replay as a causally ordered queue
and input is never locked.

### Reward Impact Preview

A player-facing label that explains what taking, upgrading, or removing a card
does to the deck's composition: the deck-size change and a rough opening-hand
likelihood. Under the full-collection deck every card fights, so the preview
speaks deck vocabulary, never hand membership.

### Combat Effect Handler Registry

The open resolution seam for combat effects. The Turn Engine dispatches each
effect to a string-keyed handler rather than a closed if/else, so a new effect
kind resolves by registering a handler — no edit to the dispatch body. Authored
content stays typed as the closed `CardEffect` union; the resolver operates on
the broader `ResolvableEffect` shape. An unregistered kind throws (fail-fast).

### Combat Event Bus

A deterministic, RNG-free subscriber surface for battle-lifecycle moments.
`damageDealt` and `statusApplied` fire live from the effect handlers; the
turn-lifecycle events (turn start, draws, reshuffles, telegraphs, block, battle
end) are mirrored by the Turn Engine; `battleWon` is emitted by the battle
drivers after victory. Subscribers fire in registration order and the dispatch
threads no RNG, so it never reorders the deterministic-run draws.
`vampiric_blade`'s post-victory heal is the first real subscriber.

### Energy

The per-turn resource budget in Card Battle's turn-based model. Each player turn
starts with a full budget (baseline 3); playing a card spends its cost, and
unspent energy is forfeit at end of turn and at battle end.

### Draw Pile

The face-down stack a battle hand is drawn from, built by shuffling the entire
card collection at battle start. Its count is always visible; its contents are
inspectable in sorted order only, never in true draw order.

### Discard Pile

Where played and end-of-turn cards go. When a draw is required and the Draw
Pile is empty, the Discard Pile shuffles back into it; if both piles are empty,
drawing simply stops.

### Exhaust

A card keyword: when played, an exhaust card leaves play for the rest of the
current battle, joining neither the Draw Pile nor the Discard Pile. It returns
with the full collection at the next battle start. Exhaust is battle-scoped,
never permanent deck removal.

### Status Effects

Timed or permanent modifiers a combatant carries during a Card Battle, resolved through the
Combat Effect Handler Registry. Two families: **damage-over-time** — `poison` and `burn` tick
their listed amount straight to HP (ignoring block) at the afflicted's turn start; and
**modifiers** — `vulnerable` (takes ×1.5 damage), `weak` (deals ×0.75 damage), `frail` (gains
×0.75 block), and `strength` (permanent additive damage per hit). All damage math runs through a
single resolver (`combat.ts` `modifiedDamage`) in a fixed order — `+strength`, `×weak`,
`×vulnerable`, then armor and block subtract — so the number a card deals, the block it depletes,
and the telegraph shown never disagree. Modifier debuffs count down at the end of the afflicted
side's action; `strength` never decays and is capped per battle.

### Strength and the Ritual

`strength` is the game's scaling axis. A player builds it with cards like Empower (it recurs
through the reshuffled collection, so it ramps over a long fight) up to a hard cap; certain
single-hit elites and bosses instead run a **ritual** — a telegraphed move that permanently raises
their own Strength, growing their whole kit every cycle. A ritual is a race-or-interrupt decision:
out-damage it, or void the ritual beat with a stun/smoke bomb — turtling only feeds it. Telegraphed
magnitudes fold the actor's Strength in, so a ritual-buffed hit always reads honestly.

### Enemy Intent

The enemy's telegraphed next action — type and raw magnitude, unadjusted for
the player's block or armor — shown before the player commits any card. Intents
come from authored per-enemy patterns; a voided intent (for example by stun)
updates the telegraph immediately so it never lies — except a block-kind
effect, which is raised at telegraph time (see Card Battle) and so is already
committed by the time a same-turn stun or smoke bomb could void it; voiding
only cancels the remaining (non-block) part of that intent. In an Enemy Pack,
each living member telegraphs and acts on its own independent Enemy Intent
cycle.

### Enemy Pack

A normal encounter's roster of foes: usually a single enemy, but sometimes 2-3
lower-HP minions instead (weighted low, gated off the first two depths; bosses
and Elites never pack). A pack is budget-anchored to the solo encounter it
replaces — its members split the tier's per-turn damage so the pack's total
output tracks a solo's, and it carries extra total HP to offset the focus-fire
advantage of picking members off one at a time. Victory requires the whole
pack dead. A solo fight is simply a one-member pack, so the Turn Engine,
balance harness, and reference-deck determinism all share one code path.

### Focus

The player's chosen target within an Enemy Pack, set by clicking an enemy (a gold
ring marks it, shown only when there's a genuine choice). Cards and items resolve
against the focused enemy; when it dies, focus slides to the next living member.
With a solo enemy there is nothing to choose, so the mechanic stays invisible.

### Turn Engine

The pure, headless module owning all combat rules in the turn-based model:
state in, new state plus an ordered presentation-event list out, RNG injected.
Scene code renders and forwards input but never makes rule decisions.

### Presentation Queue

The scheduling layer that replays the Turn Engine's ordered events as visuals
at presentation pace. It supports accelerate and skip, and never gates input —
rules are already resolved by the time it plays.

## Progression Loop

### Run

A single dungeon attempt with temporary state such as health, card collection
(the battle deck), inventory, Gold, room progress, suspended snapshot, and escape
outcome. A run is exactly 100 rooms long: every 10th room is a boss, and the
room-100 boss is the only victory terminus.

### Escape

The successful end state for a Run: defeat the room-100 boss. Escaping records a
win, awards the run's normal XP, and adds the escape XP bonus. Earlier boss kills
keep the run moving; they are milestones, not cash-out points.

### Normal Run

A non-daily attempt that routes through Scenario selection and uses the current
Campfire loadout.

### Scenario

A normal-run premise selected before the dungeon starts. Scenario choice replaces
the plain Descend handoff for normal runs: Escape the Dungeon is the clean/default
premise, while hard Scenarios add a run rule such as poisoned room entry, no
block, or budgeted doubled normal encounters. Daily Descents stay separate from
Scenarios. Every Scenario awards XP at run end.

### Daily Descent

A date-seeded challenge run tracked separately from normal progression. Daily
Descents ignore loadout choices so attempts stay comparable, but still award XP
when the run ends.

### Campfire

The between-run hub for viewing persistent progression, choosing loadout, and
starting a normal or daily run. If a suspended run exists, Campfire offers resume
and abandon actions before starting a new attempt.

### Gold

Run-local currency earned and spent during the current Run, mainly on rest-room
deck upgrades or removals. Gold never persists after a run and has no conversion
path into progression.

### XP

Lifetime progress awarded once when a run ends. XP comes from rooms reached,
bosses defeated, and an escape bonus. It is never spent; accumulated XP only
determines Level.

### Level

A derived value from lifetime XP. Level gates access to archetypes, starting
relic choices, and starter variety. It never grants direct combat stats.

### Discovery

Permanent knowledge that a relic exists for this profile. Relics can be
discovered from run pickups or contract rewards. A relic must be both discovered
and level-eligible before it can be selected as a starting relic.

### Loadout

The Campfire choices applied to the next normal run: optional Archetype, optional
starting Relic when the profile has an eligible slot, and level-gated starter
variety. Loadout changes access and starting shape, not base stats.

### Starter Variety

A Level unlock that broadens the opening card choices for normal runs.

### Archetype

A player class — Barbarian, Necromancer, or Ranger — selected on the Progression
screen after Level unlocks it. Selecting one reshapes the whole run's card
identity rather than adding a single card: the opening picks come from that
archetype's pick pool, and every card reward/chest draw is rolled from the
archetype's cards **plus** the shared neutral pool. With no archetype selected
the pool is neutral only. The fixed starting deck body (2 Strike, 2 Guard) stays
neutral across archetypes so the picks can be fully thematic without leaving a
deck defensively broken. Barbarian scales Strength and swings big; Necromancer
stacks poison/burn damage-over-time and life-drain sustain; Ranger marks prey
Vulnerable and sprays multi-hit volleys with card draw. Daily Descents ignore
Archetype selection so attempts stay comparable. Only one archetype is active for
future normal runs until the player changes it.

### Suspend

The browser-persisted snapshot of the current run. A suspended run stores the run
state, current room, RNG states, player position, facing, and primed next-room
options. Resume restores that snapshot; abandon clears it and records the run as
failed at its current room.

### Relic

A passive run modifier acquired during a dungeon run (chests, elite rewards,
boss drops, or level-gated loadout). Each relic id is unique per run — at most
one copy, up to six relics held. Relics persist for the whole run and explain
their effect in pickup panels, HUD hover tooltips, and the `[R]` inspector.
Relic drops come from the full pool; loadout selection additionally requires
Discovery and Level eligibility.
