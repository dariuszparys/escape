import { describe, expect, test } from 'vitest';
import { ITEM_DEFS } from './items';

describe('ITEM_DEFS invariants', () => {
  test('item ids are unique', () => {
    const ids = ITEM_DEFS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('every item has a positive amount', () => {
    expect(ITEM_DEFS.every((item) => item.amount > 0)).toBe(true);
  });

  test('every item is usable somewhere (dungeon or combat)', () => {
    expect(ITEM_DEFS.every((item) => item.usableInDungeon || item.usableInCombat)).toBe(true);
  });
});
