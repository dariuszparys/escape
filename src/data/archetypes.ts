import type { ArchetypeId } from './cards';

/**
 * Display metadata for the selectable player archetypes. The mechanical truth lives in the card
 * data (`cards.ts` archetype tags) and the pick pools (`startingCards.ts`); this table only names
 * and blurbs them for the Progression screen and the Campfire summary.
 */
export interface ArchetypeDef {
  id: ArchetypeId;
  name: string;
  /** Short chip shown next to the name, e.g. "Rage & Might". */
  tagline: string;
  /** One-line identity blurb for the selection row. */
  description: string;
}

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
