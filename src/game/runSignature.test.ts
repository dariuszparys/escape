import { describe, expect, test } from 'vitest';
import type { BalanceScenario } from './balanceSimulator';
import { RngDrawDigest, runSignature } from './runSignature';

/**
 * Golden signature for a fixed seed — a drift tripwire (KTD4). Regenerate ONLY on an
 * intentional determinism change (new RNG draw, reordered draws, new outcome field), and
 * record the reason in the commit body. An unexplained mismatch here is a determinism regression.
 */
const GOLDEN_SEED = 7;
const GOLDEN_SIGNATURE =
  // Re-goldened for Starter Kit retirement (2026-07-05). Intentional determinism change, not a
  // regression: the former signature cards are now normal authored neutral cards instead of a
  // kit-only pool, so reward offer contents and downstream draw order shift for fixed seeds.
  'v=1|boss=1|gate=1|death=-|stratum=1|enc=0|embers=3|draws=106|hash=37c4bdba';

describe('RngDrawDigest', () => {
  test('samples draw order and count, not just the value set (the load-bearing property)', () => {
    const inOrder = new RngDrawDigest();
    inOrder.record(0.1);
    inOrder.record(0.2);
    inOrder.record(0.3);

    const reordered = new RngDrawDigest();
    reordered.record(0.2);
    reordered.record(0.1);
    reordered.record(0.3);

    const extraDraw = new RngDrawDigest();
    extraDraw.record(0.1);
    extraDraw.record(0.2);
    extraDraw.record(0.3);
    extraDraw.record(0.3);

    // Same multiset, different order → different digest. This is exactly the regression an
    // aggregates-only signature would miss: a subscriber that reorders draws to a net-identical
    // outcome. Order-sensitivity here is what makes the gate catch it.
    expect(reordered.toString()).not.toBe(inOrder.toString());
    // One extra draw → different digest (count-sensitive too).
    expect(extraDraw.toString()).not.toBe(inOrder.toString());
    expect(extraDraw.count).toBe(4);
  });

  test('is deterministic for an identical draw sequence', () => {
    const a = new RngDrawDigest();
    const b = new RngDrawDigest();
    for (const v of [0.5, 0.25, 0.125, 0.999]) {
      a.record(v);
      b.record(v);
    }
    expect(a.toString()).toBe(b.toString());
  });
});

describe('runSignature', () => {
  test('folds the RNG draw digest in alongside outcome fields', () => {
    const sig = runSignature(GOLDEN_SEED);
    // The draw-order digest must be part of the signature, else a reordering regression is invisible.
    expect(sig).toMatch(/\|draws=\d+\|hash=[0-9a-f]+$/);
  });

  test('matches the committed golden for a fixed seed (drift tripwire)', () => {
    expect(runSignature(GOLDEN_SEED)).toBe(GOLDEN_SIGNATURE);
  });

  test('is stable across two runs of the same seed, for a spread of seeds', () => {
    for (let seed = 1; seed <= 50; seed++) {
      expect(runSignature(seed)).toBe(runSignature(seed));
    }
  });

  test('a death and a bank produce stable, distinct signatures', () => {
    // Under the combat-depth rebaseline, seed 1 dies; seed 2 banks a victory — the gate must not
    // collapse these.
    const death = runSignature(1);
    const bank = runSignature(2);

    expect(death).toBe(runSignature(1));
    expect(bank).toBe(runSignature(2));
    expect(death).not.toBe(bank);
    expect(death.startsWith('v=0|')).toBe(true);
    expect(bank.startsWith('v=1|')).toBe(true);
  });

  test('a non-default scenario yields a stable signature across double runs', () => {
    const scenario: BalanceScenario = {
      starterCardVarietyUnlocked: true,
      activeArchetypeId: 'ranger',
    };
    for (let seed = 1; seed <= 10; seed++) {
      expect(runSignature(seed, scenario)).toBe(runSignature(seed, scenario));
    }
  });
});
