---
title: Model Moving Trap Rooms as Deterministic Pressure
date: 2026-07-06
category: design-patterns
module: dungeon/trap-rooms
problem_type: design_pattern
component: service_object
severity: medium
applies_when:
  - Designing dungeon trap rooms that should pressure movement under limited visibility
  - Adding moving hazards that must remain deterministic from room generation and save snapshots
  - Verifying trap fairness across generated layouts while preserving real hit risk
symptoms:
  - Players can memorize the opening spike layout before fog hides the room
  - Static safe paths stay solved after the first glance
  - Spike descriptors need to survive snapshot serialization and hydration
related_components:
  - frontend_stimulus
  - testing_framework
tags:
  - trap-rooms
  - moving-hazards
  - deterministic-generation
  - snapshot-hydration
  - phaser-rendering
  - gameplay-pressure
---

# Model Moving Trap Rooms as Deterministic Pressure

## Context

Trap rooms stopped working as pressure when the danger was static and revealed up front. If the player briefly sees the whole spike layout before fog applies, the room becomes a memory puzzle: memorize the safe path, walk it once, and traps stop mattering. The reported symptom was gameplay feel, not a crash: no trap ever hit the player.

Session history shows the previous trap-room model already had spike damage and limited visibility, but no moving-lane, lane-drift, fairness, or safe-route system. It also shows a recurring repo preference: keep dungeon rules in pure modules with deterministic tests, and let Phaser scenes own rendering, input, and object lifecycle. (session history)

The durable fix is to model trap rooms as deterministic descriptors plus time-based rendering. The room generator decides the hazard contract in pure TypeScript, while `Dungeon.ts` renders moving actors and checks collisions against the current hit rectangle.

## Guidance

Keep trap-room generation serializable. `RoomData.spikes` stores `SpikeTrap[]`, where each spike has a base cell and may also carry a `motion` descriptor. `rooms.ts` delegates trap-room construction to `createTrapDescriptors(rng, entry)`, so room generation remains deterministic from the run seed and entry direction.

```ts
return {
  depth,
  event,
  openDoors: DIRS.filter((d) => d !== entry),
  blockedDoor: entry,
  spikes: event === 'trap' ? createTrapDescriptors(rng, entry) : [],
  cleared: false,
};
```

Put fairness and motion math in `src/dungeon/traps.ts`, not in the scene. The important helpers are:

- `createTrapDescriptors(rng, entry)` for deterministic trap layout generation.
- `trapFairCells(entry)` for door-entry and spawn breathing-room cells that traps may not start on or sweep through.
- `trapSweptCells(trap)` for every grid cell a moving lane trap can occupy.
- `hasSafeTrapRoute(traps, entry)` for route checks that treat swept cells as blocked.
- `trapCenterAt(trap, elapsedMs)` and `trapContactRectAt(trap, elapsedMs)` for runtime position and collision geometry.
- `normalizeSpikeTrap(value)` for snapshot hydration.

Represent moving hazards as data, not scene-only runtime state:

```ts
export interface TrapLaneMotion {
  kind: 'lane';
  axis: 'x' | 'y';
  from: TrapCell;
  to: TrapCell;
  periodMs: number;
  phaseMs: number;
}

export interface SpikeTrap extends TrapCell {
  motion?: TrapLaneMotion;
}
```

The scene should own Phaser objects and current-frame synchronization only. `Dungeon.ts` stores each actor with its descriptor, sprite, hit rectangle, and start time; `syncTrapActors(time)` recomputes the current center and contact rectangle every frame through the pure helpers.

```ts
private syncTrapActors(time: number): void {
  for (const trap of this.built.traps) {
    const elapsedMs = Math.max(0, time - trap.startedAtMs);
    const center = trapCenterAt(trap.descriptor, elapsedMs);
    const rect = trapContactRectFromCenter(center);
    trap.sprite.setPosition(this.origin.x + center.x, this.origin.y + center.y);
    trap.rect.setTo(this.origin.x + rect.x, this.origin.y + rect.y, rect.width, rect.height);
  }
}
```

Collision should use the current contact rectangle, not the descriptor cell. The scene detects contact in rendered coordinates, then calls `applyTrapDamage(run)` for the run-state mutation.

Hydrate snapshots through the same descriptor validator. `normalizeRunSnapshot()` calls `normalizeSpikeTrap()` for every saved spike, preserving moving traps across save/load while still accepting legacy static descriptors such as `{ col, row }` and rejecting malformed moving descriptors.

