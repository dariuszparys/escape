# Concepts

Shared domain vocabulary for Escape. Keep entries focused on player-facing
concepts and durable implementation boundaries.

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

Run-local currency earned and spent during the current Run. Gold does not carry
long-term progression by itself.

### Ember

Persistent progression currency awarded from completed runs and spent at the
Campfire on options that shape later normal runs.

### Starter Variety

An Ember unlock that broadens the opening card choices for normal runs without
changing the number of cards picked.

### Starter Kit

A durable Ember unlock that can add one selected signature card to a normal run.
Only one Starter Kit can be active for the next normal descent, and Daily
Descents ignore Starter Kits.
