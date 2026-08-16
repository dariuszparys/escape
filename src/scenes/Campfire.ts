import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../config';
import {
  campfireClassOption,
  campfireClassOptions,
  type CampfireClassOption,
} from '../data/archetypes';
import type { ArchetypeId } from '../data/cards';
import { dailyKey, dailySeed } from '../daily';
import { loadRunChronicle } from '../chronicle';
import {
  formatCampfireClassChip,
  formatChronicleLine,
  formatDailyModeBlurb,
  formatDescendModeBlurb,
  formatProfileProgressLine,
} from '../game/campfireSummary';
import { formatCampfireRunGoal } from '../game/runHook';
import {
  createCampfireClassLayout,
  createCampfireDepartLayout,
  initialCampfireBeat,
  type CampfireBeat,
  type RectLayout,
} from '../game/campfireLayout';
import { setActiveArchetype } from '../game/progression';
import { getMeta, setMeta } from '../meta';
import { newRun, setRun } from '../state';
import { FONT_FAMILY, PALETTE, TEXT_COLOR } from '../gfx/theme';
import { getProfile } from '../profile';
import { applyLoadoutToRun } from '../game/campfirePrep';
import { clearRunSnapshot, loadRunSnapshot } from '../game/runSnapshot';
import { playSfx } from '../audio/sfx';

const TEXT_STYLE = {
  fontFamily: FONT_FAMILY,
  color: TEXT_COLOR.primary,
};

const FOREGROUND_DEPTH = 10;
const SELECTED_FILL = 0x2d2414;
const IDLE_FILL = 0x0f0d15;
const IDLE_STROKE = 0x3f394d;
const CLASS_TINT: Record<string, number> = {
  barbarian: 0xe07040,
  necromancer: 0x9a70c8,
  ranger: 0x5a9a4a,
  wanderer: 0xc4baa0,
};

let classConfirmedThisSession = false;

export class CampfireScene extends Phaser.Scene {
  private dynamic!: Phaser.GameObjects.Container;
  private beat: CampfireBeat = 'class';

  constructor() {
    super('Campfire');
  }

