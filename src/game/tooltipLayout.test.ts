import { describe, expect, test } from 'vitest';
import { GAME_H, GAME_W } from '../config';
import { computeTooltipPlacement, TOOLTIP_WIDTH } from './tooltipLayout';
import {
  getTurnBattleLayout,
  handSlotPositions,
  HAND_CARD_SCALE,
  rectsOverlap,
} from './turnBattleLayout';

const CARD_ART_W = 104;
const CARD_ART_H = 140;
const SCALED_CARD_W = CARD_ART_W * HAND_CARD_SCALE;
const SCALED_CARD_H = CARD_ART_H * HAND_CARD_SCALE;

/** A representative tooltip size: a header + a few rules lines. */
const TOOLTIP_SIZE = { w: TOOLTIP_WIDTH, h: 150 };

/** Build the hover-raised on-screen rect for a hand card at `slot`, mirroring
 * `makeHandCardView`'s pointerover handler (`container.setY(handY() - 16)`) and
 * `makeCardView`'s center-anchored origin. */
function raisedHandCardRect(slot: { x: number; y: number }): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const raisedY = slot.y - 16;
  return {
    x: slot.x - SCALED_CARD_W / 2,
    y: raisedY - SCALED_CARD_H / 2,
    w: SCALED_CARD_W,
    h: SCALED_CARD_H,
  };
}

function expectInBounds(rect: { x: number; y: number; w: number; h: number }): void {
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.y).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.w).toBeLessThanOrEqual(GAME_W);
  expect(rect.y + rect.h).toBeLessThanOrEqual(GAME_H);
}

describe('computeTooltipPlacement', () => {
  test('stays fully in-bounds for hand cards at the far left, far right, and center', () => {
    const slots = handSlotPositions(10); // MAX_HAND_CARDS — widest fan, most likely to clip edges
    const farLeft = raisedHandCardRect(slots[0]);
    const center = raisedHandCardRect(slots[Math.floor(slots.length / 2)]);
    const farRight = raisedHandCardRect(slots[slots.length - 1]);

    for (const anchor of [farLeft, center, farRight]) {
      const placement = computeTooltipPlacement(anchor, TOOLTIP_SIZE);
      expectInBounds(placement);
    }
  });

  test('horizontal clamping works at both canvas edges for extreme anchors', () => {
    const leftEdgeAnchor = { x: -30, y: 300, w: 88, h: 119 };
    const rightEdgeAnchor = { x: GAME_W - 20, y: 300, w: 88, h: 119 };

    const leftPlacement = computeTooltipPlacement(leftEdgeAnchor, TOOLTIP_SIZE);
    const rightPlacement = computeTooltipPlacement(rightEdgeAnchor, TOOLTIP_SIZE);

    expectInBounds(leftPlacement);
    expectInBounds(rightPlacement);
  });

  test('flips below when the anchor sits near the top of the screen, and stays in-bounds', () => {
    const nearTopAnchor = { x: 300, y: 10, w: 88, h: 119 };

    const placement = computeTooltipPlacement(nearTopAnchor, TOOLTIP_SIZE);

    expect(placement.flippedBelow).toBe(true);
    expect(placement.y).toBeGreaterThan(nearTopAnchor.y + nearTopAnchor.h);
    expectInBounds(placement);
  });

  test('does not flip for anchors with comfortable room above (e.g. the hand)', () => {
    const slots = handSlotPositions(5);
    const anchor = raisedHandCardRect(slots[2]);

    const placement = computeTooltipPlacement(anchor, TOOLTIP_SIZE);

    expect(placement.flippedBelow).toBe(false);
  });

  test('the returned rect never overlaps the anchor rect, flipped or not', () => {
    const slots = handSlotPositions(10);
    const handAnchors = [
      slots[0],
      slots[Math.floor(slots.length / 2)],
      slots[slots.length - 1],
    ].map(raisedHandCardRect);
    const nearTopAnchor = { x: 300, y: 10, w: 88, h: 119 };
    const rewardAnchor = { x: 260, y: 188, w: 104, h: 140 }; // reward card, scale 1.0, y: 258 per runVictory

    for (const anchor of [...handAnchors, nearTopAnchor, rewardAnchor]) {
      const placement = computeTooltipPlacement(anchor, TOOLTIP_SIZE);
      expect(rectsOverlap(placement, anchor)).toBe(false);
    }
  });

  test("a hand-area-anchored card clears handArea's top edge (not just the card) when not flipped", () => {
    const { handArea } = getTurnBattleLayout();
    const slots = handSlotPositions(5);
    const anchor = raisedHandCardRect(slots[2]);

    const placement = computeTooltipPlacement(anchor, TOOLTIP_SIZE);

    expect(placement.flippedBelow).toBe(false);
    // Comfortable gap, not a graze: strictly above handArea's top edge with margin.
    expect(handArea.y - (placement.y + placement.h)).toBeGreaterThan(4);
  });
});
