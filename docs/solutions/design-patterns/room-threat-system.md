---
title: Room Threat System
date: 2026-06-28
category: design-patterns
module: dungeon-loop
problem_type: design_pattern
component: frontend_stimulus
severity: high
applies_when:
  - 'A top-down encounter room should stay spatial before handing off to card combat.'
  - 'Threat movement, contact readiness, and normal escape or boss commitment rules need deterministic coverage.'
  - 'A Phaser scene should render and react to pure gameplay rules rather than owning all threat decisions inline.'
symptoms:
  - 'Entering an encounter room immediately starts combat, so room movement has no encounter meaning.'
  - 'Normal encounter escape and mandatory boss commitment can drift when they are only encoded as scene-side effects.'
related_components:
  - testing_framework
  - documentation
tags:
  - escape
  - dungeon-loop
  - room-threat-system
  - contact-trigger
  - phaser
  - deterministic-rules
  - boss-commitment
---

# Room Threat System

## Context

Escape's dungeon loop used to treat encounter entry as immediate battle
commitment. `DungeonScene` rendered an enemy image, showed a red `!`, waited
briefly, and launched the existing `Battle` scene as soon as the player entered
an encounter or boss room. That made top-down movement in encounter rooms mostly
decorative.

The room threat work changed that boundary without replacing card combat. The
dungeon now owns pre-battle pressure: one visible monster, readable intent,
contact readiness, safe entry, and escape gating. The `Battle` scene still owns
combat resolution, rewards, and boss victory. Normal encounter rooms can be left
unfought, but leaving grants no enemy card or Gold. Boss encounters stay
mandatory, with no escape hatch before victory.

This is a design pattern for spatial pre-combat behavior in a Phaser dungeon:
make the room behavior deterministic and testable first, then let the scene
render that state and hand off to combat on contact.

## Guidance

Keep room threat rules in pure dungeon code. The reusable model lives in
`src/dungeon/roomThreat.ts`:

```ts
export type RoomThreatKind = 'normal' | 'boss';
export type RoomThreatIntent = 'ignore' | 'alert' | 'chase';
export type RoomThreatProfileId = 'ignore' | 'patrol' | 'alert_chase' | 'boss_pressure';
```

The pure layer owns profile tuning, safe placement, grace timing, intent
transitions, bounded movement, contact readiness, and escape permission:

```ts
const state = createRoomThreatState(this.gameRng, {
  kind,
  profileId: getEnemyThreatProfile(enemy.def),
  entryDoor: room.blockedDoor,
});

const result = updateRoomThreatState(threat.state, {
  player: { x: this.player.x - this.origin.x, y: this.player.y - this.origin.y },
  deltaMs: delta,
});

const escape = evaluateRoomThreatEscape(threat.state.kind, this.room.cleared);
```

Do not let stationary profiles consume unused random choices. This keeps daily
or seeded runs comparable when a profile does not need a patrol target:

```ts
const patrolTarget =
  profile.patrolSpeed > 0 ? choosePatrolTarget(rng, position, input.entryDoor) : position;
```

Attach behavior profiles to enemy data instead of hard-coding movement in the
scene. Normal enemies resolve to non-boss profiles, and bosses resolve to
`boss_pressure`:

```ts
export function getEnemyThreatProfile(def: EnemyDef): RoomThreatProfileId {
  return def.dungeonThreatProfile;
}
```

In the Phaser scene, own presentation and handoff only. `DungeonScene` keeps a
room threat actor with state, sprite, marker, and contact arc. The scene syncs
the actor from pure state and maps intent to visible markers:

```ts
private threatMarker(intent: RoomThreatIntent): { text: string; color: string; alpha: number } {
  switch (intent) {
    case 'ignore':
      return { text: 'o', color: '#b8b0c8', alpha: 0.78 };
    case 'alert':
      return { text: '?', color: '#f1c40f', alpha: 1 };
    case 'chase':
      return { text: '!', color: '#ff5544', alpha: 1 };
  }
}
```

Room entry should reveal and synchronize the threat, not launch battle. The
update loop advances the threat while normal dungeon control is active. Contact
produces visible feedback and calls the existing battle handoff once:

```ts
if (!result.contactReady) return false;
this.floatText(threat.sprite.x, threat.sprite.y - 58, '!', '#ff5544');
this.cameras.main.shake(120, 0.006);
playSfx(this, 'hit_player');
this.startBattle();
return true;
```

