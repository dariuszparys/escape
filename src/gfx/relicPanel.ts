import Phaser from 'phaser';
import type { Relic } from '../data/relics';
import { createPanel } from './panel';
import { FONT_FAMILY, TEXT_COLOR, bodyStyle } from './theme';

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
  const panel = createPanel(scene, x, y, { width, height, title });

  if (relics.length === 0) {
    panel.add(
      scene.add
        .text(0, -10, 'No relics yet.\nFind them in chests, elite fights, and boss rooms.', {
          fontFamily: FONT_FAMILY,
          fontSize: '12px',
          color: TEXT_COLOR.muted,
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
            fontFamily: FONT_FAMILY,
            fontSize: '10px',
            color: TEXT_COLOR.muted,
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
          fontFamily: FONT_FAMILY,
          fontSize: '12px',
          fontStyle: 'bold',
          color: TEXT_COLOR.primary,
        }),
      );
      const desc =
        relic.description.length > 52 ? `${relic.description.slice(0, 51)}…` : relic.description;
      panel.add(
        scene.add.text(-width / 2 + 40, rowY + 8, desc, bodyStyle('10px', TEXT_COLOR.muted)),
      );
    }

    if (relics.length > visible.length) {
      panel.add(
        scene.add
          .text(
            0,
            height / 2 - 38,
            `+${relics.length - visible.length} more relics`,
            bodyStyle('11px', TEXT_COLOR.faint),
          )
          .setOrigin(0.5),
      );
    }
  }

  panel.add(
    scene.add
      .text(0, height / 2 - 18, closeHint, bodyStyle('12px', TEXT_COLOR.muted))
      .setOrigin(0.5),
  );

  return panel;
}
