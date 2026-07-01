import type { StatusEffectType } from '../data/cards';
import type { RelicId } from '../data/relics';

/**
 * The controlled mutation surface a `battleWon` subscriber writes into (KTD2). Kept minimal for
 * the keystone: the only real subscriber (vampiric_blade, U4) heals the run. The driver reads
 * this back after emit and applies it, so subscribers never touch Phaser or the run directly.
 */
export interface BattleWonResult {
  heal: number;
}

/**
 * The combat/battle event bus's canonical event set — exactly four (KTD2). Round-level events
 * (`roundStart`, `damageDealt`, `statusApplied`) are emitted from inside `resolveRound`; the
 * battle-level `battleWon` is emitted by the drivers, since victory is detected by the caller.
 * The dispatch signature threads no `rng`, so the framework never invites RNG into a subscriber.
 */
export type CombatEvent =
  | { readonly type: 'roundStart' }
  | {
      readonly type: 'damageDealt';
      readonly sourceId: string;
      readonly targetId: string;
      readonly amount: number;
    }
  | {
      readonly type: 'statusApplied';
      readonly targetId: string;
      readonly status: StatusEffectType;
      readonly amount: number;
      readonly remainingTurns: number;
    }
  | {
      readonly type: 'battleWon';
      readonly relicIds: readonly RelicId[];
      readonly result: BattleWonResult;
    };

export type CombatEventType = CombatEvent['type'];
export type CombatEventOf<T extends CombatEventType> = Extract<CombatEvent, { type: T }>;
export type CombatEventSubscriber = (event: CombatEvent) => void;

/** Per-type, registration-ordered subscriber lists. Type-keying keeps the round-level emit path free of any `battleWon` subscriber's cost. */
const subscribers = new Map<CombatEventType, CombatEventSubscriber[]>();

/** Subscribe to one event type. Handlers fire in registration order. Returns a disposer. */
export function subscribeCombatEvent<T extends CombatEventType>(
  type: T,
  handler: (event: CombatEventOf<T>) => void,
): () => void {
  const list = subscribers.get(type) ?? [];
  list.push(handler as CombatEventSubscriber);
  subscribers.set(type, list);
  return () => {
    const current = subscribers.get(type);
    if (!current) return;
    const index = current.indexOf(handler as CombatEventSubscriber);
    if (index >= 0) current.splice(index, 1);
  };
}

/** Cheap guard for the hot round-level emit path: skip payload construction when nobody is listening. */
export function hasCombatEventSubscribers(type: CombatEventType): boolean {
  return (subscribers.get(type)?.length ?? 0) > 0;
}

/** Synchronously notify every subscriber of `event.type` in registration order. Consumes no RNG (KTD2/R3). */
export function emitCombatEvent(event: CombatEvent): void {
  const list = subscribers.get(event.type);
  if (!list) return;
  for (const handler of list) handler(event);
}

/**
 * Emit `battleWon` for a run's owned relics and return the aggregated result the driver applies.
 * With no subscriber registered this is inert (`{ heal: 0 }`); U4 binds `vampiric_blade` to it.
 */
export function emitBattleWon(relicIds: readonly RelicId[]): BattleWonResult {
  const result: BattleWonResult = { heal: 0 };
  emitCombatEvent({ type: 'battleWon', relicIds, result });
  return result;
}