Keep reward and completion semantics explicit. `evaluateRoomThreatEscape`
allows unresolved normal threats to be left uncleared with no reward, but blocks
unresolved boss escape. Boss rooms also keep the existing no-open-door shape
before victory, so the rule is enforced both by room structure and by the escape
policy.

Document simulator assumptions when encounter rules change. The balance
simulator still models the fight-taken baseline:

```ts
export const BALANCE_ENCOUNTER_POLICY = 'fight-taken-baseline';
```

That prevents future tuning work from mistaking current win-rate output for an
optimal-skip simulation.

## Why This Matters

Room behavior hidden inside Phaser callbacks is hard to test and easy to let
drift. A pure room threat layer gives direct coverage for the rules that affect
fairness: safe entry, contact readiness, deterministic placement, intent
transitions, movement bounds, normal escape, and boss commitment.

Optional normal fights create a new failure mode. If escape is represented only
as a door transition, the run can accidentally grant rewards or clear state for
a fight the player skipped. Encoding escape outcomes explicitly keeps "left the
room" separate from "defeated the enemy."

Readability is part of the gameplay contract. A contact-triggered battle feels
arbitrary if the monster's intent, motion, and contact area are not legible on
the canvas. Intent markers and a visible contact ring make the player understand
why battle started.

Keeping Battle as the combat authority prevents a small spatial feature from
turning into a second combat system. The dungeon can create pressure and route
to combat; cards, enemy defeat, rewards, and boss victory stay in the existing
combat flow.

## When to Apply

- Use this pattern when a dungeon room needs visible, time-based, or spatial
  pressure before a separate resolution scene.
- Use it when entering, leaving, or clearing a room changes reward or boss
  completion semantics.
- Use it when seeded or daily runs must remain comparable even though monsters
  move before combat.
- Avoid widening it prematurely. This first version supports one active monster
  per room, one-way room advancement, no persistent unresolved-room history, and
  no optimal-skip balance model.

## Examples

Before this pattern, room entry committed the player to battle:

```ts
// Old shape: room entry was already battle commitment.
this.time.delayedCall(450, () => {
  mark.destroy();
  this.startBattle();
});
```

The room threat shape separates pre-battle state from combat handoff:

```ts
if ((room.event === 'encounter' || room.event === 'boss') && !room.cleared && built.threat) {
  this.syncThreatActor(built.threat, true);
  this.tryRevealScoutOptions();
}
```

Then the update loop checks contact through pure rules:

```ts
const result = updateRoomThreatState(threat.state, {
  player: { x: this.player.x - this.origin.x, y: this.player.y - this.origin.y },
  deltaMs: delta,
});
threat.state = result.state;
this.syncThreatActor(threat, result.graceActive);

if (result.contactReady) {
  this.startBattle();
}
```

Escape policy stays explicit and testable:

```ts
export function evaluateRoomThreatEscape(
  kind: RoomThreatKind,
  cleared: boolean,
): RoomThreatEscapeResult {
  if (kind === 'boss' && !cleared) {
    return { allowed: false, clearThreat: false, grantBattleReward: false };
  }
  if (kind === 'normal' && !cleared) {
    return { allowed: true, clearThreat: false, grantBattleReward: false };
  }
  return { allowed: true, clearThreat: false, grantBattleReward: false };
}
```

Cover the pure rules with focused tests before trusting the scene:

```ts
expect(evaluateRoomThreatEscape('normal', false)).toEqual({
  allowed: true,
  clearThreat: false,
  grantBattleReward: false,
});

expect(evaluateRoomThreatEscape('boss', false)).toEqual({
  allowed: false,
  clearThreat: false,
  grantBattleReward: false,
});
```

Browser smoke remains required for the visible loop. The verified smoke for this
feature checked that normal encounter entry does not auto-start battle, the
threat and contact ring render, contact starts Battle, normal skip gives no
reward, and boss rooms expose no doors or hatch before victory.

## Related

- `docs/solutions/ui-bugs/phaser-screen-layout-readability-regressions.md`:
  related prevention rule for browser-smoking Phaser canvas readability.
- `docs/plans/2026-06-28-001-feat-room-threat-system-plan.md`: source plan and
  product contract for this implementation.
- `docs/ideation/2026-06-28-contact-triggered-dungeon-monsters-ideation.html`:
  source ideation for contact-triggered monsters and room-threat framing.
- `CONCEPTS.md`: shared vocabulary entry for Room Threat System.
- `README.md`: player-facing encounter and boss rules.
