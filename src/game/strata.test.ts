import { describe, expect, test } from 'vitest';
import { depthWithinStratum, isStratumBoundary, stratumForDepth } from './strata';

describe('stratumForDepth', () => {
  test('maps the first ten depths to stratum 1', () => {
    for (let depth = 1; depth <= 10; depth++) {
      expect(stratumForDepth(depth)).toBe(1);
    }
  });

  test('maps the second band to stratum 2', () => {
    for (let depth = 11; depth <= 20; depth++) {
      expect(stratumForDepth(depth)).toBe(2);
    }
  });

  test('keeps boundary depths in the lower stratum', () => {
    expect(stratumForDepth(10)).toBe(1);
    expect(stratumForDepth(20)).toBe(2);
    expect(stratumForDepth(30)).toBe(3);
  });

  test('clamps non-positive depths to stratum 1', () => {
    expect(stratumForDepth(0)).toBe(1);
    expect(stratumForDepth(-5)).toBe(1);
  });
});

describe('depthWithinStratum', () => {
  test('depth 19 mirrors depth 9 (the pre-boss room)', () => {
    expect(depthWithinStratum(19)).toBe(9);
    expect(depthWithinStratum(9)).toBe(9);
  });

  test('depth 11 mirrors depth 1 (the first room of a stratum)', () => {
    expect(depthWithinStratum(11)).toBe(1);
    expect(depthWithinStratum(1)).toBe(1);
  });

  test('boundary depths sit at the end of their stratum', () => {
    expect(depthWithinStratum(10)).toBe(10);
    expect(depthWithinStratum(20)).toBe(10);
  });
});

describe('isStratumBoundary', () => {
  test('is true at every tenth depth', () => {
    expect(isStratumBoundary(10)).toBe(true);
    expect(isStratumBoundary(20)).toBe(true);
    expect(isStratumBoundary(30)).toBe(true);
  });

  test('is false between boundaries and at depth 0', () => {
    expect(isStratumBoundary(0)).toBe(false);
    expect(isStratumBoundary(9)).toBe(false);
    expect(isStratumBoundary(11)).toBe(false);
    expect(isStratumBoundary(19)).toBe(false);
  });

  test('is a pure function of depth', () => {
    expect(isStratumBoundary(20)).toBe(isStratumBoundary(20));
  });
});
