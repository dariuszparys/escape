import { Card, randomCard, type ArchetypeId } from '../data/cards';
import { InventoryItem, makeItem, randomItemIdForDepth } from '../data/items';
import { randomRelic, type Relic } from '../data/relics';
import { RunState } from '../state';
import { relicEliteGoldBonus } from './relicBehaviors';
import { relicChestGoldMultiplier } from './relicRegistry';
import { previewRewardImpact } from './rewardImpact';
import { GameRng } from './rng';
import { isScenarioAllowedCard, isScenarioAllowedRelic } from './scenarioRules';

export type RewardResult =
  | { kind: 'card'; cardName: string; impactLabel: string }
  | { kind: 'item'; item: InventoryItem }
  | { kind: 'armor'; amount: number }
  | { kind: 'gold'; amount: number }
  | { kind: 'heal'; amount: number }
  | { kind: 'relic'; relic: Relic }
  | { kind: 'relic_exhausted'; amount: number }
  | { kind: 'inventory_full'; item: InventoryItem };

export type FloorPotionResult =
  | { kind: 'item'; item: InventoryItem }
  | { kind: 'heal'; amount: number }
  | { kind: 'inventory_full'; item: InventoryItem };

export function awardPotionItem(run: RunState, item: InventoryItem): FloorPotionResult {
  if (run.addItem(item)) {
    return { kind: 'item', item };
  }

  if (run.hp < run.maxHp) {
    run.heal(item.amount);
    return { kind: 'heal', amount: item.amount };
  }

  return { kind: 'inventory_full', item };
}

function rollChestGold(run: RunState, rng: GameRng, low: number, high: number): number {
  return Math.floor(
    rng.between(low, high) * run.goldMultiplier * relicChestGoldMultiplier(run.relicIds),
  );
}

export function rollChestReward(run: RunState, rng: GameRng, depth: number): RewardResult {
  const roll = rng.frac();
  if (roll < 0.5) {
    const card = randomCard(rng, depth, run.archetypeId, (candidate) =>
      isScenarioAllowedCard(candidate, run.scenarioId),
    );
    const impact = previewRewardImpact({
      collection: run.cardCollection,
      change: { kind: 'add', card },
    });
    run.addCard(card);
    return { kind: 'card', cardName: card.name, impactLabel: impact.label };
  }

  if (roll < 0.68) {
    const item = makeItem(randomItemIdForDepth(depth));
    return awardPotionItem(run, item);
  }

  if (roll < 0.8) {
    if (run.addArmor()) return { kind: 'armor', amount: 1 };
    const amount = rollChestGold(run, rng, 8, 18);
    run.addGold(amount);
    return { kind: 'gold', amount };
  }

  if (roll < 0.9) {
    const relic = randomRelic(
      rng,
      new Set(run.relics.map((relic) => relic.id)),
      run.relicPool,
      (candidate) => isScenarioAllowedRelic(candidate, run.scenarioId),
    );
    if (relic) {
      run.addRelic(relic);
      return { kind: 'relic', relic };
    }
    const amount = rollChestGold(run, rng, 10, 24);
    run.addGold(amount);
    return { kind: 'relic_exhausted', amount };
  }

  const amount = rollChestGold(run, rng, 10, 24);
  run.addGold(amount);
  return { kind: 'gold', amount };
}

export function awardEnemyGold(run: RunState, rng: GameRng, depth: number): number {
  const base = rng.between(4 + depth, 8 + depth * 2);
  const amount = Math.floor(base * run.goldMultiplier);
  run.addGold(amount);
  return amount;
}

/**
 * Elite reward bias (R5/KTD5). Reviewed under the U12 numeric rebaseline and left
 * unchanged — the target win-rate band and elite engagement/win rates were reached
 * through enemy and room-weight tuning alone, without needing a reward-side lever.
 */
export const ELITE_CARD_OFFER_COUNT = 4;
export const ELITE_TIER_BIAS_DEPTH = 5; // added to `depth` only for elite offer rolls, biasing randomCard's tier odds up without touching randomCard itself
export const ELITE_GOLD_MULTIPLIER = 2;

/**
 * Extra gold on top of a normal award, bringing the total to roughly
 * `ELITE_GOLD_MULTIPLIER`x (R5). Deliberately NOT a change to `awardEnemyGold`
 * itself — that shared depth-scaled function stays untouched (see the plan's
 * Constraints) — this just adds more gold at the call site after the normal
 * award already landed.
 */
export function awardEliteBonusGold(run: RunState, baseGold: number): number {
  const bonus = Math.floor(baseGold * (ELITE_GOLD_MULTIPLIER - 1));
  run.addGold(bonus);
  return bonus;
}

/** Flat relic bonus gold after defeating an elite (Merchant's Seal). */
export function awardRelicEliteGold(run: RunState): number {
  const bonus = relicEliteGoldBonus(run.relicIds);
  if (bonus > 0) run.addGold(bonus);
  return bonus;
}

/**
 * R25: the victory reward — up to `count` depth-appropriate random cards,
 * deduplicated by def so the choice is always a real choice. The pool can
 * collapse below `count` only if a tier's def list is tiny; offers then shrink
 * rather than repeat.
 */
export function rollVictoryCardOffers(
  rng: GameRng,
  depth: number,
  count = 3,
  tierBiasDepth = 0,
  archetype: ArchetypeId | null = null,
  scenarioId: RunState['scenarioId'] = null,
): Card[] {
  const offers: Card[] = [];
  for (let attempts = 0; offers.length < count && attempts < 24; attempts++) {
    const card = randomCard(rng, depth + tierBiasDepth, archetype, (candidate) =>
      isScenarioAllowedCard(candidate, scenarioId),
    );
    if (offers.some((offer) => offer.id === card.id)) continue;
    offers.push(card);
  }
  return offers;
}
