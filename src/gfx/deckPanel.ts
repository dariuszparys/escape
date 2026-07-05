import Phaser from 'phaser';
import { Card } from '../data/cards';
import { cardCost } from '../game/turnEngine';
import { createPanel } from './panel';
import { FONT_FAMILY, TEXT_COLOR, bodyStyle } from './theme';

function cardTypeTag(card: Card): string {
  return card.type === 'attack'
    ? 'ATK'
    : card.type === 'block'
      ? 'BLK'
      : card.type === 'heal'
        ? 'HEAL'
        : card.type === 'utility'
          ? 'UTIL'
          : 'STAT';
}

/**
 * Collection browser (U12): under the deck model every card fights, so the
 * panel lists the whole collection — no hand/reserve split, no selection
 * priority copy. Sorted for reading (tier, then name), never draw order.
 */
export function createDeckPanel(
  scene: Phaser.Scene,
  title: string,
  x: number,
  y: number,
  collection: readonly Card[],
): Phaser.GameObjects.Container {
  const entries = [...collection].sort(
    (a, b) => b.tier - a.tier || a.name.localeCompare(b.name) || a.uid - b.uid,
  );
  const width = 420;
  const height = 348;
  const panel = createPanel(scene, x, y, { width, height, title });

  panel.add(
    scene.add
      .text(
        0,
        -height / 2 + 58,
        `${entries.length} cards — your whole collection is your battle deck.`,
        {
          fontFamily: FONT_FAMILY,
          fontSize: '10px',
          color: TEXT_COLOR.muted,
          align: 'center',
        },
      )
      .setOrigin(0.5),
  );

  const visibleEntries = entries.slice(0, 12);
  for (const [index, card] of visibleEntries.entries()) {
    const rowY = -height / 2 + 88 + index * 18;
    const name = card.name.length > 20 ? `${card.name.slice(0, 19)}…` : card.name.padEnd(20, ' ');
    panel.add(
      scene.add.text(
        -width / 2 + 22,
        rowY,
        `${String(index + 1).padStart(2, ' ')}. ${name} ${cardTypeTag(card)}  ${cardCost(card)}⚡ T${card.tier}`,
        bodyStyle('11px', TEXT_COLOR.primary),
      ),
    );
  }

  if (entries.length > visibleEntries.length) {
    panel.add(
      scene.add
        .text(
          0,
          height / 2 - 38,
          `+${entries.length - visibleEntries.length} more cards`,
          bodyStyle('11px', TEXT_COLOR.faint),
        )
        .setOrigin(0.5),
    );
  }

  panel.add(
    scene.add
      .text(0, height / 2 - 18, '[C] close', bodyStyle('12px', TEXT_COLOR.muted))
      .setOrigin(0.5),
  );

  return panel;
}
