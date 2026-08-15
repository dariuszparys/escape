import type { ArchetypeId } from './cards';
import { STARTER_RELIC_IDS, type RelicId } from './relics';

export interface LevelUnlockEntry {
  level: number;
  archetypeIds?: ArchetypeId[];
  startingRelicSlots?: number;
  starterCardVariety?: boolean;
  relicIds?: RelicId[];
}

export interface ResolvedLevelUnlocks {
  archetypeIds: ArchetypeId[];
  startingRelicSlots: number;
  starterCardVariety: boolean;
  relicIds: RelicId[];
}

export const LEVEL_UNLOCKS: LevelUnlockEntry[] = [
  { level: 1, archetypeIds: ['barbarian', 'ranger', 'necromancer'] },
  { level: 2, startingRelicSlots: 1, relicIds: STARTER_RELIC_IDS },
  { level: 4, starterCardVariety: true },
  { level: 5, relicIds: ['spark_coil', 'vital_charm'] },
  { level: 6, relicIds: ['stone_heart', 'merchants_seal'] },
  { level: 7, relicIds: ['venom_ring', 'hunter_charm'] },
  { level: 8, relicIds: ['hoarders_map', 'wanderers_flask'] },
];

export function unlocksForLevel(level: number): ResolvedLevelUnlocks {
  const normalizedLevel =
    typeof level === 'number' && Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
  const archetypeIds: ArchetypeId[] = [];
  const relicIds: RelicId[] = [];
  let startingRelicSlots = 0;
  let starterCardVariety = false;

  for (const entry of LEVEL_UNLOCKS) {
    if (entry.level > normalizedLevel) continue;
    for (const archetypeId of entry.archetypeIds ?? []) {
      if (!archetypeIds.includes(archetypeId)) archetypeIds.push(archetypeId);
    }
    for (const relicId of entry.relicIds ?? []) {
      if (!relicIds.includes(relicId)) relicIds.push(relicId);
    }
    startingRelicSlots = Math.max(startingRelicSlots, entry.startingRelicSlots ?? 0);
    starterCardVariety = starterCardVariety || entry.starterCardVariety === true;
  }

  return {
    archetypeIds,
    startingRelicSlots,
    starterCardVariety,
    relicIds,
  };
}

export function isArchetypeLevelEligible(level: number, archetypeId: ArchetypeId): boolean {
  return unlocksForLevel(level).archetypeIds.includes(archetypeId);
}

export function isRelicLevelEligible(level: number, relicId: RelicId): boolean {
  return unlocksForLevel(level).relicIds.includes(relicId);
}

export function requiredLevelForArchetype(archetypeId: ArchetypeId): number | null {
  for (const entry of LEVEL_UNLOCKS) {
    if (entry.archetypeIds?.includes(archetypeId)) return entry.level;
  }
  return null;
}

export function requiredLevelForRelic(relicId: RelicId): number | null {
  for (const entry of LEVEL_UNLOCKS) {
    if (entry.relicIds?.includes(relicId)) return entry.level;
  }
  return null;
}
