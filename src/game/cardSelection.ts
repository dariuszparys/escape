import { Card, primaryCardValue } from '../data/cards';
import { MAX_HAND } from '../config';

export function selectCombatHand(collection: readonly Card[]): Card[] {
  return [...collection]
    .sort((a, b) => {
      const tier = b.tier - a.tier;
      if (tier !== 0) return tier;

      const value = primaryCardValue(b) - primaryCardValue(a);
      if (value !== 0) return value;

      const name = a.name.localeCompare(b.name);
      if (name !== 0) return name;

      return a.uid - b.uid;
    })
    .slice(0, MAX_HAND);
}
