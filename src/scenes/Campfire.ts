import Phaser from 'phaser';
import { GAME_H, GAME_W, MAX_INVENTORY } from '../config';
import {
  CAMPFIRE_PURCHASES,
  buyCampfirePurchase,
  canBuyCampfirePurchase,
} from '../data/campfirePurchases';
import type { CampfirePurchaseDef } from '../data/campfirePurchases';
import { ITEM_DEFS } from '../data/items';
import { applyPendingPrepToRun } from '../game/campfirePrep';
import {
  BONUS_STARTING_CARD_CHOICES,
  BONUS_STARTING_CARD_PICKS,
  DEFAULT_STARTING_CARD_CHOICES,
  DEFAULT_STARTING_CARD_PICKS,
} from '../game/startingCards';
import { dailyKey, dailySeed, loadDailyRecord } from '../daily';
import { loadRunChronicle } from '../chronicle';
import { getMeta, setMeta } from '../meta';
import { playSfx } from '../audio/sfx';
import { newRun } from '../state';

const TEXT_STYLE = {
  fontFamily: 'monospace',
  color: '#f5edd8',
};

const FIRE_X = 210;
const FIRE_Y = 348;
const HERO_X = 104;
const HERO_Y = 356;
const OPTION_X = 506;
const OPTION_W = 352;
const OPTION_H = 52;
const OPTION_START_Y = 132;
const OPTION_GAP = 60;
const FOREGROUND_DEPTH = 10;

export class CampfireScene extends Phaser.Scene {
  private dynamic!: Phaser.GameObjects.Container;

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
        .text(GAME_W / 2, 88, `Embers: ${meta.embers}`, {
          ...TEXT_STYLE,
          fontSize: '18px',
          color: '#f5edd8',
        })
        .setOrigin(0.5),
    );
    const chronicle = loadRunChronicle();
    const recordLine =
      chronicle.runsCompleted === 0
        ? 'No completed runs yet'
        : `Runs ${chronicle.runsCompleted} | Escapes ${chronicle.escapes} | Best room ${chronicle.bestDepth} | Best gold ${chronicle.bestGold}`;
    this.dynamic.add(
      this.add
        .text(GAME_W / 2, 110, recordLine, {
          ...TEXT_STYLE,
          fontSize: '12px',
          color: '#b8b0c8',
        })
        .setOrigin(0.5),
    );

    for (const [index, purchase] of CAMPFIRE_PURCHASES.entries()) {
      this.addPurchaseButton(purchase, OPTION_X, OPTION_START_Y + index * OPTION_GAP);
    }

    this.dynamic.add(
      this.add.text(330, 438, this.pendingPrepSummary(), {
        ...TEXT_STYLE,
        fontSize: '13px',
        color: '#b8b0c8',
        lineSpacing: 8,
        fixedWidth: OPTION_W,
        wordWrap: { width: OPTION_W, useAdvancedWrap: true },
      }),
    );
    this.dynamic.add(
      this.add.text(
        330,
        512,
        `Daily ${dailyRecord.date} - best room ${dailyRecord.bestDepth}, escaped: ${
          dailyRecord.escaped ? 'yes' : 'no'
        }`,
        {
          ...TEXT_STYLE,
          fontSize: '13px',
          color: '#b8b0c8',
        },
      ),
    );

    const addRunButton = (x: number, label: string, onPointerDown: () => void): void => {
      const button = this.add
        .text(x, 584, label, {
          ...TEXT_STYLE,
          fontSize: '24px',
          fontStyle: 'bold',
          color: '#f1c40f',
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      button.on('pointerover', () => button.setColor('#ffe48a'));
      button.on('pointerout', () => button.setColor('#f1c40f'));
      button.on('pointerdown', onPointerDown);
      this.dynamic.add(button);
    };

    addRunButton(GAME_W / 2 - 128, '[ DESCEND ]', () => this.startRun());
    addRunButton(GAME_W / 2 + 128, '[ DAILY DESCENT ]', () => this.startDailyRun());
  }

  private pendingPrepSummary(): string {
    const prep = getMeta().pendingPrep;
    const names = prep.itemIds.map((id) => ITEM_DEFS.find((item) => item.id === id)?.name ?? id);
    const openingChoices = prep.extraStartingChoice
      ? BONUS_STARTING_CARD_CHOICES
      : DEFAULT_STARTING_CARD_CHOICES;
    const openingPicks = prep.extraStartingChoice
      ? BONUS_STARTING_CARD_PICKS
      : DEFAULT_STARTING_CARD_PICKS;
    return [
      `Prepared supplies: ${names.length > 0 ? names.join(', ') : 'none'} (${names.length}/${MAX_INVENTORY})`,
      `Opening picks: ${openingPicks} of ${openingChoices}`,
      `Scout flame: ${prep.scoutFlame ? 'ready' : 'unlit'}`,
    ].join('\n');
  }

  private addPurchaseButton(purchase: CampfirePurchaseDef, x: number, y: number): void {
    const meta = getMeta();
    const check = canBuyCampfirePurchase(meta, purchase.id);
    const enabled = check.ok;
    const bg = this.add.graphics();

    const drawBg = (color: number, lineColor: number) => {
      bg.clear();
      bg.fillStyle(color, 0.94);
      bg.fillRect(x - OPTION_W / 2, y - OPTION_H / 2, OPTION_W, OPTION_H);
      bg.lineStyle(1, lineColor, enabled ? 0.8 : 0.45);
      bg.strokeRect(x - OPTION_W / 2, y - OPTION_H / 2, OPTION_W, OPTION_H);
    };

    drawBg(enabled ? 0x221f1e : 0x17151c, enabled ? 0x6f5032 : 0x393344);

    const title = this.add.text(
      x - OPTION_W / 2 + 16,
      y - 17,
      `${purchase.name} - ${purchase.cost} embers`,
      {
        ...TEXT_STYLE,
        fontSize: '14px',
        fontStyle: 'bold',
        color: enabled ? '#f5edd8' : '#6f687c',
      },
    );
    const detail = this.add.text(
      x - OPTION_W / 2 + 16,
      y + 3,
      this.purchaseDetail(purchase, check),
      {
        ...TEXT_STYLE,
        fontSize: '11px',
        color: enabled ? '#b8b0c8' : '#5d566d',
        fixedWidth: OPTION_W - 32,
        wordWrap: { width: OPTION_W - 32, useAdvancedWrap: true },
      },
    );
    const hit = this.add.zone(x, y, OPTION_W, OPTION_H);

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

  private purchaseDetail(
    purchase: CampfirePurchaseDef,
    check: ReturnType<typeof canBuyCampfirePurchase>,
  ): string {
    if (check.ok) return purchase.description;
    return `${purchase.description} ${check.reason}`;
  }

  private buyPurchase(id: CampfirePurchaseDef['id']): void {
    const meta = getMeta();
    const result = buyCampfirePurchase(meta, id);
    if (!result.ok) return;

    setMeta({
      ...meta,
      embers: result.state.embers,
      pendingPrep: result.state.pendingPrep,
    });
    playSfx(this, 'purchase');
    this.redraw();
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
