import Phaser from 'phaser';
import { GAME_H, GAME_W } from './config';
import { getMeta, setMeta } from './meta';
import { BootScene } from './scenes/Boot';
import { TitleScene } from './scenes/Title';
import { CampfireScene } from './scenes/Campfire';
import { DungeonScene } from './scenes/Dungeon';
import { BattleScene } from './scenes/Battle';
import { HudScene } from './scenes/Hud';
import { EndScene } from './scenes/End';
import { getRun } from './state';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#0b0a12',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
  scene: [BootScene, TitleScene, CampfireScene, DungeonScene, BattleScene, HudScene, EndScene],
});

// handles for debugging / automated testing
(window as unknown as { __game: Phaser.Game }).__game = game;
(window as unknown as { __getRun: typeof getRun }).__getRun = getRun;
(window as unknown as { __getMeta: typeof getMeta }).__getMeta = getMeta;
(window as unknown as { __setMeta: typeof setMeta }).__setMeta = setMeta;
