import Phaser from 'phaser';
import type { CardDef } from '../data/cards';
import { cardRulesLines } from '../data/keywords';
import type { TooltipPlacement } from '../game/tooltipLayout';

/**
 * Always on top: above hand cards (`makeHandCardView` uses depth 10-16) and
 * above the victory reward overlay's card views (`runVictory` uses depth 401),
 * regardless of which surface triggered the hover (U11 / KTD7).
 */
export const TOOLTIP_DEPTH = 500;

const PADDING = 10;
const HEADER_GAP = 6;
const LINE_GAP = 2;
/** Rough per-row estimate — a rules line can word-wrap onto more than one visual
 * row, which this constant can't know about; only used for the PRE-render size
 * fed to `computeTooltipPlacement` (x-clamp + flip decision), never for drawing. */
const ESTIMATED_LINE_HEIGHT = 16;
const ESTIMATED_HEADER_HEIGHT = 18;

/**
 * Estimated pixel height for a tooltip showing `lineCount` rules lines. The
 * caller (`TurnBattle.ts`) uses this to build the `tooltipSize` it hands to
 * `computeTooltipPlacement` BEFORE this container exists (so the placement's
 * x-clamp and flip-below decision have a size to work with). It is only ever
 * an estimate: `createCardTooltip` below measures the REAL rendered text
 * height and sizes/positions the panel from that, so an undercount here
 * (e.g. a line that word-wraps) never causes clipped or overlapping text —
 * it can only nudge the flip decision, which stays safe for real cards.
 */
export function estimateTooltipHeight(lineCount: number): number {
  return (
    PADDING * 2 +
    ESTIMATED_HEADER_HEIGHT +
    HEADER_GAP +
    Math.max(1, lineCount) * ESTIMATED_LINE_HEIGHT
  );
}

/**
 * Build (and return) a floating rules-text panel for `card`, positioned per
 * `placement`. Mirrors `pileView.ts`'s `createPileInspector` shape: a background
 * `graphics()` panel, then `scene.add.text(...)` rows added to one container.
 * Pure build — no lifecycle logic. The caller creates this on `pointerover` and
 * destroys it on `pointerout`/scene shutdown.
 *
 * The panel's actual height is measured from the real rendered text (rules
 * lines can word-wrap onto more than one visual row — a fixed per-line step
 * would either overlap rows or under-size the background), not from
 * `placement.h`'s pre-render estimate. To keep the geometry guarantees from
 * `computeTooltipPlacement` intact even when the real height differs from the
 * estimate, the panel grows from whichever edge that function held fixed:
 * a non-flipped placement's bottom edge is `anchorTop - ANCHOR_GAP`
 * (independent of tooltip height by construction), so it keeps that bottom
 * edge fixed and grows upward; a flipped placement keeps its top edge fixed
 * and grows downward.
 */
export function createCardTooltip(
  scene: Phaser.Scene,
  card: Pick<CardDef, 'name' | 'effects' | 'exhaust'>,
  placement: TooltipPlacement,
): Phaser.GameObjects.Container {
  const w = placement.w;
  const bodyWidth = w - PADDING * 2;

  let cursorY = PADDING;
  const header = scene.add
    .text(w / 2, cursorY, card.name, {
      fontFamily: 'monospace',
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#f1c40f',
    })
    .setOrigin(0.5, 0);
  cursorY += header.height + HEADER_GAP;

  const bodyTexts: Phaser.GameObjects.Text[] = [];
  for (const line of cardRulesLines(card)) {
    const text = scene.add
      .text(PADDING, cursorY, line, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#d8d2e4',
        wordWrap: { width: bodyWidth, useAdvancedWrap: true },
      })
      .setOrigin(0, 0);
    bodyTexts.push(text);
    cursorY += text.height + LINE_GAP;
  }

  const contentHeight = cursorY - LINE_GAP + PADDING;
  const containerY = placement.flippedBelow
    ? placement.y
    : placement.y + placement.h - contentHeight;
  const container = scene.add.container(placement.x, containerY).setDepth(TOOLTIP_DEPTH);

  const bg = scene.add.graphics();
  bg.fillStyle(0x111019, 0.96);
  bg.fillRoundedRect(0, 0, w, contentHeight, 8);
  bg.lineStyle(2, 0xcab98a, 0.85);
  bg.strokeRoundedRect(0, 0, w, contentHeight, 8);

  container.add(bg);
  container.add(header);
  container.add(bodyTexts);

  return container;
}
