import { Card, CardEffect } from '../data/cards';

const UPGRADE_DAMAGE = 2;
const UPGRADE_BLOCK = 3;
const UPGRADE_HEAL = 3;
const UPGRADE_STATUS_AMOUNT = 1;
const UPGRADE_STATUS_DURATION = 1;
const UPGRADE_STRENGTH = 1;
const UPGRADE_DRAW = 1;
const UPGRADE_ENERGY = 1;

/** Debuff statuses whose tick amount gets stronger on upgrade (same duration). */
const AMOUNT_UPGRADABLE_STATUSES = new Set(['poison', 'burn']);
/** Timed debuff modifiers whose window gets longer on upgrade (same amount). */
const DURATION_UPGRADABLE_STATUSES = new Set(['vulnerable', 'weak', 'frail']);

function upgradeEffect(effect: CardEffect): CardEffect {
  if (effect.kind === 'damage') {
    return { ...effect, amount: effect.amount + UPGRADE_DAMAGE };
  }
  if (effect.kind === 'block') {
    return { ...effect, amount: effect.amount + UPGRADE_BLOCK };
  }
  if (effect.kind === 'heal') {
    return { ...effect, amount: effect.amount + UPGRADE_HEAL };
  }
  if (effect.kind === 'strength') {
    return { ...effect, amount: effect.amount + UPGRADE_STRENGTH };
  }
  if (effect.kind === 'draw') {
    return { ...effect, amount: effect.amount + UPGRADE_DRAW };
  }
  if (effect.kind === 'energy') {
    return { ...effect, amount: effect.amount + UPGRADE_ENERGY };
  }
  if (effect.kind === 'status') {
    if (AMOUNT_UPGRADABLE_STATUSES.has(effect.status)) {
      return { ...effect, amount: effect.amount + UPGRADE_STATUS_AMOUNT };
    }
    if (DURATION_UPGRADABLE_STATUSES.has(effect.status)) {
      return { ...effect, duration: effect.duration + UPGRADE_STATUS_DURATION };
    }
    // stun: not upgradable — unchanged.
    return effect;
  }
  // shuffleCurse: not upgradable — unchanged.
  return effect;
}

/** True when upgrading would actually change at least one effect. */
export function isCardUpgradable(card: Pick<Card, 'effects'>): boolean {
  return card.effects.some((effect) => upgradeEffect(effect) !== effect);
}

export function upgradeCard(card: Card): Card {
  const effects = card.effects.map(upgradeEffect);
  const upgradable = isCardUpgradable(card);

  card.effects = effects;
  if (upgradable) {
    card.name = card.name.endsWith('+') ? card.name : `${card.name}+`;
  }
  return card;
}
