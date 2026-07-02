import type { StatusEffectType } from '../data/cards';
import type { ActiveStatusEffect, MutableCombatant } from './combat';
import { emitCombatEvent, hasCombatEventSubscribers } from './combatEvents';

/**
 * The open resolution shape (KTD1). Authored content stays typed as the closed `CardEffect`
 * union; the resolver operates on this broader shape so a *new* kind can be registered without
 * editing the dispatch body. `CardEffect` is assignable to `ResolvableEffect`, so authored cards
 * flow through unchanged while remaining compile-checked at their authoring site.
 */
export interface ResolvableEffect {
  readonly kind: string;
  readonly amount?: number;
  readonly status?: StatusEffectType;
  readonly duration?: number;
}

/**
 * What a handler may read and mutate: the acting/target combatants and the round log.
 * The optional hooks reach engine state the combatant pair cannot (piles, energy); the
 * turn engine supplies them, the round-based resolver does not — handlers that need a
 * hook no-op gracefully when it is absent.
 */
export interface EffectContext {
  actor: MutableCombatant;
  target: MutableCombatant;
  log: string[];
  drawCards?: (count: number) => void;
  gainEnergy?: (amount: number) => void;
}

export type EffectHandler = (effect: ResolvableEffect, ctx: EffectContext) => void;

const handlers = new Map<string, EffectHandler>();

/**
 * Register a resolver for an effect kind. Returns a disposer that removes it again — used by
 * tests that register a custom kind (the open-union proof, R1) so they don't leak global state.
 */
export function registerEffectHandler(kind: string, handler: EffectHandler): () => void {
  handlers.set(kind, handler);
  return () => {
    if (handlers.get(kind) === handler) handlers.delete(kind);
  };
}

export function hasEffectHandler(kind: string): boolean {
  return handlers.has(kind);
}

/**
 * Resolve one effect through its registered handler. An unregistered kind is a programming
 * error — the authoring union is exhaustive — so this throws rather than silently no-oping
 * (per Assumptions), surfacing a missing registration loudly in dev/test.
 */
export function dispatchEffect(effect: ResolvableEffect, ctx: EffectContext): void {
  const handler = handlers.get(effect.kind);
  if (!handler) {
    throw new Error(`dispatchEffect: no effect handler registered for kind "${effect.kind}"`);
  }
  handler(effect, ctx);
}

function formatStatusLine(status: ActiveStatusEffect): string {
  if (status.type === 'stun') return 'stunned';
  const rounds = `${status.remainingTurns} round${status.remainingTurns === 1 ? '' : 's'}`;
  return `${status.type}ed (${status.amount} for ${rounds})`;
}

function addStatus(target: MutableCombatant, status: ActiveStatusEffect): void {
  const existing = target.statuses.find((candidate) => candidate.type === status.type);
  if (!existing) {
    target.statuses.push(status);
    return;
  }
  existing.amount = Math.max(existing.amount, status.amount);
  existing.remainingTurns = Math.max(existing.remainingTurns, status.remainingTurns);
}

// Built-in resolvers, registered at module load. Registering them here — rather than in
// a switch — is what lets a new kind be added by registration alone (R1).
registerEffectHandler('block', (effect, { actor, log }) => {
  const amount = effect.amount ?? 0;
  actor.roundBlock += amount;
  log.push(`${actor.name} gains ${amount} block`);
});

registerEffectHandler('heal', (effect, { actor, log }) => {
  const amount = effect.amount ?? 0;
  const healed = Math.min(actor.maxHp, actor.hp + amount) - actor.hp;
  actor.hp += healed;
  if (healed > 0) log.push(`${actor.name} heals ${healed} HP`);
});

registerEffectHandler('damage', (effect, { actor, target, log }) => {
  const reduction = target.armor + target.roundBlock;
  const dealt = Math.max(0, (effect.amount ?? 0) - reduction);
  target.hp = Math.max(0, target.hp - dealt);
  if (dealt > 0) log.push(`${target.name} takes ${dealt} damage`);
  else log.push(`${target.name} blocks the hit`);
  if (hasCombatEventSubscribers('damageDealt')) {
    emitCombatEvent({
      type: 'damageDealt',
      sourceId: actor.id,
      targetId: target.id,
      amount: dealt,
    });
  }
});

registerEffectHandler('draw', (effect, { actor, log, drawCards }) => {
  const count = effect.amount ?? 0;
  if (!drawCards || count <= 0) return;
  drawCards(count);
  log.push(`${actor.name} draws ${count} card${count === 1 ? '' : 's'}`);
});

registerEffectHandler('energy', (effect, { actor, log, gainEnergy }) => {
  const amount = effect.amount ?? 0;
  if (!gainEnergy || amount <= 0) return;
  gainEnergy(amount);
  log.push(`${actor.name} gains ${amount} energy`);
});

registerEffectHandler('status', (effect, { target, log }) => {
  const type = effect.status;
  if (!type) return; // authored status effects always carry a type; defensive no-op otherwise
  const amount = effect.amount ?? 0;
  const remainingTurns = effect.duration ?? 0;
  addStatus(target, { type, amount, remainingTurns });
  const current = target.statuses.find((status) => status.type === type);
  if (current) log.push(`${target.name} is ${formatStatusLine(current)}`);
  if (hasCombatEventSubscribers('statusApplied')) {
    emitCombatEvent({
      type: 'statusApplied',
      targetId: target.id,
      status: type,
      amount,
      remainingTurns,
    });
  }
});
