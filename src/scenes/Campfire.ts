import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../config';
import { applyPendingPrepToRun } from '../game/campfirePrep';
import {
  CAMPFIRE_BARGAINS,
  acceptCampfireBargain,
  canAcceptCampfireBargain,
  formatCampfireCurseSummary,
} from '../data/campfireBargains';
import type { CampfireBargainDef } from '../data/campfireBargains';
import type { PendingPrep } from '../data/campfirePurchases';
import { dailyKey, dailySeed, loadDailyRecord } from '../daily';
import { loadRunChronicle } from '../chronicle';
import {
  formatChronicleLine,
  formatDailyRecordLine,
  formatPendingPrepSummary,
} from '../game/campfireSummary';
import { getMeta, setMeta } from '../meta';
import { newRun } from '../state';
import { playSfx } from '../audio/sfx';

const TEXT_STYLE = {
  fontFamily: 'monospace',
  color: '#f5edd8',
};

const FIRE_X = 210;
const FIRE_Y = 348;
const HERO_X = 104;
const HERO_Y = 356;
const STATUS_X = 392;
const STATUS_W = 290;
const FOREGROUND_DEPTH = 10;
const OVERLAY_DEPTH = 30;
const ACTION_Y = 584;

export class CampfireScene extends Phaser.Scene {
  private dynamic!: Phaser.GameObjects.Container;
  private bargainOverlay?: Phaser.GameObjects.Container;

  constructor() {
    super('Campfire');
  }

