// Shared OfflineAudioContext render plumbing used by both sfx.ts (short one-shot
// SFX + the ambience drone) and music.ts (battle music loops). Kept tiny and
// dependency-free on purpose — both files just need a spec shape and a render fn.

export const SAMPLE_RATE = 44100;

export interface RenderSpec {
  duration: number;
  build: (ctx: OfflineAudioContext, destination: AudioNode) => void;
}

export function render(spec: RenderSpec): Promise<AudioBuffer> {
  const length = Math.max(1, Math.ceil(spec.duration * SAMPLE_RATE));
  const ctx = new OfflineAudioContext(1, length, SAMPLE_RATE);
  spec.build(ctx, ctx.destination);
  return ctx.startRendering();
}
