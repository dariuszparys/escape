# Concepts

Shared domain vocabulary for Escape. Keep entries focused on player-facing
concepts and durable implementation boundaries.

## Dungeon Loop

### Room Threat System

A dungeon-room behavior layer that manages visible pre-battle threats. In the
first version it owns one active monster's room intent, movement, contact
trigger, and cleanup before handing off to Card Battle. Normal encounter
threats can be escaped without fight rewards; boss threats remain mandatory.

### Card Battle

The turn-based combat phase that resolves enemy fights through simultaneous
card choices after a dungeon encounter commits the player to fight.

### Card Battle Planning Board

A Card Battle readability layer that surfaces battle-side enemy intent, speed
order, and status consequences before the player chooses a card. It belongs
after combat starts; Room Threat System remains the dungeon-side pre-battle
intent layer.

### Reward Impact Preview

A player-facing label that explains whether taking, upgrading, or removing a
card changes the next combat hand. It describes outcomes such as entering hand,
replacing a role, improving an in-hand card, or staying collection-only without
showing raw hand-selection scores.

### Combat Effect Handler Registry

The open resolution seam for combat effects. `resolveRound` dispatches each
effect to a string-keyed handler rather than a closed if/else, so a new effect
kind resolves by registering a handler — no edit to the dispatch body. Authored
content stays typed as the closed `CardEffect` union; the resolver operates on
the broader `ResolvableEffect` shape. An unregistered kind throws (fail-fast).

### Combat Event Bus

A deterministic, RNG-free subscriber surface for battle-lifecycle moments. It
carries exactly four events: `roundStart`, `damageDealt`, and `statusApplied`
(emitted from inside `resolveRound`) and `battleWon` (emitted by the battle
drivers). Subscribers fire in registration order and the dispatch threads no
RNG, so it never reorders the deterministic-run draws. `vampiric_blade`'s
post-victory heal is the first real subscriber, shared by both drivers.

### Family Matchup

A Card Battle read-payoff layer where the player's committed action family can
counter the enemy's true intent family. It is player-only: the enemy applies
pressure through scripts and card strength, while the player's reward for a
correct read is a bounded combat bonus surfaced by the Card Battle Planning
Board.

## Progression Loop

### Run

A single dungeon attempt with temporary state such as health, hand, inventory,
Gold, room progress, and escape outcome.

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