  create(): void {
    this.cameras.main.fadeIn(350, 11, 10, 18);
    this.drawCell();
    this.dynamic = this.add.container(0, 0).setDepth(FOREGROUND_DEPTH);
    this.beat = initialCampfireBeat(
      classConfirmedThisSession,
      getMeta().progression.activeArchetypeId,
    );
    this.game.events.on('meta-update', this.redraw, this);
    this.input.keyboard?.on('keydown-ENTER', this.confirmClassBeat, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('meta-update', this.redraw, this);
      this.input.keyboard?.off('keydown-ENTER', this.confirmClassBeat, this);
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
    shadows.fillRect(0, 0, GAME_W, 86);
    shadows.fillRect(0, 548, GAME_W, GAME_H - 548);

    const fireGlow = this.add.graphics().setDepth(1);
    fireGlow.fillStyle(0xf1a23a, 0.12);
    fireGlow.fillCircle(GAME_W / 2, 560, 90);
    this.tweens.add({
      targets: fireGlow,
      alpha: 0.4,
      duration: 760,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private redraw = (): void => {
    this.dynamic.removeAll(true);
    if (this.beat === 'class') {
      this.drawClassBeat();
      return;
    }
    this.drawDepartBeat();
  };

  private drawClassBeat(): void {
    const options = campfireClassOptions();
    const layout = createCampfireClassLayout(options.length);
    const selectedId = getMeta().progression.activeArchetypeId;
    const selected = campfireClassOption(selectedId);

    this.dynamic.add(
      this.add
        .text(GAME_W / 2, layout.titleY, 'CHOOSE YOUR CLASS', {
          ...TEXT_STYLE,
          fontSize: '32px',
          fontStyle: 'bold',
          color: TEXT_COLOR.gold,
        })
        .setOrigin(0.5),
    );

    for (const [index, option] of options.entries()) {
      this.addClassCard(option, layout.cards[index], option.id === selectedId);
    }

    this.dynamic.add(
      this.add
        .text(layout.description.x, layout.description.y, selected.description, {
          ...TEXT_STYLE,
          fontSize: '15px',
          color: TEXT_COLOR.body,
          align: 'center',
          lineSpacing: 5,
          fixedWidth: layout.description.w,
          wordWrap: { width: layout.description.w, useAdvancedWrap: true },
        })
        .setOrigin(0, 0),
    );

    this.addFilledButton(layout.continueButton, '[ CONTINUE ]', () => this.confirmClassBeat());
  }

  private drawDepartBeat(): void {
    const meta = getMeta();
    const profile = getProfile();
    const snapshot = loadRunSnapshot();
    const chronicle = loadRunChronicle();
    const layout = createCampfireDepartLayout();

    this.dynamic.add(
      this.add
        .text(GAME_W / 2, layout.titleY, 'THE LAST FIRE', {
          ...TEXT_STYLE,
          fontSize: '34px',
          fontStyle: 'bold',
          color: TEXT_COLOR.gold,
        })
        .setOrigin(0.5),
    );
    this.dynamic.add(
      this.add
        .text(GAME_W / 2, layout.statusY, formatProfileProgressLine(profile), {
          ...TEXT_STYLE,
          fontSize: '16px',
          color: TEXT_COLOR.primary,
        })
        .setOrigin(0.5),
    );
    this.dynamic.add(
      this.add
        .text(GAME_W / 2, layout.chronicleY, formatChronicleLine(chronicle), {
          ...TEXT_STYLE,
          fontSize: '12px',
          color: TEXT_COLOR.muted,
        })
        .setOrigin(0.5),
    );

    this.addPanel(layout.classChip, false);
    const chipLabelW = layout.changeClassButton.x - layout.classChip.x - 20;
    this.dynamic.add(
      this.add
        .text(
          layout.classChip.x + 16,
          layout.classChip.y + layout.classChip.h / 2,
          formatCampfireClassChip(meta.progression.activeArchetypeId),
          {
            ...TEXT_STYLE,
            fontSize: '16px',
            fontStyle: 'bold',
            color: TEXT_COLOR.gold,
            fixedWidth: chipLabelW,
            wordWrap: { width: chipLabelW, useAdvancedWrap: true },
          },
        )
        .setOrigin(0, 0.5),
    );
    this.addFilledButton(
      layout.changeClassButton,
      '[ CHANGE CLASS ]',
      () => this.changeClass(),
      '13px',
    );

    this.dynamic.add(
      this.add
        .text(
          GAME_W / 2,
          layout.goal.y,
          snapshot
            ? `Suspended run: room ${snapshot.run.depth}`
            : formatCampfireRunGoal(
                profile.personalBestRoom,
                meta.progression.completedContractIds ?? [],
              ),
          {
            ...TEXT_STYLE,
            fontSize: '14px',
            color: snapshot ? TEXT_COLOR.gold : TEXT_COLOR.body,
            align: 'center',
            lineSpacing: 4,
            fixedWidth: layout.goal.w,
            wordWrap: { width: layout.goal.w, useAdvancedWrap: true },
          },
        )
        .setOrigin(0.5, 0),
    );

    if (snapshot) {
      this.addModeCard(
        layout.primaryMode,
        true,
        'RESUME',
        `Continue from room ${snapshot.run.depth}.`,
        () => this.resumeRun(),
      );
      this.addModeCard(
        layout.secondaryMode,
        false,
        'ABANDON',
        'End the run at this room.',
        () => this.abandonRun(),
        TEXT_COLOR.danger,
      );
    } else {
      this.addModeCard(layout.primaryMode, true, 'DESCEND', formatDescendModeBlurb(), () =>
        this.startRun(),
      );
      this.addModeCard(layout.secondaryMode, false, 'DAILY DESCENT', formatDailyModeBlurb(), () =>
        this.startDailyRun(),
      );
    }

    this.addTextButton(layout.loadoutButton.x, layout.loadoutButton.y, '[ LOADOUT ]', () =>
      this.scene.start('Progression'),
    );
  }

  private addClassCard(option: CampfireClassOption, rect: RectLayout, selected: boolean): void {
    this.addPanel(rect, selected);
    const cx = rect.x + rect.w / 2;
    const name = this.add
      .text(cx, rect.y + 16, option.name, {
        ...TEXT_STYLE,
        fontSize: '16px',
        fontStyle: 'bold',
        color: selected ? TEXT_COLOR.gold : TEXT_COLOR.primary,
        align: 'center',
        fixedWidth: rect.w - 12,
        wordWrap: { width: rect.w - 12, useAdvancedWrap: true },
      })
      .setOrigin(0.5, 0);
    this.dynamic.add(name);

    if (selected) {
      this.dynamic.add(
        this.add
          .text(cx, rect.y + 38, 'SELECTED', {
            ...TEXT_STYLE,
            fontSize: '11px',
            fontStyle: 'bold',
            color: TEXT_COLOR.goldHover,
          })
          .setOrigin(0.5, 0),
      );
    }

    const hero = this.add
      .image(cx, rect.y + 118, 'hero_down_0')
      .setScale(4)
      .setTint(CLASS_TINT[option.id ?? 'wanderer']);
    this.dynamic.add(hero);

    const tagline = this.add
      .text(cx, rect.y + rect.h - 36, option.tagline, {
        ...TEXT_STYLE,
        fontSize: '12px',
        color: selected ? TEXT_COLOR.goldHover : TEXT_COLOR.muted,
        align: 'center',
        fixedWidth: rect.w - 12,
        wordWrap: { width: rect.w - 12, useAdvancedWrap: true },
      })
      .setOrigin(0.5, 0);
    this.dynamic.add(tagline);

    const zone = this.add
      .zone(cx, rect.y + rect.h / 2, rect.w, rect.h)
      .setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => {
      name.setColor(TEXT_COLOR.goldHover);
      tagline.setColor(TEXT_COLOR.goldHover);
    });
    zone.on('pointerout', () => {
      name.setColor(selected ? TEXT_COLOR.gold : TEXT_COLOR.primary);
      tagline.setColor(selected ? TEXT_COLOR.goldHover : TEXT_COLOR.muted);
    });
    zone.on('pointerdown', () => this.selectArchetype(option.id));
    this.dynamic.add(zone);
  }

  private addModeCard(
    rect: RectLayout,
    primary: boolean,
    title: string,
    blurb: string,
    onPointerDown: () => void,
    titleColor: string = TEXT_COLOR.gold,
  ): void {
    this.addPanel(rect, primary);
    const cx = rect.x + rect.w / 2;
    const heading = this.add
      .text(cx, rect.y + 28, title, {
        ...TEXT_STYLE,
        fontSize: '22px',
        fontStyle: 'bold',
        color: titleColor,
        align: 'center',
        fixedWidth: rect.w - 28,
        wordWrap: { width: rect.w - 28, useAdvancedWrap: true },
      })
      .setOrigin(0.5, 0);
    this.dynamic.add(heading);
    const body = this.add
      .text(cx, rect.y + 72, blurb, {
        ...TEXT_STYLE,
        fontSize: '14px',
        color: TEXT_COLOR.body,
        align: 'center',
        lineSpacing: 5,
        fixedWidth: rect.w - 36,
        wordWrap: { width: rect.w - 36, useAdvancedWrap: true },
      })
      .setOrigin(0.5, 0);
    this.dynamic.add(body);

    const zone = this.add
      .zone(cx, rect.y + rect.h / 2, rect.w, rect.h)
      .setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => heading.setColor(TEXT_COLOR.goldHover));
    zone.on('pointerout', () => heading.setColor(titleColor));
    zone.on('pointerdown', onPointerDown);
    this.dynamic.add(zone);
  }

  private addPanel(rect: RectLayout, selected: boolean): void {
    const bg = this.add.graphics();
    bg.fillStyle(selected ? SELECTED_FILL : IDLE_FILL, selected ? 0.94 : 0.86);
    bg.fillRect(rect.x, rect.y, rect.w, rect.h);
    if (selected) {
      bg.fillStyle(PALETTE.gold, 0.95);
      bg.fillRect(rect.x, rect.y, rect.w, 6);
    }
    bg.lineStyle(selected ? 3 : 2, selected ? PALETTE.gold : IDLE_STROKE, selected ? 0.95 : 0.55);
    bg.strokeRect(rect.x, rect.y, rect.w, rect.h);
    this.dynamic.add(bg);
  }

  private addFilledButton(
    rect: RectLayout,
    label: string,
    onPointerDown: () => void,
    fontSize = '18px',
  ): void {
    this.addPanel(rect, true);
    const button = this.add
      .text(rect.x + rect.w / 2, rect.y + rect.h / 2, label, {
        ...TEXT_STYLE,
        fontSize,
        fontStyle: 'bold',
        color: TEXT_COLOR.gold,
      })
      .setOrigin(0.5);
    this.dynamic.add(button);
    const zone = this.add
      .zone(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w, rect.h)
      .setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => button.setColor(TEXT_COLOR.goldHover));
    zone.on('pointerout', () => button.setColor(TEXT_COLOR.gold));
    zone.on('pointerdown', onPointerDown);
    this.dynamic.add(zone);
  }

  private addTextButton(
    x: number,
    y: number,
    label: string,
    onPointerDown: () => void,
    fontSize = '18px',
  ): void {
    const button = this.add
      .text(x, y, label, {
        ...TEXT_STYLE,
        fontSize,
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

  private confirmClassBeat = (): void => {
    if (this.beat !== 'class') return;
    classConfirmedThisSession = true;
    this.beat = 'depart';
    playSfx(this, 'door', 0.4);
    this.redraw();
  };

  private changeClass(): void {
    this.beat = 'class';
    this.redraw();
  }

  private selectArchetype(archetypeId: ArchetypeId | null): void {
    const result = setActiveArchetype(getMeta(), getProfile(), archetypeId);
    if (!result.ok) return;
    const updated = setMeta(result.state);
    this.game.events.emit('meta-update', updated);
    playSfx(this, 'purchase');
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
