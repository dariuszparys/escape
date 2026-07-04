export interface ProgressionPanelLayout {
  panelX: number;
  panelY: number;
  panelW: number;
  panelH: number;
  viewportX: number;
  viewportY: number;
  viewportW: number;
  viewportH: number;
  contentW: number;
  archetypeHeadingY: number;
  archetypeSummaryY: number;
  archetypeRowsStartY: number;
  archetypeRowH: number;
  clearArchetypeButtonY: number;
  archetypeDividerY: number;
  starterHeadingY: number;
  starterSummaryY: number;
  starterSummaryBottom: number;
  unlockButtonX: number;
  unlockButtonY: number;
  dividerY: number;
  starterKitHeadingY: number;
  kitRowsStartY: number;
  kitRowH: number;
  kitTextW: number;
  kitButtonX: number;
  clearKitButtonY: number;
  contentHeight: number;
  maxScrollOffset: number;
  scrollbarTrackX: number;
  scrollbarTrackY: number;
  scrollbarTrackW: number;
  scrollbarTrackH: number;
}

export interface ScrollbarThumbLayout {
  visible: boolean;
  y: number;
  height: number;
}

const PANEL_X = 54;
const PANEL_Y = 136;
const PANEL_W = 612;
const PANEL_H = 430;
const PAD = 24;
const SCROLLBAR_GUTTER = 22;
const VIEWPORT_H = PANEL_H - PAD * 2;
const SUMMARY_DISPLAY_LINES = 6;
const SUMMARY_LINE_H = 17;
const KIT_ROW_H = 88;
const ARCHETYPE_ROW_H = 104;

export function createProgressionPanelLayout(
  kitCount: number,
  archetypeCount = 0,
): ProgressionPanelLayout {
  const viewportX = PANEL_X + PAD;
  const viewportY = PANEL_Y + PAD;
  const viewportW = PANEL_W - PAD * 2 - SCROLLBAR_GUTTER;
  const contentW = viewportW;

  // Section 1 (headline): ARCHETYPE — heading, one summary line, one row per archetype, then a
  // "no archetype" clear button. Skipped entirely when archetypeCount is 0 (older callers/tests).
  const archetypeHeadingY = 0;
  const archetypeSummaryY = archetypeHeadingY + 30;
  const archetypeRowsStartY = archetypeSummaryY + 30;
  const clearArchetypeButtonY = archetypeRowsStartY + archetypeCount * ARCHETYPE_ROW_H + 22;
  const archetypeSectionBottom = archetypeCount > 0 ? clearArchetypeButtonY + 22 : 0;
  const archetypeDividerY = archetypeCount > 0 ? archetypeSectionBottom + 16 : 0;

  // Section 2: STARTER VARIETY — begins below the archetype section (or at the top when absent).
  const starterHeadingY = archetypeCount > 0 ? archetypeDividerY + 22 : 0;
  const starterSummaryY = starterHeadingY + 32;
  const starterSummaryBottom = starterSummaryY + SUMMARY_DISPLAY_LINES * SUMMARY_LINE_H;
  const dividerY = starterSummaryBottom + 22;

  // Section 3: STARTER KITS.
  const starterKitHeadingY = dividerY + 22;
  const kitRowsStartY = starterKitHeadingY + 42;
  const clearKitButtonY = kitRowsStartY + kitCount * KIT_ROW_H + 30;
  const contentHeight = clearKitButtonY + 32;

  return {
    panelX: PANEL_X,
    panelY: PANEL_Y,
    panelW: PANEL_W,
    panelH: PANEL_H,
    viewportX,
    viewportY,
    viewportW,
    viewportH: VIEWPORT_H,
    contentW,
    archetypeHeadingY,
    archetypeSummaryY,
    archetypeRowsStartY,
    archetypeRowH: ARCHETYPE_ROW_H,
    clearArchetypeButtonY,
    archetypeDividerY,
    starterHeadingY,
    starterSummaryY,
    starterSummaryBottom,
    unlockButtonX: contentW - 92,
    unlockButtonY: starterHeadingY + 76,
    dividerY,
    starterKitHeadingY,
    kitRowsStartY,
    kitRowH: KIT_ROW_H,
    kitTextW: contentW - 154,
    kitButtonX: contentW - 72,
    clearKitButtonY,
    contentHeight,
    maxScrollOffset: Math.max(0, contentHeight - VIEWPORT_H),
    scrollbarTrackX: PANEL_X + PANEL_W - 14,
    scrollbarTrackY: PANEL_Y + 14,
    scrollbarTrackW: 4,
    scrollbarTrackH: PANEL_H - 28,
  };
}

export function clampScrollOffset(offset: number, maxScrollOffset: number): number {
  return Math.max(0, Math.min(offset, maxScrollOffset));
}

export function createScrollbarThumbLayout(
  layout: ProgressionPanelLayout,
  scrollOffset: number,
): ScrollbarThumbLayout {
  if (layout.maxScrollOffset <= 0) {
    return {
      visible: false,
      y: layout.scrollbarTrackY,
      height: layout.scrollbarTrackH,
    };
  }

  const height = Math.max(
    36,
    Math.floor((layout.viewportH / layout.contentHeight) * layout.scrollbarTrackH),
  );
  const movableH = layout.scrollbarTrackH - height;
  const progress = clampScrollOffset(scrollOffset, layout.maxScrollOffset) / layout.maxScrollOffset;

  return {
    visible: true,
    y: layout.scrollbarTrackY + Math.round(movableH * progress),
    height,
  };
}
