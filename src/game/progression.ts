import type { MetaProgressionState } from '../meta';
import { CARD_DEFS } from '../data/cards';
import { STARTER_KITS, type StarterKitId } from '../data/starterKits';

export const STARTER_CARD_VARIETY_UNLOCK_COST = 4;

export interface ProgressionState {
  embers: number;
  progression: MetaProgressionState;
}

type ProgressionResult =
  | { ok: true; state: ProgressionState }
  | { ok: false; reason: string; state: ProgressionState };

function findStarterKit(id: string) {
  return STARTER_KITS.find((kit) => kit.id === id) ?? null;
}

function signatureCardForKit(kit: (typeof STARTER_KITS)[number]) {
  const card = CARD_DEFS.find((candidate) => candidate.id === kit.signatureCardId);
  if (!card) throw new Error(`Unknown starter kit signature card: ${kit.signatureCardId}`);
  return card;
}

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

export function buyStarterKitUnlock(state: ProgressionState, kitId: string): ProgressionResult {
  const kit = findStarterKit(kitId);
  if (!kit) {
    return {
      ok: false,
      reason: 'Unknown starter kit.',
      state,
    };
  }

  if (!state.progression.starterCardVarietyUnlocked) {
    return {
      ok: false,
      reason: 'Starter variety must be unlocked first.',
      state,
    };
  }

  if (state.progression.unlockedStarterKitIds.includes(kit.id)) {
    return {
      ok: false,
      reason: 'Starter kit already unlocked.',
      state,
    };
  }

  if (state.embers < kit.cost) {
    return {
      ok: false,
      reason: 'Not enough Embers.',
      state,
    };
  }

  return {
    ok: true,
    state: {
      embers: state.embers - kit.cost,
      progression: {
        ...state.progression,
        unlockedStarterKitIds: [...state.progression.unlockedStarterKitIds, kit.id],
        activeStarterKitId: kit.id,
      },
    },
  };
}

export function setActiveStarterKit(
  state: ProgressionState,
  kitId: StarterKitId | string | null,
): ProgressionResult {
  if (kitId === null) {
    return {
      ok: true,
      state: {
        ...state,
        progression: {
          ...state.progression,
          activeStarterKitId: null,
        },
      },
    };
  }

  const kit = findStarterKit(kitId);
  if (!kit) {
    return {
      ok: false,
      reason: 'Unknown starter kit.',
      state,
    };
  }

  if (!state.progression.unlockedStarterKitIds.includes(kit.id)) {
    return {
      ok: false,
      reason: 'Starter kit is locked.',
      state,
    };
  }

  return {
    ok: true,
    state: {
      ...state,
      progression: {
        ...state.progression,
        activeStarterKitId: kit.id,
      },
    },
  };
}

export function formatStarterKitProgressionLine(state: ProgressionState, kitId: string): string {
  const kit = findStarterKit(kitId);
  if (!kit) throw new Error(`Unknown starter kit: ${kitId}`);

  const signature = signatureCardForKit(kit);
  const status = !state.progression.starterCardVarietyUnlocked
    ? 'locked - unlock starter variety first'
    : state.progression.activeStarterKitId === kit.id
      ? 'active - selected for next normal run'
      : state.progression.unlockedStarterKitIds.includes(kit.id)
        ? 'unlocked - select for next normal run'
        : `locked - ${kit.cost} Embers`;

  return `${kit.name}: ${status} | ${signature.name}: ${signature.description} | ${kit.archetype}`;
}

export function formatStarterCardProgressionSummary(state: ProgressionState): string {
  const starterLine = state.progression.starterCardVarietyUnlocked
    ? 'Starter variety: unlocked - four opening card options.'
    : `Starter variety: locked - spend ${STARTER_CARD_VARIETY_UNLOCK_COST} Embers for a fourth opening card option.`;
  const migrationLine = state.progression.migrationBonusGranted
    ? 'Migration bonus: starter variety granted for old Ember progress.'
    : 'Migration bonus: none.';
  const activeKit = state.progression.activeStarterKitId
    ? findStarterKit(state.progression.activeStarterKitId)
    : null;
  const kitLine = activeKit
    ? `Starter kit: ${activeKit.name} active.`
    : 'Starter kit: none selected.';

  return [`Embers: ${state.embers}`, starterLine, migrationLine, kitLine].join('\n');
}
