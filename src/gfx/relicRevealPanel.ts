import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../config';
import type { Relic } from '../data/relics';

/** Chest pickup modal — shows relic name, description, and tinted chip. */
export function createRelicRevealPanel(
  scene: Phaser.Scene,
  relic: Relic,
  x: number,
  y: number,
  onDismiss: () => void,
): Phaser.GameObjects.Container {
  const w = 340;
  const h = 200;
  const panel = scene.add.container(x, y).setDepth(280);

  const dim = scene.add.graphics();
  dim.fillStyle(0x000000, 0.45);
  dim.fillRect(-GAME_W, -GAME_H, GAME_W * 2, GAME_H * 2);
  dim.setInteractive(
    new Phaser.Geom.Rectangle(-GAME_W, -GAME_H, GAME_W * 2, GAME_H * 2),
    Phaser.Geom.Rectangle.Contains,
  );
  dim.on('pointerdown', onDismiss);
  panel.add(dim);

  const bg = scene.add.graphics();
  bg.fillStyle(0x111019, 0.98);
  bg.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
  bg.lineStyle(2, relic.color, 0.9);
  bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
  panel.add(bg);

  const chip = scene.add.graphics();
  chip.fillStyle(relic.color, 1);
  chip.fillRoundedRect(-w / 2 + 24, -h / 2 + 28, 28, 28, 6);
  panel.add(chip);

  panel.add(
    scene.add
      .text(-w / 2 + 64, -h / 2 + 32, 'Relic Found!', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#b8b0c8',
      })
      .setOrigin(0, 0),
  );

  panel.add(
    scene.add
      .text(-w / 2 + 64, -h / 2 + 52, relic.name, {
        fontFamily: 'monospace',
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#f1c40f',
      })
      .setOrigin(0, 0),
  );

  panel.add(
    scene.add
      .text(0, 18, relic.description, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#d8d2e4',
        align: 'center',
        wordWrap: { width: w - 48, useAdvancedWrap: true },
      })
      .setOrigin(0.5),
  );

  const dismiss = scene.add
    .text(0, h / 2 - 32, '[ Click or Enter to continue ]', {
      fontFamily: 'monospace',
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#f5edd8',
      backgroundColor: '#221f1e',
      padding: { x: 10, y: 6 },
    })
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });
  dismiss.on('pointerover', () => dismiss.setColor('#ffe48a'));
  dismiss.on('pointerout', () => dismiss.setColor('#f5edd8'));
  dismiss.on('pointerdown', onDismiss);
  panel.add(dismiss);

  return panel;
}
