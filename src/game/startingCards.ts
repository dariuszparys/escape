import { CARD_DEFS, type ArchetypeId } from '../data/cards';
import type { ScenarioId } from '../data/scenarios';
import { isScenarioAllowedCard } from './scenarioRules';

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
 * starting collection sits near the draw size (5) before picks — a 2-card deck
 * would reshuffle mid-turn forever. Composition is a playtest question; the
 * pad's existence is structural. Neutral across all archetypes so it also
 * guarantees baseline block/reliable damage unless a Scenario filters block.
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
  scenarioId?: ScenarioId | null;
}

/** The full ordered pick pool a run draws its opening choices from, before the choice-count slice. */
function startingCardPool(archetypeId: ArchetypeId | null): readonly string[] {
  return archetypeId ? ARCHETYPE_STARTING_CARD_IDS[archetypeId] : STARTING_CARD_IDS;
}

function cardDefById(id: string) {
  return CARD_DEFS.find((card) => card.id === id) ?? null;
}

function scenarioSafeCardIds(ids: readonly string[], scenarioId: ScenarioId | null): string[] {
  return ids.filter((id) => {
    const def = cardDefById(id);
    return def ? isScenarioAllowedCard(def, scenarioId) : false;
  });
}

function safeTierOneBackfillIds(scenarioId: ScenarioId | null): string[] {
  return CARD_DEFS.filter(
    (card) => card.tier === 1 && !card.archetype && isScenarioAllowedCard(card, scenarioId),
  ).map((card) => card.id);
}

function withScenarioBackfill(
  ids: readonly string[],
  desiredCount: number,
  scenarioId: ScenarioId | null,
): string[] {
  const result = scenarioSafeCardIds(ids, scenarioId);
  for (const id of safeTierOneBackfillIds(scenarioId)) {
    if (result.length >= desiredCount) break;
    if (!result.includes(id)) result.push(id);
  }
  return result.slice(0, desiredCount);
}

export function startingDeckPadIdsForScenario(scenarioId: ScenarioId | null): string[] {
  return withScenarioBackfill(STARTING_DECK_PAD_IDS, STARTING_DECK_PAD_IDS.length, scenarioId);
}

export function startingCardIdsForChoiceCount(
  choiceCount: number,
  archetypeId: ArchetypeId | null = null,
  scenarioId: ScenarioId | null = null,
): string[] {
  const pool = startingCardPool(archetypeId);
  const normalizedChoiceCount = Number.isFinite(choiceCount)
    ? Math.floor(choiceCount)
    : DEFAULT_STARTING_CARD_CHOICES;
  const count = Math.max(
    DEFAULT_STARTING_CARD_CHOICES,
    Math.min(pool.length, normalizedChoiceCount),
  );
  return withScenarioBackfill(pool, count, scenarioId);
}

export function startingCardIdsForRun(run: StartingCardRun): string[] {
  // Daily Descents ignore archetype selection so attempts stay comparable.
  const archetypeId = run.isDaily ? null : (run.archetypeId ?? null);
  const scenarioId = run.isDaily ? null : (run.scenarioId ?? null);
  if (run.isDaily) return startingCardIdsForChoiceCount(DEFAULT_STARTING_CARD_CHOICES, archetypeId);
  return startingCardIdsForChoiceCount(run.startingCardChoices, archetypeId, scenarioId);
}
