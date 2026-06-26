import { describe, expect, test } from 'vitest';
import { MAX_INVENTORY } from '../config';
import {
  buyCampfirePurchase,
  canBuyCampfirePurchase,
  createDefaultPendingPrep,
} from './campfirePurchases';

describe('campfire purchases', () => {
  test('buys repeatable starting items while inventory space remains', () => {
    const first = buyCampfirePurchase({
      embers: 20,
      pendingPrep: createDefaultPendingPrep(),
    }, 'small_potion');

    expect(first.ok).toBe(true);
    expect(first.state).toEqual({
      embers: 16,
      pendingPrep: {
        itemIds: ['small_potion'],
        extraStartingChoice: false,
        scoutFlame: false,
      },
    });

    const second = buyCampfirePurchase(first.state, 'bomb');

    expect(second.ok).toBe(true);
    expect(second.state.pendingPrep.itemIds).toEqual(['small_potion', 'bomb']);
  });

  test('rejects item purchases at the inventory cap', () => {
    const state = {
      embers: 99,
      pendingPrep: {
        itemIds: Array.from({ length: MAX_INVENTORY }, () => 'small_potion'),
        extraStartingChoice: false,
        scoutFlame: false,
      },
    };

    expect(canBuyCampfirePurchase(state, 'bomb')).toEqual({
      ok: false,
      reason: 'Inventory is full.',
    });
  });

  test('rejects duplicate one-off prep purchases', () => {
    const first = buyCampfirePurchase({
      embers: 20,
      pendingPrep: createDefaultPendingPrep(),
    }, 'extra_starting_choice');

    expect(first.ok).toBe(true);

    expect(canBuyCampfirePurchase(first.state, 'extra_starting_choice')).toEqual({
      ok: false,
      reason: 'Already prepared.',
    });
  });

  test('rejects unaffordable purchases without changing state', () => {
    const state = {
      embers: 3,
      pendingPrep: createDefaultPendingPrep(),
    };

    expect(buyCampfirePurchase(state, 'small_potion')).toEqual({
      ok: false,
      reason: 'Not enough embers.',
      state,
    });
  });
});
