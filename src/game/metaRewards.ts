export interface EmberRewardInput {
  depth: number;
  enemiesDefeated: number;
  gold: number;
  escaped: boolean;
}

export interface EmberRewardBreakdown {
  roomEmbers: number;
  enemyEmbers: number;
  goldEmbers: number;
  victoryEmbers: number;
  total: number;
}

export function calculateEmberReward(input: EmberRewardInput): EmberRewardBreakdown {
  const depth = Math.max(1, Math.floor(input.depth));
  const enemiesDefeated = Math.max(0, Math.floor(input.enemiesDefeated));
  const gold = Math.max(0, Math.floor(input.gold));

  const roomEmbers = depth * 2;
  const enemyEmbers = enemiesDefeated * 3;
  const goldEmbers = Math.floor(gold / 10);
  const victoryEmbers = input.escaped ? 15 : 0;

  return {
    roomEmbers,
    enemyEmbers,
    goldEmbers,
    victoryEmbers,
    total: roomEmbers + enemyEmbers + goldEmbers + victoryEmbers,
  };
}
