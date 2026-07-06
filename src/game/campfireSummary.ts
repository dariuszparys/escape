import { ARCHETYPES } from '../data/archetypes';
import { relicDef } from '../data/relics';
import type { DailyRecord } from '../daily';
import type { RunChronicle } from '../chronicle';
import type { MetaProgressionState } from '../meta';
import { levelForXp, xpForLevel, type ProfileState } from '../profile';
import { eligibleStartingRelics, hasStarterCardVariety } from './progression';

function activeArchetypeName(progression: MetaProgressionState): string {
  const archetype = progression.activeArchetypeId
    ? ARCHETYPES.find((candidate) => candidate.id === progression.activeArchetypeId)
    : null;
  return archetype?.name ?? 'none';
}

export function formatProfileProgressLine(profile: ProfileState): string {
  const level = levelForXp(profile.xp);
  const nextLevelXp = xpForLevel(level + 1);
  return nextLevelXp > profile.xp
    ? `Level ${level} - ${profile.xp}/${nextLevelXp} XP`
    : `Level ${level} - ${profile.xp} XP`;
}

export function formatCampfireProgressionSummary(
  progression: MetaProgressionState,
  profile: ProfileState,
): string {
  const eligibleRelics = eligibleStartingRelics(profile);
  return [
    `Archetype: ${activeArchetypeName(progression)}`,
    `Starter variety: ${hasStarterCardVariety(profile) ? 'unlocked' : 'level 4'}`,
    `Discovered relics: ${profile.discoveredRelicIds.length}`,
    `Starting relic choices: ${eligibleRelics.length}`,
    progression.activeStartingRelicId
      ? `Starting relic: ${relicDef(progression.activeStartingRelicId).name}`
      : 'Starting relic: none',
    `Personal best: room ${profile.personalBestRoom}`,
  ].join('\n');
}

export function formatChronicleLine(chronicle: RunChronicle): string {
  return chronicle.runsCompleted === 0
    ? 'No completed runs yet'
    : `Runs ${chronicle.runsCompleted} | Escapes ${chronicle.escapes} | Best room ${chronicle.bestDepth} | Best gold ${chronicle.bestGold}`;
}

export function formatDailyRecordLine(record: DailyRecord): string {
  return `Daily ${record.date} - best room ${record.bestDepth}, escaped: ${record.escaped ? 'yes' : 'no'}`;
}
