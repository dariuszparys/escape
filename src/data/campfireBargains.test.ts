import { describe, expect, test } from 'vitest';
import type { CampfirePurchaseState } from './campfirePurchases';
import { createDefaultPendingPrep } from './campfirePurchases';
import {
  acceptCampfireBargain,
  canAcceptCampfireBargain,
  formatCampfireCurseSummary,
  getCampfireBargain,
} from './campfireBargains';

describe('campfire bargains', () => {
  test('accepts Blood Oath by granting embers and setting the next-run curse', () => {
    const state = {
      embers: 4,
      pendingPrep: createDefaultPendingPrep(),
    };

    const result = acceptCampfireBargain(state, 'blood_oath');

    expect(result.ok).toBe(true);
    expect(result.state).toEqual({
      embers: 14,
      pendingPrep: {
        itemIds: [],
        extraStartingChoice: false,
        scoutFlame: false,
        curseIds: ['blood_oath'],
      },
    });
    expect(state.pendingPrep.curseIds).toEqual([]);
  });

  test('accepts Narrow Opening by granting 8 embers', () => {
    const result = acceptCampfireBargain(
      {
        embers: 1,
        pendingPrep: createDefaultPendingPrep(),
      },
      'narrow_opening',
    );

    expect(result.ok).toBe(true);
    expect(result.state.embers).toBe(9);
    expect(result.state.pendingPrep.curseIds).toEqual(['narrow_opening']);
  });

  test('rejects a second bargain without changing state', () => {
    const state: CampfirePurchaseState = {
      embers: 20,
      pendingPrep: {
        ...createDefaultPendingPrep(),
        curseIds: ['blood_oath'],
      },
    };

    expect(canAcceptCampfireBargain(state, 'narrow_opening')).toEqual({
      ok: false,
      reason: 'Already cursed.',
    });
    expect(acceptCampfireBargain(state, 'narrow_opening')).toEqual({
      ok: false,
      reason: 'Already cursed.',
      state,
    });
  });

  test('throws for an unknown bargain id', () => {
    expect(() => getCampfireBargain('missing' as never)).toThrow(
      'Unknown campfire bargain: missing',
    );
  });

  test('formats pending curse summary text', () => {
    expect(formatCampfireCurseSummary([])).toBe('Curse: none');
    expect(formatCampfireCurseSummary(['blood_oath'])).toBe('Curse: Blood Oath');
    expect(formatCampfireCurseSummary(['narrow_opening'])).toBe('Curse: Narrow Opening');
  });
});
