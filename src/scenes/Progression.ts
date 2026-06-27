import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../config';
import { playSfx } from '../audio/sfx';
import {
  STARTER_CARD_VARIETY_UNLOCK_COST,
  buyStarterCardVarietyUnlock,
  formatStarterCardProgressionSummary,
} from '../game/progression';
import { getMeta, setMeta } from '../meta';

const TEXT_STYLE = {
  fontFamily: 'monospace',
  color: '#f5edd8',
};

const FOREGROUND_DEPTH = 10;
const PANEL_X = 86;
const PANEL_Y = 162;
const PANEL_W = 548;
const PANEL_H = 252;

export class ProgressionScene extends Phaser.Scene {
  private dynamic!: Phaser.GameObjects.Container;

  constructor() {
    super('Progression');
  }

  create(): void {
    this.cameras.main.fadeIn(250, 11, 10, 18);
    this.drawRoom();
    this.dynamic = this.add.container(0, 0).setDepth(FOREGROUND_DEPTH);
    this.game.events.on('meta-update', this.redraw, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('meta-update', this.redraw, this);
    });
    this.input.keyboard?.once('keydown-ESC', () => this.scene.start('Campfire'));
    this.redraw();
  }

  private drawRoom(): void {
    const bg = this.add.graphics();
    bg.fillStyle(0x0b0a12, 1);
    bg.fillRect(0, 0, GAME_W, GAME_H);

    for (let y = 0; y < GAME_H; y += 48) {
      for (let x = 0; x < GAME_W; x += 48) {
        const shade = (x / 48 + y / 48) % 2 === 0 ? 0x17151c : 0x121018;
        bg.fillStyle(shade, 0.66);
        bg.fillRect(x, y, 48, 48);
      }
    }

    bg.fillStyle(0x000000, 0.36);
    bg.fillRect(0, 0, GAME_W, 86);
    bg.fillRect(0, 548, GAME_W, GAME_H - 548);
  }

  private redraw(): void {
    this.dynamic.removeAll(true);
    const meta = getMeta();

    this.addBackButton();
    this.dynamic.add(
      this.add
        .text(GAME_W / 2, 50, 'PROGRESSION', {
          ...TEXT_STYLE,
          fontSize: '34px',
          fontStyle: 'bold',
          color: '#f1c40f',
        })
        .setOrigin(0.5),
    );
    this.dynamic.add(
      this.add
        .text(GAME_W / 2, 94, 'Gold is for this run. Embers are for long-term progress.', {
          ...TEXT_STYLE,
          fontSize: '14px',
          color: '#b8b0c8',
        })
        .setOrigin(0.5),
    );

    const panel = this.add.graphics();
    panel.fillStyle(0x151018, 0.97);
    panel.fillRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H);
    panel.lineStyle(2, 0xf1c40f, 0.66);
    panel.strokeRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H);
    this.dynamic.add(panel);

    this.dynamic.add(
      this.add.text(PANEL_X + 28, PANEL_Y + 26, 'STARTER CARDS', {
        ...TEXT_STYLE,
        fontSize: '20px',
        fontStyle: 'bold',
        color: '#f1c40f',
      }),
    );
    this.dynamic.add(
      this.add.text(PANEL_X + 28, PANEL_Y + 68, formatStarterCardProgressionSummary(meta), {
        ...TEXT_STYLE,
        fontSize: '14px',
        color: '#d8d2e4',
        fixedWidth: PANEL_W - 56,
        wordWrap: { width: PANEL_W - 56, useAdvancedWrap: true },
        lineSpacing: 8,
      }),
    );

    this.addUnlockButton(meta.progression.starterCardVarietyUnlocked, meta.embers);
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

  private addUnlockButton(unlocked: boolean, embers: number): void {
    const affordable = embers >= STARTER_CARD_VARIETY_UNLOCK_COST;
    const enabled = !unlocked && affordable;
    const label = unlocked
      ? '[ UNLOCKED ]'
      : affordable
        ? `[ UNLOCK - ${STARTER_CARD_VARIETY_UNLOCK_COST} EMBERS ]`
        : `[ NEED ${STARTER_CARD_VARIETY_UNLOCK_COST} EMBERS ]`;
    const button = this.add
      .text(PANEL_X + PANEL_W / 2, PANEL_Y + PANEL_H - 48, label, {
        ...TEXT_STYLE,
        fontSize: '18px',
        fontStyle: 'bold',
        color: enabled ? '#f1c40f' : '#6f687c',
      })
      .setOrigin(0.5);

    if (enabled) {
      button.setInteractive({ useHandCursor: true });
      button.on('pointerover', () => button.setColor('#ffe48a'));
      button.on('pointerout', () => button.setColor('#f1c40f'));
      button.on('pointerdown', () => this.buyStarterUnlock());
    }

    this.dynamic.add(button);
  }

  private buyStarterUnlock(): void {
    const meta = getMeta();
    const result = buyStarterCardVarietyUnlock(meta);
    if (!result.ok) return;

    const updated = setMeta({
      ...meta,
      embers: result.state.embers,
      progression: result.state.progression,
    });
    this.game.events.emit('meta-update', updated);
    playSfx(this, 'purchase');
    this.redraw();
  }
}
