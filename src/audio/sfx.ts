import Phaser from 'phaser';
import { render, RenderSpec, SAMPLE_RATE } from './renderSpec';

export type SfxKey =
  | 'step'
  | 'door'
  | 'card_play'
  | 'card_draw'
  | 'shuffle'
  | 'end_turn'
  | 'reject'
  | 'hit_enemy'
  | 'hit_player'
  | 'block'
  | 'heal'
  | 'chest'
  | 'trap'
  | 'victory'
  | 'death'
  | 'purchase'
  | 'boss_telegraph'
  | 'ambience';

const SFX_PREFIX = 'sfx_';

function envelope(gain: GainNode, peak: number, duration: number): void {
  gain.gain.setValueAtTime(peak, 0);
  gain.gain.exponentialRampToValueAtTime(0.0001, duration);
}

function tone(
  freq: number,
  freqEnd: number | undefined,
  type: OscillatorType,
  gainPeak: number,
  duration: number,
): RenderSpec {
  return {
    duration,
    build: (ctx, dest) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, 0);
      if (freqEnd !== undefined) {
        osc.frequency.linearRampToValueAtTime(freqEnd, duration);
      }
      const gain = ctx.createGain();
      envelope(gain, gainPeak, duration);
      osc.connect(gain).connect(dest);
      osc.start(0);
      osc.stop(duration);
    },
  };
}

function noise(
  duration: number,
  gainPeak: number,
  filterType: BiquadFilterType | undefined,
  filterFreq: number | undefined,
): RenderSpec {
  return {
    duration,
    build: (ctx, dest) => {
      const length = Math.ceil(duration * SAMPLE_RATE);
      const buffer = ctx.createBuffer(1, length, SAMPLE_RATE);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      envelope(gain, gainPeak, duration);
      let node: AudioNode = src;
      if (filterType !== undefined) {
        const filter = ctx.createBiquadFilter();
        filter.type = filterType;
        filter.frequency.value = filterFreq ?? 1000;
        src.connect(filter);
        node = filter;
      }
      node.connect(gain).connect(dest);
      src.start(0);
      src.stop(duration);
    },
  };
}

const SPECS: Record<SfxKey, RenderSpec> = {
  step: noise(0.06, 0.5, 'lowpass', 140),
  door: {
    duration: 0.18,
    build: (ctx, dest) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(90, 0);
      osc.frequency.exponentialRampToValueAtTime(50, 0.18);
      const g1 = ctx.createGain();
      envelope(g1, 0.5, 0.18);
      osc.connect(g1).connect(dest);
      osc.start(0);
      osc.stop(0.18);
      const n = noise(0.1, 0.4, 'lowpass', 220);
      n.build(ctx, dest);
    },
  },
  card_play: tone(660, undefined, 'square', 0.35, 0.05),
  card_draw: tone(520, 640, 'triangle', 0.22, 0.05),
  shuffle: noise(0.28, 0.35, 'bandpass', 600),
  end_turn: tone(330, 220, 'square', 0.28, 0.12),
  reject: tone(140, 90, 'square', 0.32, 0.09),
  hit_enemy: noise(0.12, 0.6, 'bandpass', 800),
  hit_player: noise(0.14, 0.6, 'lowpass', 300),
  block: {
    duration: 0.12,
    build: (ctx, dest) => {
      for (const freq of [320, 324]) {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, 0);
        const g = ctx.createGain();
        envelope(g, 0.3, 0.12);
        osc.connect(g).connect(dest);
        osc.start(0);
        osc.stop(0.12);
      }
    },
  },
  heal: tone(440, 880, 'sine', 0.4, 0.22),
  chest: {
    duration: 0.25,
    build: (ctx, dest) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, 0);
      osc.frequency.exponentialRampToValueAtTime(60, 0.25);
      const g1 = ctx.createGain();
      envelope(g1, 0.4, 0.25);
      osc.connect(g1).connect(dest);
      osc.start(0);
      osc.stop(0.25);
      const sweep = ctx.createBiquadFilter();
      sweep.type = 'bandpass';
      sweep.frequency.setValueAtTime(400, 0);
      sweep.frequency.linearRampToValueAtTime(1200, 0.18);
      const length = Math.ceil(0.18 * SAMPLE_RATE);
      const buffer = ctx.createBuffer(1, length, SAMPLE_RATE);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const g2 = ctx.createGain();
      envelope(g2, 0.25, 0.18);
      src.connect(sweep).connect(g2).connect(dest);
      src.start(0);
      src.stop(0.18);
    },
  },
  trap: tone(200, 80, 'sawtooth', 0.5, 0.1),
  victory: {
    duration: 0.5,
    build: (ctx, dest) => {
      const notes = [523, 659, 784];
      for (const [i, freq] of notes.entries()) {
        const start = i * 0.16;
        const dur = 0.15;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(0.4, start + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        osc.connect(g).connect(dest);
        osc.start(start);
        osc.stop(start + dur);
      }
    },
  },
  death: tone(330, 110, 'sawtooth', 0.5, 0.5),
  purchase: tone(990, undefined, 'square', 0.3, 0.07),
  boss_telegraph: {
    duration: 0.4,
    build: (ctx, dest) => {
      for (const freq of [70, 73]) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, 0);
        osc.frequency.linearRampToValueAtTime(freq - 5, 0.4);
        const g = ctx.createGain();
        envelope(g, 0.5, 0.4);
        osc.connect(g).connect(dest);
        osc.start(0);
        osc.stop(0.4);
      }
    },
  },
  ambience: {
    duration: 8,
    build: (ctx, dest) => {
      for (const freq of [55, 82]) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, 0);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.06, 0);
        gain.gain.linearRampToValueAtTime(0.04, 4);
        gain.gain.linearRampToValueAtTime(0.06, 8);
        osc.connect(gain).connect(dest);
        osc.start(0);
        osc.stop(8);
      }

      const scale = [220, 261.63, 293.66, 329.63, 392, 440];
      const phrase = [0, 2, 3, 2, 4, 3, 1, 0, 2, 4, 5, 4, 3, 2, 0, 1];
      for (const [index, note] of phrase.entries()) {
        const start = index * 0.5;
        const duration = index % 4 === 3 ? 0.46 : 0.34;
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(scale[note], start);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1200, start);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.11, start + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        osc.connect(filter).connect(gain).connect(dest);
        osc.start(start);
        osc.stop(start + duration);
      }

      const length = Math.ceil(8 * SAMPLE_RATE);
      const buffer = ctx.createBuffer(1, length, SAMPLE_RATE);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 180;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.035, 0);
      gain.gain.linearRampToValueAtTime(0.02, 4);
      gain.gain.linearRampToValueAtTime(0.035, 8);
      src.connect(filter).connect(gain).connect(dest);
      src.start(0);
      src.stop(8);
    },
  },
};

