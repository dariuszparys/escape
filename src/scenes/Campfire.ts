import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../config';
import { ARCHETYPES } from '../data/archetypes';
import type { ArchetypeId } from '../data/cards';
import { dailyKey, dailySeed, loadDailyRecord } from '../daily';
import { loadRunChronicle } from '../chronicle';
import {
  formatChronicleLine,
  formatCampfireProgressionSummary,
  formatDailyRecordLine,
  formatProfileProgressLine,
} from '../game/campfireSummary';
import { formatCampfireRunGoal, formatPathPrompt } from '../game/runHook';
import { setActiveArchetype } from '../game/progression';
import { getMeta, setMeta } from '../meta';
import { newRun, setRun } from '../state';
import { FONT_FAMILY, TEXT_COLOR } from '../gfx/theme';
import { getProfile } from '../profile';
import { applyLoadoutToRun } from '../game/campfirePrep';
import { clearRunSnapshot, loadRunSnapshot } from '../game/runSnapshot';
import { playSfx } from '../audio/sfx';

const TEXT_STYLE = {
  fontFamily: FONT_FAMILY,
  color: TEXT_COLOR.primary,
};

const FIRE_X = 210;
const FIRE_Y = 348;
const HERO_X = 104;
const HERO_Y = 356;
const STATUS_X = 392;
const STATUS_W = 290;
const FOREGROUND_DEPTH = 10;
const ACTION_Y = 584;

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

  private redraw = (): void => {
    this.dynamic.removeAll(true);
    const meta = getMeta();
    const profile = getProfile();
    const snapshot = loadRunSnapshot();
    const dailyRecord = loadDailyRecord();
    const chronicle = loadRunChronicle();

    this.dynamic.add(
      this.add
        .text(GAME_W / 2, 50, 'THE LAST FIRE', {
          ...TEXT_STYLE,
          fontSize: '38px',
          fontStyle: 'bold',
          color: TEXT_COLOR.gold,
        })
        .setOrigin(0.5),
    );

    this.dynamic.add(
      this.add
        .text(GAME_W / 2, 94, formatProfileProgressLine(profile), {
          ...TEXT_STYLE,
          fontSize: '18px',
          color: TEXT_COLOR.primary,
        })
        .setOrigin(0.5),
    );
    this.dynamic.add(
      this.add
        .text(GAME_W / 2, 120, formatChronicleLine(chronicle), {
          ...TEXT_STYLE,
          fontSize: '12px',
          color: TEXT_COLOR.muted,
        })
        .setOrigin(0.5),
    );

    this.dynamic.add(
      this.add.text(STATUS_X, 168, formatPathPrompt(meta.progression.activeArchetypeId), {
        ...TEXT_STYLE,
        fontSize: '18px',
        fontStyle: 'bold',
        color: TEXT_COLOR.gold,
      }),
    );
    for (const [index, archetype] of ARCHETYPES.entries()) {
      this.addPathButton(
        STATUS_X,
        196 + index * 24,
        `${archetype.name} - ${archetype.tagline}`,
        meta.progression.activeArchetypeId === archetype.id,
        () => this.selectArchetype(archetype.id),
      );
    }
    this.addPathButton(STATUS_X, 268, 'Wanderer - no class', false, () =>
      this.selectArchetype(null),
    );

    this.dynamic.add(
      this.add.text(STATUS_X, 304, 'THIS RUN', {
        ...TEXT_STYLE,
        fontSize: '18px',
        fontStyle: 'bold',
        color: TEXT_COLOR.gold,
      }),
    );
    this.dynamic.add(
      this.add.text(
        STATUS_X,
        332,
        formatCampfireRunGoal(
          profile.personalBestRoom,
          meta.progression.completedContractIds ?? [],
        ),
        {
          ...TEXT_STYLE,
          fontSize: '13px',
          color: TEXT_COLOR.body,
          lineSpacing: 6,
          fixedWidth: STATUS_W,
          wordWrap: { width: STATUS_W, useAdvancedWrap: true },
        },
      ),
    );

    this.dynamic.add(
      this.add.text(STATUS_X, 392, formatCampfireProgressionSummary(meta.progression, profile), {
        ...TEXT_STYLE,
        fontSize: '12px',
        color: TEXT_COLOR.muted,
        lineSpacing: 5,
        fixedWidth: STATUS_W,
        wordWrap: { width: STATUS_W, useAdvancedWrap: true },
      }),
    );
    if (snapshot) {
      this.dynamic.add(
        this.add.text(STATUS_X, 478, `Suspended run: room ${snapshot.run.depth}`, {
          ...TEXT_STYLE,
          fontSize: '13px',
          color: TEXT_COLOR.gold,
          fixedWidth: STATUS_W,
          wordWrap: { width: STATUS_W, useAdvancedWrap: true },
        }),
      );
    } else {
      this.dynamic.add(
        this.add.text(STATUS_X, 478, formatDailyRecordLine(dailyRecord), {
          ...TEXT_STYLE,
          fontSize: '12px',
          color: TEXT_COLOR.muted,
          fixedWidth: STATUS_W,
          wordWrap: { width: STATUS_W, useAdvancedWrap: true },
        }),
      );
    }

    this.addActionButton(142, '[ PROGRESSION ]', () => this.scene.start('Progression'));
    if (snapshot) {
      this.addActionButton(378, '[ RESUME ]', () => this.resumeRun());
      this.addActionButton(596, '[ ABANDON ]', () => this.abandonRun());
    } else {
      this.addActionButton(378, '[ DESCEND ]', () => this.startRun());
      this.addActionButton(596, '[ DAILY DESCENT ]', () => this.startDailyRun());
    }
  };

  private addPathButton(
    x: number,
    y: number,
    label: string,
    active: boolean,
    onPointerDown: () => void,
  ): void {
    const button = this.add
      .text(x, y, active ? `> ${label}` : `  ${label}`, {
        ...TEXT_STYLE,
        fontSize: '13px',
        fontStyle: active ? 'bold' : 'normal',
        color: active ? TEXT_COLOR.gold : TEXT_COLOR.body,
      })
      .setInteractive({ useHandCursor: true });
    button.on('pointerover', () => button.setColor(TEXT_COLOR.goldHover));
    button.on('pointerout', () => button.setColor(active ? TEXT_COLOR.gold : TEXT_COLOR.body));
    button.on('pointerdown', onPointerDown);
    this.dynamic.add(button);
  }

  private selectArchetype(archetypeId: ArchetypeId | null): void {
    const result = setActiveArchetype(getMeta(), getProfile(), archetypeId);
    if (!result.ok) return;
    const updated = setMeta(result.state);
    this.game.events.emit('meta-update', updated);
    playSfx(this, 'purchase');
  }

  private addActionButton(x: number, label: string, onPointerDown: () => void): void {
    const button = this.add
      .text(x, ACTION_Y, label, {
        ...TEXT_STYLE,
        fontSize: '18px',
        fontStyle: 'bold',
        color: TEXT_COLOR.gold,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    button.on('pointerover', () => button.setColor(TEXT_COLOR.goldHover));
    button.on('pointerout', () => button.setColor(TEXT_COLOR.gold));
    button.on('pointerdown', onPointerDown);
    this.dynamic.add(button);
  }

  private startRun(): void {
    this.scene.start('ScenarioSelect');
  }

  private resumeRun(): void {
    const snapshot = loadRunSnapshot();
    if (!snapshot) return;
    setRun(snapshot.run);
    this.scene.start('Dungeon');
  }

  private abandonRun(): void {
    const snapshot = loadRunSnapshot();
    if (!snapshot) return;
    const run = setRun(snapshot.run);
    run.escaped = false;
    clearRunSnapshot();
    this.scene.start('End', { victory: false });
  }

  private startDailyRun(): void {
    const seed = dailySeed();
    const run = newRun(seed);
    run.isDaily = true;
    run.dailyKey = dailyKey();
    applyLoadoutToRun(run, getMeta().progression, getProfile());
    this.scene.start('Dungeon');
  }
}
