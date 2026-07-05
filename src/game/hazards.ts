import { TRAP_DAMAGE } from '../config';
import type { RunState } from '../state';

export interface TrapDamageResult {
  amount: number;
  hpBefore: number;
  hpAfter: number;
  died: boolean;
}

/** Spike-trap contact damage (rules only — invulnerability windows and FX stay in the scene). */
export function applyTrapDamage(run: Pick<RunState, 'hp'>): TrapDamageResult {
  const hpBefore = run.hp;
  run.hp = Math.max(0, run.hp - TRAP_DAMAGE);
  return { amount: TRAP_DAMAGE, hpBefore, hpAfter: run.hp, died: run.hp <= 0 };
}
