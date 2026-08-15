export const SCENARIO_IDS = [
  'escape_the_dungeon',
  'im_poisoned',
  'lost_left_arm',
  'enemies_doubled',
] as const;

export type ScenarioId = (typeof SCENARIO_IDS)[number];

export interface ScenarioDef {
  id: ScenarioId;
  name: string;
  backstory: string;
  ruleSummary: string;
}

export const SCENARIOS: ScenarioDef[] = [
  {
    id: 'escape_the_dungeon',
    name: 'Escape the Dungeon',
    backstory:
      'You wake below the old stones with a single promise: reach the gate alive and leave the dungeon behind.',
    ruleSummary: 'A clean escape attempt. Keep your campfire loadout. Every finished run pays XP.',
  },
  {
    id: 'im_poisoned',
    name: "I'm Poisoned",
    backstory:
      'A bitter drink is already in your blood. Every room costs time, and time now costs life.',
    ruleSummary:
      'After the start room, lose 1-2 HP whenever you enter a new room. This can kill you before combat.',
  },
  {
    id: 'lost_left_arm',
    name: 'I Lost My Left Arm',
    backstory:
      'The shield arm is gone. You can still swing, move, and endure, but you cannot raise a guard.',
    ruleSummary:
      'You cannot gain block from any source. Block cards, shield items, and block-only relics are not offered.',
  },
  {
    id: 'enemies_doubled',
    name: 'Enemies Are Doubled',
    backstory:
      'Every footstep answers twice. The ordinary rooms are crowded, but the great threats still wait alone.',
    ruleSummary:
      'Normal encounters contain two enemies sharing a harsher encounter budget. Elites and bosses stay single fights.',
  },
];

export function scenarioDef(id: ScenarioId): ScenarioDef {
  const def = SCENARIOS.find((candidate) => candidate.id === id);
  if (!def) throw new Error(`Unknown scenario: ${id}`);
  return def;
}
