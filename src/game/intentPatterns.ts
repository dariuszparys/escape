import type { CardEffect } from '../data/cards';

/**
 * One authored enemy action: what the telegraph says and what resolves when the beat plays.
 */
export interface IntentEntry {
  name: string;
  telegraph: string;
  effects: CardEffect[];
}

/**
 * An enemy's authored behavior: an ordered cycle that wraps around, plus an
 * optional boss special that interleaves every `interval` player turns.
 */
export interface IntentPattern {
  cycle: IntentEntry[];
  special?: { entry: IntentEntry; interval: number };
}

export type IntentKind = 'attack' | 'block' | 'status' | 'heal' | 'unknown';

/** Why a telegraphed intent was negated before its beat (R21 / smoke bomb). */
export type IntentVoidReason = 'stun' | 'smoke_bomb';

/**
 * What the telegraph shows the player (R5): the action's type and its raw
 * magnitude, never adjusted for the player's block or armor.
 */
export interface IntentView {
  name: string;
  telegraph: string;
  kind: IntentKind;
  magnitude: number;
}

/**
 * Mutable-per-turn intent bookkeeping carried inside the turn-battle state.
 * `current` is the telegraphed entry for this player turn; `cycleIndex` points
 * at the NEXT cycle entry to telegraph (the telegraph peeks, resolution consumes).
 */
export interface IntentState {
  pattern: IntentPattern;
  cycleIndex: number;
  current: IntentEntry | null;
  currentIsSpecial: boolean;
  voided: IntentVoidReason | null;
}

export function createIntentState(pattern: IntentPattern): IntentState {
  if (pattern.cycle.length === 0) {
    throw new Error('IntentPattern requires at least one cycle entry');
  }
  return { pattern, cycleIndex: 0, current: null, currentIsSpecial: false, voided: null };
}

/** Shallow clone: pattern and entries are immutable authored data and stay shared. */
export function cloneIntentState(state: IntentState): IntentState {
  return { ...state };
}

/**
 * Telegraph the intent for player turn `turn`. Boss specials fire on
 * `turn % interval === 0` (per-player-turn counter, matching the old round
 * semantics) and interleave the cycle without consuming it.
 */
export function telegraphIntent(state: IntentState, turn: number): IntentState {
  const special = state.pattern.special;
  if (special && turn > 0 && turn % special.interval === 0) {
    return { ...state, current: special.entry, currentIsSpecial: true, voided: null };
  }
  const entry = state.pattern.cycle[state.cycleIndex % state.pattern.cycle.length];
  return { ...state, current: entry, currentIsSpecial: false, voided: null };
}

/**
 * Consume the telegraphed intent after its beat resolved. Only a resolved cycle
 * entry advances the cycle; a special leaves it untouched so the cycle resumes
 * where it left off.
 */
export function resolveIntent(state: IntentState): IntentState {
  const cycleIndex = state.currentIsSpecial
    ? state.cycleIndex
    : (state.cycleIndex + 1) % state.pattern.cycle.length;
  return { ...state, cycleIndex, current: null, currentIsSpecial: false, voided: null };
}

/** Mark the telegraphed intent negated; its beat will fizzle instead of resolving. */
export function voidIntent(state: IntentState, reason: IntentVoidReason): IntentState {
  return { ...state, voided: reason };
}

/**
 * Clear a voided intent after its fizzled beat WITHOUT advancing the cycle:
 * stunning delays the action rather than skipping it — the enemy retries the
 * same cycle entry next turn (deliberate ruling, covered by tests). A voided
 * special is the exception by construction: it simply waits for its next interval.
 */
export function clearVoidedIntent(state: IntentState): IntentState {
  return { ...state, current: null, currentIsSpecial: false, voided: null };
}

/**
 * Derive the truthful telegraph view from an entry's effects (R5). Kind priority
 * is damage > block > status > heal; magnitude is the summed raw amount of the
 * winning kind, so the shown number always matches what the beat resolves.
 */
export function intentView(entry: IntentEntry): IntentView {
  const total = (kind: CardEffect['kind']): number =>
    entry.effects
      .filter((effect) => effect.kind === kind)
      .reduce((sum, effect) => sum + effect.amount, 0);
  const base = { name: entry.name, telegraph: entry.telegraph };
  const damage = total('damage');
  if (damage > 0) return { ...base, kind: 'attack', magnitude: damage };
  const block = total('block');
  if (block > 0) return { ...base, kind: 'block', magnitude: block };
  const status = total('status');
  if (status > 0) return { ...base, kind: 'status', magnitude: status };
  const heal = total('heal');
  if (heal > 0) return { ...base, kind: 'heal', magnitude: heal };
  return { ...base, kind: 'unknown', magnitude: 0 };
}

/**
 * Depth-empowered copy of a pattern: `bonus` damage is added to each entry's
 * heaviest hit (specials included). This restores the old model's second
 * scaling axis — enemy power grew with depth alongside HP — without touching
 * the authored cycle's character. Telegraphs stay truthful because the scaled
 * pattern is what both the telegraph and the beat read.
 */
export function empowerPattern(pattern: IntentPattern, bonus: number): IntentPattern {
  if (bonus <= 0) return pattern;
  const empowerEntry = (entry: IntentEntry): IntentEntry => {
    let heaviest = -1;
    entry.effects.forEach((effect, index) => {
      if (effect.kind !== 'damage') return;
      if (
        heaviest === -1 ||
        effect.amount > (entry.effects[heaviest] as { amount: number }).amount
      ) {
        heaviest = index;
      }
    });
    if (heaviest === -1) return entry;
    return {
      ...entry,
      effects: entry.effects.map((effect, index) =>
        index === heaviest && effect.kind === 'damage'
          ? { ...effect, amount: effect.amount + bonus }
          : effect,
      ),
    };
  };
  return {
    cycle: pattern.cycle.map(empowerEntry),
    special: pattern.special
      ? { interval: pattern.special.interval, entry: empowerEntry(pattern.special.entry) }
      : undefined,
  };
}
