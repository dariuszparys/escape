export interface HpChange {
  damage: number;
  heal: number;
}

export function hpChange(before: number, after: number): HpChange {
  const delta = after - before;
  return {
    damage: Math.max(0, -delta),
    heal: Math.max(0, delta),
  };
}
