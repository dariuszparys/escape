import Phaser from 'phaser';
import type { Relic } from '../data/relics';

export const RELIC_TOOLTIP_DEPTH = 520;

const MONO = 'monospace';

/** Floating name + description panel for a hovered relic chip. */
export function createRelicTooltip(
  scene: Phaser.Scene,
  relic: Pick<Relic, 'name' | 'description' | 'color'>,
  x: number,
  y: number,
  width = 220,
): Phaser.GameObjects.Container {
  const pad = 8;
  const name = scene.add.text(pad, pad, relic.name, {
    fontFamily: MONO,
    fontSize: '12px',
    fontStyle: 'bold',
    color: '#f1c40f',
  });
  const desc = scene.add.text(pad, pad + name.height + 4, relic.description, {
    fontFamily: MONO,
    fontSize: '10px',
    color: '#d8d2e4',
    wordWrap: { width: width - pad * 2, useAdvancedWrap: true },
  });
  const h = pad * 2 + name.height + 4 + desc.height;
  const bg = scene.add.graphics();
  bg.fillStyle(0x111019, 0.96);
  bg.fillRoundedRect(0, 0, width, h, 8);
  bg.lineStyle(2, relic.color, 0.85);
  bg.strokeRoundedRect(0, 0, width, h, 8);
  return scene.add.container(x, y, [bg, name, desc]).setDepth(RELIC_TOOLTIP_DEPTH);
}
