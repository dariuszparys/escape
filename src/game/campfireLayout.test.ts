import { describe, expect, test } from 'vitest';
import { campfireClassOptions } from '../data/archetypes';
import {
  continueTop,
  createCampfireClassLayout,
  createCampfireDepartLayout,
  descriptionBottom,
  initialCampfireBeat,
  layoutFitsCanvas,
  loadoutTop,
  modesBottom,
  rectsOverlap,
} from './campfireLayout';

describe('campfire two-step layout', () => {
  test('lands on class pick until a class is persisted or confirmed this session', () => {
    expect(initialCampfireBeat(false, null)).toBe('class');
    expect(initialCampfireBeat(false, 'barbarian')).toBe('depart');
    expect(initialCampfireBeat(true, null)).toBe('depart');
    expect(initialCampfireBeat(true, 'ranger')).toBe('depart');
  });

  test('keeps class cards, description, and continue in distinct regions', () => {
    const layout = createCampfireClassLayout(campfireClassOptions().length);

    expect(layout.cards).toHaveLength(4);
    for (const [index, card] of layout.cards.entries()) {
      expect(layoutFitsCanvas(card)).toBe(true);
      for (const other of layout.cards.slice(index + 1)) {
        expect(rectsOverlap(card, other)).toBe(false);
      }
      expect(rectsOverlap(card, layout.description)).toBe(false);
      expect(rectsOverlap(card, layout.continueButton)).toBe(false);
    }

    expect(layoutFitsCanvas(layout.description)).toBe(true);
    expect(layoutFitsCanvas(layout.continueButton)).toBe(true);
    expect(rectsOverlap(layout.description, layout.continueButton)).toBe(false);
    expect(continueTop(layout) - descriptionBottom(layout)).toBeGreaterThanOrEqual(24);
  });

  test('keeps depart chip, goal, mode cards, and loadout from overlapping', () => {
    const layout = createCampfireDepartLayout();

    expect(layoutFitsCanvas(layout.classChip)).toBe(true);
    expect(layoutFitsCanvas(layout.goal)).toBe(true);
    expect(layoutFitsCanvas(layout.primaryMode)).toBe(true);
    expect(layoutFitsCanvas(layout.secondaryMode)).toBe(true);
    expect(rectsOverlap(layout.classChip, layout.goal)).toBe(false);
    expect(rectsOverlap(layout.goal, layout.primaryMode)).toBe(false);
    expect(rectsOverlap(layout.goal, layout.secondaryMode)).toBe(false);
    expect(rectsOverlap(layout.primaryMode, layout.secondaryMode)).toBe(false);
    expect(layout.changeClassButton.x).toBeGreaterThan(layout.classChip.x);
    expect(layout.changeClassButton.x + layout.changeClassButton.w).toBeLessThanOrEqual(
      layout.classChip.x + layout.classChip.w,
    );
    expect(layout.changeClassButton.y).toBeGreaterThan(layout.classChip.y);
    expect(layout.changeClassButton.y + layout.changeClassButton.h).toBeLessThan(
      layout.classChip.y + layout.classChip.h,
    );
    expect(loadoutTop(layout) - modesBottom(layout)).toBeGreaterThanOrEqual(24);
  });

  test('treats Wanderer as the fourth class option', () => {
    const options = campfireClassOptions();
    expect(options.map((option) => option.id)).toEqual([
      'barbarian',
      'necromancer',
      'ranger',
      null,
    ]);
    expect(options[3]?.name).toBe('Wanderer');
  });
});
