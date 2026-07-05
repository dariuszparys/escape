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

### Elite

A hand-authored spike encounter placed before a Stratum's boss. Elite rooms
are their own room type — Scout Charge reveals them distinctly, so fighting
one is an informed opt-in for rewards clearly better than a normal
encounter's. Each elite carries a signature mechanic that teaches a specific
counterplay lesson. Each Stratum offers exactly one Elite room; the offer is
satisfied when the room is generated and reachable — routing around it does
not re-offer one later in the Stratum.

### Card Battle

The Slay-the-Spire-style combat phase entered when a dungeon encounter commits
the player to fight. Each player turn: statuses tick, energy resets, a hand
draws from the Draw Pile, the player plays any number of cards within energy
and ends the turn, then the enemy executes its telegraphed intent as one fast
beat. Rules resolve instantly; visuals replay as a causally ordered queue and
input is never locked.

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
updates the telegraph immediately so it never lies. In an Enemy Pack, each
living member telegraphs and acts on its own independent Enemy Intent cycle.

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
(the battle deck), inventory, Gold, room progress, and escape outcome.

### Normal Run

A non-daily descent that can use Campfire preparation and the active Starter Kit
selection.

### Daily Descent

A date-seeded challenge run tracked separately from normal progression. Daily
Descents ignore Ember progression benefits so attempts stay comparable.

### Campfire

The between-run hub for viewing persistent progression, choosing one-run
preparation, and starting a normal or daily descent.

### Gold

Run-local currency earned and spent during the current Run. Unbanked Gold is
forfeited on death; Banking at a Gate converts the leftover Gold into Embers
(see Endless Descent).

### Ember

Persistent progression currency spent at the Campfire on options that shape
later normal runs. Earned from depth milestones, the escape bonus, and Gold
Banked at a Gate.

### Starter Variety

An Ember unlock that broadens the opening card choices for normal runs without
changing the number of cards picked.

### Starter Kit

A durable Ember unlock that can add one selected signature card to a normal run.
Only one Starter Kit can be active for the next normal descent, and Daily
Descents ignore Starter Kits.

### Archetype

A player class — Barbarian, Necromancer, or Ranger — selected for free on the
Progression screen. Selecting one reshapes the whole run's card identity rather
than adding a single card: the opening picks come from that archetype's pick
pool, and every card reward/chest draw is rolled from the archetype's cards
**plus** the shared neutral pool. With no archetype selected the pool is neutral
only — the standard cards and nothing else. Archetype cards carry an `archetype`
tag and never appear in a neutral (or enemy) draw, so the neutral game — and its
determinism golden — is unchanged. The fixed starting deck body (2 Strike, 2
Guard) stays neutral across archetypes so the picks can be fully thematic without
leaving a deck defensively broken. Barbarian scales Strength and swings big;
Necromancer stacks poison/burn damage-over-time and life-drain sustain; Ranger
marks prey Vulnerable and sprays multi-hit volleys with card draw. Daily Descents
ignore Archetype selection so attempts stay comparable. Only one archetype is
active for the next normal descent; the selection persists like Starter Kit
choice.

## Endless Descent

### Stratum

A fixed-length band of dungeon depth ending in a boss Gate; the base run is the
first stratum, and Delving continues into deeper, harder strata. Depth keeps
climbing across strata rather than resetting, and difficulty escalates with it.

### Gate

The decision point after clearing a Stratum's boss, where the player chooses to
Bank or Delve. Gates are the only points at which a Run can end in a win.

### Delve

Committing to descend into the next Stratum instead of Banking. Irreversible
until the next Gate, and death anywhere in the Stratum forfeits all unbanked
Gold — the risk half of the push-your-luck choice.

### Bank

Ending a Run a winner at a Gate by converting unbanked Gold into Embers and
escaping. The safe terminus opposite death; in a Daily Descent, Banking still
ends the run but mints no Embers from Gold.

### Relic

A passive run modifier acquired during a dungeon run (chests, elite rewards,
boss drops, meta starting picks, or Campfire prep). Each relic id is unique per
run — at most one copy, up to six relics held. Relics persist for the whole run
and explain their effect in pickup panels, HUD hover tooltips, and the `[R]`
inspector. Meta progression unlocks additional relic types into the drop pool
and can equip one eligible relic before a normal run starts.
