import Phaser from 'phaser';

/**
 * Shared UI theme tokens. This is a *tokenization* pass over values already
 * in use across scenes/gfx — it should not introduce new colors or change
 * any rendered pixel. Add a token here only once you're migrating a call
 * site that uses it; don't pre-invent names for colors nobody references
 * yet (see plans/006).
 */

export const FONT_FAMILY = 'monospace';

export const PALETTE = {
  panelBg: 0x111019,
  hudBg: 0x16121e,
  /** HUD/room divider line (was an inline literal in Hud.ts create()). */
  hudBorder: 0x3a3544,
  chipBg: 0x1c1826,
  gold: 0xf1c40f,
  parchment: 0xcab98a,
} as const;

export const TEXT_COLOR = {
  gold: '#f1c40f',
  goldHover: '#ffe48a',
  primary: '#f5edd8',
  body: '#d8d2e4',
  muted: '#b8b0c8',
  faint: '#6a6478',
  danger: '#ff5544',
  warn: '#ff9944',
  success: '#5fe07a',
  delve: '#ff7a55',
  delveHover: '#ff9b80',
  /** Dark ink text for labels on light/colored chips (e.g. relic chips). */
  ink: '#16121e',
} as const;

/** Card-type tag colors used by the HUD's deck-summary chips. */
export const TYPE_COLOR: Record<string, string> = {
  attack: '#e87060',
  block: '#7fb2e8',
  heal: '#5fe07a',
  utility: '#90d8e8',
  status: '#c490e8',
};

export function panelTitleStyle(fontSize = '24px'): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT_FAMILY,
    fontSize,
    fontStyle: 'bold',
    color: TEXT_COLOR.gold,
  };
}

export function bodyStyle(
  fontSize = '12px',
  color: string = TEXT_COLOR.muted,
): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT_FAMILY,
    fontSize,
    color,
  };
}
