import type { MetaProgressionState } from '../meta';
import { CARD_DEFS, type ArchetypeId } from '../data/cards';
import { ARCHETYPES, archetypeDef } from '../data/archetypes';
import { ARCHETYPE_STARTING_CARD_IDS } from './startingCards';
import { RELIC_DEFS, relicDef, type RelicId } from '../data/relics';

export const STARTER_CARD_VARIETY_UNLOCK_COST = 4;
export const RELIC_PATH_UNLOCK_COST = 5;

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

/**
 * Select (or clear) the active archetype for the next normal run. Archetypes are a free, horizontal
 * playstyle choice — no Ember cost and no unlock gate — so this only validates the id and swaps it.
 * `null` clears back to the neutral (standard) card pool.
 */
export function setActiveArchetype(
  state: ProgressionState,
  archetypeId: ArchetypeId | null,
): ProgressionResult {
  if (archetypeId !== null && !ARCHETYPES.some((archetype) => archetype.id === archetypeId)) {
    return { ok: false, reason: 'Unknown archetype.', state };
  }

  return {
    ok: true,
    state: {
      ...state,
      progression: {
        ...state.progression,
        activeArchetypeId: archetypeId,
      },
    },
  };
}

/** The display names of an archetype's opening-pick cards, for the Progression row. */
function archetypePickNames(archetypeId: ArchetypeId): string[] {
  return ARCHETYPE_STARTING_CARD_IDS[archetypeId].map((cardId) => {
    const card = CARD_DEFS.find((candidate) => candidate.id === cardId);
    return card?.name ?? cardId;
  });
}

export function formatArchetypeProgressionLine(
  state: ProgressionState,
  archetypeId: ArchetypeId,
): string {
  const def = archetypeDef(archetypeId);
  const active = state.progression.activeArchetypeId === archetypeId;
  const status = active ? 'active - shapes next normal run' : 'select for next normal run';
  return `${def.name} (${def.tagline}): ${status} | ${def.description} | Opens with: ${archetypePickNames(archetypeId).join(', ')}`;
}

export function formatArchetypeSelectionSummary(state: ProgressionState): string {
  const active = state.progression.activeArchetypeId;
  const line = active
    ? `Archetype: ${archetypeDef(active).name} - every card draw is ${archetypeDef(active).name}-flavored.`
    : 'Archetype: none - standard cards only. Pick one to reshape the whole run.';
  return line;
}

export function formatStarterCardProgressionSummary(state: ProgressionState): string {
  const starterLine = state.progression.starterCardVarietyUnlocked
    ? 'Starter variety: unlocked - four opening card options.'
    : `Starter variety: locked - spend ${STARTER_CARD_VARIETY_UNLOCK_COST} Embers for a fourth opening card option.`;
  const migrationLine = state.progression.migrationBonusGranted
    ? 'Migration bonus: starter variety granted for old Ember progress.'
    : 'Migration bonus: none.';

  return [
    `Embers: ${state.embers}`,
    starterLine,
    migrationLine,
    formatRelicProgressionSummary(state),
  ].join('\n');
}

function findRelic(id: string) {
  return RELIC_DEFS.find((relic) => relic.id === id) ?? null;
}

export function buyRelicPathUnlock(state: ProgressionState): ProgressionResult {
  if (state.progression.relicPathUnlocked) {
    return { ok: false, reason: 'Relic path already unlocked.', state };
  }
  if (state.embers < RELIC_PATH_UNLOCK_COST) {
    return { ok: false, reason: 'Not enough Embers.', state };
  }
  return {
    ok: true,
    state: {
      embers: state.embers - RELIC_PATH_UNLOCK_COST,
      progression: {
        ...state.progression,
        relicPathUnlocked: true,
      },
    },
  };
}

export function buyRelicUnlock(state: ProgressionState, relicId: string): ProgressionResult {
  const relic = findRelic(relicId);
  if (!relic) return { ok: false, reason: 'Unknown relic.', state };
  if (!state.progression.relicPathUnlocked) {
    return { ok: false, reason: 'Unlock the relic path first.', state };
  }
  if (relic.unlockCost === 0) {
    return { ok: false, reason: 'Starter relics are always available.', state };
  }
  if (state.progression.unlockedRelicIds?.includes(relic.id)) {
    return { ok: false, reason: 'Relic already unlocked.', state };
  }
  if (state.embers < relic.unlockCost) {
    return { ok: false, reason: 'Not enough Embers.', state };
  }
  return {
    ok: true,
    state: {
      embers: state.embers - relic.unlockCost,
      progression: {
        ...state.progression,
        unlockedRelicIds: [...(state.progression.unlockedRelicIds ?? []), relic.id],
      },
    },
  };
}

export function setActiveStartingRelic(
  state: ProgressionState,
  relicId: RelicId | null,
): ProgressionResult {
  if (relicId === null) {
    return {
      ok: true,
      state: {
        ...state,
        progression: { ...state.progression, activeStartingRelicId: null },
      },
    };
  }
  const relic = findRelic(relicId);
  if (!relic) return { ok: false, reason: 'Unknown relic.', state };
  if (!state.progression.relicPathUnlocked) {
    return { ok: false, reason: 'Unlock the relic path first.', state };
  }
  if (!relic.startingRelicEligible) {
    return { ok: false, reason: 'This relic cannot start a run.', state };
  }
  const unlocked =
    relic.unlockCost === 0 || (state.progression.unlockedRelicIds ?? []).includes(relic.id);
  if (!unlocked) return { ok: false, reason: 'Relic is locked.', state };
  return {
    ok: true,
    state: {
      ...state,
      progression: { ...state.progression, activeStartingRelicId: relic.id },
    },
  };
}

export function formatRelicProgressionLine(state: ProgressionState, relicId: RelicId): string {
  const relic = relicDef(relicId);
  const status = !state.progression.relicPathUnlocked
    ? 'locked - unlock relic path first'
    : state.progression.activeStartingRelicId === relic.id
      ? 'active - starts next normal run'
      : relic.unlockCost === 0 || (state.progression.unlockedRelicIds ?? []).includes(relic.id)
        ? relic.startingRelicEligible
          ? 'unlocked - select as starting relic'
          : 'unlocked - in-run drops only'
        : `locked - ${relic.unlockCost} Embers`;
  return `${relic.name} (${relic.family}): ${status} | ${relic.description}`;
}

export function formatRelicProgressionSummary(state: ProgressionState): string {
  const pathLine = state.progression.relicPathUnlocked
    ? 'Relic path: unlocked - chests and elites can drop relics from your pool.'
    : `Relic path: locked - spend ${RELIC_PATH_UNLOCK_COST} Embers to unlock relic progression.`;
  const active = state.progression.activeStartingRelicId
    ? `Starting relic: ${relicDef(state.progression.activeStartingRelicId).name}.`
    : 'Starting relic: none selected.';
  return [pathLine, active].join('\n');
}
