export interface EmberRewardInput {
  depth: number;
  enemiesDefeated: number;
  gold: number;
  escaped: boolean;
}

export interface EmberRewardBreakdown {
  depthMilestoneEmbers: number;
  escapeEmbers: number;
  total: number;
}

const DEPTH_MILESTONES = [3, 6, 9] as const;
const ESCAPE_EMBERS = 3;

function normalizeNonNegativeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function calculateEmberReward(input: EmberRewardInput): EmberRewardBreakdown {
  const depth = normalizeNonNegativeInteger(input.depth);
  const depthMilestoneEmbers = DEPTH_MILESTONES.filter((milestone) => depth >= milestone).length;
  const escapeEmbers = input.escaped ? ESCAPE_EMBERS : 0;

  return {
    depthMilestoneEmbers,
    escapeEmbers,
    total: depthMilestoneEmbers + escapeEmbers,
  };
}
