export const STARTING_CARD_IDS = ['slash', 'guard', 'quick_jab', 'minor_heal'] as const;

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
