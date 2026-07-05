import { MAX_INVENTORY } from '../config';
import type { PendingPrep } from '../data/campfirePurchases';
import { ARCHETYPES } from '../data/archetypes';
import { ITEM_DEFS } from '../data/items';
import { relicDef } from '../data/relics';
import type { DailyRecord } from '../daily';
import type { RunChronicle } from '../chronicle';
import type { MetaProgressionState } from '../meta';
import {
  BONUS_STARTING_CARD_CHOICES,
  BONUS_STARTING_CARD_PICKS,
  DEFAULT_STARTING_CARD_CHOICES,
  DEFAULT_STARTING_CARD_PICKS,
} from './startingCards';

function activeArchetypeName(progression: MetaProgressionState): string {
  const archetype = progression.activeArchetypeId
    ? ARCHETYPES.find((candidate) => candidate.id === progression.activeArchetypeId)
    : null;
  return archetype?.name ?? 'none';
}

export function formatCampfireProgressionSummary(progression: MetaProgressionState): string {
  return [
    `Archetype: ${activeArchetypeName(progression)}`,
    `Starter variety: ${progression.starterCardVarietyUnlocked ? 'unlocked' : 'locked'}`,
    progression.relicPathUnlocked
      ? `Relics: ${(progression.unlockedRelicIds ?? []).length + 4} in pool`
      : 'Relics: path locked',
    progression.activeStartingRelicId
      ? `Starting relic: ${relicDef(progression.activeStartingRelicId).name}`
      : 'Starting relic: none',
  ].join('\n');
}

export function formatPendingPrepSummary(
  prep: PendingPrep,
  progression?: MetaProgressionState,
): string {
  const names = prep.itemIds.map((id) => ITEM_DEFS.find((item) => item.id === id)?.name ?? id);
  const openingChoices =
    prep.extraStartingChoice || progression?.starterCardVarietyUnlocked
      ? BONUS_STARTING_CARD_CHOICES
      : DEFAULT_STARTING_CARD_CHOICES;
  const openingPicks = prep.extraStartingChoice
    ? BONUS_STARTING_CARD_PICKS
    : DEFAULT_STARTING_CARD_PICKS;
  const archetypeLine = progression ? `Archetype: ${activeArchetypeName(progression)}` : null;

  return [
    ...(archetypeLine ? [archetypeLine] : []),
    `One-run prep: ${names.length > 0 ? names.join(', ') : 'none'} (${names.length}/${MAX_INVENTORY})`,
    `Opening picks: ${openingPicks} of ${openingChoices}`,
    `Scout flame: ${prep.scoutFlame ? 'ready' : 'unlit'}`,
    `Relic charm: ${prep.pendingRelicRoll ? 'ready' : 'none'}`,
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
