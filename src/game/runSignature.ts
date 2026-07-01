import {
  type BalanceScenario,
  type DelveStrategy,
  createSimRng,
  simulateRun,
} from './balanceSimulator';

/**
 * Order-sensitive digest of a run's RNG consumption. Accumulates a draw *count* and a
 * rolling FNV-1a hash of the successive `frac()` results, so any regression that reorders,
 * adds, or drops a draw flips the digest — even when the net run outcome is unchanged. This
 * is the load-bearing half of the seed-stability gate (KTD4): an aggregates-only signature
 * would pass green on such a reordering.
 */
export class RngDrawDigest {
  private drawCount = 0;
  private rollingHash = 0x811c9dc5; // FNV-1a 32-bit offset basis

  record(frac: number): void {
    this.drawCount++;
    // Quantize the [0, 1) draw to a uint32 so the hash is exact and platform-stable.
    const q = Math.min(0xffffffff, Math.floor(frac * 0x100000000)) >>> 0;
    let hash = this.rollingHash;
    for (let shift = 0; shift < 32; shift += 8) {
      hash ^= (q >>> shift) & 0xff;
      hash = Math.imul(hash, 0x01000193); // FNV-1a prime
    }
    this.rollingHash = hash >>> 0;
  }

  get count(): number {
    return this.drawCount;
  }

  get hash(): number {
    return this.rollingHash >>> 0;
  }

  toString(): string {
    return `${this.drawCount}:${(this.rollingHash >>> 0).toString(16)}`;
  }
}

export interface RunSignatureOptions {
  strategy?: DelveStrategy;
  maxStrata?: number;
}

/**
 * A stable, serialized digest of a simulated run: its observable outcome fields *plus* an
 * RNG draw-order digest. Two `simulateRun(seed)` calls that consume RNG identically produce
 * an identical signature; any determinism drift (outcome change or draw reordering) changes it.
 * The seed-stability gate asserts double-run equality of this signature and matches one fixed
 * seed against a committed golden (KTD4/R5).
 */
export function runSignature(
  seed: number,
  scenario: BalanceScenario = {},
  options: RunSignatureOptions = {},
): string {
  const digest = new RngDrawDigest();
  const result = simulateRun(seed, scenario, {
    ...options,
    createRng: (s) => createSimRng(s, (frac) => digest.record(frac)),
  });

  return [
    `v=${result.victory ? 1 : 0}`,
    `boss=${result.reachedBoss ? 1 : 0}`,
    `gate=${result.clearedFirstGate ? 1 : 0}`,
    `death=${result.deathDepth ?? '-'}`,
    `stratum=${result.stratumReached}`,
    `enc=${result.encounters}`,
    `embers=${result.convertedEmbers}`,
    `draws=${digest.count}`,
    `hash=${digest.hash.toString(16)}`,
  ].join('|');
}
