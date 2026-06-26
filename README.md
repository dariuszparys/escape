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

- Each run is a fresh dungeon of **10 rooms**. Room 1 offers a choice of
  **one of two starting cards**; its three exits lead deeper.
- Every later room has four doors — the one you came through is barred.
  Rooms are randomized: **encounters, treasure chests, health potions,
  spike traps**, or nothing.
- Entering an encounter room starts the fight immediately. Combat is
  simultaneous rounds: you play a card (or drink a potion), the enemy
  plays one. Attacks are reduced by the opponent's block and your
  collected armor. Cards refresh once a whole hand has been used.
- The enemy always holds **one card more than you** (capped at 6).
  Win a fight and you may steal one enemy card — hand limit is **5**.
- Room 10 holds one of three bosses (Minotaur, Lich, Demon King), each
  with six cards **plus** a special weapon attack telegraphed every
  third round. Kill it, step into the hatch, and escape.

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
