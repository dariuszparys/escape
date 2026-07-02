import { Card } from '../data/cards';
import { DEFAULT_DRAW_SIZE } from './turnEngine';

export type RewardImpactChange =
  | { kind: 'add'; card: Card }
  | { kind: 'upgrade'; cardUid: number }
  | { kind: 'remove'; cardUid: number };

export type RewardImpactKind = 'grows_deck' | 'improves_card' | 'thins_deck' | 'unchanged';

/**
 * KTD9: under the full-collection deck, "enters hand / replaces card" is
 * meaningless — a reward changes the DECK'S COMPOSITION. The preview speaks
 * that language: size delta plus a rough opening-hand likelihood.
 */
export interface RewardImpactPreview {
  kind: RewardImpactKind;
  label: string;
  deckBefore: number;
  deckAfter: number;
  /** Rough chance the affected card shows up in an opening hand of the after-deck (0..1). */
  drawOdds: number;
}

export interface PreviewRewardImpactInput {
  collection: readonly Card[];
  change: RewardImpactChange;
  drawSize?: number;
}

/** P(a specific card is among the first `drawSize` of a shuffled `deckSize`-card deck). */
export function openingHandOdds(deckSize: number, drawSize: number): number {
  if (deckSize <= 0) return 0;
  if (deckSize <= drawSize) return 1;
  return drawSize / deckSize;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function previewRewardImpact(input: PreviewRewardImpactInput): RewardImpactPreview {
  const drawSize = input.drawSize ?? DEFAULT_DRAW_SIZE;
  const before = input.collection.length;
  const change = input.change;

  if (change.kind === 'add') {
    const after = before + 1;
    const odds = openingHandOdds(after, drawSize);
    return {
      kind: 'grows_deck',
      label: `${change.card.name} joins a ${after}-card deck — opening hand ~${pct(odds)} of battles.`,
      deckBefore: before,
      deckAfter: after,
      drawOdds: odds,
    };
  }

  const target = input.collection.find((card) => card.uid === change.cardUid);
  if (!target) {
    return {
      kind: 'unchanged',
      label: 'Deck unchanged.',
      deckBefore: before,
      deckAfter: before,
      drawOdds: 0,
    };
  }

  if (change.kind === 'upgrade') {
    const odds = openingHandOdds(before, drawSize);
    return {
      kind: 'improves_card',
      label: `${target.name} improves in place — drawn in ~${pct(odds)} of opening hands.`,
      deckBefore: before,
      deckAfter: before,
      drawOdds: odds,
    };
  }

  const after = Math.max(0, before - 1);
  const odds = openingHandOdds(after, drawSize);
  return {
    kind: 'thins_deck',
    label: `${target.name} leaves — a ${after}-card deck draws its best cards more often.`,
    deckBefore: before,
    deckAfter: after,
    drawOdds: odds,
  };
}
