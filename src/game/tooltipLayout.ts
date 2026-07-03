import { GAME_H, GAME_W } from '../config';
import { getTurnBattleLayout, rectsOverlap, type TurnBattleRect } from './turnBattleLayout';

/**
 * Pure geometry for the card rules-text tooltip (U11 / KTD7).
 *
 * Mirrors `turnBattleLayout.ts`'s discipline: no Phaser import, no text
 * measurement — this module only ever reasons about rectangles in the
 * 720x640 (`GAME_W` x `GAME_H`) logical screen space. The caller (`cardTooltip.ts`)
 * decides the tooltip's pixel size (a fixed `TOOLTIP_WIDTH`, height derived from
 * the card's rules-line count) and hands that size in as `tooltipSize`; this
 * module only decides WHERE to put it.
 */

/** Fixed tooltip width shared by every call site (hand cards and reward cards alike). */
export const TOOLTIP_WIDTH = 240;

/** Minimum gap kept between the tooltip and the canvas edges. */
const EDGE_MARGIN = 8;

/** Gap kept between the tooltip and the card (or hand area) it's anchored above/below. */
const ANCHOR_GAP = 12;

export interface TooltipPlacement {
  x: number;
  y: number;
  w: number;
  h: number;
  /** True when the tooltip was flipped below the anchor because there wasn't room above. */
  flippedBelow: boolean;
}

/**
 * Where to place a tooltip of size `tooltipSize` for a hovered card occupying
 * `anchorRect` on screen, clamped fully inside the GAME_W x GAME_H canvas.
 *
 * Default anchor is directly above the card, horizontally centered on it; flips
 * below when there isn't enough vertical room above (e.g. a card near the top of
 * the screen — this matters for reward-offer cards, which sit much higher on
 * screen than hand cards).
 *
 * "Clearance above the hand": when `anchorRect` sits inside `getTurnBattleLayout().handArea`
 * (true for every hand card, per `handSlotPositions`), the default placement clears the
 * whole hand strip's top edge, not just the individual card, so the tooltip never grazes
 * neighboring hand cards as they raise on hover.
 */
export function computeTooltipPlacement(
  anchorRect: TurnBattleRect,
  tooltipSize: { w: number; h: number },
): TooltipPlacement {
  const { w, h } = tooltipSize;
  const { handArea } = getTurnBattleLayout();

  // Cards that live in the hand strip must clear the whole strip's top edge, not
  // just their own (possibly hover-raised) top edge.
  const anchorTop = rectsOverlap(anchorRect, handArea)
    ? Math.min(anchorRect.y, handArea.y)
    : anchorRect.y;

  let flippedBelow = false;
  let y = anchorTop - ANCHOR_GAP - h;
  if (y < EDGE_MARGIN) {
    flippedBelow = true;
    y = anchorRect.y + anchorRect.h + ANCHOR_GAP;
    y = Math.min(y, GAME_H - EDGE_MARGIN - h);
  }

  let x = anchorRect.x + anchorRect.w / 2 - w / 2;
  x = Math.max(EDGE_MARGIN, Math.min(x, GAME_W - EDGE_MARGIN - w));

  return { x, y, w, h, flippedBelow };
}
