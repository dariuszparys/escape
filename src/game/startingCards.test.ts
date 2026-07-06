import { describe, expect, test } from 'vitest';
import {
  ARCHETYPE_STARTING_CARD_IDS,
  STARTING_CARD_IDS,
  STARTING_DECK_PAD_IDS,
  startingDeckPadIdsForScenario,
  startingCardIdsForChoiceCount,
  startingCardIdsForRun,
} from './startingCards';
import { CARD_DEFS, type ArchetypeId } from '../data/cards';
import { cardGrantsBlock } from './scenarioRules';

const LEFT_ARM_ARCHETYPE_CASES: readonly (ArchetypeId | null)[] = [
  null,
  'barbarian',
  'necromancer',
  'ranger',
];

describe('startingCardIdsForChoiceCount', () => {
  test('defaults to the three-card opening offer', () => {
    expect(startingCardIdsForChoiceCount(3)).toEqual(['slash', 'guard', 'quick_jab']);
  });

  test('adds a fourth support option for the prep upgrade', () => {
    expect(startingCardIdsForChoiceCount(4)).toEqual(['slash', 'guard', 'quick_jab', 'minor_heal']);
  });

  test('clamps invalid counts to the supported range', () => {
    expect(startingCardIdsForChoiceCount(0)).toEqual(['slash', 'guard', 'quick_jab']);
    expect(startingCardIdsForChoiceCount(Number.NaN)).toEqual(['slash', 'guard', 'quick_jab']);
    expect(startingCardIdsForChoiceCount(99)).toEqual([
      'slash',
      'guard',
      'quick_jab',
      'minor_heal',
    ]);
  });

  test('uses the fourth starter option for normal runs after the unlock', () => {
    expect(
      startingCardIdsForRun({
        startingCardChoices: 4,
        isDaily: false,
      }),
    ).toEqual(['slash', 'guard', 'quick_jab', 'minor_heal']);
  });

  test('keeps daily runs on the default fixed opening offer', () => {
    expect(
      startingCardIdsForRun({
        startingCardChoices: 4,
        isDaily: true,
      }),
    ).toEqual(['slash', 'guard', 'quick_jab']);
  });

  test('offers the archetype pick pool when an archetype is active', () => {
    expect(
      startingCardIdsForRun({
        startingCardChoices: 3,
        archetypeId: 'barbarian',
        isDaily: false,
      }),
    ).toEqual(ARCHETYPE_STARTING_CARD_IDS.barbarian.slice(0, 3));

    expect(
      startingCardIdsForRun({
        startingCardChoices: 4,
        archetypeId: 'ranger',
        isDaily: false,
      }),
    ).toEqual([...ARCHETYPE_STARTING_CARD_IDS.ranger]);
  });

  test('daily runs ignore the active archetype (kept comparable)', () => {
    expect(
      startingCardIdsForRun({
        startingCardChoices: 4,
        archetypeId: 'necromancer',
        isDaily: true,
      }),
    ).toEqual(['slash', 'guard', 'quick_jab']);
  });

  test('startingCardIdsForChoiceCount honors an explicit archetype pool', () => {
    expect(startingCardIdsForChoiceCount(4, 'necromancer')).toEqual([
      ...ARCHETYPE_STARTING_CARD_IDS.necromancer,
    ]);
    expect(startingCardIdsForChoiceCount(3, 'necromancer')).toEqual(
      ARCHETYPE_STARTING_CARD_IDS.necromancer.slice(0, 3),
    );
  });

  test('Left Arm opening choices and deck pad exclude block cards with safe backfill', () => {
    const pad = startingDeckPadIdsForScenario('lost_left_arm');
    const padDefs = pad.map((id) => {
      const def = CARD_DEFS.find((card) => card.id === id);
      if (!def) throw new Error(`missing card def: ${id}`);
      return def;
    });

    expect(pad).toHaveLength(4);
    expect(padDefs.every((card) => !cardGrantsBlock(card))).toBe(true);
    expect(pad).not.toContain('guard');

    for (const archetypeId of LEFT_ARM_ARCHETYPE_CASES) {
      const choices = startingCardIdsForRun({
        startingCardChoices: 4,
        archetypeId,
        isDaily: false,
        scenarioId: 'lost_left_arm',
      });
      const choiceDefs = choices.map((id) => {
        const def = CARD_DEFS.find((card) => card.id === id);
        if (!def) throw new Error(`missing card def: ${id}`);
        return def;
      });

      expect(choices, `${archetypeId ?? 'neutral'} choices`).toHaveLength(4);
      expect(choiceDefs.every((card) => !cardGrantsBlock(card))).toBe(true);
    }
  });
});

describe('starting card id integrity', () => {
  test('every archetype pool id resolves to a CARD_DEFS entry tagged with that archetype', () => {
    for (const [archetypeId, ids] of Object.entries(ARCHETYPE_STARTING_CARD_IDS)) {
      for (const id of ids) {
        const def = CARD_DEFS.find((card) => card.id === id);
        expect(def, `missing card def for archetype id: ${id}`).toBeDefined();
        expect(def?.archetype, `card ${id} should be tagged '${archetypeId}'`).toBe(archetypeId);
      }
    }
  });

  test('neutral STARTING_CARD_IDS and STARTING_DECK_PAD_IDS resolve to untagged CARD_DEFS entries', () => {
    for (const id of [...STARTING_CARD_IDS, ...STARTING_DECK_PAD_IDS]) {
      const def = CARD_DEFS.find((card) => card.id === id);
      expect(def, `missing card def for neutral id: ${id}`).toBeDefined();
      expect(def?.archetype, `card ${id} must stay neutral (no archetype tag)`).toBeUndefined();
    }
  });
});
