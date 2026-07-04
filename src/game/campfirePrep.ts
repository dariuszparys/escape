import { PendingPrep, createDefaultPendingPrep } from '../data/campfirePurchases';
import { CARD_DEFS, makeCard } from '../data/cards';
import { makeItem } from '../data/items';
import { starterKitDef, type StarterKitDef } from '../data/starterKits';
import type { MetaProgressionState } from '../meta';
import { RunState } from '../state';
import {
  BONUS_STARTING_CARD_CHOICES,
  BONUS_STARTING_CARD_PICKS,
  DEFAULT_STARTING_CARD_CHOICES,
  DEFAULT_STARTING_CARD_PICKS,
  STARTING_DECK_PAD_IDS,
} from './startingCards';

function activeStarterKit(progression?: MetaProgressionState): StarterKitDef | null {
  if (!progression?.starterCardVarietyUnlocked || !progression.activeStarterKitId) return null;
  if (!progression.unlockedStarterKitIds.includes(progression.activeStarterKitId)) return null;
  return starterKitDef(progression.activeStarterKitId);
}

function makeSignatureCard(kit: StarterKitDef) {
  const def = CARD_DEFS.find((card) => card.id === kit.signatureCardId);
  if (!def) throw new Error(`Unknown starter kit signature card: ${kit.signatureCardId}`);
  return makeCard(def);
}

export function applyPendingPrepToRun(
  run: RunState,
  pendingPrep: PendingPrep,
  progression?: MetaProgressionState,
): PendingPrep {
  const curseIds = pendingPrep.curseIds ?? [];
  const hasStarterCardVariety = progression?.starterCardVarietyUnlocked === true;
  const starterKit = activeStarterKit(progression);

  run.startingCardChoices =
    hasStarterCardVariety || pendingPrep.extraStartingChoice
      ? BONUS_STARTING_CARD_CHOICES
      : DEFAULT_STARTING_CARD_CHOICES;
  run.startingCardPicks = pendingPrep.extraStartingChoice
    ? BONUS_STARTING_CARD_PICKS
    : DEFAULT_STARTING_CARD_PICKS;
  run.startingCardsTaken = 0;
  run.starterKitId = starterKit?.id ?? null;
  run.archetypeId = progression?.activeArchetypeId ?? null;
  run.scoutCharges = pendingPrep.scoutFlame ? 1 : 0;
  run.curseIds = [...curseIds];

  // R15: pad the opening collection toward the draw size before kit and picks.
  for (const padId of STARTING_DECK_PAD_IDS) {
    const def = CARD_DEFS.find((card) => card.id === padId);
    if (def) run.addCard(makeCard(def));
  }

  if (starterKit) {
    run.addCard(makeSignatureCard(starterKit));
  }

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
