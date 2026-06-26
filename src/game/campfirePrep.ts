import { PendingPrep, createDefaultPendingPrep } from '../data/campfirePurchases';
import { makeItem } from '../data/items';
import { RunState } from '../state';

export function applyPendingPrepToRun(run: RunState, pendingPrep: PendingPrep): PendingPrep {
  run.startingCardChoices = pendingPrep.extraStartingChoice ? 3 : 2;
  run.scoutCharges = pendingPrep.scoutFlame ? 1 : 0;

  for (const itemId of pendingPrep.itemIds) {
    run.addItem(makeItem(itemId));
  }

  return createDefaultPendingPrep();
}
