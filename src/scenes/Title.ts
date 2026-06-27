import Phaser from 'phaser';
import { GAME_W } from '../config';
import { playSfx } from '../audio/sfx';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    const cx = GAME_W / 2;

    this.add
      .text(cx, 130, 'ESCAPE', {
        fontFamily: 'monospace',
        fontSize: '72px',
        fontStyle: 'bold',
        color: '#f1c40f',
      })
      .setOrigin(0.5);
    this.add
      .text(cx, 195, '~ the card dungeon ~', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#b8b0c8',
      })
      .setOrigin(0.5);

    const hero = this.add.image(cx, 290, 'hero_down_0').setScale(5);
    this.tweens.add({
      targets: hero,
      y: 280,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const lines = [
      'Descend 10 rooms. Slay the boss. Escape.',
      '',
      'Choose two opening cards at the fire',
      'Gold is for this run; Embers unlock long-term options',
      'Move with WASD / arrow keys',
      'Walk into things to pick them up',
      'Beat enemies to steal their cards (max 5 in hand)',
      'Most enemies match your hand size',
      '',
      'In battle you can always Punch for 3 damage',
      'Press P in the dungeon to drink a potion',
    ];
    this.add
      .text(cx, 430, lines.join('\n'), {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: '#d8d2e4',
        align: 'center',
        lineSpacing: 4,
      })
      .setOrigin(0.5);

    const start = this.add
      .text(cx, 560, '[ PRESS SPACE OR CLICK TO ENTER ]', {
        fontFamily: 'monospace',
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
}
