import { POTION_HEAL } from '../config';
import { randomCard } from '../data/cards';
import { InventoryItem, makeItem, randomItemIdForDepth } from '../data/items';
import { RunState } from '../state';
import { GameRng } from './rng';

export type RewardResult =
  | { kind: 'card'; cardName: string }
  | { kind: 'item'; item: InventoryItem }
  | { kind: 'armor'; amount: number }
  | { kind: 'gold'; amount: number }
  | { kind: 'heal'; amount: number };

export type FloorPotionResult =
  | { kind: 'item'; item: InventoryItem }
  | { kind: 'heal'; amount: number };

export function awardFloorPotion(run: RunState): FloorPotionResult {
  const item = makeItem('small_potion');
  if (run.addItem(item)) {
    return { kind: 'item', item };
  }

  run.heal(POTION_HEAL);
  return { kind: 'heal', amount: POTION_HEAL };
}

export function rollChestReward(run: RunState, rng: GameRng, depth: number): RewardResult {
  const roll = rng.frac();
  if (roll < 0.35) {
    const card = randomCard(rng, depth);
    run.addCard(card);
    return { kind: 'card', cardName: card.name };
  }

  if (roll < 0.6) {
    const item = makeItem(randomItemIdForDepth(depth));
    if (run.addItem(item)) return { kind: 'item', item };
    run.heal(item.amount);
    return { kind: 'heal', amount: item.amount };
  }

  if (roll < 0.8) {
    if (run.addArmor()) return { kind: 'armor', amount: 1 };
    const amount = rng.between(8, 18);
    run.addGold(amount);
    return { kind: 'gold', amount };
  }

  const amount = rng.between(10, 24);
  run.addGold(amount);
  return { kind: 'gold', amount };
}

export function awardEnemyGold(run: RunState, rng: GameRng, depth: number): number {
  const amount = rng.between(4 + depth, 8 + depth * 2);
  run.addGold(amount);
  return amount;
}
