import { GAME_H, GAME_W } from '../config';

/**
 * Screen geometry for the Slay-the-Spire-style `TurnBattle` scene.
 *
 * This is a pure module: it imports no Phaser and no scene code so the layout
 * can be reasoned about and regression-tested with plain numbers. Every region
 * is expressed in the 720x640 (`GAME_W` x `GAME_H`) logical screen space.
 */

/** Base card-art footprint at scale 1 (mirrors the sprite sheet frame size). */
const CARD_ART_W = 104;
const CARD_ART_H = 140;

/** Hand cards render slightly shrunk so a full fan stays inside `handArea`. */
export const HAND_CARD_SCALE = 0.85;

/** The hand never holds more than this many cards. */
export const MAX_HAND_CARDS = 10;

/** Card footprint after the hand scale is applied: 88.4 x 119. */
const SCALED_CARD_W = CARD_ART_W * HAND_CARD_SCALE;
const SCALED_CARD_H = CARD_ART_H * HAND_CARD_SCALE;

/** Gap kept between adjacent hand cards before they must start overlapping. */
const HAND_CARD_GAP = 10;

export interface TurnBattleRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TurnBattleLayout {
  /** The enemy band across the top: one to three foes laid out in a row, each with
   * its own name/HP/intent (multi-enemy). Left of the item column. */
  enemyZone: TurnBattleRect;
  /** Hero sprite + HP bar + block badge, left column. */
  playerZone: TurnBattleRect;
  /** Announcement anchor (reshuffle / no-plays / stunned), center. */
  announcement: TurnBattleRect;
  /** Where a played card travels before discarding, center. */
  playZone: TurnBattleRect;
  /** Free-action item buttons, right column. */
  itemRow: TurnBattleRect;
  /** Right side, above the discard pile badge. */
  endTurnButton: TurnBattleRect;
  /** Bottom-left, above the draw pile badge. */
  energyBadge: TurnBattleRect;
  /** Draw pile badge, bottom-left corner. */
  drawPile: TurnBattleRect;
  /** Discard pile badge, bottom-right corner. */
  discardPile: TurnBattleRect;
  /** Hand fan strip, bottom center. */
  handArea: TurnBattleRect;
}

/**
 * Axis-aligned rectangle overlap using strict inequalities, so rectangles that
 * merely share an edge are treated as clear (not overlapping). Self-contained
 * so this module has no dependency on other layout helpers.
 */
export function rectsOverlap(a: TurnBattleRect, b: TurnBattleRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Fixed screen geometry for the turn-based battle scene.
 *
 * Guarantees (covered by the colocated tests): every region lies fully inside
 * the `GAME_W` x `GAME_H` screen; the labelled regions are pairwise
 * non-overlapping; the enemy band sits above the announcement and play zone with
 * readable gaps; and the hand strip, end-turn button, and discard badge stay out
 * of one another's way.
 */
export function getTurnBattleLayout(): TurnBattleLayout {
  return {
    enemyZone: { x: 24, y: 24, w: 560, h: 250 },
    playerZone: { x: 24, y: 320, w: 180, h: 130 },
    announcement: { x: GAME_W / 2 - 190, y: 276, w: 380, h: 26 },
    playZone: { x: GAME_W / 2 - 44, y: 316, w: 88, h: SCALED_CARD_H },
    itemRow: { x: GAME_W - 116, y: 110, w: 108, h: 320 },
    endTurnButton: { x: GAME_W - 104, y: GAME_H - 172, w: 100, h: 60 },
    energyBadge: { x: 12, y: GAME_H - 184, w: 88, h: 88 },
    drawPile: { x: 12, y: GAME_H - 84, w: 88, h: 72 },
    discardPile: { x: GAME_W - 100, y: GAME_H - 84, w: 88, h: 72 },
    handArea: { x: GAME_W / 2 - 252, y: GAME_H - 144, w: 504, h: 140 },
  };
}

/**
 * Center points for `count` hand cards, laid out symmetrically around the hand
 * area's horizontal center. Spacing shrinks as the hand grows (cards fan and
 * overlap) but every card's scaled footprint stays fully inside `handArea`.
 *
 * The returned array is ordered strictly left-to-right; `y` is always the
 * vertical center of `handArea`.
 */
/**
 * Center x for each of `count` enemies, spread evenly across the enemy band.
 * One enemy sits at the band's center; a pack fans out with equal margins so
 * every foe (and its HP bar / intent) has room. `count` is clamped to >= 1.
 */
export function enemyAnchorsX(count: number): number[] {
  const band = getTurnBattleLayout().enemyZone;
  const n = Math.max(1, count);
  if (n === 1) return [band.x + band.w / 2];
  const step = band.w / n;
  return Array.from({ length: n }, (_, i) => band.x + step * (i + 0.5));
}

export function handSlotPositions(count: number): { x: number; y: number }[] {
  if (count <= 0) {
    return [];
  }

  const { handArea } = getTurnBattleLayout();
  const centerX = handArea.x + handArea.w / 2;
  const y = handArea.y + handArea.h / 2;

  if (count === 1) {
    return [{ x: centerX, y }];
  }

  const spacing = Math.min(
    SCALED_CARD_W + HAND_CARD_GAP,
    (handArea.w - SCALED_CARD_W) / (count - 1),
  );

  const slots: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    slots.push({ x: centerX + (i - (count - 1) / 2) * spacing, y });
  }
  return slots;
}
