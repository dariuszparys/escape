export interface EmberRewardInput {
  depth: number;
  enemiesDefeated: number;
  gold: number;
  escaped: boolean;
  /**
   * Whether leftover Gold converts to Embers at run-end. True for normal runs
   * (banking cashes Gold out), false for Daily delves where conversion is disabled
   * and delving yields depth only (R15).
   */
  convertGold?: boolean;
}

export interface EmberRewardBreakdown {
  depthMilestoneEmbers: number;
  escapeEmbers: number;
  convertedEmbers: number;
  total: number;
}

const DEPTH_MILESTONES = [3, 6, 9] as const;
const ESCAPE_EMBERS = 3;

/**
 * Conversion economy (KTD3). Two separable halves so the U7 harness can move the
 * bound between the conversion side and the escalation side without reshaping the
 * breakdown:
 *   - GOLD_PER_EMBER is the raw, linear rate.
 *   - CONVERSION_GUARD_CAP is the bounding guard: a concave saturation toward the
 *     cap so doubling raw Gold never doubles converted Embers past it, and
 *     unlimited delving cannot trivialize the Campfire economy (R13).
 * Both are provisional and tuned against the balance simulator (KTD8).
 */
const GOLD_PER_EMBER = 10;
const CONVERSION_GUARD_CAP = 10;

function normalizeNonNegativeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/** The hard ceiling on Embers a single run can mint from Gold conversion. */
export const CONVERSION_EMBER_CAP = CONVERSION_GUARD_CAP;

/** The "rate" half of the conversion: linear Gold→Ember before the guard. */
function rawConvertedEmbers(gold: number): number {
  return gold / GOLD_PER_EMBER;
}

/**
 * The "guard" half: a hyperbolic saturation toward CONVERSION_GUARD_CAP. As raw
 * conversion grows the marginal Ember shrinks, so the yield is strictly bounded.
 */
function applyConversionGuard(raw: number): number {
  if (raw <= 0) return 0;
  return Math.floor((CONVERSION_GUARD_CAP * raw) / (raw + CONVERSION_GUARD_CAP));
}

/**
 * Canonical Gold→Ember conversion (rate + guard), shared by the run-end reward and
 * the balance harness so there is a single curve to tune (KTD3/KTD8).
 */
export function convertGoldToEmbers(gold: number): number {
  return applyConversionGuard(rawConvertedEmbers(normalizeNonNegativeInteger(gold)));
}

export function calculateEmberReward(input: EmberRewardInput): EmberRewardBreakdown {
  const depth = normalizeNonNegativeInteger(input.depth);
  const gold = normalizeNonNegativeInteger(input.gold);
  const convertGold = input.convertGold ?? true;

  const depthMilestoneEmbers = DEPTH_MILESTONES.filter((milestone) => depth >= milestone).length;
  const escapeEmbers = input.escaped ? ESCAPE_EMBERS : 0;
  // Conversion is a banking-only reward: it requires escaping (death forfeits Gold)
  // and a run where conversion is enabled (off for the Daily delve).
  const convertedEmbers = input.escaped && convertGold ? convertGoldToEmbers(gold) : 0;

  return {
    depthMilestoneEmbers,
    escapeEmbers,
    convertedEmbers,
    total: depthMilestoneEmbers + escapeEmbers + convertedEmbers,
  };
}
