import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../config';
import {
  CAMPFIRE_PURCHASES,
  buyCampfirePurchase,
  canBuyCampfirePurchase,
} from '../data/campfirePurchases';
import type { CampfirePurchaseDef } from '../data/campfirePurchases';
import { loadDailyRecord } from '../daily';
import { loadRunChronicle } from '../chronicle';
import {
  formatChronicleLine,
  formatDailyRecordLine,
  formatPendingPrepSummary,
} from '../game/campfireSummary';
import { getMeta, setMeta } from '../meta';
import { playSfx } from '../audio/sfx';

const TEXT_STYLE = {
  fontFamily: 'monospace',
  color: '#f5edd8',
};

const FOREGROUND_DEPTH = 10;
const ROW_X = 48;
const ROW_W = 430;
const ROW_H = 62;
const ROW_START_Y = 116;
const ROW_GAP = 74;
const STATUS_X = 514;
const STATUS_W = 164;

export class SuppliesScene extends Phaser.Scene {
  private dynamic!: Phaser.GameObjects.Container;

  constructor() {
    super('Supplies');
  }

  create(): void {
    this.cameras.main.fadeIn(250, 11, 10, 18);
    this.drawBackroom();
    this.dynamic = this.add.container(0, 0).setDepth(FOREGROUND_DEPTH);
    this.game.events.on('meta-update', this.redraw, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('meta-update', this.redraw, this);
    });
    this.input.keyboard?.once('keydown-ESC', () => this.scene.start('Campfire'));
    this.redraw();
  }

  private drawBackroom(): void {
    const bg = this.add.graphics();
    bg.fillStyle(0x0b0a12, 1);
    bg.fillRect(0, 0, GAME_W, GAME_H);

    for (let y = 0; y < GAME_H; y += 48) {
      for (let x = 0; x < GAME_W; x += 48) {
        const shade = (x / 48 + y / 48) % 2 === 0 ? 0x17151c : 0x121018;
        bg.fillStyle(shade, 0.7);
        bg.fillRect(x, y, 48, 48);
      }
    }

    bg.fillStyle(0x000000, 0.36);
    bg.fillRect(0, 0, GAME_W, 86);
    bg.fillRect(0, 548, GAME_W, GAME_H - 548);
    bg.fillStyle(0x120d0d, 0.72);
    bg.fillRect(494, 92, 184, 420);
  }

  private redraw(): void {
    this.dynamic.removeAll(true);
    const meta = getMeta();
    const chronicle = loadRunChronicle();
    const dailyRecord = loadDailyRecord();

    this.addBackButton();
    this.dynamic.add(
      this.add
        .text(GAME_W / 2, 50, 'SUPPLIES', {
          ...TEXT_STYLE,
          fontSize: '34px',
          fontStyle: 'bold',
          color: '#f1c40f',
        })
        .setOrigin(0.5),
    );
    this.dynamic.add(
      this.add
        .text(630, 52, `Embers: ${meta.embers}`, {
          ...TEXT_STYLE,
          fontSize: '16px',
          color: '#f5edd8',
        })
        .setOrigin(0.5),
    );

    for (const [index, purchase] of CAMPFIRE_PURCHASES.entries()) {
      this.addPurchaseRow(purchase, ROW_START_Y + index * ROW_GAP);
    }

    this.addStatusText('NEXT RUN', STATUS_X, 118, '#f1c40f', '16px', true);
    this.addStatusText(
      formatPendingPrepSummary(meta.pendingPrep),
      STATUS_X,
      150,
      '#b8b0c8',
      '12px',
      false,
    );
    this.addStatusText('RECORDS', STATUS_X, 278, '#f1c40f', '16px', true);
    this.addStatusText(formatChronicleLine(chronicle), STATUS_X, 310, '#b8b0c8', '12px', false);
    this.addStatusText('TODAY', STATUS_X, 382, '#f1c40f', '16px', true);
    this.addStatusText(formatDailyRecordLine(dailyRecord), STATUS_X, 414, '#b8b0c8', '12px', false);
    this.addStatusText('BARGAINS', STATUS_X, 486, '#6f5032', '16px', true);
    this.addStatusText('None tonight.', STATUS_X, 518, '#6f687c', '12px', false);
  }

  private addBackButton(): void {
    const button = this.add
      .text(92, 52, '[ BACK ]', {
        ...TEXT_STYLE,
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#f1c40f',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    button.on('pointerover', () => button.setColor('#ffe48a'));
    button.on('pointerout', () => button.setColor('#f1c40f'));
    button.on('pointerdown', () => this.scene.start('Campfire'));
    this.dynamic.add(button);
  }

  private addStatusText(
    text: string,
    x: number,
    y: number,
    color: string,
    fontSize: string,
    bold: boolean,
  ): void {
    this.dynamic.add(
      this.add.text(x, y, text, {
        ...TEXT_STYLE,
        fontSize,
        fontStyle: bold ? 'bold' : undefined,
        color,
        fixedWidth: STATUS_W,
        wordWrap: { width: STATUS_W, useAdvancedWrap: true },
        lineSpacing: 8,
      }),
    );
  }

  private addPurchaseRow(purchase: CampfirePurchaseDef, y: number): void {
    const meta = getMeta();
    const check = canBuyCampfirePurchase(meta, purchase.id);
    const enabled = check.ok;
    const bg = this.add.graphics();

    const drawBg = (color: number, lineColor: number) => {
      bg.clear();
      bg.fillStyle(color, 0.94);
      bg.fillRect(ROW_X, y, ROW_W, ROW_H);
      bg.lineStyle(1, lineColor, enabled ? 0.82 : 0.46);
      bg.strokeRect(ROW_X, y, ROW_W, ROW_H);
    };

    drawBg(enabled ? 0x221f1e : 0x17151c, enabled ? 0x6f5032 : 0x393344);

    const title = this.add.text(ROW_X + 16, y + 12, `${purchase.name} - ${purchase.cost} embers`, {
      ...TEXT_STYLE,
      fontSize: '15px',
      fontStyle: 'bold',
      color: enabled ? '#f5edd8' : '#6f687c',
    });
    const detail = this.add.text(
      ROW_X + 16,
      y + 36,
      enabled ? purchase.description : `${purchase.description} ${check.reason}`,
      {
        ...TEXT_STYLE,
        fontSize: '12px',
        color: enabled ? '#b8b0c8' : '#5d566d',
        fixedWidth: ROW_W - 32,
        wordWrap: { width: ROW_W - 32, useAdvancedWrap: true },
      },
    );
    const hit = this.add.zone(ROW_X + ROW_W / 2, y + ROW_H / 2, ROW_W, ROW_H);

    if (enabled) {
      hit.setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => {
        drawBg(0x2d261f, 0xf1c40f);
        title.setColor('#ffe48a');
      });
      hit.on('pointerout', () => {
        drawBg(0x221f1e, 0x6f5032);
        title.setColor('#f5edd8');
      });
      hit.on('pointerdown', () => this.buyPurchase(purchase.id));
    }

    this.dynamic.add([bg, title, detail, hit]);
  }

  private buyPurchase(id: CampfirePurchaseDef['id']): void {
    const meta = getMeta();
    const result = buyCampfirePurchase(meta, id);
    if (!result.ok) return;

    const updated = setMeta({
      ...meta,
      embers: result.state.embers,
      pendingPrep: result.state.pendingPrep,
    });
    this.game.events.emit('meta-update', updated);
    playSfx(this, 'purchase');
    this.redraw();
  }
}
