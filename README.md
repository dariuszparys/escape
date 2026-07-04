# Escape — the card dungeon

A roguelite mashup: 2D top-down dungeon crawler (Zelda-style rooms and
walking) where every fight is a card battle.

## Run it

```sh
npm install
npm run dev      # http://localhost:5173
```

`npm run build` type-checks and produces a static bundle in `dist/`.

## How it plays

- Each run descends through **strata** of 10 rooms apiece. On the Progression
  screen you can freely pick an **archetype** — Barbarian, Necromancer, or
  Ranger — that reshapes the whole run's card pool instead of adding a single
  card; skip it and the run draws from the neutral pool only. The fire offers
  **two opening card picks** (Ember progression can unlock a fourth) plus any
  active starter kit.
- Every later room has four doors — the one you came through is barred.
  Rooms are randomized: **encounters, elites, treasure chests, health
  potions, paid rest rooms, or spike traps**. Each stratum guarantees exactly
  one elite: a hand-authored spike fight with a signature mechanic, worth
  clearly better rewards than a normal encounter. Scout Charges let you peek
  at adjacent room types before committing.
- Encounter rooms place one or more visible monsters in the room — most
  fights are solo, but some spawn a budget-anchored pack of 2-3 weaker foes.
  Entering an uncleared room starts the card battle immediately — entry is
  commitment, so you avoid a fight by not entering the room, not by slipping
  past the monster(s). You play a card (or drink a potion), the enemies each
  act on their own telegraphed cycle. Click an enemy in a pack to focus your
  cards and items on it. The battle screen previews each enemy's intent,
  speed order, and active status effects (poison, burn, vulnerable, weak,
  frail, strength) before you commit. Attacks are reduced by the opponent's
  block and your collected armor. Cards refresh once a whole hand has been
  used.
- Win a fight and you may steal one enemy card — hand limit is **5**. Card
  rewards, chest cards, and rest-room upgrades or removals preview whether the
  next combat hand changes.
- **Gold** is earned and spent inside the current run, including paid rest-room
  deck upgrades or removals. **Embers** persist after the run and unlock
  long-term Campfire progression (Ember unlocks, starter kits, archetypes).
- The 10th room of each stratum holds a boss fight. Boss fights are
  mandatory: no escape hatch opens until the boss is defeated (elites, by
  contrast, are an informed opt-in — you can route around one via a Scout
  Charge reveal). Clearing a boss opens a **Gate**: bank your unbanked Gold
  as Embers and end the run a winner, or delve into the next, harder stratum
  and keep pushing your luck — dying anywhere in a stratum forfeits that
  stratum's unbanked Gold.

## Controls

| Input            | Action                        |
| ---------------- | ----------------------------- |
| WASD / arrows    | move                          |
| walk into things | pick up / open / choose       |
| P                | drink a potion in the dungeon |
| mouse            | play cards in battle          |

## Tech

Phaser 3 + TypeScript + Vite. All art is generated at boot from pixel
string-maps in `src/gfx/sprites.ts` — no external assets.
