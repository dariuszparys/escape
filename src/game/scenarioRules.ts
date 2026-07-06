import type { CardDef } from '../data/cards';
import type { InventoryItemDef } from '../data/items';
import type { RelicDef, RelicId } from '../data/relics';
import type { ScenarioId } from '../data/scenarios';
import type { RunState } from '../state';
import type { GameRng } from './rng';

export function shouldUseFullProgressionPrep(scenarioId: ScenarioId | null): boolean {
  return scenarioId !== 'escape_the_dungeon';
}

export function shouldAwardProgressionRewards(scenarioId: ScenarioId | null): boolean {
  void scenarioId;
  return true;
}

export function shouldApplyPoisonedRoomDamage(scenarioId: ScenarioId | null): boolean {
  return scenarioId === 'im_poisoned';
}

export const POISONED_ROOM_DAMAGE_INTERVAL = 3;

export function shouldPreventPlayerBlock(scenarioId: ScenarioId | null): boolean {
  return scenarioId === 'lost_left_arm';
}

export function shouldDoubleNormalEncounters(scenarioId: ScenarioId | null): boolean {
  return scenarioId === 'enemies_doubled';
}

export function cardGrantsBlock(card: Pick<CardDef, 'effects'>): boolean {
  return card.effects.some((effect) => effect.kind === 'block' && effect.amount > 0);
}

export function isScenarioAllowedCard(
  card: Pick<CardDef, 'effects'>,
  scenarioId: ScenarioId | null,
): boolean {
  return !shouldPreventPlayerBlock(scenarioId) || !cardGrantsBlock(card);
}

export function isScenarioAllowedItem(
  item: Pick<InventoryItemDef, 'kind'>,
  scenarioId: ScenarioId | null,
): boolean {
  return !shouldPreventPlayerBlock(scenarioId) || item.kind !== 'shield';
}

const BLOCK_ONLY_RELIC_IDS: ReadonlySet<RelicId> = new Set(['stone_heart']);

export function isScenarioAllowedRelic(
  relic: Pick<RelicDef, 'id'>,
  scenarioId: ScenarioId | null,
): boolean {
  return !shouldPreventPlayerBlock(scenarioId) || !BLOCK_ONLY_RELIC_IDS.has(relic.id);
}

export interface PoisonedRoomEntryResult {
  applied: boolean;
  amount: number;
  hpBefore: number;
  hpAfter: number;
  died: boolean;
}

export function applyPoisonedRoomEntryDamage(
  run: Pick<RunState, 'scenarioId' | 'depth' | 'hp'>,
  rng: Pick<GameRng, 'between'>,
): PoisonedRoomEntryResult {
  const hpBefore = run.hp;
  if (
    !shouldApplyPoisonedRoomDamage(run.scenarioId) ||
    run.depth <= 1 ||
    (run.depth - 1) % POISONED_ROOM_DAMAGE_INTERVAL !== 0 ||
    run.hp <= 0
  ) {
    return { applied: false, amount: 0, hpBefore, hpAfter: run.hp, died: run.hp <= 0 };
  }

  const amount = rng.between(1, 2);
  run.hp = Math.max(0, run.hp - amount);
  return {
    applied: true,
    amount,
    hpBefore,
    hpAfter: run.hp,
    died: run.hp <= 0,
  };
}
