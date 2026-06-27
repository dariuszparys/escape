import { randomCard } from '../data/cards';
import { InventoryItem, makeItem, randomItemIdForDepth } from '../data/items';
import { randomRelic } from '../data/relics';
import { RunState } from '../state';
import { GameRng } from './rng';

export type RewardResult =
  | { kind: 'card'; cardName: string }
  | { kind: 'item'; item: InventoryItem }
  | { kind: 'armor'; amount: number }
  | { kind: 'gold'; amount: number }
  | { kind: 'heal'; amount: number }
  | { kind: 'relic'; relicName: string }
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

export function rollChestReward(run: RunState, rng: GameRng, depth: number): RewardResult {
  const roll = rng.frac();
  if (roll < 0.5) {
    const card = randomCard(rng, depth);
    run.addCard(card);
    return { kind: 'card', cardName: card.name };
  }

  if (roll < 0.68) {
    const item = makeItem(randomItemIdForDepth(depth));
    return awardPotionItem(run, item);
  }

  if (roll < 0.8) {
    if (run.addArmor()) return { kind: 'armor', amount: 1 };
    const amount = Math.floor(rng.between(8, 18) * run.goldMultiplier);
    run.addGold(amount);
    return { kind: 'gold', amount };
  }

  if (roll < 0.88) {
    const relic = randomRelic(rng, new Set(run.relics.map((relic) => relic.id)));
    if (relic) {
      run.addRelic(relic);
      return { kind: 'relic', relicName: relic.name };
    }
  }

  const amount = Math.floor(rng.between(10, 24) * run.goldMultiplier);
  run.addGold(amount);
  return { kind: 'gold', amount };
}

export function awardEnemyGold(run: RunState, rng: GameRng, depth: number): number {
  const base = rng.between(4 + depth, 8 + depth * 2);
  const amount = Math.floor(base * run.goldMultiplier);
  run.addGold(amount);
  return amount;
}
