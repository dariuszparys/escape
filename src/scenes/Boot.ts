import Phaser from 'phaser';
import { createAllTextures } from '../gfx/sprites';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    createAllTextures(this);

    const walk = (key: string, a: string, b: string) =>
      this.anims.create({
        key,
        frames: [{ key: a }, { key: b }],
        frameRate: 7,
        repeat: -1,
      });
    walk('walk_down', 'hero_down_0', 'hero_down_1');
    walk('walk_up', 'hero_up_0', 'hero_up_1');
    walk('walk_left', 'hero_left_0', 'hero_left_1');
    walk('walk_right', 'hero_right_0', 'hero_right_1');

    this.scene.start('Title');
  }
}
