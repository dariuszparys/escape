import type { MetaProgressionState } from '../meta';
import { CARD_DEFS, type ArchetypeId } from '../data/cards';
import { ARCHETYPES, archetypeDef } from '../data/archetypes';
import {
  isArchetypeLevelEligible,
  isRelicLevelEligible,
  requiredLevelForArchetype,
  requiredLevelForRelic,
  unlocksForLevel,
} from '../data/levelUnlocks';
import { RELIC_DEFS, relicDef, type RelicDef, type RelicId } from '../data/relics';
import { levelForXp, type ProfileState } from '../profile';
import { ARCHETYPE_STARTING_CARD_IDS } from './startingCards';

export interface ProgressionState {
  progression: MetaProgressionState;
}

type ProgressionResult<T extends ProgressionState> =
  | { ok: true; state: T }
  | { ok: false; reason: string; state: T };

function withProgression<T extends ProgressionState>(
  state: T,
  progression: MetaProgressionState,
): T {
  return {
    ...state,
    progression,
  };
}

export function hasStarterCardVariety(profile: ProfileState): boolean {
  return unlocksForLevel(levelForXp(profile.xp)).starterCardVariety;
}

export function isArchetypeUnlocked(profile: ProfileState, archetypeId: ArchetypeId): boolean {
  return isArchetypeLevelEligible(levelForXp(profile.xp), archetypeId);
}

export function isStartingRelicEligible(profile: ProfileState, relicId: RelicId): boolean {
  const relic = RELIC_DEFS.find((candidate) => candidate.id === relicId);
  if (!relic?.startingRelicEligible) return false;
  const level = levelForXp(profile.xp);
  if (unlocksForLevel(level).startingRelicSlots <= 0) return false;
  return profile.discoveredRelicIds.includes(relicId) && isRelicLevelEligible(level, relicId);
}

export function eligibleStartingRelics(profile: ProfileState): RelicDef[] {
  return RELIC_DEFS.filter((relic) => isStartingRelicEligible(profile, relic.id));
}

export function setActiveArchetype<T extends ProgressionState>(
  state: T,
  profile: ProfileState,
  archetypeId: ArchetypeId | null,
): ProgressionResult<T> {
  if (archetypeId === null) {
    return {
      ok: true,
      state: withProgression(state, {
        ...state.progression,
        activeArchetypeId: null,
      }),
    };
  }

  if (!ARCHETYPES.some((archetype) => archetype.id === archetypeId)) {
    return { ok: false, reason: 'Unknown archetype.', state };
  }

  if (!isArchetypeUnlocked(profile, archetypeId)) {
    const requiredLevel = requiredLevelForArchetype(archetypeId);
    return {
      ok: false,
      reason: requiredLevel
        ? `Archetype requires level ${requiredLevel}.`
        : 'Archetype is not unlockable.',
      state,
    };
  }

  return {
    ok: true,
    state: withProgression(state, {
      ...state.progression,
      activeArchetypeId: archetypeId,
    }),
  };
}

export function setActiveStartingRelic<T extends ProgressionState>(
  state: T,
  profile: ProfileState,
  relicId: RelicId | null,
): ProgressionResult<T> {
  if (relicId === null) {
    return {
      ok: true,
      state: withProgression(state, {
        ...state.progression,
        activeStartingRelicId: null,
      }),
    };
  }

  const relic = RELIC_DEFS.find((candidate) => candidate.id === relicId);
  if (!relic) return { ok: false, reason: 'Unknown relic.', state };
  if (!relic.startingRelicEligible) {
    return { ok: false, reason: 'This relic cannot start a run.', state };
  }

  const level = levelForXp(profile.xp);
  if (unlocksForLevel(level).startingRelicSlots <= 0) {
    return { ok: false, reason: 'No starting relic slot unlocked.', state };
  }

  if (!profile.discoveredRelicIds.includes(relicId)) {
    return { ok: false, reason: 'Relic is not discovered.', state };
  }

  if (!isRelicLevelEligible(level, relicId)) {
    const requiredLevel = requiredLevelForRelic(relicId);
    return {
      ok: false,
      reason: requiredLevel ? `Relic requires level ${requiredLevel}.` : 'Relic is not unlockable.',
      state,
    };
  }

  return {
    ok: true,
    state: withProgression(state, {
      ...state.progression,
      activeStartingRelicId: relic.id,
    }),
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
  profile: ProfileState,
  archetypeId: ArchetypeId,
): string {
  const def = archetypeDef(archetypeId);
  const active = state.progression.activeArchetypeId === archetypeId;
  const unlocked = isArchetypeUnlocked(profile, archetypeId);
  const requiredLevel = requiredLevelForArchetype(archetypeId);
  const status = active
    ? 'active - shapes next run'
    : unlocked
      ? 'available - select for next run'
      : `locked - level ${requiredLevel ?? '?'}`;
  return `${def.name} (${def.tagline}): ${status} | ${def.description} | Opens with: ${archetypePickNames(archetypeId).join(', ')}`;
}

export function formatArchetypeSelectionSummary(state: ProgressionState): string {
  const active = state.progression.activeArchetypeId;
  return active
    ? `Archetype: ${archetypeDef(active).name} - every card draw is ${archetypeDef(active).name}-flavored.`
    : 'Archetype: none - standard cards only.';
}

export function formatStarterCardProgressionSummary(profile: ProfileState): string {
  const level = levelForXp(profile.xp);
  const unlocked = hasStarterCardVariety(profile);
  return [
    `Level ${level} - ${profile.xp} lifetime XP.`,
    unlocked
      ? 'Starter variety: unlocked - four opening card options.'
      : 'Starter variety: unlocks at level 4.',
  ].join('\n');
}

export function formatRelicProgressionLine(
  state: ProgressionState,
  profile: ProfileState,
  relicId: RelicId,
): string {
  const relic = relicDef(relicId);
  const level = levelForXp(profile.xp);
  const active = state.progression.activeStartingRelicId === relic.id;
  const discovered = profile.discoveredRelicIds.includes(relic.id);
  const requiredLevel = requiredLevelForRelic(relic.id);
  const levelEligible = isRelicLevelEligible(level, relic.id);
  const status = active
    ? 'active - starts next run'
    : !discovered
      ? 'undiscovered - find it during a run'
      : !levelEligible
        ? `discovered - requires level ${requiredLevel ?? '?'}`
        : relic.startingRelicEligible
          ? 'available - select as starting relic'
          : 'discovered - in-run drops only';
  return `${relic.name} (${relic.family}): ${status} | ${relic.description}`;
}

export function formatRelicProgressionSummary(
  state: ProgressionState,
  profile: ProfileState,
): string {
  const discovered = profile.discoveredRelicIds.length;
  const active = state.progression.activeStartingRelicId
    ? `Starting relic: ${relicDef(state.progression.activeStartingRelicId).name}.`
    : 'Starting relic: none selected.';
  const eligibleCount = eligibleStartingRelics(profile).length;
  return [
    `Discovered relics: ${discovered}/${RELIC_DEFS.length}.`,
    `Loadout choices: ${eligibleCount} starting relic${eligibleCount === 1 ? '' : 's'} available.`,
    'Drop pool: all relics can appear during runs.',
    active,
  ].join('\n');
}
