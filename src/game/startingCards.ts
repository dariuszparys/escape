import type { ArchetypeId } from '../data/cards';

export const STARTING_CARD_IDS = ['slash', 'guard', 'quick_jab', 'minor_heal'] as const;

/**
 * The opening card choices offered per archetype (U-archetypes). When an archetype is active
 * these fully replace the neutral `STARTING_CARD_IDS` picks, so the run's very first choice is
 * already archetypal. Each pool has four entries so the Starter Variety unlock (fourth option)
 * still has something to reveal; the order front-loads the class's most identity-defining cards
 * because the default (locked-variety) run only shows the first three.
 *
 * Defense is intentionally left to the shared pad (2 Strike, 2 Guard) below rather than baked
 * into every pool, so these picks can stay purely thematic while the deck keeps a functional body.
 */
export const ARCHETYPE_STARTING_CARD_IDS: Record<ArchetypeId, readonly string[]> = {
  barbarian: ['cleave', 'warpath', 'frenzy', 'rampage'],
  necromancer: ['wither', 'blight', 'siphon_life', 'ossify'],
  ranger: ['quickshot', 'mark_prey', 'volley', 'evasion'],
};

/**
 * R15: the deck model needs a body. Every run opens with these basics so the
 * starting collection sits near the draw size (5) before picks and kit
 * signatures — a 2-card deck would reshuffle mid-turn forever. Composition is
 * a playtest question; the pad's existence is structural. Neutral across all
 * archetypes so it also guarantees baseline block/reliable damage.
 */
export const STARTING_DECK_PAD_IDS = ['strike', 'strike', 'guard', 'guard'] as const;

export const DEFAULT_STARTING_CARD_CHOICES = 3;
export const DEFAULT_STARTING_CARD_PICKS = 2;
export const BONUS_STARTING_CARD_CHOICES = 4;
export const BONUS_STARTING_CARD_PICKS = 3;

interface StartingCardRun {
  startingCardChoices: number;
  archetypeId?: ArchetypeId | null;
  isDaily: boolean;
}

/** The full ordered pick pool a run draws its opening choices from, before the choice-count slice. */
function startingCardPool(archetypeId: ArchetypeId | null): readonly string[] {
  return archetypeId ? ARCHETYPE_STARTING_CARD_IDS[archetypeId] : STARTING_CARD_IDS;
}

export function startingCardIdsForChoiceCount(
  choiceCount: number,
  archetypeId: ArchetypeId | null = null,
): string[] {
  const pool = startingCardPool(archetypeId);
  const normalizedChoiceCount = Number.isFinite(choiceCount)
    ? Math.floor(choiceCount)
    : DEFAULT_STARTING_CARD_CHOICES;
  const count = Math.max(
    DEFAULT_STARTING_CARD_CHOICES,
    Math.min(pool.length, normalizedChoiceCount),
  );
  return pool.slice(0, count);
}

export function startingCardIdsForRun(run: StartingCardRun): string[] {
  // Daily Descents ignore archetype selection (and Ember progression) so attempts stay comparable.
  const archetypeId = run.isDaily ? null : (run.archetypeId ?? null);
  if (run.isDaily) return startingCardIdsForChoiceCount(DEFAULT_STARTING_CARD_CHOICES, archetypeId);
  return startingCardIdsForChoiceCount(run.startingCardChoices, archetypeId);
}
