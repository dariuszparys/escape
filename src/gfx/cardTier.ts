import type { CardDef } from '../data/cards';

/**
 * How a card's tier is drawn on its face.
 *
 * Tier is the game's rarity axis, and reward offers are only a real decision if the player can
 * tell a tier-3 find from tier-1 filler at a glance. Every card used to draw the same parchment
 * border, so rarity was invisible at the exact moment it mattered — the reward row.
 *
 * `color` alone is not enough: the game's palette is dim, the hand fan draws cards scaled down,
 * and colour-blind players would lose the distinction entirely. Each tier therefore also differs
 * in stroke `width`, and tier 3 adds a second inset frame — redundant cues that survive both a
 * small render and a monochrome one.
 *
 * Kept free of Phaser imports so it stays unit-testable without a scene or a DOM.
 */
export interface TierBorder {
  /** Stroke colour for the card's outer frame. */
  color: number;
  /** Stroke width in px at scale 1. */
  width: number;
  /** Whether to draw a second inset frame — the non-colour marker for the top tier. */
  doubleFrame: boolean;
}

const TIER_BORDERS: Record<CardDef['tier'], TierBorder> = {
  1: { color: 0x8a6a44, width: 2, doubleFrame: false }, // weathered bronze
  2: { color: 0xc8cdd8, width: 3, doubleFrame: false }, // pale silver
  3: { color: 0xf1c40f, width: 3, doubleFrame: true }, // warm gold, double-framed
};

/** Border treatment for a tier. Falls back to tier 1 for any out-of-range value. */
export function tierBorder(tier: number): TierBorder {
  return TIER_BORDERS[tier as CardDef['tier']] ?? TIER_BORDERS[1];
}