export async function createAllSfx(scene: Phaser.Scene): Promise<void> {
  if (typeof window === 'undefined' || !window.OfflineAudioContext) return;
  const entries = Object.entries(SPECS) as [SfxKey, RenderSpec][];
  const buffers = await Promise.all(entries.map(([, spec]) => render(spec)));
  for (const [i, [key]] of entries.entries()) {
    scene.game.cache.audio.add(SFX_PREFIX + key, buffers[i]);
  }
}

export function playSfx(scene: Phaser.Scene, key: SfxKey, volume = 0.6): void {
  const cacheKey = SFX_PREFIX + key;
  if (!scene.game.cache.audio.exists(cacheKey)) return;
  scene.sound.play(cacheKey, { volume });
}

export function startAmbience(game: Phaser.Game, volume = 0.18): void {
  const cacheKey = SFX_PREFIX + 'ambience';
  if (game.sound.mute || !game.cache.audio.exists(cacheKey)) return;
  const manager = game.sound as Phaser.Sound.BaseSoundManager & {
    sounds?: Phaser.Sound.BaseSound[];
  };
  const sounds = manager.sounds ?? [];
  const alreadyPlaying = sounds.some((sound) => sound.key === cacheKey && sound.isPlaying);
  if (alreadyPlaying) return;
  // main.ts calls this unconditionally on every pointerdown/keydown and on
  // unmute, which also fire during battles (card plays, key bindings). Battle
  // music (music_-prefixed, see music.ts) owns the audio bed for the battle
  // scene's lifetime per KTD6, so never let ambience restart over it.
  const musicPlaying = sounds.some((sound) => sound.key.startsWith('music_') && sound.isPlaying);
  if (musicPlaying) return;
  game.sound.play(cacheKey, { volume, loop: true });
}

/** The "ambience pauses at battle start" half of KTD6; startAmbience is the resume half. */
export function stopAmbience(game: Phaser.Game): void {
  const cacheKey = SFX_PREFIX + 'ambience';
  const manager = game.sound as Phaser.Sound.BaseSoundManager & {
    sounds?: Phaser.Sound.BaseSound[];
  };
  const playing = (manager.sounds ?? []).find((sound) => sound.key === cacheKey && sound.isPlaying);
  playing?.stop();
}
