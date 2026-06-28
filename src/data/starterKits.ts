export type StarterKitId = 'duelist' | 'warden' | 'hexbinder';

export interface StarterKitDef {
  id: StarterKitId;
  name: string;
  archetype: string;
  cost: number;
  description: string;
  signatureCardId: string;
}

export const STARTER_KIT_COST = 6;

export const STARTER_KITS: StarterKitDef[] = [
  {
    id: 'duelist',
    name: 'Duelist',
    archetype: 'Aggression',
    cost: STARTER_KIT_COST,
    description: 'Opens with a fast counterattack that keeps pressure while adding a little guard.',
    signatureCardId: 'riposte',
  },
  {
    id: 'warden',
    name: 'Warden',
    archetype: 'Defense / sustain',
    cost: STARTER_KIT_COST,
    description: 'Opens with a field patch that stabilizes early damage without raising max HP.',
    signatureCardId: 'field_dressing',
  },
  {
    id: 'hexbinder',
    name: 'Hexbinder',
    archetype: 'Status / tempo',
    cost: STARTER_KIT_COST,
    description: 'Opens with a small burn curse that rewards slower status-focused fights.',
    signatureCardId: 'cinder_hex',
  },
];

export function starterKitDef(id: string): StarterKitDef {
  const kit = STARTER_KITS.find((candidate) => candidate.id === id);
  if (!kit) {
    throw new Error(`Unknown starter kit: ${id}`);
  }

  return kit;
}
