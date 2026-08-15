# Escape — the card dungeon

A roguelite mashup: 2D top-down dungeon crawler (Zelda-style rooms and
walking) where every fight is a card battle.

**[Play it in the browser](https://dariuszparys.github.io/escape/)**

## Run it

```sh
npm install
npm run dev      # http://localhost:5173
```

`npm run build` type-checks and produces a static bundle in `dist/`.

## Deploy

Every push to `main` builds and publishes `dist/` to GitHub Pages via
`.github/workflows/deploy.yml` (also runnable manually from the Actions tab).
Vite's `base` is `./`, so the bundle works both at a domain root and under the
`/escape/` project subpath.

## How it plays

- Each normal run starts by choosing a **path** at the fire (Barbarian, Ranger,
  Necromancer, or Wanderer) and a **Scenario**. Escape the Dungeon is the
  clean attempt; I'm Poisoned, I Lost My Left Arm, and Enemies Are Doubled are
  harder runs with explicit rules. Every finished run pays lifetime **XP**.
  Level unlocks starter variety and eligible starting relics; it never raises
  stats directly. The first chapter goal is the **First Gate** at room 10;
  escape is still the room-100 boss.
- Every later room has four doors — the one you came through is barred. The
  first few rooms label those doors with what waits behind them (a short Scout
  Charge allotment); after that, routing is blind. Rooms are randomized:
  **encounters, elites, treasure chests, health potions, paid rest rooms, or
  spike traps**. Each 10-room decade can offer one elite: a hand-authored spike
  fight with a signature mechanic, worth clearly better than a normal
  encounter. Fighting an elite is an informed opt-in while you still have
  Scout Charges. Trap rooms use fog, lane-drifting spikes, and narrow safe
  gaps instead of card combat.
- Encounter rooms place one or more visible monsters in the room — most
  fights are solo, but some spawn a budget-anchored pack of 2-3 weaker foes.
  In the Enemies Are Doubled Scenario, normal encounter rooms instead spawn a
  budgeted pair of normal enemies; elites and bosses stay single authored fights.
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
  deck upgrades or removals. Gold dies with the run; lifetime XP and discovery
  flags are the persistent layer.
- The run is a fixed **100-room escape**. Every 10th room holds a mandatory boss,
  and the room-100 boss is the final wall. Defeat it to escape; die or abandon
  before then and the run ends, still awarding XP for the room reached and bosses
  cleared.

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
