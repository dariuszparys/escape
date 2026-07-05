import { PendingPrep, createDefaultPendingPrep } from '../data/campfirePurchases';
import { CARD_DEFS, makeCard } from '../data/cards';
import { makeItem } from '../data/items';
import {
  makeRelic,
  randomRelic,
  relicPoolFromUnlocked,
  starterRelicPool,
  type RelicId,
} from '../data/relics';
import type { MetaProgressionState } from '../meta';
import type { ScenarioId } from '../data/scenarios';
import { RunState } from '../state';
import { GameRng } from './rng';
import {
  BONUS_STARTING_CARD_CHOICES,
  BONUS_STARTING_CARD_PICKS,
  DEFAULT_STARTING_CARD_CHOICES,
  DEFAULT_STARTING_CARD_PICKS,
  startingDeckPadIdsForScenario,
} from './startingCards';
import {
  isScenarioAllowedItem,
  isScenarioAllowedRelic,
  shouldUseFullProgressionPrep,
} from './scenarioRules';

export function relicPoolForRun(
  progression?: MetaProgressionState,
  isDaily = false,
): ReadonlySet<RelicId> {
  if (isDaily || !progression?.relicPathUnlocked) return starterRelicPool();
  return relicPoolFromUnlocked(progression?.unlockedRelicIds ?? []);
}

export function applyPendingPrepToRun(
  run: RunState,
  pendingPrep: PendingPrep,
  progression?: MetaProgressionState,
  rng?: GameRng,
  scenarioId: ScenarioId | null = run.scenarioId,
): PendingPrep {
  const curseIds = pendingPrep.curseIds ?? [];
  const useFullPrep = shouldUseFullProgressionPrep(scenarioId);
  const hasStarterCardVariety = progression?.starterCardVarietyUnlocked === true;

  run.relicPool = useFullPrep ? relicPoolForRun(progression, run.isDaily) : starterRelicPool();

  run.startingCardChoices =
    useFullPrep && (hasStarterCardVariety || pendingPrep.extraStartingChoice)
      ? BONUS_STARTING_CARD_CHOICES
      : DEFAULT_STARTING_CARD_CHOICES;
  run.startingCardPicks =
    useFullPrep && pendingPrep.extraStartingChoice
      ? BONUS_STARTING_CARD_PICKS
      : DEFAULT_STARTING_CARD_PICKS;
  run.startingCardsTaken = 0;
  run.archetypeId = run.isDaily ? null : (progression?.activeArchetypeId ?? null);
  run.scoutCharges = useFullPrep && pendingPrep.scoutFlame ? 1 : 0;
  run.curseIds = useFullPrep ? [...curseIds] : [];

  // R15: pad the opening collection toward the draw size before opening picks.
  for (const padId of startingDeckPadIdsForScenario(scenarioId)) {
    const def = CARD_DEFS.find((card) => card.id === padId);
    if (def) run.addCard(makeCard(def));
  }

  if (useFullPrep && curseIds.includes('blood_oath')) {
    run.maxHp = Math.max(1, run.maxHp - 6);
    run.hp = Math.min(run.hp, run.maxHp);
  }

  if (useFullPrep && curseIds.includes('narrow_opening')) {
    run.startingCardPicks = Math.max(1, run.startingCardPicks - 1);
  }

  if (useFullPrep) {
    for (const itemId of pendingPrep.itemIds) {
      const item = makeItem(itemId);
      if (isScenarioAllowedItem(item, scenarioId)) run.addItem(item);
    }

    if (!run.isDaily && progression?.activeStartingRelicId) {
      const relic = makeRelic(progression.activeStartingRelicId);
      if (isScenarioAllowedRelic(relic, scenarioId)) run.addRelic(relic);
    }

    if (!run.isDaily && pendingPrep.pendingRelicRoll && rng) {
      const relic = randomRelic(rng, new Set(run.relicIds), run.relicPool, (candidate) =>
        isScenarioAllowedRelic(candidate, scenarioId),
      );
      if (relic) run.addRelic(relic);
    }
  }

  return useFullPrep ? createDefaultPendingPrep() : pendingPrep;
}
