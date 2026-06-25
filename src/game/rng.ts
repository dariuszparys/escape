export interface GameRng {
  frac(): number;
  between(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
}

export class PhaserGameRng implements GameRng {
  constructor(private readonly rng: Phaser.Math.RandomDataGenerator) {}

  frac(): number {
    return this.rng.frac();
  }

  between(min: number, max: number): number {
    return this.rng.between(min, max);
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Cannot pick from an empty array.');
    return this.rng.pick([...items]);
  }
}
