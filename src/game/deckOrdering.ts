import { Card } from '../data/cards';
import { compareCombatCards } from './cardSelection';

export interface OrderedDeckEntry {
  card: Card;
  inHand: boolean;
}

export function orderedDeckEntries(
  collection: readonly Card[],
  combatHand: readonly Card[],
): OrderedDeckEntry[] {
  const handIds = new Set(combatHand.map((card) => card.uid));
  return [...collection]
    .sort(compareCombatCards)
    .map((card) => ({
      card,
      inHand: handIds.has(card.uid),
    }));
}
