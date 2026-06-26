import { PendingPrep, createDefaultPendingPrep } from '../data/campfirePurchases';
import { makeItem } from '../data/items';
import { RunState } from '../state';
import {
  BONUS_STARTING_CARD_CHOICES,
  BONUS_STARTING_CARD_PICKS,
  DEFAULT_STARTING_CARD_CHOICES,
  DEFAULT_STARTING_CARD_PICKS,
} from './startingCards';

export function applyPendingPrepToRun(run: RunState, pendingPrep: PendingPrep): PendingPrep {
  run.startingCardChoices = pendingPrep.extraStartingChoice ? BONUS_STARTING_CARD_CHOICES : DEFAULT_STARTING_CARD_CHOICES;
  run.startingCardPicks = pendingPrep.extraStartingChoice ? BONUS_STARTING_CARD_PICKS : DEFAULT_STARTING_CARD_PICKS;
  run.startingCardsTaken = 0;
  run.scoutCharges = pendingPrep.scoutFlame ? 1 : 0;

  for (const itemId of pendingPrep.itemIds) {
    run.addItem(makeItem(itemId));
  }

  return createDefaultPendingPrep();
}
