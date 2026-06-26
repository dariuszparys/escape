import { Card, CardEffect, cardEffectAmount, primaryCardValue } from '../data/cards';
import { MAX_HAND } from '../config';

const MIN_OFFENSIVE_CARDS = 3;

function statusScore(effect: Extract<CardEffect, { kind: 'status' }>): number {
  if (effect.status === 'stun') return 10;
  return effect.amount * effect.duration * 2;
}

export function isOffensiveCard(card: Pick<Card, 'effects'>): boolean {
  return cardEffectAmount(card, 'damage') > 0
    || card.effects.some((effect) => effect.kind === 'status');
}

export function combatCardScore(card: Pick<Card, 'tier' | 'speed' | 'effects'>): number {
  const damage = cardEffectAmount(card, 'damage');
  const block = cardEffectAmount(card, 'block');
  const heal = cardEffectAmount(card, 'heal');
  const statuses = card.effects
    .filter((effect): effect is Extract<CardEffect, { kind: 'status' }> => effect.kind === 'status')
    .reduce((sum, effect) => sum + statusScore(effect), 0);

  return card.tier * 100 + damage * 8 + block * 4 + heal * 4 + statuses + card.speed;
}

function compareCards(a: Card, b: Card): number {
  const tier = b.tier - a.tier;
  if (tier !== 0) return tier;

  const combatScore = combatCardScore(b) - combatCardScore(a);
  if (combatScore !== 0) return combatScore;

  const value = primaryCardValue(b) - primaryCardValue(a);
  if (value !== 0) return value;

  const name = a.name.localeCompare(b.name);
  if (name !== 0) return name;

  return a.uid - b.uid;
}

export function selectCombatHand(collection: readonly Card[]): Card[] {
  const sorted = [...collection].sort(compareCards);
  const offensive = sorted.filter(isOffensiveCard);
  const selected = new Set<number>();
  const guaranteedOffense = Math.min(MIN_OFFENSIVE_CARDS, MAX_HAND, offensive.length);

  for (const card of offensive.slice(0, guaranteedOffense)) {
    selected.add(card.uid);
  }

  for (const card of sorted) {
    if (selected.size >= MAX_HAND) break;
    selected.add(card.uid);
  }

  return sorted
    .filter((card) => selected.has(card.uid))
    .slice(0, MAX_HAND);
}
