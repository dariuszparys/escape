import { describe, expect, test } from 'vitest';
import {
  clearVoidedIntent,
  createIntentState,
  IntentEntry,
  IntentPattern,
  intentView,
  resolveIntent,
  telegraphIntent,
  voidIntent,
  empowerPattern,
} from './intentPatterns';

const slash: IntentEntry = {
  name: 'Slash',
  telegraph: 'raises a blade...',
  effects: [{ kind: 'damage', amount: 7 }],
};
const brace: IntentEntry = {
  name: 'Brace',
  telegraph: 'hunkers down...',
  effects: [
    { kind: 'block', amount: 6 },
    { kind: 'damage', amount: 3 },
  ],
};
const curse: IntentEntry = {
  name: 'Curse',
  telegraph: 'chants...',
  effects: [{ kind: 'status', status: 'burn', amount: 2, duration: 2 }],
};

const pattern: IntentPattern = { cycle: [slash, brace, curse] };

describe('intent cycle', () => {
  test('requires at least one entry', () => {
    expect(() => createIntentState({ cycle: [] })).toThrow();
  });

  test('telegraph peeks, resolution consumes, and the cycle wraps around', () => {
    let state = createIntentState(pattern);
    const seen: string[] = [];
    for (let turn = 1; turn <= 4; turn++) {
      state = telegraphIntent(state, turn);
      seen.push(state.current!.name);
      state = resolveIntent(state);
    }
    expect(seen).toEqual(['Slash', 'Brace', 'Curse', 'Slash']);
  });

  test('telegraphing twice without resolving repeats the same entry', () => {
    let state = createIntentState(pattern);
    state = telegraphIntent(state, 1);
    const again = telegraphIntent(state, 2);
    expect(again.current!.name).toBe('Slash');
  });
});

describe('boss interval specials', () => {
  const special: IntentEntry = {
    name: 'Warhammer',
    telegraph: 'braces behind iron plates...',
    effects: [{ kind: 'damage', amount: 9 }],
  };
  const bossPattern: IntentPattern = {
    cycle: [slash, brace],
    special: { entry: special, interval: 3 },
  };

  test('fires on every interval turn and telegraphs ahead like any intent', () => {
    let state = createIntentState(bossPattern);
    const seen: string[] = [];
    for (let turn = 1; turn <= 7; turn++) {
      state = telegraphIntent(state, turn);
      seen.push(state.current!.name);
      state = resolveIntent(state);
    }
    // Interval turns 3 and 6 interleave the special without consuming the cycle.
    expect(seen).toEqual(['Slash', 'Brace', 'Warhammer', 'Slash', 'Brace', 'Warhammer', 'Slash']);
  });
});

describe('voided intents (R21)', () => {
  test('a voided beat does not advance the cycle: the enemy retries the same action', () => {
    let state = createIntentState(pattern);
    state = telegraphIntent(state, 1);
    expect(state.current!.name).toBe('Slash');
    state = voidIntent(state, 'stun');
    expect(state.voided).toBe('stun');
    state = clearVoidedIntent(state);
    state = telegraphIntent(state, 2);
    expect(state.current!.name).toBe('Slash');
  });

  test('telegraphing anew clears a stale void mark', () => {
    let state = createIntentState(pattern);
    state = telegraphIntent(state, 1);
    state = voidIntent(state, 'smoke_bomb');
    state = clearVoidedIntent(state);
    state = telegraphIntent(state, 2);
    expect(state.voided).toBeNull();
  });
});

describe('telegraph truthfulness (R5)', () => {
  test('attack magnitude is the summed raw damage', () => {
    expect(intentView(slash)).toMatchObject({ kind: 'attack', magnitude: 7 });
    expect(intentView(brace)).toMatchObject({ kind: 'attack', magnitude: 3 });
  });

  test('pure block and pure status entries report their own kind', () => {
    expect(
      intentView({ name: 'Wall', telegraph: '...', effects: [{ kind: 'block', amount: 6 }] }),
    ).toMatchObject({ kind: 'block', magnitude: 6 });
    expect(intentView(curse)).toMatchObject({ kind: 'status', magnitude: 2 });
  });

  test('view carries the authored name and telegraph line', () => {
    const view = intentView(slash);
    expect(view.name).toBe('Slash');
    expect(view.telegraph).toBe('raises a blade...');
  });
});

describe('empowerPattern (depth scaling)', () => {
  test('adds the bonus to the heaviest hit of every entry, specials included', () => {
    const empowered = empowerPattern(
      {
        cycle: [brace, slash],
        special: { interval: 4, entry: slash },
      },
      3,
    );
    // brace: block 6 untouched, its lone hit 3 -> 6.
    expect(empowered.cycle[0].effects).toEqual([
      { kind: 'block', amount: 6 },
      { kind: 'damage', amount: 6 },
    ]);
    expect(empowered.cycle[1].effects).toEqual([{ kind: 'damage', amount: 10 }]);
    expect(empowered.special?.entry.effects).toEqual([{ kind: 'damage', amount: 10 }]);
  });

  test('leaves damage-free entries and zero bonuses untouched', () => {
    expect(empowerPattern({ cycle: [curse] }, 3).cycle[0]).toEqual(curse);
    const pattern = { cycle: [slash] };
    expect(empowerPattern(pattern, 0)).toBe(pattern);
  });

  test('the telegraph stays truthful: the view reads the empowered numbers (R5)', () => {
    const empowered = empowerPattern({ cycle: [slash] }, 4);
    expect(intentView(empowered.cycle[0]).magnitude).toBe(11);
  });
});
