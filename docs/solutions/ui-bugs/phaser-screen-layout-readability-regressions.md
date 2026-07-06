---
title: Phaser Screen Layout Readability Regressions
date: 2026-06-28
last_refreshed: 2026-07-06
category: ui-bugs
module: escape-ui-layout
problem_type: ui_bug
component: frontend_stimulus
symptoms:
  - 'Campfire progression copy overlapped the NEXT RUN section after progression copy grew.'
  - 'Title screen instructions collided with the start prompt.'
  - 'Progression loadout copy overlapped later headings and needed overflow handling.'
root_cause: logic_error
resolution_type: code_fix
severity: medium
related_components:
  - testing_framework
tags:
  - phaser
  - ui-layout
  - readability
  - scroll-panel
  - progression-screen
  - campfire
  - title-screen
---

# Phaser Screen Layout Readability Regressions

## Problem

The retired Gold/Embers economy and starter-kit unlocks originally made
Escape's Campfire, Title, and Progression screens carry longer player-facing
copy. The current XP/Level/Discovery/Loadout model has different vocabulary, but
the same layout pressure remains whenever progression copy grows. Those Phaser
scenes still used fixed Y coordinates sized for shorter text, so wrapped text
occupied space that later sections assumed was empty.

The feature logic was correct. The bug was that canvas scene layout behaved like
absolute positioning, not document flow.

## Symptoms

- On Campfire, the detailed progression summary collided with the `NEXT RUN`
  heading.
- On Title, the instruction block pushed into `[ PRESS SPACE OR CLICK TO ENTER ]`.
- On Progression, wrapped starter-variety/loadout text collided with later
  headings.
- The Progression panel had more content than the available viewport, but no
  scroll model.
- Browser smoke showed only the existing `favicon.ico` 404; the relevant failure
  was visual overlap on the canvas.

## What Didn't Work

Keeping the longer feature copy inside the old fixed scene layout did not work.
Phaser text wrapping made each text object readable in isolation, but it did not
push later text objects down.

One-off Y-coordinate nudges would have been fragile because each new loadout
option, summary line, or translated text block could recreate the same class of
bug.
The first compact Campfire fix solved that screen, but the same fixed-coordinate
pattern remained visible on Title and Progression.

Native browser scrollbars were not the right abstraction for the Progression
scene. The screen is rendered on a Phaser canvas, so the durable fix was a
Phaser-native scroll panel built from layout metrics, a geometry mask, a content
container, wheel/key/drag input, and a drawn scrollbar thumb.

## Solution

Campfire now renders a bounded status summary instead of the full progression
explainer. `src/game/campfireSummary.ts` keeps the overview compact and current
with the XP/Level/Discovery/Loadout model:

```ts
return [
  `Archetype: ${activeArchetypeName(progression)}`,
  `Starter variety: ${hasStarterCardVariety(profile) ? 'unlocked' : 'level 4'}`,
  `Discovered relics: ${profile.discoveredRelicIds.length}`,
  `Starting relic choices: ${eligibleRelics.length}`,
  progression.activeStartingRelicId
    ? `Starting relic: ${relicDef(progression.activeStartingRelicId).name}`
    : 'Starting relic: none',
  `Personal best: room ${profile.personalBestRoom}`,
].join('\n');
```

`src/scenes/Campfire.ts` uses that compact formatter for the hub overview while
the richer archetype, starter-variety, and relic copy stays on the dedicated
Progression screen.

Title moved its geometry into `src/game/titleLayout.ts` and replaced the long
centered instruction block with three grouped columns. The layout helper exposes
the clearance that matters:

```ts
instructionsBottom: sectionTextY + sectionTextHeight,
promptTop: promptY - PROMPT_FONT_SIZE / 2,
```

Progression moved panel geometry into `src/game/progressionLayout.ts`. The
helper calculates viewport bounds, content height, maximum scroll offset, and
scrollbar track geometry:

```ts
const contentHeight = clearRelicButtonY + 32;

return {
  viewportH: VIEWPORT_H,
  contentHeight,
  maxScrollOffset: Math.max(0, contentHeight - VIEWPORT_H),
  scrollbarTrackH: PANEL_H - 28,
};
```

