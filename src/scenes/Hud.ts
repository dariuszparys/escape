import Phaser from 'phaser';
import { GAME_W, MAX_HAND, MAX_DEPTH, ROOM_H, HUD_H, MAX_INVENTORY } from '../config';
import { primaryCardValue } from '../data/cards';
import { getRun } from '../state';

const TYPE_COLOR: Record<string, string> = {
  attack: '#e87060',
  block: '#7fb2e8',
  heal: '#5fe07a',
  utility: '#90d8e8',
  status: '#c490e8',
};

export class HudScene extends Phaser.Scene {
  private dynamic!: Phaser.GameObjects.Container;

  constructor() {
    super('Hud');
  }

  create(): void {
    const bg = this.add.graphics();
    bg.fillStyle(0x16121e, 1);
    bg.fillRect(0, ROOM_H, GAME_W, HUD_H);
    bg.lineStyle(2, 0x3a3544, 1);
    bg.lineBetween(0, ROOM_H + 1, GAME_W, ROOM_H + 1);

    this.dynamic = this.add.container(0, 0);

    this.game.events.on('hud-update', this.redraw, this);
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('hud-update', this.redraw, this);
    });
    this.redraw();
  }

  private redraw(): void {
    this.dynamic.removeAll(true);
    const run = getRun();
    const y0 = ROOM_H;

    // hearts: 10 hearts, 3 HP each
    for (let i = 0; i < 10; i++) {
      const full = run.hp >= (i + 1) * 3 - 1;
      const img = this.add.image(
        28 + (i % 5) * 26,
        y0 + 24 + Math.floor(i / 5) * 24,
        full ? 'heart' : 'heart_empty',
      );
      img.setScale(2.4);
      this.dynamic.add(img);
    }
    this.dynamic.add(
      this.add.text(28, y0 + 78, `HP ${Math.max(0, run.hp)}/${run.maxHp}`, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#d8d2e4',
      }),
    );

    // cards
    const cardX0 = 200;
    this.dynamic.add(
      this.add.text(
        cardX0,
        y0 + 10,
        `HAND ${run.combatHand.length}/${MAX_HAND}  DECK ${run.cardCollection.length}`,
        {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#b8b0c8',
        },
      ),
    );
    for (const [i, card] of run.combatHand.entries()) {
      const x = cardX0 + i * 62;
      const g = this.add.graphics();
      g.fillStyle(0x1c1826, 1);
      g.fillRoundedRect(x, y0 + 30, 56, 64, 5);
      g.lineStyle(1, card.color, 1);
      g.strokeRoundedRect(x, y0 + 30, 56, 64, 5);
      this.dynamic.add(g);
      this.dynamic.add(
        this.add
          .text(x + 28, y0 + 44, card.name.split(' ')[0], {
            fontFamily: 'monospace',
            fontSize: '9px',
            color: '#f5edd8',
          })
          .setOrigin(0.5),
      );
      this.dynamic.add(
        this.add
          .text(x + 28, y0 + 66, String(primaryCardValue(card)), {
            fontFamily: 'monospace',
            fontSize: '20px',
            fontStyle: 'bold',
            color: TYPE_COLOR[card.type],
          })
          .setOrigin(0.5),
      );
      this.dynamic.add(
        this.add
          .text(x + 28, y0 + 84, card.type.toUpperCase(), {
            fontFamily: 'monospace',
            fontSize: '8px',
            color: '#b8b0c8',
          })
          .setOrigin(0.5),
      );
    }

    // inventory + depth
    const invX = 545;
    this.dynamic.add(
      this.add.text(invX, y0 + 12, `GOLD ${run.gold}`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#f1c40f',
      }),
    );
    this.dynamic.add(this.add.image(invX, y0 + 42, 'potion').setScale(2));
    this.dynamic.add(
      this.add
        .text(invX + 22, y0 + 42, `${run.inventory.length}/${MAX_INVENTORY}`, {
          fontFamily: 'monospace',
          fontSize: '15px',
          fontStyle: 'bold',
          color: '#f5edd8',
        })
        .setOrigin(0, 0.5),
    );
    this.dynamic.add(this.add.image(invX, y0 + 74, 'armor').setScale(2));
    this.dynamic.add(
      this.add
        .text(invX + 22, y0 + 74, `x${run.armor}`, {
          fontFamily: 'monospace',
          fontSize: '15px',
          fontStyle: 'bold',
          color: '#f5edd8',
        })
        .setOrigin(0, 0.5),
    );
    this.dynamic.add(
      this.add
        .text(
          invX,
          y0 + 94,
          run.scoutCharges > 0
            ? `SCOUT x${run.scoutCharges}  [P] potion  [C] cards`
            : '[P] drink potion  [C] cards',
          {
            fontFamily: 'monospace',
            fontSize: '9px',
            color: run.scoutCharges > 0 ? '#f1c40f' : '#6a6478',
          },
        )
        .setOrigin(0, 0.5),
    );

    this.dynamic.add(
      this.add
        .text(GAME_W - 24, y0 + 30, `ROOM ${Math.min(run.depth, MAX_DEPTH)}/${MAX_DEPTH}`, {
          fontFamily: 'monospace',
          fontSize: '17px',
          fontStyle: 'bold',
          color: run.depth >= MAX_DEPTH ? '#ff5544' : '#f1c40f',
        })
        .setOrigin(1, 0.5),
    );
  }
}
