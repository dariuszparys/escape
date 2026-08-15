import type { ArchetypeId } from '../data/cards';
import { ARCHETYPES, archetypeDef } from '../data/archetypes';
import { RUN_LENGTH } from '../config';
import { chapterForDepth, nextGateRoom } from '../dungeon/rooms';
import { hasStarterCardVariety } from './progression';
import { formatChargeLine } from './contracts';
import { levelForXp, type ProfileState } from '../profile';

export function formatChapterGoal(personalBestRoom: number): string {
  if (personalBestRoom >= RUN_LENGTH) return 'Escape the dungeon again.';
  const room = nextGateRoom(personalBestRoom);
  const chapter = chapterForDepth(room);
  if (room === RUN_LENGTH) return `Reach ${chapter.gateName} (room ${RUN_LENGTH}) and escape.`;
  return `Reach ${chapter.gateName} (room ${room}).`;
}

export function formatChapterDeathLine(depth: number): string {
  return `The ${chapterForDepth(depth).name} claimed you in room ${depth}.`;
}

/** Cycle the unplayed fantasy so death always names a different class to try. */
export function suggestedNextArchetype(current: ArchetypeId | null): ArchetypeId {
  if (current === 'barbarian') return 'ranger';
  if (current === 'ranger') return 'necromancer';
  return 'barbarian';
}

export function formatNextFantasyLine(current: ArchetypeId | null): string {
  const next = archetypeDef(suggestedNextArchetype(current));
  if (current === null) {
    return `Next: pick a path at the fire - start with ${next.name} (${next.tagline}).`;
  }
  return `Next: try ${next.name} - ${next.tagline}.`;
}

export function formatUnlockHookLine(profile: ProfileState): string | null {
  const level = levelForXp(profile.xp);
  if (level < 2) return 'Clear the First Gate to unlock a starting relic.';
  if (!hasStarterCardVariety(profile)) return 'Reach level 4 to unlock starter variety.';
  return null;
}

export function formatCampfireRunGoal(
  personalBestRoom: number,
  completedContractIds: readonly string[],
): string {
  const charge = formatChargeLine(completedContractIds);
  return [formatChapterGoal(personalBestRoom), charge].filter(Boolean).join('\n');
}

export function formatDeathHookLines(
  depth: number,
  archetypeId: ArchetypeId | null,
  profile: ProfileState,
  completedContractIds: readonly string[],
): string[] {
  const charge = formatChargeLine(completedContractIds);
  const hook = charge ?? formatUnlockHookLine(profile);
  return [formatChapterDeathLine(depth), formatNextFantasyLine(archetypeId), hook].filter(
    (line): line is string => Boolean(line),
  );
}

export function formatPathPrompt(activeArchetypeId: ArchetypeId | null): string {
  if (activeArchetypeId) {
    const active = ARCHETYPES.find((archetype) => archetype.id === activeArchetypeId);
    return active ? `PATH - ${active.name}` : 'PATH';
  }
  return 'PICK A PATH';
}
