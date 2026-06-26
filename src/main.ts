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

type DebugSetMeta = (next: Parameters<typeof setMeta>[0]) => ReturnType<typeof setMeta>;

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
const debugWindow = window as unknown as {
  __game: Phaser.Game;
  __getRun: typeof getRun;
  __getMeta: typeof getMeta;
  __setMeta: DebugSetMeta;
};

debugWindow.__game = game;
debugWindow.__getRun = getRun;
debugWindow.__getMeta = getMeta;
debugWindow.__setMeta = (next) => {
  const updated = setMeta(next);
  game.events.emit('meta-update', updated);
  return updated;
};
