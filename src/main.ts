import Phaser from 'phaser';
import { GAME_H, GAME_W } from './config';
import { saveAudioSettings } from './audio/settings';
import { startAmbience } from './audio/sfx';
import { getProfile, setProfile } from './profile';
import { getMeta, setMeta } from './meta';
import { BootScene } from './scenes/Boot';
import { TitleScene } from './scenes/Title';
import { CampfireScene } from './scenes/Campfire';
import { ProgressionScene } from './scenes/Progression';
import { ScenarioSelectScene } from './scenes/ScenarioSelect';
import { DungeonScene } from './scenes/Dungeon';
import { TurnBattleScene } from './scenes/TurnBattle';
import { HudScene } from './scenes/Hud';
import { EndScene } from './scenes/End';
import { getRun } from './state';

type DebugSetMeta = (next: Parameters<typeof setMeta>[0]) => ReturnType<typeof setMeta>;
type DebugSetProfile = (next: Parameters<typeof setProfile>[0]) => ReturnType<typeof setProfile>;

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
  scene: [
    BootScene,
    TitleScene,
    CampfireScene,
    ProgressionScene,
    ScenarioSelectScene,
    DungeonScene,
    TurnBattleScene,
    HudScene,
    EndScene,
  ],
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'm' || event.key === 'M') {
    const muted = !game.sound.mute;
    game.sound.mute = muted;
    saveAudioSettings({ muted });
    if (!muted) startAmbience(game);
  }
});

// Browsers start the Web Audio AudioContext suspended until a user gesture.
// Phaser attaches its own unlock listener, but a keyboard-only start (SPACE on
// the title screen) does not reliably resume it, leaving every playSfx silent.
// Resume explicitly on pointer/key interactions. Keep listening because some
// browsers ignore the first resume attempt even though the game handled the key.
type WebAudioManagerLike = Phaser.Sound.BaseSoundManager & {
  context?: AudioContext;
};

const resumeAudio = () => {
  const manager = game.sound as WebAudioManagerLike;
  if (manager.context && manager.context.state !== 'running') {
    void manager.context.resume().then(() => startAmbience(game));
    return;
  }
  startAmbience(game);
};

window.addEventListener('pointerdown', resumeAudio);
window.addEventListener('keydown', resumeAudio);

// handles for debugging / automated testing
const debugWindow = window as unknown as {
  __game: Phaser.Game;
  __getRun: typeof getRun;
  __getMeta: typeof getMeta;
  __setMeta: DebugSetMeta;
  __getProfile: typeof getProfile;
  __setProfile: DebugSetProfile;
};

debugWindow.__game = game;
debugWindow.__getRun = getRun;
debugWindow.__getProfile = getProfile;
debugWindow.__getMeta = getMeta;
debugWindow.__setProfile = setProfile;
debugWindow.__setMeta = (next) => {
  const updated = setMeta(next);
  game.events.emit('meta-update', updated);
  return updated;
};
