import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../config';
import { Card } from '../data/cards';
import { cardCost } from '../game/turnEngine';

const TYPE_TAG: Record<string, string> = {
  attack: 'ATK',
  block: 'BLK',
  heal: 'HEAL',
  utility: 'UTIL',
  status: 'STAT',
};

const MAX_ROWS = 14;

function cardRow(card: Card): string {
  const name = card.name.length > 16 ? `${card.name.slice(0, 15)}…` : card.name.padEnd(16, ' ');
  return `${name} ${TYPE_TAG[card.type] ?? '????'} ${cardCost(card)}⚡`;
}

function addColumn(
  scene: Phaser.Scene,
  panel: Phaser.GameObjects.Container,
  x: number,
  title: string,
  note: string,
  cards: readonly Card[],
  top: number,
): void {
  panel.add(
    scene.add
      .text(x, top, title, {
        fontFamily: 'monospace',
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#f1c40f',
      })
      .setOrigin(0.5),
  );
  panel.add(
    scene.add
      .text(x, top + 18, note, { fontFamily: 'monospace', fontSize: '9px', color: '#6a6478' })
      .setOrigin(0.5),
  );
  const visible = cards.slice(0, MAX_ROWS);
  for (const [index, card] of visible.entries()) {
    panel.add(
      scene.add
        .text(x, top + 40 + index * 17, cardRow(card), {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#d8d2e4',
        })
        .setOrigin(0.5, 0),
    );
  }
  if (cards.length > visible.length) {
    panel.add(
      scene.add
        .text(x, top + 40 + visible.length * 17, `+${cards.length - visible.length} more`, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#6a6478',
        })
        .setOrigin(0.5, 0),
    );
  }
  if (cards.length === 0) {
    panel.add(
      scene.add
        .text(x, top + 40, '(empty)', {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#6a6478',
        })
        .setOrigin(0.5, 0),
    );
  }
}

/**
 * The R4 pile inspector: draw pile in SORTED order (tier, then name — never the
 * true draw order), discard pile in TRUE order with the newest discard on top,
 * exhaust pile (R8) in whatever order cards left play — exhausted cards never
 * reshuffle or reorder mid-battle, so accumulation order is already informative.
 */
export function createPileInspector(
  scene: Phaser.Scene,
  drawPile: readonly Card[],
  discardPile: readonly Card[],
  exhaustPile: readonly Card[],
): Phaser.GameObjects.Container {
  const width = 660;
  const height = 400;
  const panel = scene.add.container(GAME_W / 2, GAME_H / 2 - 24).setDepth(300);

  const bg = scene.add.graphics();
  bg.fillStyle(0x111019, 0.96);
  bg.fillRoundedRect(-width / 2, -height / 2, width, height, 8);
  bg.lineStyle(2, 0xcab98a, 0.85);
  bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 8);
  bg.lineStyle(1, 0x3a3544, 1);
  bg.lineBetween(-width / 6, -height / 2 + 16, -width / 6, height / 2 - 34);
  bg.lineBetween(width / 6, -height / 2 + 16, width / 6, height / 2 - 34);
  panel.add(bg);

  const sortedDraw = [...drawPile].sort(
    (a, b) => a.tier - b.tier || a.name.localeCompare(b.name) || a.uid - b.uid,
  );
  const newestFirstDiscard = [...discardPile].reverse();

  addColumn(
    scene,
    panel,
    -width / 3,
    `Draw pile (${drawPile.length})`,
    'sorted — not draw order',
    sortedDraw,
    -height / 2 + 22,
  );
  addColumn(
    scene,
    panel,
    0,
    `Discard (${discardPile.length})`,
    'true order — newest first',
    newestFirstDiscard,
    -height / 2 + 22,
  );
  addColumn(
    scene,
    panel,
    width / 3,
    `Exhausted (${exhaustPile.length})`,
    'gone for this battle',
    exhaustPile,
    -height / 2 + 22,
  );

  panel.add(
    scene.add
      .text(0, height / 2 - 20, '[C] close', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#b8b0c8',
      })
      .setOrigin(0.5),
  );

  return panel;
}
