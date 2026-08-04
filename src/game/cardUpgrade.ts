import { Card, CardEffect } from '../data/cards';

const UPGRADE_DAMAGE = 2;
const UPGRADE_BLOCK = 3;
const UPGRADE_HEAL = 3;
const UPGRADE_STATUS_AMOUNT = 1;
const UPGRADE_STATUS_DURATION = 1;
const UPGRADE_STRENGTH = 1;
const UPGRADE_DRAW = 1;
const UPGRADE_ENERGY = 1;

/**
 * How many times one card instance may be upgraded across a run.
 *
 * A single upgraded version per card (the physical-prototype rule) is what keeps rest-room
 * gold spreading across the deck. Unbounded upgrades let a run pour every rest into one
 * scaling card until it out-damaged the player's whole HP pool.
 */
export const MAX_CARD_UPGRADES = 1;

/** Debuff statuses whose tick amount gets stronger on upgrade (same duration). */
const AMOUNT_UPGRADABLE_STATUSES = new Set(['poison', 'burn']);
/** Timed debuff modifiers whose window gets longer on upgrade (same amount). */
const DURATION_UPGRADABLE_STATUSES = new Set(['vulnerable', 'weak', 'frail']);

/** Upgrades applied so far. Legacy snapshots predate the field, so absent means none. */
export function upgradeCount(card: Pick<Card, 'upgrades'>): number {
  return card.upgrades ?? 0;
}

/**
 * Damage gained per damage effect this upgrade.
 *
 * Deliberately a flat per-effect bonus, so a multi-hit card gains more total than a single-hit
 * one. That asymmetry looks like the Sunder snowball's cause — two damage effects meant +4 per
 * upgrade, banked again at x1.5 by the card's own Vulnerable — but the real cause was that
 * upgrades never stopped. `MAX_CARD_UPGRADES` bounds it: one upgrade takes Sunder to 6/9 raw
 * instead of the 40 that six upgrades reached.
 *
 * Splitting the budget across hits was tried and reverted: once the cap is in place it moved the
 * survival bands so little that it was not worth the extra rule, and what it did change fell
 * only on the Barbarian, whose kit is built from multi-hit cards. Multi-hit cards paying off
 * with Strength and Vulnerable is the point of building around them; the card-lint dominance
 * check is what keeps that honest.
 */
function damageStep(): number {
  return UPGRADE_DAMAGE;
}

function upgradeEffect(effect: CardEffect, damageStepAmount: number): CardEffect {
  if (effect.kind === 'damage') {
    return { ...effect, amount: effect.amount + damageStepAmount };
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

/** True when at least one effect would change AND the instance is under the upgrade cap. */
export function isCardUpgradable(card: Pick<Card, 'effects' | 'upgrades'>): boolean {
  if (upgradeCount(card) >= MAX_CARD_UPGRADES) return false;
  return card.effects.some((effect) => upgradeEffect(effect, damageStep()) !== effect);
}

export function upgradeCard(card: Card): Card {
  if (!isCardUpgradable(card)) return card;

  card.effects = card.effects.map((effect) => upgradeEffect(effect, damageStep()));
  card.upgrades = upgradeCount(card) + 1;
  card.name = card.name.endsWith('+') ? card.name : `${card.name}+`;
  return card;
}
