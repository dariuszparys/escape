import { describe, expect, test } from 'vitest';
import {
  relicBattleSetup,
  relicChestGoldBonusLabel,
  relicChestGoldMultiplier,
  relicGoldBonusLabel,
  relicGoldMultiplier,
  relicMaxArmor,
  relicRoomEnterHeal,
  RELIC_BATTLE_WON_HEAL,
  RELIC_ELITE_GOLD,
  RELIC_ON_ACQUIRE_MAX_HP,
} from './relicRegistry';

describe('relicRegistry', () => {
  test('swift_boots sets draw size in battle setup', () => {
    expect(relicBattleSetup(['swift_boots']).drawSize).toBe(6);
  });

  test('spark_coil adds starting energy bonus', () => {
    expect(relicBattleSetup(['spark_coil']).startingEnergyBonus).toBe(1);
  });

  test('stone_heart sets a block-retention cap', () => {
    expect(relicBattleSetup(['stone_heart']).retainBlockCap).toBe(3);
  });

  test('venom_ring adds a poison bonus', () => {
    expect(relicBattleSetup(['venom_ring']).poisonBonus).toBe(1);
  });

  test('hunter_charm adds an enemy-kill draw bonus', () => {
    expect(relicBattleSetup(['hunter_charm']).enemyKillDraw).toBe(1);
  });

  test('iron_will raises max armor cap', () => {
    expect(relicMaxArmor(3, ['iron_will'])).toBe(4);
  });

  test('lucky_coin applies gold multiplier', () => {
    expect(relicGoldMultiplier(['lucky_coin'])).toBe(1.5);
  });

  test('hoarders_map applies a chest-only gold multiplier', () => {
    expect(relicChestGoldMultiplier(['hoarders_map'])).toBe(1.25);
    expect(relicChestGoldMultiplier([])).toBe(1);
  });

  test('wanderers_flask heals 1 HP on room entry', () => {
    expect(relicRoomEnterHeal(['wanderers_flask'])).toBe(1);
    expect(relicRoomEnterHeal([])).toBe(0);
  });

  test('vampiric_blade, merchants_seal, and vital_charm register their fixed bonuses', () => {
    expect(RELIC_BATTLE_WON_HEAL.vampiric_blade).toBe(2);
    expect(RELIC_ELITE_GOLD.merchants_seal).toBe(8);
    expect(RELIC_ON_ACQUIRE_MAX_HP.vital_charm).toBe(5);
  });

  test('gold-bonus labels derive from the actual multipliers, not a hardcoded string', () => {
    expect(relicGoldBonusLabel([])).toBe('');
    expect(relicGoldBonusLabel(['lucky_coin'])).toBe(' (+50%)');
    expect(relicChestGoldBonusLabel([])).toBe('');
    expect(relicChestGoldBonusLabel(['hoarders_map'])).toBe(' (+25%)');
    expect(relicChestGoldBonusLabel(['lucky_coin', 'hoarders_map'])).toBe(' (+50%, +25%)');
  });
});
