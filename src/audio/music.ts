import Phaser from 'phaser';
import { render, RenderSpec, SAMPLE_RATE } from './renderSpec';

// Battle music, following sfx.ts's ambience pattern: procedural, pre-rendered
// loop buffers, no assets. Mono, gapless via native buffer looping. Audio
// synthesis stays on unseeded Math.random() — never the gameplay RNG.

export type MusicKey = 'battle_default' | 'battle_elite' | 'battle_boss';

const MUSIC_PREFIX = 'music_';

/**
 * Sustained-layer frequencies per track — the drones/pads that ring for the
 * FULL loop duration. These are the single source of truth for both the
 * audio (build functions below read from this) and the integer-cycle test
 * (frequency * duration must be a whole number of cycles so the loop point
 * is gapless). Short enveloped one-shot notes elsewhere in each track decay
 * to silence well before the loop boundary, so they're exempt from this rule.
 */
export const SUSTAINED_LAYER_FREQUENCIES: Record<MusicKey, number[]> = {
  battle_default: [110, 220],
  battle_elite: [98, 104, 139],
  battle_boss: [55, 56, 110, 165],
};

// ---------------------------------------------------------------- builders

function sustainedPad(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  freqs: number[],
  duration: number,
  type: OscillatorType,
  peak: number,
): void {
  for (const freq of freqs) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, 0);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peak * 0.75, 0);
    gain.gain.linearRampToValueAtTime(peak, duration / 2);
    gain.gain.linearRampToValueAtTime(peak * 0.75, duration);
    osc.connect(gain).connect(dest);
    osc.start(0);
    osc.stop(duration);
  }
}

function pulseNote(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  freq: number,
  start: number,
  dur: number,
  type: OscillatorType,
  peak: number,
  filterFreq: number,
): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(filterFreq, start);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(filter).connect(gain).connect(dest);
  osc.start(start);
  osc.stop(start + dur);
}

function kickHit(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  start: number,
  peak: number,
  low: number,
  high: number,
  dur: number,
): void {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(high, start);
  osc.frequency.exponentialRampToValueAtTime(low, start + dur);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peak, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(dest);
  osc.start(start);
  osc.stop(start + dur);
}

function noiseHit(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  start: number,
  dur: number,
  peak: number,
  filterType: BiquadFilterType,
  filterFreq: number,
): void {
  const length = Math.max(1, Math.ceil(dur * SAMPLE_RATE));
  const buffer = ctx.createBuffer(1, length, SAMPLE_RATE);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = filterFreq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peak, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(filter).connect(gain).connect(dest);
  src.start(start);
  src.stop(start + dur);
}

// ------------------------------------------------------------------ tracks

