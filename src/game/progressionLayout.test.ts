import { describe, expect, test } from 'vitest';
import {
  clampScrollOffset,
  createProgressionPanelLayout,
  createScrollbarThumbLayout,
} from './progressionLayout';

describe('progression screen layout', () => {
  test('keeps relic heading below wrapped starter summary', () => {
    const layout = createProgressionPanelLayout(3, 12);

    expect(layout.relicHeadingY - layout.starterSummaryBottom).toBeGreaterThanOrEqual(40);
  });

  test('stacks the archetype section above starter variety when archetypes are present', () => {
    const layout = createProgressionPanelLayout(3, 12);

    expect(layout.archetypeHeadingY).toBeLessThan(layout.starterHeadingY);
    expect(layout.clearArchetypeButtonY).toBeLessThan(layout.archetypeDividerY);
    expect(layout.archetypeDividerY).toBeLessThan(layout.starterHeadingY);
  });

  test('omits the archetype section for legacy no-archetype callers', () => {
    const layout = createProgressionPanelLayout();

    expect(layout.starterHeadingY).toBe(0);
  });

  test('uses scrolling when progression content is taller than the panel viewport', () => {
    const layout = createProgressionPanelLayout(3, 12);

    expect(layout.maxScrollOffset).toBeGreaterThan(0);
  });

  test('clamps progression scroll offsets to available content', () => {
    expect(clampScrollOffset(-12, 80)).toBe(0);
    expect(clampScrollOffset(44, 80)).toBe(44);
    expect(clampScrollOffset(120, 80)).toBe(80);
  });

  test('positions the scrollbar thumb within its track', () => {
    const layout = createProgressionPanelLayout(3, 12);
    const thumb = createScrollbarThumbLayout(layout, layout.maxScrollOffset);

    expect(thumb.visible).toBe(true);
    expect(thumb.y + thumb.height).toBe(layout.scrollbarTrackY + layout.scrollbarTrackH);
  });
});
