import { describe, expect, test } from 'vitest';
import {
  ARCHETYPE_STARTING_CARD_IDS,
  startingDeckPadIdsForScenario,
  startingCardIdsForChoiceCount,
  startingCardIdsForRun,
} from './startingCards';
import { CARD_DEFS } from '../data/cards';
import { cardGrantsBlock } from './scenarioRules';

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
    const choices = startingCardIdsForRun({
      startingCardChoices: 4,
      archetypeId: null,
      isDaily: false,
      scenarioId: 'lost_left_arm',
    });
    const pad = startingDeckPadIdsForScenario('lost_left_arm');
    const defs = [...choices, ...pad].map((id) => {
      const def = CARD_DEFS.find((card) => card.id === id);
      if (!def) throw new Error(`missing card def: ${id}`);
      return def;
    });

    expect(choices).toHaveLength(4);
    expect(pad).toHaveLength(4);
    expect(defs.every((card) => !cardGrantsBlock(card))).toBe(true);
    expect(pad).not.toContain('guard');
  });
});
