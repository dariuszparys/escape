import { describe, expect, test } from 'vitest';
import { createTitleLayout } from './titleLayout';

describe('title screen layout', () => {
  test('keeps instructions clear of the enter prompt', () => {
    const layout = createTitleLayout();

    expect(layout.promptTop - layout.instructionsBottom).toBeGreaterThanOrEqual(24);
  });
});
