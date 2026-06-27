import type { MetaProgressionState } from '../meta';

export const STARTER_CARD_VARIETY_UNLOCK_COST = 4;

export interface ProgressionState {
  embers: number;
  progression: MetaProgressionState;
}

type ProgressionResult =
  | { ok: true; state: ProgressionState }
  | { ok: false; reason: string; state: ProgressionState };

export function buyStarterCardVarietyUnlock(state: ProgressionState): ProgressionResult {
  if (state.progression.starterCardVarietyUnlocked) {
    return {
      ok: false,
      reason: 'Starter variety already unlocked.',
      state,
    };
  }

  if (state.embers < STARTER_CARD_VARIETY_UNLOCK_COST) {
    return {
      ok: false,
      reason: 'Not enough Embers.',
      state,
    };
  }

  return {
    ok: true,
    state: {
      embers: state.embers - STARTER_CARD_VARIETY_UNLOCK_COST,
      progression: {
        ...state.progression,
        starterCardVarietyUnlocked: true,
      },
    },
  };
}

export function formatStarterCardProgressionSummary(state: ProgressionState): string {
  const starterLine = state.progression.starterCardVarietyUnlocked
    ? 'Starter variety: unlocked - four opening card options.'
    : `Starter variety: locked - spend ${STARTER_CARD_VARIETY_UNLOCK_COST} Embers for a fourth opening card option.`;
  const migrationLine = state.progression.migrationBonusGranted
    ? 'Migration bonus: starter variety granted for old Ember progress.'
    : 'Migration bonus: none.';

  return [`Embers: ${state.embers}`, starterLine, migrationLine].join('\n');
}
