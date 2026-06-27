import { MAX_INVENTORY } from '../config';
import type { PendingPrep } from '../data/campfirePurchases';
import { ITEM_DEFS } from '../data/items';
import type { DailyRecord } from '../daily';
import type { RunChronicle } from '../chronicle';
import {
  BONUS_STARTING_CARD_CHOICES,
  BONUS_STARTING_CARD_PICKS,
  DEFAULT_STARTING_CARD_CHOICES,
  DEFAULT_STARTING_CARD_PICKS,
} from './startingCards';

export function formatPendingPrepSummary(prep: PendingPrep): string {
  const names = prep.itemIds.map((id) => ITEM_DEFS.find((item) => item.id === id)?.name ?? id);
  const openingChoices = prep.extraStartingChoice
    ? BONUS_STARTING_CARD_CHOICES
    : DEFAULT_STARTING_CARD_CHOICES;
  const openingPicks = prep.extraStartingChoice
    ? BONUS_STARTING_CARD_PICKS
    : DEFAULT_STARTING_CARD_PICKS;

  return [
    `Prepared supplies: ${names.length > 0 ? names.join(', ') : 'none'} (${names.length}/${MAX_INVENTORY})`,
    `Opening picks: ${openingPicks} of ${openingChoices}`,
    `Scout flame: ${prep.scoutFlame ? 'ready' : 'unlit'}`,
  ].join('\n');
}

export function formatChronicleLine(chronicle: RunChronicle): string {
  return chronicle.runsCompleted === 0
    ? 'No completed runs yet'
    : `Runs ${chronicle.runsCompleted} | Escapes ${chronicle.escapes} | Best room ${chronicle.bestDepth} | Best gold ${chronicle.bestGold}`;
}

export function formatDailyRecordLine(record: DailyRecord): string {
  return `Daily ${record.date} - best room ${record.bestDepth}, escaped: ${record.escaped ? 'yes' : 'no'}`;
}
