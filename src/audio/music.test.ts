import { describe, expect, test } from 'vitest';
import { MusicKey, SPECS, SUSTAINED_LAYER_FREQUENCIES, trackForEncounterKind } from './music';

const MUSIC_KEYS: MusicKey[] = ['battle_default', 'battle_elite', 'battle_boss'];

describe('trackForEncounterKind', () => {
  test('maps each encounter kind to its dedicated track', () => {
    expect(trackForEncounterKind('normal')).toBe('battle_default');
    expect(trackForEncounterKind('elite')).toBe('battle_elite');
    expect(trackForEncounterKind('boss')).toBe('battle_boss');
  });
});

describe('sustained-layer integer-cycle rule', () => {
  for (const key of MUSIC_KEYS) {
    test(`${key}: every sustained-layer frequency completes a whole number of cycles over its loop`, () => {
      const duration = SPECS[key].duration;
      const freqs = SUSTAINED_LAYER_FREQUENCIES[key];
      expect(freqs.length).toBeGreaterThan(0);
      for (const freq of freqs) {
        expect(Number.isInteger(freq * duration)).toBe(true);
      }
    });
  }
});

describe('loop duration budget', () => {
  for (const key of MUSIC_KEYS) {
    test(`${key} loop duration sits within the 10-20s budget`, () => {
      const duration = SPECS[key].duration;
      expect(duration).toBeGreaterThanOrEqual(10);
      expect(duration).toBeLessThanOrEqual(20);
    });
  }
});
