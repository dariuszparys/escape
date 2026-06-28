import { describe, expect, test } from 'vitest';
import {
  clampScrollOffset,
  createProgressionPanelLayout,
  createScrollbarThumbLayout,
} from './progressionLayout';

describe('progression screen layout', () => {
  test('keeps starter-kit heading below wrapped starter summary', () => {
    const layout = createProgressionPanelLayout(3);

    expect(layout.starterKitHeadingY - layout.starterSummaryBottom).toBeGreaterThanOrEqual(24);
  });

  test('uses scrolling when progression content is taller than the panel viewport', () => {
    const layout = createProgressionPanelLayout(3);

    expect(layout.maxScrollOffset).toBeGreaterThan(0);
  });

  test('clamps progression scroll offsets to available content', () => {
    expect(clampScrollOffset(-12, 80)).toBe(0);
    expect(clampScrollOffset(44, 80)).toBe(44);
    expect(clampScrollOffset(120, 80)).toBe(80);
  });

  test('positions the scrollbar thumb within its track', () => {
    const layout = createProgressionPanelLayout(3);
    const thumb = createScrollbarThumbLayout(layout, layout.maxScrollOffset);

    expect(thumb.visible).toBe(true);
    expect(thumb.y + thumb.height).toBe(layout.scrollbarTrackY + layout.scrollbarTrackH);
  });
});
