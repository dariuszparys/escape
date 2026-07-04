import type { Card, StatusEffectType } from '../data/cards';
import type { RelicId } from '../data/relics';
import type { IntentKind, IntentVoidReason } from './intentPatterns';

/**
 * The controlled mutation surface a `battleWon` subscriber writes into (KTD2). Kept minimal for
 * the keystone: the only real subscriber (vampiric_blade, U4) heals the run. The driver reads
 * this back after emit and applies it, so subscribers never touch Phaser or the run directly.
 */
export interface BattleWonResult {
  heal: number;
}

/**
 * The combat/battle event bus's canonical event set. `damageDealt` and
 * `statusApplied` are emitted live from the effect handlers during resolution;
 * the battle-level `battleWon` is emitted by the drivers (scene, simulator)
 * after victory, since rewards precede it. The dispatch signature threads no
 * `rng`, so the framework never invites RNG into a subscriber.
 *
 * The turn-lifecycle events extend the union for the turn engine (KTD3): the
 * engine returns them as an ordered presentation list that the queue replays,
 * and mirrors them onto this bus for future subscribers. Events carry
 * post-mutation values (`hpAfter`, `blockAfter`, pile counts) so a presentation
 * executor can render each step without consulting engine state.
 */
export type CombatEvent =
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
    }
  | { readonly type: 'turnStarted'; readonly turn: number }
  | { readonly type: 'blockExpired'; readonly targetId: string; readonly amount: number }
  | {
      readonly type: 'statusTicked';
      readonly targetId: string;
      readonly status: StatusEffectType;
      readonly amount: number;
      readonly hpAfter: number;
      readonly remainingTurns: number;
    }
  | {
      // A timed modifier debuff (vulnerable/weak/frail) counting down by one at the end of the
      // afflicted side's action (B4). Silent — no HP change, no damage pop — the HUD just
      // decrements or drops it. Distinct from `statusTicked`, which is a DoT dealing HP damage.
      readonly type: 'statusFaded';
      readonly targetId: string;
      readonly status: StatusEffectType;
      readonly remainingTurns: number;
    }
  | { readonly type: 'stunned'; readonly targetId: string }
  | { readonly type: 'energyChanged'; readonly energy: number; readonly max: number }
  | {
      readonly type: 'cardDrawn';
      readonly card: Card;
      readonly handCount: number;
      readonly drawCount: number;
      readonly discardCount: number;
    }
  | { readonly type: 'reshuffled'; readonly count: number }
  | {
      readonly type: 'intentTelegraphed';
      /** Which enemy is telegraphing — routes the panel/marker to its sprite in a pack (multi-enemy). */
      readonly sourceId: string;
      readonly name: string;
      readonly telegraph: string;
      readonly kind: IntentKind;
      readonly magnitude: number;
    }
  | { readonly type: 'intentVoided'; readonly sourceId: string; readonly reason: IntentVoidReason }
  | {
      readonly type: 'cardPlayed';
      readonly card: Card;
      readonly cost: number;
      readonly energyAfter: number;
    }
  | {
      readonly type: 'damageResolved';
      readonly sourceId: string;
      readonly targetId: string;
      readonly amount: number;
      readonly blockAbsorbed: number;
      readonly hpAfter: number;
      readonly blockAfter: number;
    }
  | {
      readonly type: 'blockGained';
      readonly targetId: string;
      readonly amount: number;
      readonly blockAfter: number;
    }
  | {
      readonly type: 'healed';
      readonly targetId: string;
      readonly amount: number;
      readonly hpAfter: number;
    }
  | { readonly type: 'cardDiscarded'; readonly card: Card; readonly discardCount: number }
  | { readonly type: 'cardExhausted'; readonly card: Card; readonly exhaustCount: number }
  | { readonly type: 'handDiscarded'; readonly count: number; readonly discardCount: number }
  | { readonly type: 'itemUsed'; readonly itemName: string }
  | { readonly type: 'enemyBeatStarted'; readonly sourceId: string; readonly name: string }
  | {
      readonly type: 'enemyBeatFizzled';
      readonly sourceId: string;
      readonly reason: IntentVoidReason;
    }
  | {
      readonly type: 'noPlayableCards';
      readonly reason: 'empty_hand' | 'unaffordable' | 'stunned';
    }
  | { readonly type: 'battleEnded'; readonly outcome: 'victory' | 'defeat' };

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
