import { describe, expect, test } from 'vitest';
import { GAME_H, GAME_W } from '../config';
import {
  getTurnBattleLayout,
  handSlotPositions,
  HAND_CARD_SCALE,
  MAX_HAND_CARDS,
  rectsOverlap,
  type TurnBattleRect,
} from './turnBattleLayout';

const SCALED_CARD_W = 104 * HAND_CARD_SCALE;
const SCALED_CARD_H = 140 * HAND_CARD_SCALE;
const HAND_CENTER_X = 360;
const FLOAT_TOLERANCE = 0.51;

function allRegions(): TurnBattleRect[] {
  const layout = getTurnBattleLayout();
  return [
    layout.playerZone,
    layout.enemyZone,
    layout.intentPanel,
    layout.announcement,
    layout.playZone,
    layout.itemRow,
    layout.endTurnButton,
    layout.energyBadge,
    layout.drawPile,
    layout.discardPile,
    layout.handArea,
  ];
}

describe('rectsOverlap', () => {
  test('detects interior overlap and treats shared edges as clear', () => {
    const base: TurnBattleRect = { x: 0, y: 0, w: 10, h: 10 };
    expect(rectsOverlap(base, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    // Touching along the right edge (x === 10) is not an overlap.
    expect(rectsOverlap(base, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
    // Touching along the bottom edge (y === 10) is not an overlap.
    expect(rectsOverlap(base, { x: 0, y: 10, w: 10, h: 10 })).toBe(false);
    // Fully separated.
    expect(rectsOverlap(base, { x: 20, y: 20, w: 5, h: 5 })).toBe(false);
  });
});

describe('turn battle layout metrics', () => {
  test('every region lies fully inside the 720x640 screen', () => {
    for (const rect of allRegions()) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.w).toBeLessThanOrEqual(GAME_W);
      expect(rect.y + rect.h).toBeLessThanOrEqual(GAME_H);
      expect(rect.w).toBeGreaterThan(0);
      expect(rect.h).toBeGreaterThan(0);
    }
  });

  test('the labelled regions are pairwise non-overlapping', () => {
    const regions = allRegions();
    for (let i = 0; i < regions.length; i += 1) {
      for (let j = i + 1; j < regions.length; j += 1) {
        expect(rectsOverlap(regions[i], regions[j])).toBe(false);
      }
    }
  });

  test('the center stack reads intent -> announcement -> play zone with readable gaps', () => {
    const { intentPanel, announcement, playZone } = getTurnBattleLayout();

    expect(announcement.y - (intentPanel.y + intentPanel.h)).toBeGreaterThanOrEqual(4);
    expect(playZone.y - (announcement.y + announcement.h)).toBeGreaterThanOrEqual(4);
  });

  test('the play-zone card-travel path clears the hand area by at least 40px', () => {
    const { playZone, handArea } = getTurnBattleLayout();

    expect(handArea.y - (playZone.y + playZone.h)).toBeGreaterThanOrEqual(40);
  });

  test('the end-turn button and discard pile never intersect the hand area', () => {
    const { endTurnButton, discardPile, handArea } = getTurnBattleLayout();

    expect(rectsOverlap(endTurnButton, handArea)).toBe(false);
    expect(rectsOverlap(discardPile, handArea)).toBe(false);
  });
});

describe('handSlotPositions', () => {
  test('a single card sits at the hand area horizontal center', () => {
    const slots = handSlotPositions(1);
    const { handArea } = getTurnBattleLayout();

    expect(slots).toHaveLength(1);
    expect(slots[0].x).toBeCloseTo(HAND_CENTER_X, 6);
    expect(slots[0].y).toBeCloseTo(handArea.y + handArea.h / 2, 6);
    expect(handArea.x + handArea.w / 2).toBe(HAND_CENTER_X);
  });

  test.each([1, 5, MAX_HAND_CARDS])(
    'every scaled card at count %i stays inside the hand area',
    (count) => {
      const { handArea } = getTurnBattleLayout();
      const slots = handSlotPositions(count);

      expect(slots).toHaveLength(count);

      for (const slot of slots) {
        const left = slot.x - SCALED_CARD_W / 2;
        const right = slot.x + SCALED_CARD_W / 2;
        const top = slot.y - SCALED_CARD_H / 2;
        const bottom = slot.y + SCALED_CARD_H / 2;

        expect(left).toBeGreaterThanOrEqual(handArea.x - FLOAT_TOLERANCE);
        expect(right).toBeLessThanOrEqual(handArea.x + handArea.w + FLOAT_TOLERANCE);
        expect(top).toBeGreaterThanOrEqual(handArea.y - FLOAT_TOLERANCE);
        expect(bottom).toBeLessThanOrEqual(handArea.y + handArea.h + FLOAT_TOLERANCE);
      }
    },
  );

  test.each([5, MAX_HAND_CARDS])(
    'slots at count %i are strictly ascending and symmetric around x=360',
    (count) => {
      const slots = handSlotPositions(count);

      for (let i = 1; i < slots.length; i += 1) {
        expect(slots[i].x).toBeGreaterThan(slots[i - 1].x);
      }

      const first = slots[0];
      const last = slots[slots.length - 1];
      expect(Math.abs(HAND_CENTER_X - first.x - (last.x - HAND_CENTER_X))).toBeLessThanOrEqual(
        0.01,
      );
    },
  );

  test('spacing shrinks as the hand grows so a full hand still fits', () => {
    const fiveGap = handSlotPositions(5)[1].x - handSlotPositions(5)[0].x;
    const maxGap = handSlotPositions(MAX_HAND_CARDS)[1].x - handSlotPositions(MAX_HAND_CARDS)[0].x;

    expect(maxGap).toBeLessThan(fiveGap);
    expect(maxGap).toBeGreaterThan(0);
  });

  test('a non-positive count yields no slots', () => {
    expect(handSlotPositions(0)).toEqual([]);
  });
});
