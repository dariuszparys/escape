export const STARTING_CARD_IDS = ['slash', 'guard', 'quick_jab', 'minor_heal'] as const;

/**
 * R15: the deck model needs a body. Every run opens with these basics so the
 * starting collection sits near the draw size (5) before picks and kit
 * signatures — a 2-card deck would reshuffle mid-turn forever. Composition is
 * a playtest question; the pad's existence is structural.
 */
export const STARTING_DECK_PAD_IDS = ['strike', 'strike', 'guard', 'guard'] as const;

export const DEFAULT_STARTING_CARD_CHOICES = 3;
export const DEFAULT_STARTING_CARD_PICKS = 2;
export const BONUS_STARTING_CARD_CHOICES = 4;
export const BONUS_STARTING_CARD_PICKS = 3;

interface StartingCardRun {
  startingCardChoices: number;
  isDaily: boolean;
}

export function startingCardIdsForChoiceCount(choiceCount: number): string[] {
  const normalizedChoiceCount = Number.isFinite(choiceCount)
    ? Math.floor(choiceCount)
    : DEFAULT_STARTING_CARD_CHOICES;
  const count = Math.max(
    DEFAULT_STARTING_CARD_CHOICES,
    Math.min(STARTING_CARD_IDS.length, normalizedChoiceCount),
  );
  return STARTING_CARD_IDS.slice(0, count);
}

export function startingCardIdsForRun(run: StartingCardRun): string[] {
  if (run.isDaily) return startingCardIdsForChoiceCount(DEFAULT_STARTING_CARD_CHOICES);
  return startingCardIdsForChoiceCount(run.startingCardChoices);
}
