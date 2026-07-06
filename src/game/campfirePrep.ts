import { CARD_DEFS, makeCard } from '../data/cards';
import { allRelicPool, makeRelic, type RelicId } from '../data/relics';
import type { ScenarioId } from '../data/scenarios';
import type { MetaProgressionState } from '../meta';
import type { ProfileState } from '../profile';
import { RunState } from '../state';
import {
  BONUS_STARTING_CARD_CHOICES,
  DEFAULT_STARTING_CARD_CHOICES,
  DEFAULT_STARTING_CARD_PICKS,
  startingDeckPadIdsForScenario,
} from './startingCards';
import { isScenarioAllowedRelic } from './scenarioRules';
import { hasStarterCardVariety, isArchetypeUnlocked, isStartingRelicEligible } from './progression';

export function relicPoolForRun(): ReadonlySet<RelicId> {
  return allRelicPool();
}

export function applyLoadoutToRun(
  run: RunState,
  progression: MetaProgressionState,
  profile: ProfileState,
  scenarioId: ScenarioId | null = run.scenarioId,
): void {
  run.relicPool = relicPoolForRun();
  run.startingCardChoices = hasStarterCardVariety(profile)
    ? BONUS_STARTING_CARD_CHOICES
    : DEFAULT_STARTING_CARD_CHOICES;
  run.startingCardPicks = DEFAULT_STARTING_CARD_PICKS;
  run.startingCardsTaken = 0;
  run.scoutCharges = 0;
  run.archetypeId =
    !run.isDaily &&
    progression.activeArchetypeId !== null &&
    isArchetypeUnlocked(profile, progression.activeArchetypeId)
      ? progression.activeArchetypeId
      : null;

  // Pad the opening collection toward the draw size before opening picks.
  for (const padId of startingDeckPadIdsForScenario(scenarioId)) {
    const def = CARD_DEFS.find((card) => card.id === padId);
    if (def) run.addCard(makeCard(def));
  }

  if (
    !run.isDaily &&
    progression.activeStartingRelicId &&
    isStartingRelicEligible(profile, progression.activeStartingRelicId)
  ) {
    const relic = makeRelic(progression.activeStartingRelicId);
    if (isScenarioAllowedRelic(relic, scenarioId)) run.addRelic(relic);
  }
}
