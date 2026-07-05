import { describe, expect, test } from 'vitest';
import {
  makeRelic,
  randomRelic,
  relicDef,
  RELIC_DEFS,
  rollRelicOffers,
  starterRelicPool,
} from './relics';
import { GameRng } from '../game/rng';

function makePredictableRng(index: number): GameRng {
  return {
    frac(): number {
      return 0.7;
    },
    between(): number {
      return 0;
    },
    pick<T>(items: readonly T[]): T {
      return items[Math.min(index, items.length - 1)]!;
    },
  };
}

describe('relic defs', () => {
  test('makeRelic creates an instance with the selected definition', () => {
    const relic = makeRelic('swift_boots');

    expect(relic.id).toBe('swift_boots');
    expect(relic.name).toBe('Swift Boots');
    expect(relic.description).toBe('Draw 6 cards each battle turn instead of 5.');
    expect(relic.uid).toBeGreaterThan(0);
  });

  test('makeRelic returns unique uids', () => {
    const first = makeRelic('swift_boots');
    const second = makeRelic('swift_boots');

    expect(second.uid).not.toBe(first.uid);
  });

  test('relicDef returns a known relic', () => {
    const relic = relicDef('iron_will');

    expect(relic).toEqual(
      expect.objectContaining({
        id: 'iron_will',
        name: 'Iron Will',
        description: 'Armor raised to 4, gained immediately.',
        color: 0x90d8e8,
      }),
    );
  });

  test('relicDef throws for unknown ids', () => {
    expect(() => relicDef('non-existent' as 'swift_boots')).toThrowError(/Unknown relic/);
  });

  test('randomRelic returns a relic from available definitions', () => {
    const rng = makePredictableRng(1);

    const relic = randomRelic(rng, new Set(), starterRelicPool());

    expect(RELIC_DEFS.map((def) => def.id)).toContain(relic?.id);
  });

  test('randomRelic returns null when all relics are owned', () => {
    const allRelics = new Set(RELIC_DEFS.map((relic) => relic.id));
    const relic = randomRelic(makePredictableRng(0), allRelics, starterRelicPool());

    expect(relic).toBeNull();
  });

  test('randomRelic excludes already owned relics', () => {
    const relics = new Set(['swift_boots', 'iron_will', 'vampiric_blade'] as const);
    const rng = makePredictableRng(2);

    const relic = randomRelic(rng, relics, starterRelicPool());

    expect(relic).not.toBeNull();
    if (relic === null) throw new Error('Expected a relic');
    expect(relic.id).toBe('lucky_coin');
  });

  test('rollRelicOffers returns distinct unowned offers', () => {
    const offers = rollRelicOffers(
      makePredictableRng(0),
      new Set(['swift_boots']),
      starterRelicPool(),
      3,
    );
    expect(offers.length).toBeGreaterThan(0);
    expect(new Set(offers.map((relic) => relic.id)).size).toBe(offers.length);
    expect(offers.every((relic) => relic.id !== 'swift_boots')).toBe(true);
  });
});
