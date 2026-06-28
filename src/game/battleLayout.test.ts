import { describe, expect, test } from 'vitest';
import { GAME_H, GAME_W } from '../config';
import { getBattleLayout, rectsOverlap } from './battleLayout';

describe('battle layout metrics', () => {
  test('planning board stays inside the canvas and away from critical regions', () => {
    const layout = getBattleLayout();

    expect(layout.planningBoard.x).toBeGreaterThanOrEqual(0);
    expect(layout.planningBoard.y).toBeGreaterThanOrEqual(0);
    expect(layout.planningBoard.x + layout.planningBoard.w).toBeLessThanOrEqual(GAME_W);
    expect(layout.planningBoard.y + layout.planningBoard.h).toBeLessThanOrEqual(GAME_H);

    expect(rectsOverlap(layout.planningBoard, layout.historyPanel)).toBe(false);
    expect(rectsOverlap(layout.planningBoard, layout.punchButton)).toBe(false);
    expect(rectsOverlap(layout.planningBoard, layout.itemButtons)).toBe(false);
    expect(rectsOverlap(layout.planningBoard, layout.handArea)).toBe(false);
  });

  test('planning board leaves a readable gap before the center prompt', () => {
    const layout = getBattleLayout();
    const boardBottom = layout.planningBoard.y + layout.planningBoard.h;

    expect(layout.prompt.y - boardBottom).toBeGreaterThanOrEqual(28);
  });
});
