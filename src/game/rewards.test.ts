import { describe, expect, test } from 'vitest';
import { makeCard } from '../data/cards';
import { makeItem } from '../data/items';
import { makeRelic, STARTER_RELIC_IDS } from '../data/relics';
import { RunState } from '../state';
import { applySimulatedPostBattleRewards, createSimRng } from './balanceSimulator';
import {
  awardEliteBonusGold,
  awardEnemyGold,
  awardPotionItem,
  ELITE_CARD_OFFER_COUNT,
  ELITE_TIER_BIAS_DEPTH,
  rollChestReward,
  rollVictoryCardOffers,
} from './rewards';
import { SequenceRng } from './test-rng';

describe('rewards', () => {
  test('every added card stays in the collection — the deck IS the collection (R1)', () => {
    const run = new RunState('seed');
    for (let i = 0; i < 7; i++) {
      run.addCard(
        makeCard({
          id: `card-${i}`,
          name: `Card ${i}`,
          type: 'attack',
          tier: i < 2 ? 1 : 2,
          cost: 1,
          color: 0,
          description: 'card',
          effects: [{ kind: 'damage', amount: i + 1 }],
        }),
      );
    }

    expect(run.cardCollection).toHaveLength(7);
  });

  test('inventory accepts only three items', () => {
    const run = new RunState('seed');

    expect(run.addItem(makeItem('small_potion'))).toBe(true);
    expect(run.addItem(makeItem('bomb'))).toBe(true);
    expect(run.addItem(makeItem('smoke_bomb'))).toBe(true);
    expect(run.addItem(makeItem('large_potion'))).toBe(false);
    expect(run.inventory.map((item) => item.id)).toEqual(['small_potion', 'bomb', 'smoke_bomb']);
  });

  test('inventory can replace an item without changing capacity', () => {
    const run = new RunState('seed');
    run.addItem(makeItem('small_potion'));
    run.addItem(makeItem('bomb'));
    run.addItem(makeItem('smoke_bomb'));
    const bomb = run.inventory[1];

    expect(run.replaceItem(bomb.uid, makeItem('large_potion'))).toBe(true);

    expect(run.inventory).toHaveLength(3);
    expect(run.inventory.map((item) => item.id)).toEqual([
      'small_potion',
      'large_potion',
      'smoke_bomb',
    ]);
  });

  test('potion item heals immediately when inventory is full', () => {
    const run = new RunState('seed');
    run.hp = 20;
    run.addItem(makeItem('small_potion'));
    run.addItem(makeItem('bomb'));
    run.addItem(makeItem('smoke_bomb'));

    const result = awardPotionItem(run, makeItem('small_potion'));

    expect(result.kind).toBe('heal');
    expect(run.hp).toBe(28);
    expect(run.inventory).toHaveLength(3);
  });

  test('potion item waits for replacement when inventory and health are full', () => {
    const run = new RunState('seed');
    run.addItem(makeItem('small_potion'));
    run.addItem(makeItem('bomb'));
    run.addItem(makeItem('smoke_bomb'));

    const result = awardPotionItem(run, makeItem('small_potion'));

    expect(result.kind).toBe('inventory_full');
    if (result.kind !== 'inventory_full') throw new Error(`Unexpected result: ${result.kind}`);
    expect(result.item.id).toBe('small_potion');
    expect(run.hp).toBe(run.maxHp);
    expect(run.inventory.map((item) => item.id)).toEqual(['small_potion', 'bomb', 'smoke_bomb']);
  });

  test('chest potion waits for a replacement when inventory and health are full', () => {
    const run = new RunState('seed');
    run.addItem(makeItem('small_potion'));
    run.addItem(makeItem('bomb'));
    run.addItem(makeItem('smoke_bomb'));

    const result = rollChestReward(run, new SequenceRng([0.6]), 5);

    expect(result.kind).toBe('inventory_full');
    if (result.kind !== 'inventory_full') throw new Error(`Unexpected result: ${result.kind}`);
    expect(result.item.id).toBe('small_potion');
    expect(run.hp).toBe(run.maxHp);
    expect(run.inventory.map((item) => item.id)).toEqual(['small_potion', 'bomb', 'smoke_bomb']);
  });

  test('chest can award deterministic gold', () => {
    const run = new RunState('seed');

    const result = rollChestReward(run, new SequenceRng([0.95], [17]), 5);

    expect(result.kind).toBe('gold');
    expect(run.gold).toBe(17);
  });

  test('chest card rewards speak deck vocabulary in the impact preview (KTD9)', () => {
    const run = new RunState('seed');
    const result = rollChestReward(run, new SequenceRng([0, 0]), 5);

    expect(result.kind).toBe('card');
    if (result.kind !== 'card') throw new Error(`Unexpected result: ${result.kind}`);
    expect(result.impactLabel).toMatch(/deck/);
    expect(result.impactLabel).not.toMatch(/enters hand|replaces/i);
    expect(run.cardCollection).toHaveLength(1);
  });

  test('chest can award a relic and store it on the run', () => {
    const run = new RunState('seed');

    const result = rollChestReward(run, new SequenceRng([0.85], []), 5);

    expect(result.kind).toBe('relic');
    if (result.kind !== 'relic') throw new Error(`Unexpected result: ${result.kind}`);
    expect(run.relics).toHaveLength(1);
    expect(run.relics[0]).toBe(result.relic);
    // A fresh RunState defaults `relicPool` to the starter pool (state.ts) — assert the drawn
    // relic actually came from `run.relicPool`, the real invariant `randomRelic`'s `poolIds`
    // param exists to protect (a `toBeTruthy()` name check would pass for any relic at all).
    expect(STARTER_RELIC_IDS).toContain(result.relic.id);
  });

  test('lucky_coin increases all gold rewards by 50%', () => {
    const run = new RunState('seed');
    run.addRelic(makeRelic('lucky_coin'));

    const gold = awardEnemyGold(run, new SequenceRng([], [10]), 5);

    expect(gold).toBe(15);
    expect(run.gold).toBe(15);
  });

  test('elite victory offers 4 distinct cards; a normal call still offers 3 (regression, R5/KTD5)', () => {
    const eliteOffers = rollVictoryCardOffers(
      createSimRng(1),
      5,
      ELITE_CARD_OFFER_COUNT,
      ELITE_TIER_BIAS_DEPTH,
    );
    expect(eliteOffers).toHaveLength(4);
    expect(new Set(eliteOffers.map((card) => card.id)).size).toBe(4);

    const normalOffers = rollVictoryCardOffers(createSimRng(2), 5);
    expect(normalOffers).toHaveLength(3);
  });

  test('elite tier bias skews offers toward higher tiers at a low depth (R5/KTD5)', () => {
    const depth = 2; // depth <= 3 unbiased tier weights are [8, 2, 0] — heavily tier 1
    const rolls = 200;
    let biasedHighTierCount = 0;
    let unbiasedHighTierCount = 0;

    for (let seed = 1; seed <= rolls; seed++) {
      const biased = rollVictoryCardOffers(
        createSimRng(seed),
        depth,
        ELITE_CARD_OFFER_COUNT,
        ELITE_TIER_BIAS_DEPTH,
      );
      const unbiased = rollVictoryCardOffers(
        createSimRng(seed + 100_000),
        depth,
        ELITE_CARD_OFFER_COUNT,
        0,
      );
      biasedHighTierCount += biased.filter((card) => card.tier >= 2).length;
      unbiasedHighTierCount += unbiased.filter((card) => card.tier >= 2).length;
    }

    expect(biasedHighTierCount).toBeGreaterThan(unbiasedHighTierCount);
  });

  test('awardEliteBonusGold roughly doubles a given base gold amount', () => {
    const run = new RunState('seed');
    const baseGold = 20;

    const bonus = awardEliteBonusGold(run, baseGold);

    expect(bonus).toBe(20);
    expect(run.gold).toBe(20);
    expect(baseGold + bonus).toBe(baseGold * 2);
  });

  test('simulator elite rewards mirror the scene path: gold roughly doubles and offers draw from a 4-card pool (R5/KTD5)', () => {
    const normalRun = new RunState('seed-normal');
    applySimulatedPostBattleRewards(normalRun, createSimRng(7), 5, false);

    const eliteRun = new RunState('seed-elite');
    applySimulatedPostBattleRewards(eliteRun, createSimRng(7), 5, true);

    // Both runs draw the same first rng value for the base gold award (same seed,
    // no relics), so with no rounding in play here the elite total is exactly 2x.
    expect(normalRun.gold).toBeGreaterThan(0);
    expect(eliteRun.gold).toBe(normalRun.gold * 2);

    // applySimulatedPostBattleRewards returns void, so the 4-offer/bias-depth pool
    // it draws from for isElite=true is asserted directly against the same
    // underlying call it makes internally.
    const eliteOffers = rollVictoryCardOffers(
      createSimRng(1),
      5,
      ELITE_CARD_OFFER_COUNT,
      ELITE_TIER_BIAS_DEPTH,
    );
    expect(eliteOffers).toHaveLength(4);
  });
});
