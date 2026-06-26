import Phaser from 'phaser';
import { Card } from '../data/cards';
import { orderedDeckEntries } from '../game/deckOrdering';

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

export function createDeckPanel(
  scene: Phaser.Scene,
  title: string,
  x: number,
  y: number,
  collection: readonly Card[],
  combatHand: readonly Card[],
): Phaser.GameObjects.Container {
  const entries = orderedDeckEntries(collection, combatHand);
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
        'Top 5 cards fight, and at least 3 offensive cards stay in hand.',
        {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#b8b0c8',
          align: 'center',
        },
      )
      .setOrigin(0.5),
  );

  panel.add(
    scene.add
      .text(0, -height / 2 + 78, 'Priority: tier > combat score > total value > name', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#6a6478',
        align: 'center',
      })
      .setOrigin(0.5),
  );

  const visibleEntries = entries.slice(0, 12);
  for (const [index, entry] of visibleEntries.entries()) {
    const rowY = -height / 2 + 112 + index * 18;
    const badge = entry.inHand ? 'HAND' : 'RES ';
    const name =
      entry.card.name.length > 18
        ? `${entry.card.name.slice(0, 17)}…`
        : entry.card.name.padEnd(18, ' ');
    panel.add(
      scene.add.text(
        -width / 2 + 22,
        rowY,
        `${String(index + 1).padStart(2, ' ')}. ${badge} ${name} ${cardTypeTag(entry.card)} s${entry.card.speed}`,
        {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: entry.inHand ? '#f5edd8' : '#8e889a',
        },
      ),
    );
  }

  if (entries.length > visibleEntries.length) {
    panel.add(
      scene.add
        .text(0, height / 2 - 38, `+${entries.length - visibleEntries.length} more reserve cards`, {
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