  create(): void {
    this.cameras.main.fadeIn(350, 11, 10, 18);
    this.drawCell();
    this.dynamic = this.add.container(0, 0).setDepth(FOREGROUND_DEPTH);
    this.game.events.on('meta-update', this.redraw, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('meta-update', this.redraw, this);
      this.closeBargainOverlay();
    });
    this.redraw();
  }

  private drawCell(): void {
    const bg = this.add.graphics();
    bg.fillStyle(0x0b0a12, 1);
    bg.fillRect(0, 0, GAME_W, GAME_H);

    for (let y = 0; y < GAME_H; y += 48) {
      for (let x = 0; x < GAME_W; x += 48) {
        const key = (x / 48 + y / 48) % 2 === 0 ? 'floor_a' : 'floor_b';
        this.add
          .image(x + 24, y + 24, key)
          .setScale(3)
          .setAlpha(0.18);
      }
    }

    const shadows = this.add.graphics();
    shadows.fillStyle(0x000000, 0.42);
    shadows.fillRect(0, 0, GAME_W, 74);
    shadows.fillRect(0, 470, GAME_W, GAME_H - 470);
    shadows.fillRect(0, 0, 58, GAME_H);
    shadows.fillRect(GAME_W - 58, 0, 58, GAME_H);

    const fireGlow = this.add.graphics().setDepth(1);
    fireGlow.fillStyle(0xf1a23a, 0.14);
    fireGlow.fillCircle(FIRE_X, FIRE_Y, 110);
    this.tweens.add({
      targets: fireGlow,
      alpha: 0.45,
      duration: 760,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const hero = this.add.image(HERO_X, HERO_Y, 'hero_down_0').setScale(5).setDepth(3);
    hero.setTint(0xc4baa0);
    this.tweens.add({
      targets: hero,
      y: HERO_Y - 6,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.drawFire();
  }

  private drawFire(): void {
    const logs = this.add.graphics().setDepth(3);
    logs.lineStyle(8, 0x5c321f, 1);
    logs.lineBetween(FIRE_X - 42, FIRE_Y + 14, FIRE_X + 38, FIRE_Y + 28);
    logs.lineBetween(FIRE_X + 42, FIRE_Y + 14, FIRE_X - 38, FIRE_Y + 28);
    logs.fillStyle(0x26160f, 1);
    logs.fillEllipse(FIRE_X, FIRE_Y + 24, 106, 18);

    const outer = this.add.graphics().setDepth(4);
    outer.fillStyle(0xff7a2f, 0.95);
    outer.fillTriangle(FIRE_X - 28, FIRE_Y + 15, FIRE_X, FIRE_Y - 67, FIRE_X + 24, FIRE_Y + 15);

    const inner = this.add.graphics().setDepth(5);
    inner.fillStyle(0xf1c40f, 0.96);
    inner.fillTriangle(
      FIRE_X - 14,
      FIRE_Y + 17,
      FIRE_X + 10,
      FIRE_Y - 45,
      FIRE_X + 24,
      FIRE_Y + 17,
    );

    this.tweens.add({
      targets: outer,
      scaleY: 0.9,
      alpha: 0.7,
      duration: 420,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.tweens.add({
      targets: inner,
      x: -4,
      scaleY: 1.08,
      duration: 360,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private redraw(): void {
    this.dynamic.removeAll(true);
    const meta = getMeta();
    const dailyRecord = loadDailyRecord();
    const chronicle = loadRunChronicle();

    this.dynamic.add(
      this.add
        .text(GAME_W / 2, 50, 'THE LAST FIRE', {
          ...TEXT_STYLE,
          fontSize: '38px',
          fontStyle: 'bold',
          color: '#f1c40f',
        })
        .setOrigin(0.5),
    );

    this.dynamic.add(
      this.add
        .text(GAME_W / 2, 94, `Embers: ${meta.embers}`, {
          ...TEXT_STYLE,
          fontSize: '18px',
          color: '#f5edd8',
        })
        .setOrigin(0.5),
    );
    this.dynamic.add(
      this.add
        .text(GAME_W / 2, 120, formatChronicleLine(chronicle), {
          ...TEXT_STYLE,
          fontSize: '12px',
          color: '#b8b0c8',
        })
        .setOrigin(0.5),
    );

    this.dynamic.add(
      this.add.text(STATUS_X, 220, 'NEXT RUN', {
        ...TEXT_STYLE,
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#f1c40f',
      }),
    );
    this.dynamic.add(
      this.add.text(STATUS_X, 254, this.formatPendingPrepSummary(meta.pendingPrep), {
        ...TEXT_STYLE,
        fontSize: '13px',
        color: '#b8b0c8',
        lineSpacing: 8,
        fixedWidth: STATUS_W,
        wordWrap: { width: STATUS_W, useAdvancedWrap: true },
      }),
    );
    this.dynamic.add(
      this.add.text(STATUS_X, 368, 'TODAY', {
        ...TEXT_STYLE,
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#f1c40f',
      }),
    );
    this.dynamic.add(
      this.add.text(STATUS_X, 402, formatDailyRecordLine(dailyRecord), {
        ...TEXT_STYLE,
        fontSize: '13px',
        color: '#b8b0c8',
        fixedWidth: STATUS_W,
        wordWrap: { width: STATUS_W, useAdvancedWrap: true },
      }),
    );

    this.addActionButton(92, '[ SUPPLIES ]', () => this.scene.start('Supplies'));
    this.addActionButton(250, '[ BARGAINS ]', () => this.openBargainOverlay());
    this.addActionButton(407, '[ DESCEND ]', () => this.startRun());
    this.addActionButton(592, '[ DAILY DESCENT ]', () => this.startDailyRun());
  }

  private addActionButton(x: number, label: string, onPointerDown: () => void): void {
    const button = this.add
      .text(x, ACTION_Y, label, {
        ...TEXT_STYLE,
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#f1c40f',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    button.on('pointerover', () => button.setColor('#ffe48a'));
    button.on('pointerout', () => button.setColor('#f1c40f'));
    button.on('pointerdown', onPointerDown);
    this.dynamic.add(button);
  }

  private formatPendingPrepSummary(prep: PendingPrep): string {
    return [formatPendingPrepSummary(prep), formatCampfireCurseSummary(prep.curseIds ?? [])].join(
      '\n',
    );
  }

  private openBargainOverlay(): void {
    this.closeBargainOverlay();

    const overlay = this.add.container(0, 0).setDepth(OVERLAY_DEPTH);
    this.bargainOverlay = overlay;

    const backdrop = this.add
      .rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.66)
      .setInteractive();
    const panel = this.add.graphics();
    panel.fillStyle(0x151018, 0.98);
    panel.fillRect(82, 96, 556, 390);
    panel.lineStyle(2, 0xf1c40f, 0.72);
    panel.strokeRect(82, 96, 556, 390);

    overlay.add([backdrop, panel]);
    overlay.add(
      this.add
        .text(GAME_W / 2, 126, 'CAMPFIRE BARGAINS', {
          ...TEXT_STYLE,
          fontSize: '22px',
          fontStyle: 'bold',
          color: '#f1c40f',
        })
        .setOrigin(0.5),
    );

    CAMPFIRE_BARGAINS.forEach((bargain, index) => {
      this.addBargainRow(overlay, bargain, 114, 168 + index * 112);
    });

    const close = this.add
      .text(GAME_W / 2, 454, '[ CLOSE ]', {
        ...TEXT_STYLE,
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#f1c40f',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    close.on('pointerover', () => close.setColor('#ffe48a'));
    close.on('pointerout', () => close.setColor('#f1c40f'));
    close.on('pointerdown', () => this.closeBargainOverlay());
    overlay.add(close);

    this.input.keyboard?.once('keydown-ESC', this.closeBargainOverlay, this);
  }

  private addBargainRow(
    overlay: Phaser.GameObjects.Container,
    bargain: CampfireBargainDef,
    x: number,
    y: number,
  ): void {
    const check = canAcceptCampfireBargain(getMeta(), bargain.id);
    const enabled = check.ok;
    const row = this.add.graphics();
    row.fillStyle(enabled ? 0x241c1a : 0x17151c, 0.98);
    row.fillRect(x, y, 492, 86);
    row.lineStyle(1, enabled ? 0x6f5032 : 0x393344, enabled ? 0.82 : 0.46);
    row.strokeRect(x, y, 492, 86);

    const title = this.add.text(x + 14, y + 10, `${bargain.name} +${bargain.emberGain} embers`, {
      ...TEXT_STYLE,
      fontSize: '16px',
      fontStyle: 'bold',
      color: enabled ? '#f5edd8' : '#6f687c',
    });
    const detail = this.add.text(
      x + 14,
      y + 36,
      enabled ? bargain.description : `${bargain.description} ${check.reason}`,
      {
        ...TEXT_STYLE,
        fontSize: '12px',
        color: enabled ? '#b8b0c8' : '#5d566d',
        fixedWidth: 342,
        wordWrap: { width: 342, useAdvancedWrap: true },
        lineSpacing: 5,
      },
    );
    const action = this.add
      .text(x + 416, y + 42, enabled ? '[ ACCEPT ]' : '[ LOCKED ]', {
        ...TEXT_STYLE,
        fontSize: '14px',
        fontStyle: 'bold',
        color: enabled ? '#f1c40f' : '#5d566d',
      })
      .setOrigin(0.5);

    if (enabled) {
      action.setInteractive({ useHandCursor: true });
      action.on('pointerover', () => action.setColor('#ffe48a'));
      action.on('pointerout', () => action.setColor('#f1c40f'));
      action.on('pointerdown', () => this.acceptBargain(bargain));
    }

    overlay.add([row, title, detail, action]);
  }

  private acceptBargain(bargain: CampfireBargainDef): void {
    const meta = getMeta();
    const result = acceptCampfireBargain(meta, bargain.id);
    if (!result.ok) return;

    const updated = setMeta({
      ...meta,
      embers: result.state.embers,
      pendingPrep: result.state.pendingPrep,
    });
    playSfx(this, 'purchase');
    this.closeBargainOverlay();
    this.game.events.emit('meta-update', updated);
  }

  private closeBargainOverlay(): void {
    this.input.keyboard?.off('keydown-ESC', this.closeBargainOverlay, this);
    this.bargainOverlay?.destroy();
    this.bargainOverlay = undefined;
  }

  private startRun(): void {
    const seed = new URLSearchParams(window.location.search).get('seed') ?? String(Math.random());
    const run = newRun(seed);
    const meta = getMeta();
    const clearedPrep = applyPendingPrepToRun(run, meta.pendingPrep);
    setMeta({ ...meta, pendingPrep: clearedPrep });
    this.scene.start('Dungeon');
  }

  private startDailyRun(): void {
    const seed = dailySeed();
    const run = newRun(seed);
    run.isDaily = true;
    run.dailyKey = dailyKey();
    this.scene.start('Dungeon');
  }
}
