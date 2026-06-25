import Phaser from 'phaser';
import { Card, primaryCardValue } from '../data/cards';

export const CARD_W = 104;
export const CARD_H = 140;

const TYPE_LABEL: Record<string, string> = {
  attack: 'ATK',
  block: 'BLK',
  heal: 'HEAL',
  utility: 'UTIL',
  status: 'STAT',
};

/** Render a card as a container centered on (x, y). */
export function makeCardView(
  scene: Phaser.Scene,
  card: Card,
  x: number,
  y: number,
  scale = 1,
): Phaser.GameObjects.Container {
  const w = CARD_W;
  const h = CARD_H;
  const g = scene.add.graphics();
  g.fillStyle(0x1c1826, 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
  g.lineStyle(2, 0xcab98a, 1);
  g.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
  g.fillStyle(card.color, 1);
  g.fillRoundedRect(-w / 2 + 5, -h / 2 + 5, w - 10, 26, 5);

  const name = scene.add
    .text(0, -h / 2 + 18, card.name, {
      fontFamily: 'monospace',
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#ffffff',
    })
    .setOrigin(0.5);

  const value = scene.add
    .text(0, -4, String(primaryCardValue(card)), {
      fontFamily: 'monospace',
      fontSize: '40px',
      fontStyle: 'bold',
      color: '#f5edd8',
    })
    .setOrigin(0.5);

  const type = scene.add
    .text(0, 30, TYPE_LABEL[card.type], {
      fontFamily: 'monospace',
      fontSize: '14px',
      fontStyle: 'bold',
      color: Phaser.Display.Color.IntegerToColor(card.color).rgba,
    })
    .setOrigin(0.5);

  const desc = scene.add
    .text(0, h / 2 - 18, card.description, {
      fontFamily: 'monospace',
      fontSize: '9px',
      color: '#b8b0c8',
    })
    .setOrigin(0.5);

  const c = scene.add.container(x, y, [g, name, value, type, desc]);
  c.setSize(w, h);
  c.setScale(scale);
  return c;
}

/** Face-down card back. */
export function makeCardBack(scene: Phaser.Scene, x: number, y: number, scale = 1): Phaser.GameObjects.Container {
  const w = CARD_W;
  const h = CARD_H;
  const g = scene.add.graphics();
  g.fillStyle(0x2a2440, 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
  g.lineStyle(2, 0x6a5a9a, 1);
  g.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
  g.lineStyle(2, 0x4a3f70, 1);
  g.strokeRoundedRect(-w / 2 + 10, -h / 2 + 10, w - 20, h - 20, 6);
  g.strokeCircle(0, 0, 18);
  const c = scene.add.container(x, y, [g]);
  c.setSize(w, h);
  c.setScale(scale);
  return c;
}
