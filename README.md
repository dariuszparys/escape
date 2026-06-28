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

- Each run is a fresh dungeon of **10 rooms**. The fire offers **two opening
  card picks** from a small starter set. Ember progression can unlock a fourth
  opening option and optional starter kits that add one signature card to normal
  runs without adding raw stat boosts.
- Every later room has four doors — the one you came through is barred.
  Rooms are randomized: **encounters, treasure chests, health potions,
  paid rest rooms, or spike traps**.
- Encounter rooms place one visible monster in the room. Touching the monster
  starts simultaneous card combat: you play a card (or drink a potion), the
  enemy plays one. Attacks are reduced by the opponent's block and your
  collected armor. Cards refresh once a whole hand has been used.
- Normal encounters can be escaped through an open door before fighting, but
  skipped fights give no enemy-card or Gold reward. Win a fight and you may
  steal one enemy card — hand limit is **5**.
- **Gold** is earned and spent inside the current run, including paid rest-room
  deck upgrades or removals. **Embers** persist after the run and unlock
  long-term campfire progression.
- Room 10 holds one of three bosses. Boss fights are mandatory: no escape hatch
  opens until the boss is defeated.

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
