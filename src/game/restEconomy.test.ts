import { describe, expect, test } from 'vitest';
import { makeCard, type Card } from '../data/cards';
import { upgradeCard } from './cardUpgrade';
import { canUseRestAction, payRestAction, restActionTargets } from './restEconomy';

/** A plain upgradable card — the upgrade table changes its damage. */
function card(id = 'strike'): Card {
  return makeCard({
    id,
    name: 'Strike',
    type: 'attack',
    tier: 1,
    cost: 1,
    color: 0,
    description: 'Deal 5 damage',
    effects: [{ kind: 'damage', amount: 5 }],
  });
}

/** A card the upgrade table cannot change at all — stun is not upgradable. */
function unUpgradableCard(): Card {
  return makeCard({
    id: 'concuss',
    name: 'Concuss',
    type: 'status',
    tier: 1,
    cost: 1,
    color: 0,
    description: 'Stun',
    effects: [{ kind: 'status', status: 'stun', amount: 1, duration: 1 }],
  });
}

describe('rest economy', () => {
  test('charges twelve gold for an upgrade action', () => {
    const run = { gold: 12, cardCollection: [card()] };

    expect(canUseRestAction(run, 'upgrade')).toEqual({ ok: true, cost: 12 });
    expect(payRestAction(run, 'upgrade')).toEqual({ ok: true, cost: 12 });
    expect(run.gold).toBe(0);
  });

  test('charges ten gold for a remove action', () => {
    const run = { gold: 10, cardCollection: [card(), card()] };

    expect(canUseRestAction(run, 'remove')).toEqual({ ok: true, cost: 10 });
    expect(payRestAction(run, 'remove')).toEqual({ ok: true, cost: 10 });
    expect(run.gold).toBe(0);
  });

  test('rejects unaffordable rest actions without charging', () => {
    const run = { gold: 9, cardCollection: [card(), card()] };

    expect(payRestAction(run, 'remove')).toEqual({ ok: false, reason: 'Not enough Gold.' });
    expect(run.gold).toBe(9);
  });

  test('rejects removing the last card without charging', () => {
    const run = { gold: 99, cardCollection: [card()] };

    expect(payRestAction(run, 'remove')).toEqual({
      ok: false,
      reason: 'Cannot remove last card.',
    });
    expect(run.gold).toBe(99);
  });
});

describe('rest action targets', () => {
  test('a maxed-out card leaves the upgrade path but stays removable', () => {
    const maxed = upgradeCard(card('maxed'));
    const fresh = card('fresh');
    const collection = [maxed, fresh];

    expect(restActionTargets(collection, 'upgrade')).toEqual([fresh]);
    expect(restActionTargets(collection, 'remove')).toEqual([maxed, fresh]);
  });

  test('a card the upgrade table cannot change is also kept out of the upgrade path', () => {
    const stun = unUpgradableCard();
    const collection = [stun, card()];

    expect(restActionTargets(collection, 'upgrade')).not.toContain(stun);
    expect(restActionTargets(collection, 'remove')).toContain(stun);
  });

  test('an all-maxed collection blocks the paid upgrade action outright', () => {
    // Charging Gold for an action with no legal target is the failure this guards.
    const run = { gold: 999, cardCollection: [upgradeCard(card()), upgradeCard(card('b'))] };

    expect(canUseRestAction(run, 'upgrade')).toEqual({
      ok: false,
      reason: 'Every card is fully upgraded.',
    });
    expect(payRestAction(run, 'upgrade')).toEqual({
      ok: false,
      reason: 'Every card is fully upgraded.',
    });
    expect(run.gold).toBe(999);
    // Removal is still on the table.
    expect(canUseRestAction(run, 'remove')).toEqual({ ok: true, cost: 10 });
  });

  test('targets are returned as a copy, never the live collection', () => {
    const collection = [card(), card('b')];
    const targets = restActionTargets(collection, 'remove');
    targets.pop();
    expect(collection).toHaveLength(2);
  });
});