## Why This Matters

Fog cannot rescue a trap room if the initial full-layout reveal already leaked the answer. Moving traps add a second pressure source: the player must time movement, not just remember a route.

The deterministic-descriptor pattern avoids the usual downside of moving hazards. If Phaser owns the motion rules directly, seeded rooms, tests, save/load, and browser behavior can drift. By making movement serializable data and evaluating it through pure helpers, the same trap can be generated, tested, hydrated, rendered, and collided consistently.

Fairness checks make stronger pressure acceptable. `trapSweptCells()` treats the whole movement lane as blocked for route analysis, and `hasSafeTrapRoute()` requires at least one safe route from the entry to a non-entry door. Door-entry cells and the spawn breathing-room cell stay trap-free, so layouts can narrow corridors and pressure the center lane without creating unavoidable entry damage.

Session history also showed adjacent snapshot work where exact room-entry semantics mattered. The carryover here is that dynamic room state should hydrate as game state, not as reconstructed Phaser scene state. (session history)

## When to Apply

- Use this pattern when a dungeon-room feature has durable rules and animated presentation.
- Use it when the feature must remain deterministic from the run seed and path.
- Use it when the room state must survive snapshot serialization and hydration.
- Use it when stronger pressure needs fairness guarantees, such as safe entry and at least one route to an exit.
- Avoid scene-only implementations for hazards that can damage the player, block a route, alter completion, or affect seeded replay behavior.

## Examples

A good trap-room generation contract checks pressure and fairness together:

```ts
const traps = createTrapDescriptors(rng, entry);

expect(traps.filter(isLaneDriftTrap).length).toBeGreaterThan(traps.length / 2);
expect(hasSafeTrapRoute(traps, entry)).toBe(true);
```

Fairness tests should check swept cells, not only starting cells:

```ts
for (const trap of traps) {
  for (const swept of trapSweptCells(trap)) {
    expect(fair).not.toContain(`${swept.col},${swept.row}`);
  }
}
```

Seeded sweeps prevent the route guarantee from being a one-seed coincidence:

```ts
for (const entry of DIRS) {
  for (let seed = 1; seed <= 40; seed += 1) {
    const traps = createTrapDescriptors(new LcgRng(seed * 97), entry);

    expect(traps.filter(isLaneDriftTrap).length).toBeGreaterThan(traps.length / 2);
    expect(hasSafeTrapRoute(traps, entry)).toBe(true);
  }
}
```

Snapshot tests should cover forward compatibility and backward compatibility:

```ts
expect(hydrated.room.spikes).toEqual(trapRoom.spikes);
expect(hydrated.room.spikes.filter(isLaneDriftTrap).length).toBeGreaterThan(
  hydrated.room.spikes.length / 2,
);

expect(hydratedLegacy?.room.spikes).toEqual([
  { col: 4, row: 4 },
  { col: 9, row: 6 },
]);
```

Verification should combine several layers:

- Pure trap tests for deterministic generation, lane motion, contact rectangles, and static-compatible descriptors.
- Room-generation tests for fair cells, swept-cell bounds, center-lane pressure, and safe-route guarantees across entry directions.
- Snapshot tests for moving trap preservation, legacy static hydration, and malformed descriptor rejection.
- Browser smoke for the visible result: generate a trap room, confirm fog is enabled, entry is safe, traps move, and contact with a moving trap reduces HP.

For the moving-trap implementation, validation covered `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `git diff --check`, and `npm run build`; browser smoke confirmed a generated trap room had moving traps, fog enabled, safe entry, visible trap movement, and HP loss on contact.

## Related

- `docs/solutions/design-patterns/room-threat-system.md` captures the same pure-rules plus Phaser-projection pattern for encounter-room spatial pressure.
- `docs/solutions/ui-bugs/phaser-screen-layout-readability-regressions.md` captures why Phaser-visible behavior needs browser smoke beyond pure tests.
- `src/dungeon/traps.ts` owns trap descriptors, fairness checks, lane motion, contact geometry, and descriptor normalization.
- `src/dungeon/rooms.ts` consumes trap descriptors when building trap rooms.
- `src/game/runSnapshot.ts` preserves and validates trap descriptors during save/load hydration.
- `src/scenes/Dungeon.ts` owns Phaser sprites, per-frame actor synchronization, and current-rectangle collision checks.