export const SPECS: Record<MusicKey, RenderSpec> = {
  // Calm, moderate-tempo default: a sparse pentatonic bassline over a soft
  // sine pad, with a gentle once-a-second thump. 12s loop.
  battle_default: {
    duration: 12,
    build: (ctx, dest) => {
      sustainedPad(ctx, dest, SUSTAINED_LAYER_FREQUENCIES.battle_default, 12, 'sine', 0.05);

      const scale = [110, 130.81, 146.83, 164.81, 196];
      const pattern = [0, 0, 2, 0, 3, 0, 2, 0, 0, 0, 4, 0, 3, 0, 2, 0, 0, 0, 2, 0, 3, 0, 1, 0];
      const step = 0.5;
      for (const [i, note] of pattern.entries()) {
        pulseNote(ctx, dest, scale[note], i * step, 0.38, 'triangle', 0.14, 1400);
      }

      for (let i = 0; i < 12; i++) {
        kickHit(ctx, dest, i, 0.22, 45, 90, 0.16);
      }
    },
  },

  // Tenser and faster: a dissonant tritone/cluster pad under a driving
  // sawtooth arpeggio with kick + hats. 13s loop.
  battle_elite: {
    duration: 13,
    build: (ctx, dest) => {
      sustainedPad(ctx, dest, SUSTAINED_LAYER_FREQUENCIES.battle_elite, 13, 'sawtooth', 0.045);

      const scale = [196, 220.0, 233.08, 261.63, 293.66, 311.13];
      const pattern = [0, 2, 1, 3, 0, 2, 4, 3, 5, 3, 1, 0, 2, 4, 3, 1];
      const step = 0.25;
      const steps = Math.floor(13 / step);
      for (let i = 0; i < steps; i++) {
        pulseNote(
          ctx,
          dest,
          scale[pattern[i % pattern.length]],
          i * step,
          0.18,
          'sawtooth',
          0.1,
          2200,
        );
      }

      for (let i = 0; i * 0.5 < 13; i++) {
        kickHit(ctx, dest, i * 0.5, 0.26, 55, 120, 0.14);
      }
      for (let i = 0; i * 0.25 + 0.25 < 13; i++) {
        noiseHit(ctx, dest, i * 0.25 + 0.25, 0.06, 0.09, 'highpass', 4000);
      }
    },
  },

  // Heaviest and most intense: a detuned low sawtooth cluster (55/56 Hz beat
  // for a growling weight) under a slow stomping bassline, a relentless
  // double kick, crunchy bandpass hits, and sparse dissonant bell stabs. 16s loop.
  battle_boss: {
    duration: 16,
    build: (ctx, dest) => {
      sustainedPad(ctx, dest, SUSTAINED_LAYER_FREQUENCIES.battle_boss, 16, 'sawtooth', 0.06);

      const scale = [55, 61.74, 65.41, 73.42, 82.41];
      const pattern = [0, 0, 2, 0, 0, 3, 0, 2, 0, 0, 4, 0, 2, 0, 3, 0];
      const step = 1;
      for (const [i, note] of pattern.entries()) {
        pulseNote(ctx, dest, scale[note], i * step, 0.55, 'sawtooth', 0.16, 500);
      }

      for (let i = 0; i * 0.5 < 16; i++) {
        kickHit(ctx, dest, i * 0.5, 0.3, 38, 100, 0.2);
      }
      for (let i = 0; i * 1 < 16; i++) {
        noiseHit(ctx, dest, i, 0.18, 0.14, 'bandpass', 260);
      }
      for (let i = 0; i * 2 < 16; i++) {
        pulseNote(ctx, dest, 466.16, i * 2, 0.3, 'square', 0.05, 3000);
      }
    },
  },
};

// ----------------------------------------------------------------- playback

export async function createAllMusic(scene: Phaser.Scene): Promise<void> {
  if (typeof window === 'undefined' || !window.OfflineAudioContext) return;
  const entries = Object.entries(SPECS) as [MusicKey, RenderSpec][];
  const buffers = await Promise.all(entries.map(([, spec]) => render(spec)));
  for (const [i, [key]] of entries.entries()) {
    scene.game.cache.audio.add(MUSIC_PREFIX + key, buffers[i]);
  }
}

export function trackForEncounterKind(kind: 'normal' | 'elite' | 'boss'): MusicKey {
  switch (kind) {
    case 'elite':
      return 'battle_elite';
    case 'boss':
      return 'battle_boss';
    default:
      return 'battle_default';
  }
}

type SoundManagerWithSounds = Phaser.Sound.BaseSoundManager & {
  sounds?: Phaser.Sound.BaseSound[];
};

export function playMusic(scene: Phaser.Scene, key: MusicKey, volume = 0.24): void {
  const game = scene.game;
  if (game.sound.mute) return;
  const cacheKey = MUSIC_PREFIX + key;
  if (!game.cache.audio.exists(cacheKey)) return;
  const manager = game.sound as SoundManagerWithSounds;
  const playingMusic = (manager.sounds ?? []).filter(
    (sound) => sound.key.startsWith(MUSIC_PREFIX) && sound.isPlaying,
  );
  if (playingMusic.some((sound) => sound.key === cacheKey)) return;
  for (const sound of playingMusic) sound.stop();
  game.sound.play(cacheKey, { volume, loop: true });
}

export function stopAllMusic(game: Phaser.Game): void {
  const manager = game.sound as SoundManagerWithSounds;
  for (const sound of manager.sounds ?? []) {
    if (sound.key.startsWith(MUSIC_PREFIX) && sound.isPlaying) sound.stop();
  }
}
