import type { ArchetypeId } from './cards';

/**
 * Display metadata for the selectable player archetypes. The mechanical truth lives in the card
 * data (`cards.ts` archetype tags) and the pick pools (`startingCards.ts`); this table only names
 * and blurbs them for the Progression screen and the Campfire class beat.
 */
export interface ArchetypeDef {
  id: ArchetypeId;
  name: string;
  /** Short chip shown next to the name, e.g. "Rage & Might". */
  tagline: string;
  /** One-line identity blurb for the selection row. */
  description: string;
}

/** Neutral "no class" option shown beside the three archetypes on Campfire. */
export interface CampfireClassOption {
  id: ArchetypeId | null;
  name: string;
  tagline: string;
  description: string;
}

export const WANDERER: CampfireClassOption = {
  id: null,
  name: 'Wanderer',
  tagline: 'Neutral cards',
  description: 'Neutral cards only. No class fantasy.',
};

export const ARCHETYPES: ArchetypeDef[] = [
  {
    id: 'barbarian',
    name: 'Barbarian',
    tagline: 'Rage & Might',
    description:
      'Builds Strength and throws big reckless hits. Cleave, Warpath, Frenzy, and exhausting finishers.',
  },
  {
    id: 'necromancer',
    name: 'Necromancer',
    tagline: 'Rot & Drain',
    description:
      'Poison and burn wear the enemy down while life-steal keeps you standing. A slow, sustaining clock.',
  },
  {
    id: 'ranger',
    name: 'Ranger',
    tagline: 'Precision & Tempo',
    description:
      'Multi-hit volleys and card draw, marking prey Vulnerable so every follow-up shot lands harder.',
  },
];

export function archetypeDef(id: ArchetypeId): ArchetypeDef {
  const def = ARCHETYPES.find((candidate) => candidate.id === id);
  if (!def) throw new Error(`Unknown archetype: ${id}`);
  return def;
}

export function campfireClassOptions(): CampfireClassOption[] {
  return [
    ...ARCHETYPES.map((archetype) => ({
      id: archetype.id,
      name: archetype.name,
      tagline: archetype.tagline,
      description: archetype.description,
    })),
    WANDERER,
  ];
}

export function campfireClassOption(id: ArchetypeId | null): CampfireClassOption {
  return campfireClassOptions().find((option) => option.id === id) ?? WANDERER;
}
