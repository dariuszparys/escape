# Repository Guidelines

## Project Structure & Module Organization

This is a Phaser 3 + TypeScript + Vite browser game. Runtime code lives in `src/`.
Use `src/main.ts` for Phaser bootstrapping, `src/scenes/` for game scenes, `src/state.ts`
for run state, `src/data/` for cards and enemies, `src/dungeon/` for room generation,
and `src/gfx/` for generated pixel-art rendering helpers. `index.html` hosts the game
container. `dist/` is build output and should not be edited by hand.

## Build, Test, and Development Commands

- `npm install`: install dependencies from `package-lock.json`.
- `npm run dev`: start the Vite development server, usually at `http://localhost:5173`.
- `npm run build`: run `tsc --noEmit` and produce the static bundle in `dist/`.
- `npm run preview`: serve the production build locally for a final smoke test.

Run commands from the repository root.

## Coding Style & Naming Conventions

Write strict TypeScript ES modules. The project enforces `strict`, unused symbol checks,
isolated modules, and consistent filename casing through `tsconfig.json`. Use 2-space
indentation, single quotes, and semicolons to match the existing code. Keep constants in
`UPPER_SNAKE_CASE`, regular values and functions in `camelCase`, types/classes in
`PascalCase`, and scene files/classes in `PascalCase` such as `Battle.ts` and
`BattleScene`.

Prefer small modules organized by responsibility. Add new card/enemy data to `src/data/`,
new dungeon rules to `src/dungeon/`, and reusable drawing logic to `src/gfx/`.

## Testing Guidelines

There is no dedicated automated test runner yet. Treat `npm run build` as the required
baseline validation before submitting changes. For gameplay changes, also run
`npm run dev` and manually smoke test the affected loop, such as dungeon movement,
encounters, card selection, treasure, potions, traps, or boss completion. If tests are
introduced later, add a matching `npm test` script and document the naming pattern here.

## Commit & Pull Request Guidelines

The current history uses short, imperative commit subjects, for example
`Add MIT license` and `Initial commit: Escape - card-battle dungeon crawler`. Keep commits
focused and use a body when a change affects gameplay rules or architecture.

Pull requests should include a concise summary, validation performed, and screenshots or
short recordings for visible gameplay/UI changes. Link any related issue and call out
changes to player-facing controls, balance, or generated assets.
