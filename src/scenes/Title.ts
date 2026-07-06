import Phaser from 'phaser';
import { GAME_W } from '../config';
import { playSfx } from '../audio/sfx';
import { createTitleLayout } from '../game/titleLayout';

const TEXT_STYLE = {
  fontFamily: 'monospace',
  color: '#f5edd8',
};

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    // Development entry for the turn-battle slice (R13), mirroring Campfire's
    // `?seed=` read. One step from URL to battle; the run loop stays untouched.
    const params = new URLSearchParams(window.location.search);
    if (params.get('battle') === 'slice') {
      this.scene.start('TurnBattle', {
        enemyId: params.get('enemy') ?? undefined,
        seed: params.get('seed') ?? String(Math.random()),
      });
      return;
    }

    const cx = GAME_W / 2;
    const layout = createTitleLayout();

    this.add
      .text(cx, layout.titleY, 'ESCAPE', {
        ...TEXT_STYLE,
        fontSize: '72px',
        fontStyle: 'bold',
        color: '#f1c40f',
      })
      .setOrigin(0.5);
    this.add
      .text(cx, layout.subtitleY, '~ the card dungeon ~', {
        ...TEXT_STYLE,
        fontSize: '22px',
        color: '#b8b0c8',
      })
      .setOrigin(0.5);

    const hero = this.add.image(cx, layout.heroY, 'hero_down_0').setScale(5);
    this.tweens.add({
      targets: hero,
      y: layout.heroY - 10,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.add
      .text(cx, layout.objectiveY, 'Descend 10 rooms. Slay the boss. Escape.', {
        ...TEXT_STYLE,
        fontSize: '15px',
        color: '#d8d2e4',
      })
      .setOrigin(0.5);

    this.addInfoColumn(cx - 204, layout, 'RUN', [
      'WASD / arrows move',
      'Walk into loot',
      'Find the stairs down',
    ]);
    this.addInfoColumn(cx, layout, 'CARDS', [
      'Pick 2 at the fire',
      'Scenarios shape runs',
      'Gold in-run, XP after',
    ]);
    this.addInfoColumn(cx + 204, layout, 'BATTLE', [
      'Spend energy on cards',
      'End turn, read intents',
      'Beat enemies for cards',
    ]);

    const start = this.add
      .text(cx, layout.promptY, '[ PRESS SPACE OR CLICK TO ENTER ]', {
        ...TEXT_STYLE,
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#f1c40f',
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: start, alpha: 0.3, duration: 600, yoyo: true, repeat: -1 });

    const begin = () => {
      playSfx(this, 'door', 0.4);
      this.scene.start('Campfire');
    };
    this.input.keyboard?.once('keydown-SPACE', begin);
    this.input.once('pointerdown', begin);

    this.scale.canvas.focus?.();
  }

  private addInfoColumn(
    x: number,
    layout: ReturnType<typeof createTitleLayout>,
    heading: string,
    lines: string[],
  ): void {
    this.add
      .text(x, layout.sectionHeadingY, heading, {
        ...TEXT_STYLE,
        fontSize: '15px',
        fontStyle: 'bold',
        color: '#f1c40f',
      })
      .setOrigin(0.5);
    this.add
      .text(x, layout.sectionTextY, lines.join('\n'), {
        ...TEXT_STYLE,
        fontSize: '13px',
        color: '#d8d2e4',
        align: 'center',
        lineSpacing: 5,
        fixedWidth: 196,
        wordWrap: { width: 196, useAdvancedWrap: true },
      })
      .setOrigin(0.5, 0);
  }
}
