import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../config';
import { SCENARIOS, type ScenarioId } from '../data/scenarios';
import { applyPendingPrepToRun } from '../game/campfirePrep';
import { PhaserGameRng } from '../game/rng';
import { createScenarioSelectLayout } from '../game/scenarioSelectLayout';
import { getMeta, setMeta } from '../meta';
import { newRun } from '../state';

const TEXT_STYLE = {
  fontFamily: 'monospace',
  color: '#f5edd8',
};

const FOREGROUND_DEPTH = 10;

export class ScenarioSelectScene extends Phaser.Scene {
  private dynamic!: Phaser.GameObjects.Container;
  private selectedId: ScenarioId = SCENARIOS[0].id;

  constructor() {
    super('ScenarioSelect');
  }

  create(): void {
    this.cameras.main.fadeIn(250, 11, 10, 18);
    this.drawRoom();
    this.dynamic = this.add.container(0, 0).setDepth(FOREGROUND_DEPTH);
    this.input.keyboard?.on('keydown-UP', this.selectPrevious, this);
    this.input.keyboard?.on('keydown-DOWN', this.selectNext, this);
    this.input.keyboard?.once('keydown-ESC', () => this.scene.start('Campfire'));
    this.input.keyboard?.once('keydown-ENTER', () => this.confirmScenario());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown-UP', this.selectPrevious, this);
      this.input.keyboard?.off('keydown-DOWN', this.selectNext, this);
    });
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
    bg.fillRect(0, 0, GAME_W, 104);
    bg.fillRect(0, 548, GAME_W, GAME_H - 548);
  }

  private redraw(): void {
    this.dynamic.removeAll(true);
    const layout = createScenarioSelectLayout(SCENARIOS.length);
    const selected = SCENARIOS.find((scenario) => scenario.id === this.selectedId) ?? SCENARIOS[0];

    this.dynamic.add(
      this.add
        .text(GAME_W / 2, layout.titleY, 'CHOOSE A SCENARIO', {
          ...TEXT_STYLE,
          fontSize: '32px',
          fontStyle: 'bold',
          color: '#f1c40f',
        })
        .setOrigin(0.5),
    );
    this.dynamic.add(
      this.add
        .text(GAME_W / 2, layout.subtitleY, 'A normal descent starts with one premise.', {
          ...TEXT_STYLE,
          fontSize: '14px',
          color: '#b8b0c8',
        })
        .setOrigin(0.5),
    );

    for (const [index, scenario] of SCENARIOS.entries()) {
      const y = layout.list.y + index * layout.rowH;
      this.addScenarioRow(scenario.id, y, layout.rowH, scenario.id === selected.id);
    }

    this.addPreview(
      selected,
      layout.preview.x,
      layout.preview.y,
      layout.preview.w,
      layout.preview.h,
    );
    this.addTextButton(layout.backButton.x, layout.backButton.y, '[ BACK ]', () =>
      this.scene.start('Campfire'),
    );
    this.addTextButton(layout.confirmButton.x, layout.confirmButton.y, '[ DESCEND ]', () =>
      this.confirmScenario(),
    );
  }

  private addScenarioRow(id: ScenarioId, y: number, rowH: number, selected: boolean): void {
    const scenario = SCENARIOS.find((candidate) => candidate.id === id);
    if (!scenario) return;

    const layout = createScenarioSelectLayout(SCENARIOS.length);
    const bg = this.add.graphics();
    bg.fillStyle(selected ? 0x2d2414 : 0x0f0d15, selected ? 0.94 : 0.78);
    bg.fillRect(layout.list.x, y, layout.list.w, rowH - 10);
    bg.lineStyle(2, selected ? 0xf1c40f : 0x3f394d, selected ? 0.78 : 0.55);
    bg.strokeRect(layout.list.x, y, layout.list.w, rowH - 10);
    this.dynamic.add(bg);

    const label = this.add
      .text(layout.list.x + 16, y + 12, scenario.name, {
        ...TEXT_STYLE,
        fontSize: '16px',
        fontStyle: 'bold',
        color: selected ? '#ffe48a' : '#f5edd8',
        fixedWidth: layout.list.w - 32,
        wordWrap: { width: layout.list.w - 32, useAdvancedWrap: true },
      })
      .setInteractive({ useHandCursor: true });
    label.on('pointerdown', () => {
      this.selectedId = id;
      this.redraw();
    });
    this.dynamic.add(label);

    const rule = this.add
      .text(layout.list.x + 16, y + 36, scenario.ruleSummary, {
        ...TEXT_STYLE,
        fontSize: '11px',
        color: '#b8b0c8',
        fixedWidth: layout.list.w - 32,
        wordWrap: { width: layout.list.w - 32, useAdvancedWrap: true },
        maxLines: 2,
      })
      .setInteractive({ useHandCursor: true });
    rule.on('pointerdown', () => {
      this.selectedId = id;
      this.redraw();
    });
    this.dynamic.add(rule);
  }

  private addPreview(
    scenario: (typeof SCENARIOS)[number],
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    const panel = this.add.graphics();
    panel.fillStyle(0x151018, 0.97);
    panel.fillRect(x, y, w, h);
    panel.lineStyle(2, 0xf1c40f, 0.62);
    panel.strokeRect(x, y, w, h);
    this.dynamic.add(panel);

    this.dynamic.add(
      this.add.text(x + 20, y + 22, scenario.name, {
        ...TEXT_STYLE,
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#f1c40f',
        fixedWidth: w - 40,
        wordWrap: { width: w - 40, useAdvancedWrap: true },
      }),
    );
    this.dynamic.add(
      this.add.text(x + 20, y + 78, scenario.backstory, {
        ...TEXT_STYLE,
        fontSize: '15px',
        color: '#f5edd8',
        fixedWidth: w - 40,
        wordWrap: { width: w - 40, useAdvancedWrap: true },
        lineSpacing: 5,
      }),
    );
    this.dynamic.add(
      this.add.text(x + 20, y + 202, scenario.ruleSummary, {
        ...TEXT_STYLE,
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#d8d2e4',
        fixedWidth: w - 40,
        wordWrap: { width: w - 40, useAdvancedWrap: true },
        lineSpacing: 5,
      }),
    );
  }

  private addTextButton(x: number, y: number, label: string, onPointerDown: () => void): void {
    const button = this.add
      .text(x, y, label, {
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

  private selectPrevious(): void {
    const current = SCENARIOS.findIndex((scenario) => scenario.id === this.selectedId);
    this.selectedId = SCENARIOS[Math.max(0, current - 1)].id;
    this.redraw();
  }

  private selectNext(): void {
    const current = SCENARIOS.findIndex((scenario) => scenario.id === this.selectedId);
    this.selectedId = SCENARIOS[Math.min(SCENARIOS.length - 1, current + 1)].id;
    this.redraw();
  }

  private confirmScenario(): void {
    const seed = new URLSearchParams(window.location.search).get('seed') ?? String(Math.random());
    const run = newRun(seed);
    run.scenarioId = this.selectedId;
    const meta = getMeta();
    const rng = new PhaserGameRng(new Phaser.Math.RandomDataGenerator([seed, 'prep']));
    const nextPrep = applyPendingPrepToRun(
      run,
      meta.pendingPrep,
      meta.progression,
      rng,
      this.selectedId,
    );
    setMeta({ ...meta, pendingPrep: nextPrep });
    this.scene.start('Dungeon');
  }
}
