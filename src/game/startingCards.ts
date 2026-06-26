export const STARTING_CARD_IDS = ['slash', 'guard', 'quick_jab'] as const;

export function startingCardIdsForChoiceCount(choiceCount: number): string[] {
  const normalizedChoiceCount = Number.isFinite(choiceCount) ? Math.floor(choiceCount) : 2;
  const count = Math.max(2, Math.min(STARTING_CARD_IDS.length, normalizedChoiceCount));
  return STARTING_CARD_IDS.slice(0, count);
}
