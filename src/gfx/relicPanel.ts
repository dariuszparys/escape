import Phaser from 'phaser';
import type { Relic } from '../data/relics';

/**
 * In-run relic inspector — lists owned relics with full descriptions.
 * Mirrors `createDeckPanel` shape.
 */
export function createRelicPanel(
  scene: Phaser.Scene,
  title: string,
  x: number,
  y: number,
  relics: readonly Relic[],
  closeHint = '[R] close',
): Phaser.GameObjects.Container {
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

  if (relics.length === 0) {
    panel.add(
      scene.add
        .text(0, -10, 'No relics yet.\nFind them in chests, elite fights, and boss rooms.', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#b8b0c8',
          align: 'center',
          lineSpacing: 6,
        })
        .setOrigin(0.5),
    );
  } else {
    panel.add(
      scene.add
        .text(
          0,
          -height / 2 + 58,
          `${relics.length} relic${relics.length === 1 ? '' : 's'} — passive bonuses for this run.`,
          {
            fontFamily: 'monospace',
            fontSize: '10px',
            color: '#b8b0c8',
            align: 'center',
          },
        )
        .setOrigin(0.5),
    );

    const visible = relics.slice(0, 6);
    for (const [index, relic] of visible.entries()) {
      const rowY = -height / 2 + 88 + index * 38;
      const chip = scene.add.graphics();
      chip.fillStyle(relic.color, 1);
      chip.fillRoundedRect(-width / 2 + 18, rowY - 6, 14, 14, 3);
      panel.add(chip);
      panel.add(
        scene.add.text(-width / 2 + 40, rowY - 8, relic.name, {
          fontFamily: 'monospace',
          fontSize: '12px',
          fontStyle: 'bold',
          color: '#f5edd8',
        }),
      );
      const desc =
        relic.description.length > 52 ? `${relic.description.slice(0, 51)}…` : relic.description;
      panel.add(
        scene.add.text(-width / 2 + 40, rowY + 8, desc, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#b8b0c8',
        }),
      );
    }

    if (relics.length > visible.length) {
      panel.add(
        scene.add
          .text(0, height / 2 - 38, `+${relics.length - visible.length} more relics`, {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#6a6478',
          })
          .setOrigin(0.5),
      );
    }
  }

  panel.add(
    scene.add
      .text(0, height / 2 - 18, closeHint, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#b8b0c8',
      })
      .setOrigin(0.5),
  );

  return panel;
}
