import type { Card, CardDef, CardEffect, StatusEffectType } from './cards';

/**
 * The canonical keyword -> explanation glossary (U11 / KTD7). This is the first
 * home for player-facing status-effect copy anywhere in the codebase — every
 * other module only ever APPLIES `poison`/`burn`/`stun`, never explains them.
 *
 * Every entry is written against the engine mechanics actually implemented in
 * `turnEngine.ts` / `effectHandlers.ts`, not idealized/genre-convention behavior:
 * - `block` expires at the OWNER's next turn start (`startPlayerTurn` / `enemyBeat`
 *   both zero it out), it does not persist or carry over.
 * - `damage` is reduced by armor (permanent, never consumed) and then depletes
 *   the target's block pool by up to the raw damage amount before any of it
 *   reaches HP.
 * - `poison` / `burn` tick for their FULL listed amount (it does not decay) at
 *   the afflicted combatant's own turn start, direct to HP — block never
 *   absorbs a tick — then their duration counts down by one.
 * - `stun` is consumed the instant it matters: on the player it is cleared and
 *   converted into `playerStunned` at the start of the player's next turn
 *   (skipping that turn's card plays only — items stay legal); on the enemy it
 *   is consumed immediately on landing, voiding whatever move was telegraphed.
 */
export type KeywordKey = CardEffect['kind'] | 'exhaust' | StatusEffectType;

export const KEYWORD_GLOSSARY: Record<KeywordKey, string> = {
  damage:
    'Deals damage to the target, reduced by their armor and then by any block remaining in their pool.',
  block:
    "Gains Block, a shield that absorbs damage until the start of the block-holder's next turn.",
  heal: "Restores HP, up to the healer's maximum.",
  status: 'Applies a status effect to the target for a number of turns.',
  draw: 'Draws cards from the Draw Pile into hand, reshuffling the Discard Pile in if the Draw Pile runs out.',
  energy: 'Grants extra Energy to spend during the current turn.',
  shuffleCurse:
    "Shuffles a dead Curse card into the target's Draw Pile for this battle — it costs a future play and does nothing. A Leaden Curse costs two. Curses are gone by the next battle, and the thinner the deck the more often one is drawn.",
  exhaust: 'Leaves play for the rest of this battle instead of returning to the Discard Pile.',
  poison:
    "Deals its listed damage directly to HP (ignoring block) at the afflicted's own turn start, then its duration ticks down by one turn.",
  burn: "Deals its listed damage directly to HP (ignoring block) at the afflicted's own turn start, then its duration ticks down by one turn.",
  stun: "Skips the afflicted's next turn of card plays; against an enemy it instead voids their telegraphed move immediately. Consumed the moment it takes effect.",
  vulnerable: 'While Vulnerable, the afflicted takes 50% more damage from every hit.',
  weak: 'While Weak, the afflicted deals 25% less damage with every attack.',
  frail: 'While Frail, the afflicted gains 25% less Block from cards.',
  strength:
    'Raises the attacker’s damage by its amount on every hit for the rest of the battle (permanent, stacks, capped).',
};

function pluralize(amount: number, noun: string): string {
  return `${noun}${amount === 1 ? '' : 's'}`;
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function statusLine(status: StatusEffectType, amount: number, duration: number): string {
  if (status === 'stun') {
    return `Apply Stun, skipping the target's next turn of card plays.`;
  }
  // vulnerable/weak/frail are flag debuffs — their amount is unused, only the duration matters.
  if (status === 'vulnerable' || status === 'weak' || status === 'frail') {
    return `Apply ${capitalize(status)} for ${duration} ${pluralize(duration, 'turn')}.`;
  }
  return `Apply ${amount} ${capitalize(status)} for ${duration} ${pluralize(duration, 'turn')}.`;
}

/** One natural-language rules line per effect, describing what the card actually does. */
function effectLine(effect: CardEffect): string {
  switch (effect.kind) {
    case 'damage':
      return `Deal ${effect.amount} damage.`;
    case 'block':
      return `Gain ${effect.amount} block.`;
    case 'heal':
      return `Restore ${effect.amount} HP.`;
    case 'draw':
      return `Draw ${effect.amount} ${pluralize(effect.amount, 'card')}.`;
    case 'energy':
      return `Gain ${effect.amount} energy.`;
    case 'strength':
      return `Gain ${effect.amount} Strength.`;
    case 'shuffleCurse':
      return `Shuffle ${effect.amount} ${effect.curse === 'leaden' ? 'Leaden ' : ''}${pluralize(effect.amount, 'curse')} into the target's draw pile.`;
    case 'status':
      return statusLine(effect.status, effect.amount, effect.duration);
    default: {
      // Exhaustiveness guard: every CardEffect kind above must be handled.
      const _never: never = effect;
      return String(_never);
    }
  }
}

/** Terse phrase for one effect, in the clipped voice authored descriptions use. */
function effectPhrase(effect: CardEffect): string {
  switch (effect.kind) {
    case 'damage':
      return `Deal ${effect.amount}`;
    case 'block':
      return `Gain ${effect.amount} block`;
    case 'heal':
      return `Restore ${effect.amount} HP`;
    case 'draw':
      return `Draw ${effect.amount}`;
    case 'energy':
      return `+${effect.amount} energy`;
    case 'strength':
      return `+${effect.amount} Strength`;
    case 'shuffleCurse':
      return `Curse ${effect.amount}`;
    case 'status':
      if (effect.status === 'stun') return 'Stun';
      if (effect.status === 'vulnerable' || effect.status === 'weak' || effect.status === 'frail') {
        return `${capitalize(effect.status)} ${effect.duration}`;
      }
      return `${capitalize(effect.status)} ${effect.amount} for ${effect.duration}`;
    default: {
      const _never: never = effect;
      return String(_never);
    }
  }
}

/**
 * The blurb to print on a card's face.
 *
 * Authored `description` text is canonical while a card is unmodified — it is hand-tuned to
 * fit the face and to read better than any generated string. But `upgradeCard` changes
 * `effects` without touching `description`, so an upgraded card used to display its ORIGINAL
 * numbers: the face lied about what the card did. Once a card has been upgraded the face is
 * derived from the effects instead, which cannot drift.
 */
export function cardFaceText(card: Pick<Card, 'description' | 'effects' | 'upgrades'>): string {
  if (!card.upgrades) return card.description;
  return card.effects.map(effectPhrase).join(', ');
}

/**
 * A card's full rules text, one line per effect IN ARRAY ORDER (play order — the
 * order effects would actually resolve), plus a trailing Exhaust line when the
 * card carries that flag.
 */
export function cardRulesLines(card: Pick<CardDef, 'effects' | 'exhaust'>): string[] {
  const lines = card.effects.map(effectLine);
  if (card.exhaust) {
    lines.push(`Exhaust — ${KEYWORD_GLOSSARY.exhaust}`);
  }
  return lines;
}
