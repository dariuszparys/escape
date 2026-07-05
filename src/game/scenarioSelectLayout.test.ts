import { describe, expect, test } from 'vitest';
import { createScenarioSelectLayout, rectsOverlap } from './scenarioSelectLayout';

describe('scenario selection layout', () => {
  test('leaves distinct regions for list, preview, confirm, and back controls', () => {
    const layout = createScenarioSelectLayout(4);

    expect(rectsOverlap(layout.list, layout.preview)).toBe(false);
    expect(layout.confirmButton.y).toBeGreaterThan(layout.preview.y + layout.preview.h);
    expect(layout.backButton.y).toBe(layout.confirmButton.y);
    expect(layout.backButton.x).toBeLessThan(layout.confirmButton.x);
  });

  test('fits the four v1 scenario rows inside the list region', () => {
    const layout = createScenarioSelectLayout(4);

    expect(layout.rowH * 4).toBe(layout.list.h);
    expect(layout.list.y + layout.list.h).toBeLessThan(layout.confirmButton.y);
  });
});
