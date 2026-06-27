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
  const curseIds = pendingPrep.curseIds ?? [];

  run.startingCardChoices = pendingPrep.extraStartingChoice
    ? BONUS_STARTING_CARD_CHOICES
    : DEFAULT_STARTING_CARD_CHOICES;
  run.startingCardPicks = pendingPrep.extraStartingChoice
    ? BONUS_STARTING_CARD_PICKS
    : DEFAULT_STARTING_CARD_PICKS;
  run.startingCardsTaken = 0;
  run.scoutCharges = pendingPrep.scoutFlame ? 1 : 0;
  run.curseIds = [...curseIds];

  if (curseIds.includes('blood_oath')) {
    run.maxHp = Math.max(1, run.maxHp - 6);
    run.hp = Math.min(run.hp, run.maxHp);
  }

  if (curseIds.includes('narrow_opening')) {
    run.startingCardPicks = Math.max(1, run.startingCardPicks - 1);
  }

  for (const itemId of pendingPrep.itemIds) {
    run.addItem(makeItem(itemId));
  }

  return createDefaultPendingPrep();
}
