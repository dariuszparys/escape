import Phaser from 'phaser';
import { Card } from '../data/cards';
import { cardCost } from '../game/turnEngine';

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
  const panel = scene.add.container(x, y).setDepth(300);

  const bg = scene.add.graphics();
  bg.fillStyle(0x111019, 0.96);
  bg.fillRoundedRect(-width / 2, -height / 2, width, height, 8);
  bg.lineStyle(2, 0xcab98a, 0.85);
  bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 8);
  panel.add(bg);

  panel.add(
    scene.add
      .text(0, -height / 2 + 28, title, {
        fontFamily: 'monospace',
        fontSize: '24px',
        fontStyle: 'bold',
        color: '#f1c40f',
      })
      .setOrigin(0.5),
  );

  panel.add(
    scene.add
      .text(
        0,
        -height / 2 + 58,
        `${entries.length} cards — your whole collection is your battle deck.`,
        {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#b8b0c8',
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
        {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#f5edd8',
        },
      ),
    );
  }

  if (entries.length > visibleEntries.length) {
    panel.add(
      scene.add
        .text(0, height / 2 - 38, `+${entries.length - visibleEntries.length} more cards`, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#6a6478',
        })
        .setOrigin(0.5),
    );
  }

  panel.add(
    scene.add
      .text(0, height / 2 - 18, '[C] close', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#b8b0c8',
      })
      .setOrigin(0.5),
  );

  return panel;
}
