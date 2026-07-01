import type { CardEffect } from '../data/cards';

export type ActionFamily = 'attack' | 'block' | 'heal' | 'status' | 'special' | 'mixed';
export type MatchupRole = 'aggression' | 'defense' | 'disruption';
export type MatchupOutcome = 'win' | 'lose' | 'tie' | 'neutral';

export interface MatchupResult {
  playerRole: MatchupRole | null;
  enemyRole: MatchupRole | null;
  outcome: MatchupOutcome;
}

export function familyForEffects(effects: readonly CardEffect[]): ActionFamily {
  const hasDamage = effects.some((effect) => effect.kind === 'damage');
  const hasBlock = effects.some((effect) => effect.kind === 'block');
  const hasHeal = effects.some((effect) => effect.kind === 'heal');
  const hasStatus = effects.some((effect) => effect.kind === 'status');

  if (hasStatus) return hasDamage || hasBlock || hasHeal ? 'mixed' : 'status';
  if (hasDamage && (hasBlock || hasHeal)) return 'mixed';
  if (hasDamage) return 'attack';
  if (hasBlock && hasHeal) return 'mixed';
  if (hasBlock) return 'block';
  if (hasHeal) return 'heal';
  return 'mixed';
}

export function roleForFamily(family: ActionFamily): MatchupRole | null {
  if (family === 'attack') return 'aggression';
  if (family === 'block') return 'defense';
  if (family === 'heal' || family === 'status') return 'disruption';
  return null;
}

export function roleLabel(role: MatchupRole): string {
  if (role === 'aggression') return 'Aggression';
  if (role === 'defense') return 'Defense';
  return 'Disruption';
}

export function intentTitleForFamily(family: ActionFamily): string {
  if (family === 'attack') return 'Attack intent';
  if (family === 'block') return 'Block intent';
  if (family === 'heal') return 'Healing intent';
  if (family === 'status') return 'Status intent';
  if (family === 'special') return 'Special intent';
  return 'Mixed intent';
}

export function counterRoleFor(role: MatchupRole): MatchupRole {
  if (role === 'aggression') return 'defense';
  if (role === 'defense') return 'disruption';
  return 'aggression';
}

export function roleBeats(attacker: MatchupRole, defender: MatchupRole): boolean {
  return counterRoleFor(defender) === attacker;
}

export function matchupResult(
  playerFamily: ActionFamily,
  enemyFamily: ActionFamily,
): MatchupResult {
  const playerRole = roleForFamily(playerFamily);
  const enemyRole = roleForFamily(enemyFamily);
  if (!playerRole || !enemyRole) return { playerRole, enemyRole, outcome: 'neutral' };
  if (playerRole === enemyRole) return { playerRole, enemyRole, outcome: 'tie' };
  if (roleBeats(playerRole, enemyRole)) return { playerRole, enemyRole, outcome: 'win' };
  return { playerRole, enemyRole, outcome: 'lose' };
}

export function counterTextForFamily(family: ActionFamily): string {
  const role = roleForFamily(family);
  if (!role) return 'No counter bonus';
  return `${roleLabel(counterRoleFor(role))} counters ${roleLabel(role)}`;
}
