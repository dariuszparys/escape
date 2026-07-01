import { Card, CardEffect, cardEffectAmount } from '../data/cards';
import { EnemyCombatArchetype, EnemyCombatPreference, EnemyInstance } from '../data/enemies';
import { CombatAction, combatActionSpeed } from './combat';
import { type ActionFamily, familyForEffects, intentTitleForFamily } from './familyMatchup';
import { GameRng } from './rng';

export type EnemyIntentFamily = ActionFamily;
export type EnemyIntentRevealMode = 'summary' | 'exact';
export type EnemyIntentSource = 'script' | 'fallback' | 'boss_special';

export interface EnemyIntentSummary {
  family: EnemyIntentFamily;
  title: string;
  speed: number;
  consequence: string;
  revealMode: EnemyIntentRevealMode;
  cardName?: string;
  telegraph?: string;
}

export interface EnemyIntentPlan {
  action: CombatAction;
  card: Card | null;
  usedCardUids: Set<number>;
  summary: EnemyIntentSummary;
  source: EnemyIntentSource;
  archetype?: EnemyCombatArchetype;
}

export interface PlanEnemyIntentInput {
  enemy: EnemyInstance;
  round: number;
  usedCardUids: ReadonlySet<number>;
  rng: GameRng;
  lowHealth?: boolean;
  revealMode?: EnemyIntentRevealMode;
}

function effectText(effect: CardEffect): string {
  if (effect.kind === 'damage') return `deals ${effect.amount} damage`;
  if (effect.kind === 'block') return `gains ${effect.amount} block`;
  if (effect.kind === 'heal') return `heals ${effect.amount} HP`;
  return `applies ${effect.status} ${effect.amount} for ${effect.duration} round${
    effect.duration === 1 ? '' : 's'
  }`;
}

function summarizeEffects(effects: readonly CardEffect[]): string {
  if (effects.length === 0) return 'No direct effect';
  const [first, ...rest] = effects.map(effectText);
  const text = rest.length === 0 ? first : `${first} and ${rest.join(', ')}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function summarizeCard(card: Card, revealMode: EnemyIntentRevealMode): EnemyIntentSummary {
  const family = familyForEffects(card.effects);
  return {
    family,
    title: intentTitleForFamily(family),
    speed: card.speed,
    consequence: summarizeEffects(card.effects),
    revealMode,
    ...(revealMode === 'exact' ? { cardName: card.name } : {}),
  };
}

function cardMatchesPreference(card: Card, preference: EnemyCombatPreference): boolean {
  if (preference === 'fast_damage') return cardEffectAmount(card, 'damage') > 0 && card.speed >= 6;
  if (preference === 'damage') return cardEffectAmount(card, 'damage') > 0;
  if (preference === 'block_damage')
    return cardEffectAmount(card, 'block') > 0 && cardEffectAmount(card, 'damage') > 0;
  if (preference === 'status') return card.effects.some((effect) => effect.kind === 'status');
  if (preference === 'block') return cardEffectAmount(card, 'block') > 0;
  return cardEffectAmount(card, 'heal') > 0;
}

function availableCards(cards: readonly Card[], usedCardUids: ReadonlySet<number>) {
  const keptUsed = new Set(usedCardUids);
  const unused = cards.filter((card) => !keptUsed.has(card.uid));
  if (unused.length > 0) return { pool: unused, usedBeforePick: keptUsed };
  return { pool: [...cards], usedBeforePick: new Set<number>() };
}

function usedAfterPick(cards: readonly Card[], usedBeforePick: ReadonlySet<number>, card: Card) {
  const next = new Set(usedBeforePick);
  next.add(card.uid);
  return cards.every((candidate) => next.has(candidate.uid)) ? new Set<number>() : next;
}

function pickFromPreference(
  pool: readonly Card[],
  preferences: readonly EnemyCombatPreference[],
  rng: GameRng,
): Card | null {
  if (preferences.length === 0) return null;

  const ordered = [...preferences];
  const firstPreference =
    ordered.length === 1 ? ordered[0] : ordered[Math.floor(rng.frac() * ordered.length)];

  for (const preference of [
    firstPreference,
    ...ordered.filter((entry) => entry !== firstPreference),
  ]) {
    const matches = pool.filter((card) => cardMatchesPreference(card, preference));
    if (matches.length > 0) return rng.pick(matches);
  }

  return null;
}

function fallbackWeight(card: Card, lowHealth: boolean): number {
  let weight = 3;
  if (cardEffectAmount(card, 'block') > 0) weight = 1.5;
  if (cardEffectAmount(card, 'heal') > 0) weight = lowHealth ? 6 : 0.8;
  if (card.effects.some((effect) => effect.kind === 'status')) weight = 4;
  return weight;
}

function pickFallbackCard(pool: readonly Card[], lowHealth: boolean, rng: GameRng): Card {
  const weighted = pool.map((card) => ({ card, weight: fallbackWeight(card, lowHealth) }));
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng.frac() * total;
  for (const entry of weighted) {
    if ((roll -= entry.weight) < 0) return entry.card;
  }
  return weighted[weighted.length - 1].card;
}

function makeCardPlan(
  enemy: EnemyInstance,
  card: Card,
  usedBeforePick: ReadonlySet<number>,
  source: EnemyIntentSource,
  revealMode: EnemyIntentRevealMode,
): EnemyIntentPlan {
  return {
    action: { actor: 'enemy', kind: 'card', card },
    card,
    usedCardUids: usedAfterPick(enemy.cards, usedBeforePick, card),
    summary: summarizeCard(card, revealMode),
    source,
    ...(enemy.def.combatScript ? { archetype: enemy.def.combatScript.archetype } : {}),
  };
}

export function planEnemyIntent(input: PlanEnemyIntentInput): EnemyIntentPlan {
  const revealMode = input.revealMode ?? 'summary';
  const special = input.enemy.def.special;
  if (special && input.round % special.interval === 0) {
    const action: CombatAction = {
      actor: 'enemy',
      kind: 'special',
      name: special.name,
      speed: special.speed,
      effects: special.effects,
    };
    return {
      action,
      card: null,
      usedCardUids: new Set(input.usedCardUids),
      summary: {
        family: 'special',
        title: special.name,
        speed: combatActionSpeed(action),
        consequence: summarizeEffects(special.effects),
        revealMode: 'exact',
        telegraph: special.telegraph,
      },
      source: 'boss_special',
    };
  }

  const { pool, usedBeforePick } = availableCards(input.enemy.cards, input.usedCardUids);
  if (pool.length === 0) {
    return {
      action: { actor: 'enemy', kind: 'none' },
      card: null,
      usedCardUids: new Set(input.usedCardUids),
      summary: {
        family: 'mixed',
        title: 'No action',
        speed: 0,
        consequence: 'No direct effect',
        revealMode,
      },
      source: 'fallback',
    };
  }

  const lowHealth = input.lowHealth ?? input.enemy.hp / input.enemy.maxHp < 0.35;
  const script = input.enemy.def.combatScript;
  if (script) {
    const roundIndex = Math.max(0, input.round - 1) % script.pattern.length;
    const preferences: EnemyCombatPreference[] = lowHealth
      ? ['heal', ...script.pattern[roundIndex]]
      : [...script.pattern[roundIndex]];
    const scripted = pickFromPreference(pool, preferences, input.rng);
    if (scripted) return makeCardPlan(input.enemy, scripted, usedBeforePick, 'script', revealMode);
  }

  return makeCardPlan(
    input.enemy,
    pickFallbackCard(pool, lowHealth, input.rng),
    usedBeforePick,
    'fallback',
    revealMode,
  );
}
