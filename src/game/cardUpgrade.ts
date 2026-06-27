import { Card } from '../data/cards';

const UPGRADE_DAMAGE = 2;
const UPGRADE_BLOCK = 3;
const UPGRADE_HEAL = 3;

export function upgradeCard(card: Card): Card {
  const effects = card.effects.map((effect) => {
    if (effect.kind === 'damage') {
      return { ...effect, amount: effect.amount + UPGRADE_DAMAGE };
    }
    if (effect.kind === 'block') {
      return { ...effect, amount: effect.amount + UPGRADE_BLOCK };
    }
    if (effect.kind === 'heal') {
      return { ...effect, amount: effect.amount + UPGRADE_HEAL };
    }
    return effect;
  });

  const name = card.name.endsWith('+') ? card.name : `${card.name}+`;

  card.effects = effects;
  card.name = name;
  return card;
}