`src/scenes/Progression.ts` renders the content inside a masked container:

```ts
maskShape.fillRect(layout.viewportX, layout.viewportY, layout.viewportW, layout.viewportH);

const content = this.add.container(layout.viewportX, layout.viewportY - this.scrollOffset);
content.setMask(maskShape.createGeometryMask());
```

Scroll updates move the content container and redraw the scrollbar rather than
rebuilding the scene:

```ts
const next = clampScrollOffset(this.scrollOffset + delta, this.layout.maxScrollOffset);
this.scrollOffset = next;
this.scrollContent.y = this.layout.viewportY - this.scrollOffset;
this.redrawScrollbar();
```

The scene handles mouse wheel, ArrowUp, ArrowDown, PageUp, PageDown, and
scrollbar dragging. The scrollbar is drawn with Phaser graphics from the tested
layout metrics.

## Why This Works

The fix separates layout calculation from Phaser rendering. Pure helpers define
stable screen geometry, and scenes consume those metrics. That gives tests
concrete values to assert: section clearance, scrollable overflow, scroll offset
clamping, and scrollbar thumb placement.

Campfire works because the hub gets bounded copy. Title works because its
instructions have predictable line counts and a tested prompt gap. Progression
works because overflow is treated as viewport state instead of more fixed-position
text.

Session history showed this was not a one-off problem. Earlier Campfire work had
already needed browser smoke because art, controls, and live meta refresh could
look correct in pure tests while still failing visually on the Phaser canvas.

## Prevention

- Put geometry for Phaser screens with dynamic or wrapped copy in pure layout
  helpers before rendering.
- Add tests for the relationships that can regress, not just for individual
  strings.
- Treat scrollable canvas panels as explicit UI components: viewport, content
  height, mask, scroll offset, input handling, and scrollbar drawing.
- Keep hub summaries bounded. Put detailed explanatory copy on the dedicated
  screen that has room or scrolling.
- Browser smoke test actual Phaser screens when changing visible copy, masks,
  controls, or progression-dependent UI.

Useful regression assertions from this fix:

```ts
expect(layout.promptTop - layout.instructionsBottom).toBeGreaterThanOrEqual(24);
expect(layout.relicHeadingY - layout.starterSummaryBottom).toBeGreaterThanOrEqual(40);
expect(layout.maxScrollOffset).toBeGreaterThan(0);
```

Scroll behavior also needs direct coverage:

```ts
expect(clampScrollOffset(-12, 80)).toBe(0);
expect(clampScrollOffset(120, 80)).toBe(80);
expect(thumb.y + thumb.height).toBe(layout.scrollbarTrackY + layout.scrollbarTrackH);
```

For compact hub summaries, assert that verbose progression copy does not leak
back in:

```ts
expect(summary).not.toMatch(/Migration bonus|four opening card options/);
```

Current tests use the active wording guard from `src/game/campfireSummary.test.ts`:

```ts
expect(summary).not.toMatch(/Migration bonus|purchase/i);
```

Final verification for the merged fix included `npm test`, `npm run build`,
`npm run lint`, `npm run format:check`, `git diff --check`, and browser smoke
over Title, Progression top, wheel scroll, PageDown scroll, and Campfire.

## Related Issues

- `docs/plans/2026-06-27-001-feat-gold-embers-economy-plan.md` introduced the
  retired Gold/Embers economy and the initial Progression screen.
- `docs/plans/2026-06-27-002-feat-starter-kit-ember-unlocks-plan.md` added the
  retired starter-kit progression surface whose copy exposed the layout problem.
- [Hundred-Room Escape Vocabulary Sweep](../documentation-gaps/hundred-room-escape-vocabulary-sweep.md)
  tracks the current XP/Level/Discovery/Loadout terminology that replaced that
  older copy.
- Earlier campfire planning is historical context for the Campfire hub and its
  manual smoke expectations.
- `src/profile.ts`, `src/meta.ts`, `src/game/progression.ts`,
  `src/game/campfirePrep.ts`, and `src/state.ts` own the current profile,
  loadout, and run-prep state.

No GitHub issue number was part of this capture.
