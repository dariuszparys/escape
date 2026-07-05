# Repository Guidelines

## Project Structure & Module Organization

This is a Phaser 3 + TypeScript + Vite browser game. Runtime code lives in `src/`.
Use `src/main.ts` for Phaser bootstrapping, `src/scenes/` for game scenes (`TurnBattle.ts`
is the card-battle scene, `Dungeon.ts` the room crawl, `Progression.ts` the Campfire/archetype
hub), `src/state.ts` for run state, `src/data/` for cards, enemies, archetypes, relics, and
starter kits, `src/dungeon/` for room generation, `src/audio/` for procedural music/SFX, and
`src/gfx/` for generated pixel-art rendering helpers. `src/game/` holds the headless rules
engine — `turnEngine.ts` (combat rules over an `enemies[]` pack, RNG injected), `combatEvents.ts`
(the deterministic event bus), `effectHandlers.ts` (the combat-effect handler registry),
`balanceSimulator.ts` (the automated win-rate harness), `delve.ts`/`strata.ts` (Endless Descent
bank/delve rules), and `progression.ts`/`campfirePrep.ts` (Ember spend and run prep) among other
pure rule modules — scene code renders and forwards input but never decides rules. `index.html`
hosts the game container. `dist/` is build output and should not be edited by hand.

## Build, Test, and Development Commands

- `npm install`: install dependencies from `package-lock.json`.
- `npm run dev`: start the Vite development server, usually at `http://localhost:5173`.
- `npm run build`: run `tsc --noEmit` and produce the static bundle in `dist/`.
- `npm run typecheck`: fast type-only gate (`tsc --noEmit`) without building the bundle.
- `npm run preview`: serve the production build locally for a final smoke test.

Run commands from the repository root.

## Coding Style & Naming Conventions

Write strict TypeScript ES modules. The project enforces `strict`, unused symbol checks,
isolated modules, and consistent filename casing through `tsconfig.json`. Use 2-space
indentation, single quotes, and semicolons to match the existing code. Keep constants in
`UPPER_SNAKE_CASE`, regular values and functions in `camelCase`, types/classes in
`PascalCase`, and scene files/classes in `PascalCase` such as `Battle.ts` and
`BattleScene`.

Prefer small modules organized by responsibility. Add new card/enemy/archetype data to
`src/data/`, new dungeon rules to `src/dungeon/`, new combat/progression rules to `src/game/`,
and reusable drawing logic to `src/gfx/`. New combat effects register a handler in
`src/game/effectHandlers.ts` rather than adding a branch to the Turn Engine's dispatch.

## Testing Guidelines

Automated tests use Vitest through `npm test`. Treat `npm run build` as the required
baseline validation before submitting changes. For gameplay changes, also run
`npm run dev` and manually smoke test the affected loop, such as dungeon movement,
encounters, card selection, treasure, potions, traps, or boss completion.

Changes that touch combat numbers, enemy packs, statuses, or the Endless Descent
economy are validated against `src/game/balanceSimulator.ts`, an automated policy-driven
win-rate harness — re-run its tests and check the reported win rate still sits in the
tuned band rather than eyeballing individual numbers.

Use `docs/solutions/` for repo-local writeups of solved problems and reusable fixes;
entries are organized by category with YAML frontmatter such as `module`, `tags`,
and `problem_type`, and are relevant when implementing or debugging in documented
areas. Shared player-facing vocabulary lives in `CONCEPTS.md`.

## Commit & Pull Request Guidelines

The current history uses short, imperative commit subjects, for example
`Add MIT license` and `Initial commit: Escape - card-battle dungeon crawler`. Keep commits
focused and use a body when a change affects gameplay rules or architecture.

Pull requests should include a concise summary, validation performed, and screenshots or
short recordings for visible gameplay/UI changes. Link any related issue and call out
changes to player-facing controls, balance, or generated assets.
