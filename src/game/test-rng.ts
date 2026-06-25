import { GameRng } from './rng';

export class SequenceRng implements GameRng {
  private fracIndex = 0;
  private betweenIndex = 0;

  constructor(
    private readonly fractions: number[] = [],
    private readonly betweenValues: number[] = [],
  ) {}

  frac(): number {
    if (this.fractions.length === 0) return 0;
    const value = this.fractions[Math.min(this.fracIndex, this.fractions.length - 1)];
    this.fracIndex++;
    return value;
  }

  between(min: number, max: number): number {
    if (this.betweenValues.length === 0) return min;
    const value = this.betweenValues[Math.min(this.betweenIndex, this.betweenValues.length - 1)];
    this.betweenIndex++;
    return Math.max(min, Math.min(max, value));
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Cannot pick from an empty array.');
    const index = Math.min(items.length - 1, Math.floor(this.frac() * items.length));
    return items[index];
  }
}
