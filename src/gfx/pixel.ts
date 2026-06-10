/**
 * Tiny pixel-art factory: turns string maps into Phaser textures.
 * Each character indexes into a palette; '.' is transparent.
 */
export type Palette = Record<string, string>;

export function makePixelTexture(
  scene: Phaser.Scene,
  key: string,
  rows: string[],
  palette: Palette,
): void {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const ctx = tex.getContext();
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const color = palette[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  tex.refresh();
}

/** Horizontally mirrored copy of an existing string map. */
export function mirror(rows: string[]): string[] {
  return rows.map((r) => r.split('').reverse().join(''));
}
