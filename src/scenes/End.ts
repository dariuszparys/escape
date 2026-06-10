import Phaser from 'phaser';
import { GAME_W } from '../config';
import { getRun, newRun } from '../state';

export class EndScene extends Phaser.Scene {
  private victory = false;

  constructor() {
    super('End');
  }

  init(data: { victory: boolean }): void {
    this.victory = data.victory;
  }

  create(): void {
    const run = getRun();
    const cx = GAME_W / 2;
    this.cameras.main.fadeIn(600, 11, 10, 18);

    if (this.victory) {
      this.add
        .text(cx, 150, 'YOU ESCAPED!', {
          fontFamily: 'monospace', fontSize: '54px', fontStyle: 'bold', color: '#f1c40f',
        })
        .setOrigin(0.5);
      const hero = this.add.image(cx, 270, 'hero_down_0').setScale(6);
      this.tweens.add({ targets: hero, y: 258, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.add
        .text(cx, 380, [
          'The dungeon falls silent behind you.',
          'Sunlight. Fresh air. Freedom.',
          '',
          `Escaped with ${run.hp}/${run.maxHp} HP and ${run.hand.length} cards.`,
        ].join('\n'), {
          fontFamily: 'monospace', fontSize: '17px', color: '#d8d2e4', align: 'center', lineSpacing: 6,
        })
        .setOrigin(0.5);
    } else {
      this.add
        .text(cx, 170, 'YOU DIED', {
          fontFamily: 'monospace', fontSize: '54px', fontStyle: 'bold', color: '#ff5544',
        })
        .setOrigin(0.5);
      this.add.image(cx, 280, 'skeleton').setScale(6).setAlpha(0.8);
      this.add
        .text(cx, 390, `The dungeon claims another soul in room ${run.depth}.`, {
          fontFamily: 'monospace', fontSize: '17px', color: '#b8b0c8',
        })
        .setOrigin(0.5);
    }

    const retry = this.add
      .text(cx, 500, this.victory ? '[ SPACE: DELVE AGAIN ]' : '[ SPACE: TRY AGAIN ]', {
        fontFamily: 'monospace', fontSize: '20px', fontStyle: 'bold', color: '#f5edd8',
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: retry, alpha: 0.3, duration: 600, yoyo: true, repeat: -1 });

    const restart = () => {
      newRun();
      this.scene.start('Dungeon');
    };
    this.input.keyboard?.once('keydown-SPACE', restart);
    this.input.once('pointerdown', restart);
  }
}
