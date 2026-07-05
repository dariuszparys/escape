import Phaser from 'phaser';
import { PALETTE, panelTitleStyle } from './theme';

export interface PanelOptions {
  width: number;
  height: number;
  title: string;
  /** @default PALETTE.parchment */
  borderColor?: number;
  /** @default 0.96 */
  bgAlpha?: number;
  /** @default '24px' */
  titleSize?: string;
  /** @default 300 */
  depth?: number;
  /** Vertical offset of the title from the panel's top edge. @default 28 */
  titleOffsetY?: number;
}

/**
 * Shared rounded-rect panel chrome: fill + stroke + centered title.
 * Generalized from `createRelicPanel`'s scaffolding (src/gfx/relicPanel.ts).
 * Callers add their own rows/buttons on top of the returned container.
 */
export function createPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  opts: PanelOptions,
): Phaser.GameObjects.Container {
  const {
    width,
    height,
    title,
    borderColor = PALETTE.parchment,
    bgAlpha = 0.96,
    titleSize = '24px',
    depth = 300,
    titleOffsetY = 28,
  } = opts;

  const panel = scene.add.container(x, y).setDepth(depth);

  const bg = scene.add.graphics();
  bg.fillStyle(PALETTE.panelBg, bgAlpha);
  bg.fillRoundedRect(-width / 2, -height / 2, width, height, 8);
  bg.lineStyle(2, borderColor, 0.85);
  bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 8);
  panel.add(bg);

  panel.add(
    scene.add.text(0, -height / 2 + titleOffsetY, title, panelTitleStyle(titleSize)).setOrigin(0.5),
  );

  return panel;
}
