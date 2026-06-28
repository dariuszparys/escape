import { MAX_HAND } from '../config';
import { Card, cardEffectAmount } from '../data/cards';
import { upgradeCard } from './cardUpgrade';
import { selectCombatHand } from './cardSelection';

export type RewardImpactChange =
  | { kind: 'add'; card: Card }
  | { kind: 'upgrade'; cardUid: number }
  | { kind: 'remove'; cardUid: number };

export type RewardImpactKind =
  | 'enters_hand'
  | 'replaces_card'
  | 'improves_role'
  | 'removes_hand_card'
  | 'collection_only'
  | 'unchanged';

export interface RewardImpactPreview {
  kind: RewardImpactKind;
  label: string;
  beforeHand: Card[];
  afterHand: Card[];
  entering?: Card;
  leaving?: Card;
}

export interface PreviewRewardImpactInput {
  collection: readonly Card[];
  combatHand: readonly Card[];
  change: RewardImpactChange;
  handLimit?: number;
}

function cloneCard(card: Card): Card {
  return {
    ...card,
    effects: card.effects.map((effect) => ({ ...effect })),
  };
}

function cardRole(card: Card): string {
  if (card.effects.some((effect) => effect.kind === 'status')) return 'status role';
  if (cardEffectAmount(card, 'damage') > 0) return 'attack role';
  if (cardEffectAmount(card, 'block') > 0) return 'block role';
  if (cardEffectAmount(card, 'heal') > 0) return 'healing role';
  return `${card.type} role`;
}

function roleWithArticle(role: string): string {
  return `${/^[aeiou]/i.test(role) ? 'an' : 'a'} ${role}`;
}

function handDiff(beforeHand: readonly Card[], afterHand: readonly Card[]) {
  const beforeIds = new Set(beforeHand.map((card) => card.uid));
  const afterIds = new Set(afterHand.map((card) => card.uid));
  return {
    entering: afterHand.filter((card) => !beforeIds.has(card.uid)),
    leaving: beforeHand.filter((card) => !afterIds.has(card.uid)),
  };
}

function selectAfter(collection: readonly Card[], handLimit: number): Card[] {
  return selectCombatHand(collection, handLimit);
}

function previewAdd(
  collection: readonly Card[],
  beforeHand: readonly Card[],
  card: Card,
  handLimit: number,
): RewardImpactPreview {
  const afterHand = selectAfter([...collection, card], handLimit);
  const diff = handDiff(beforeHand, afterHand);
  const entering = diff.entering.find((entry) => entry.uid === card.uid);
  const leaving = diff.leaving[0];

  if (!entering) {
    return {
      kind: 'collection_only',
      label: `${card.name} stays in collection; next hand unchanged.`,
      beforeHand: [...beforeHand],
      afterHand,
    };
  }

  if (leaving) {
    return {
      kind: 'replaces_card',
      label: `${entering.name} enters hand, replacing ${leaving.name}'s ${cardRole(leaving)}.`,
      beforeHand: [...beforeHand],
      afterHand,
      entering,
      leaving,
    };
  }

  return {
    kind: 'enters_hand',
    label: `${entering.name} enters the next hand as ${roleWithArticle(cardRole(entering))}.`,
    beforeHand: [...beforeHand],
    afterHand,
    entering,
  };
}

function previewUpgrade(
  collection: readonly Card[],
  beforeHand: readonly Card[],
  cardUid: number,
  handLimit: number,
): RewardImpactPreview {
  const upgradedCollection = collection.map((card) => {
    if (card.uid !== cardUid) return card;
    return upgradeCard(cloneCard(card));
  });
  const upgraded = upgradedCollection.find((card) => card.uid === cardUid);
  const afterHand = selectAfter(upgradedCollection, handLimit);
  const beforeIds = new Set(beforeHand.map((card) => card.uid));
  const afterIds = new Set(afterHand.map((card) => card.uid));
  const diff = handDiff(beforeHand, afterHand);

  if (upgraded && beforeIds.has(cardUid) && afterIds.has(cardUid)) {
    return {
      kind: 'improves_role',
      label: `${upgraded.name} stays in hand and improves its ${cardRole(upgraded)}.`,
      beforeHand: [...beforeHand],
      afterHand,
      entering: upgraded,
    };
  }

  if (upgraded && afterIds.has(cardUid)) {
    const leaving = diff.leaving[0];
    return {
      kind: leaving ? 'replaces_card' : 'enters_hand',
      label: leaving
        ? `${upgraded.name} enters hand, replacing ${leaving.name}'s ${cardRole(leaving)}.`
        : `${upgraded.name} enters the next hand as ${roleWithArticle(cardRole(upgraded))}.`,
      beforeHand: [...beforeHand],
      afterHand,
      entering: upgraded,
      leaving,
    };
  }

  return {
    kind: 'unchanged',
    label: upgraded
      ? `${upgraded.name} improves in collection; next hand unchanged.`
      : 'Next hand unchanged.',
    beforeHand: [...beforeHand],
    afterHand,
  };
}

function previewRemove(
  collection: readonly Card[],
  beforeHand: readonly Card[],
  cardUid: number,
  handLimit: number,
): RewardImpactPreview {
  const removed = collection.find((card) => card.uid === cardUid);
  const afterCollection = collection.filter((card) => card.uid !== cardUid);
  const afterHand = selectAfter(afterCollection, handLimit);
  const beforeIds = new Set(beforeHand.map((card) => card.uid));
  const diff = handDiff(beforeHand, afterHand);
  const entering = diff.entering[0];
  const leaving = removed && beforeIds.has(cardUid) ? removed : undefined;

  if (!removed) {
    return {
      kind: 'unchanged',
      label: 'Next hand unchanged.',
      beforeHand: [...beforeHand],
      afterHand,
    };
  }

  if (!leaving) {
    return {
      kind: 'unchanged',
      label: `${removed.name} was in reserve; next hand unchanged.`,
      beforeHand: [...beforeHand],
      afterHand,
    };
  }

  if (entering) {
    return {
      kind: 'removes_hand_card',
      label: `${leaving.name} leaves hand; ${entering.name} enters as ${roleWithArticle(
        cardRole(entering),
      )}.`,
      beforeHand: [...beforeHand],
      afterHand,
      entering,
      leaving,
    };
  }

  return {
    kind: 'removes_hand_card',
    label: `${leaving.name} leaves the next hand.`,
    beforeHand: [...beforeHand],
    afterHand,
    leaving,
  };
}

export function previewRewardImpact(input: PreviewRewardImpactInput): RewardImpactPreview {
  const handLimit = input.handLimit ?? MAX_HAND;
  const beforeHand = [...input.combatHand];

  if (input.change.kind === 'add') {
    return previewAdd(input.collection, beforeHand, input.change.card, handLimit);
  }
  if (input.change.kind === 'upgrade') {
    return previewUpgrade(input.collection, beforeHand, input.change.cardUid, handLimit);
  }
  return previewRemove(input.collection, beforeHand, input.change.cardUid, handLimit);
}
