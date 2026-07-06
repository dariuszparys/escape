import { describe, expect, test } from 'vitest';
import {
  applyPoisonedRoomEntryDamage,
  cardGrantsBlock,
  isScenarioAllowedCard,
  isScenarioAllowedItem,
  isScenarioAllowedRelic,
  shouldApplyPoisonedRoomDamage,
  shouldAwardProgressionRewards,
  shouldDoubleNormalEncounters,
  shouldPreventPlayerBlock,
  shouldUseFullProgressionPrep,
} from './scenarioRules';
import { RunState } from '../state';
import { CARD_DEFS } from '../data/cards';
import { ITEM_DEFS } from '../data/items';
import { makeRelic, relicDef } from '../data/relics';
import { SequenceRng } from './test-rng';

describe('scenario rules', () => {
  test('classifies Escape as archetype-only prep with universal progression rewards', () => {
    expect(shouldUseFullProgressionPrep('escape_the_dungeon')).toBe(false);
    expect(shouldAwardProgressionRewards('escape_the_dungeon')).toBe(true);
  });

  test('classifies hard scenarios as full-prep progression runs', () => {
    for (const id of ['im_poisoned', 'lost_left_arm', 'enemies_doubled'] as const) {
      expect(shouldUseFullProgressionPrep(id)).toBe(true);
      expect(shouldAwardProgressionRewards(id)).toBe(true);
    }
  });

  test('keeps null scenario behavior compatible for daily and legacy callers', () => {
    expect(shouldUseFullProgressionPrep(null)).toBe(true);
    expect(shouldAwardProgressionRewards(null)).toBe(true);
    expect(shouldApplyPoisonedRoomDamage(null)).toBe(false);
    expect(shouldPreventPlayerBlock(null)).toBe(false);
    expect(shouldDoubleNormalEncounters(null)).toBe(false);
  });

  test('exposes one predicate per hard-scenario rule', () => {
    expect(shouldApplyPoisonedRoomDamage('im_poisoned')).toBe(true);
    expect(shouldApplyPoisonedRoomDamage('lost_left_arm')).toBe(false);

    expect(shouldPreventPlayerBlock('lost_left_arm')).toBe(true);
    expect(shouldPreventPlayerBlock('enemies_doubled')).toBe(false);

    expect(shouldDoubleNormalEncounters('enemies_doubled')).toBe(true);
    expect(shouldDoubleNormalEncounters('im_poisoned')).toBe(false);
  });

  test('applies poisoned room damage only after the start room', () => {
    const run = new RunState('seed');
    run.scenarioId = 'im_poisoned';
    run.hp = 10;

    expect(applyPoisonedRoomEntryDamage(run, new SequenceRng([], [2]))).toMatchObject({
      applied: false,
      amount: 0,
      hpAfter: 10,
    });

    run.depth = 2;
    expect(applyPoisonedRoomEntryDamage(run, new SequenceRng([], [2]))).toEqual({
      applied: true,
      amount: 2,
      hpBefore: 10,
      hpAfter: 8,
      died: false,
    });
  });

  test('poisoned room damage can kill before the room resolves', () => {
    const run = new RunState('seed');
    run.scenarioId = 'im_poisoned';
    run.depth = 2;
    run.hp = 1;

    expect(applyPoisonedRoomEntryDamage(run, new SequenceRng([], [1]))).toEqual({
      applied: true,
      amount: 1,
      hpBefore: 1,
      hpAfter: 0,
      died: true,
    });
    expect(run.hp).toBe(0);
  });

  test('non-poisoned scenarios do not lose HP on room entry', () => {
    for (const scenarioId of [
      'escape_the_dungeon',
      'lost_left_arm',
      'enemies_doubled',
      null,
    ] as const) {
      const run = new RunState('seed');
      run.scenarioId = scenarioId;
      run.depth = 3;
      run.hp = 7;

      expect(applyPoisonedRoomEntryDamage(run, new SequenceRng([], [2]))).toMatchObject({
        applied: false,
        hpAfter: 7,
      });
      expect(run.hp).toBe(7);
    }
  });

  test("Wanderer's Flask healing resolves before poisoned room damage", () => {
    const run = new RunState('seed');
    run.scenarioId = 'im_poisoned';
    run.depth = 2;
    run.hp = 1;
    run.addRelic(makeRelic('wanderers_flask'));

    run.onRoomEntered();
    const result = applyPoisonedRoomEntryDamage(run, new SequenceRng([], [2]));

    expect(result.hpBefore).toBe(2);
    expect(result.hpAfter).toBe(0);
    expect(result.died).toBe(true);
  });

  test('classifies block-granting cards for Left Arm filtering', () => {
    const guard = CARD_DEFS.find((card) => card.id === 'guard');
    const strike = CARD_DEFS.find((card) => card.id === 'strike');
    if (!guard || !strike) throw new Error('missing card defs');

    expect(cardGrantsBlock(guard)).toBe(true);
    expect(cardGrantsBlock(strike)).toBe(false);
    expect(isScenarioAllowedCard(guard, 'lost_left_arm')).toBe(false);
    expect(isScenarioAllowedCard(strike, 'lost_left_arm')).toBe(true);
    expect(isScenarioAllowedCard(guard, 'im_poisoned')).toBe(true);
  });

  test('classifies shield items and block-only relics for Left Arm filtering', () => {
    const ironArmor = ITEM_DEFS.find((item) => item.id === 'iron_armor');
    const smallPotion = ITEM_DEFS.find((item) => item.id === 'small_potion');
    if (!ironArmor || !smallPotion) throw new Error('missing item defs');

    expect(isScenarioAllowedItem(ironArmor, 'lost_left_arm')).toBe(false);
    expect(isScenarioAllowedItem(smallPotion, 'lost_left_arm')).toBe(true);
    expect(isScenarioAllowedRelic(relicDef('stone_heart'), 'lost_left_arm')).toBe(false);
    expect(isScenarioAllowedRelic(relicDef('iron_will'), 'lost_left_arm')).toBe(true);
  });
});
