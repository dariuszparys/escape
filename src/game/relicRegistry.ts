import type { RelicId } from '../data/relics';

/** Battle-setup overrides contributed by owned relics. */
export interface RelicBattleSetup {
  drawSize?: number;
  startingEnergyBonus?: number;
  retainBlockCap?: number;
  poisonBonus?: number;
  enemyKillDraw?: number;
}

export function relicBattleSetup(relicIds: readonly RelicId[]): RelicBattleSetup {
  const setup: RelicBattleSetup = {};
  for (const id of relicIds) {
    switch (id) {
      case 'swift_boots':
        // A set-to-N override, not a delta — `Math.max` so a future second draw-size relic
        // composes as "the strongest applies" instead of silently clobbering by iteration order.
        setup.drawSize = Math.max(setup.drawSize ?? 0, 6);
        break;
      case 'spark_coil':
        setup.startingEnergyBonus = (setup.startingEnergyBonus ?? 0) + 1;
        break;
      case 'stone_heart':
        setup.retainBlockCap = Math.max(setup.retainBlockCap ?? 0, 3);
        break;
      case 'venom_ring':
        setup.poisonBonus = (setup.poisonBonus ?? 0) + 1;
        break;
      case 'hunter_charm':
        setup.enemyKillDraw = (setup.enemyKillDraw ?? 0) + 1;
        break;
      case 'iron_will':
      case 'lucky_coin':
      case 'vampiric_blade':
      case 'merchants_seal':
      case 'hoarders_map':
      case 'vital_charm':
      case 'wanderers_flask':
        break;
      default: {
        const _exhaustive: never = id;
        throw new Error(`Unhandled relic battle setup: ${String(_exhaustive)}`);
      }
    }
  }
  return setup;
}

/** Post-victory heal from relics (combat event bus layer). */
export const RELIC_BATTLE_WON_HEAL: Partial<Record<RelicId, number>> = {
  vampiric_blade: 2,
};

/** Bonus gold after elite victory. */
export const RELIC_ELITE_GOLD: Partial<Record<RelicId, number>> = {
  merchants_seal: 8,
};

/** Chest gold multiplier from relics (stacks multiplicatively with lucky_coin). */
export function relicChestGoldMultiplier(relicIds: readonly RelicId[]): number {
  let mult = 1;
  if (relicIds.includes('hoarders_map')) mult *= 1.25;
  return mult;
}

/** Room-enter heal from relics. */
export function relicRoomEnterHeal(relicIds: readonly RelicId[]): number {
  return relicIds.includes('wanderers_flask') ? 1 : 0;
}

/** Max HP bonus applied when a relic is acquired. */
export const RELIC_ON_ACQUIRE_MAX_HP: Partial<Record<RelicId, number>> = {
  vital_charm: 5,
};

/** Max armor cap override from relics. */
export function relicMaxArmor(baseMax: number, relicIds: readonly RelicId[]): number {
  return relicIds.includes('iron_will') ? baseMax + 1 : baseMax;
}

/** Relics that fill armor to the (possibly relic-raised) cap the instant they're acquired,
 * rather than leaving it to accumulate from rare chest pickups — otherwise a cap raise with
 * nothing behind it is a dead pick for most of a run. */
export const RELIC_ON_ACQUIRE_FILLS_ARMOR: ReadonlySet<RelicId> = new Set(['iron_will']);

/** Gold multiplier from relics (run economy layer). */
export function relicGoldMultiplier(relicIds: readonly RelicId[]): number {
  return relicIds.includes('lucky_coin') ? 1.5 : 1;
}

function percentBonus(multiplier: number): number {
  return Math.round((multiplier - 1) * 100);
}

/** "(+50%)"-style suffix for the combat gold multiplier (lucky_coin), or '' with no bonus. Scene
 * code derives its gold-bonus labels from this instead of hardcoding the percentage, so a retune
 * of `relicGoldMultiplier` can't leave the displayed text stale. */
export function relicGoldBonusLabel(relicIds: readonly RelicId[]): string {
  const pct = percentBonus(relicGoldMultiplier(relicIds));
  return pct > 0 ? ` (+${pct}%)` : '';
}

/** "(+50%, +25%)"-style suffix combining the combat and chest-only gold multipliers, or ''. */
export function relicChestGoldBonusLabel(relicIds: readonly RelicId[]): string {
  const parts = [
    percentBonus(relicGoldMultiplier(relicIds)),
    percentBonus(relicChestGoldMultiplier(relicIds)),
  ]
    .filter((pct) => pct > 0)
    .map((pct) => `+${pct}%`);
  return parts.length > 0 ? ` (${parts.join(', ')})` : '';
}
