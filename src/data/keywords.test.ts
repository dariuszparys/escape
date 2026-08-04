import { describe, expect, test } from 'vitest';
import type { CardDef, CardEffect, StatusEffectType } from './cards';
import { makeCard } from './cards';
import { upgradeCard } from '../game/cardUpgrade';
import { cardFaceText, cardRulesLines, KEYWORD_GLOSSARY, type KeywordKey } from './keywords';

const CARD_EFFECT_KINDS: CardEffect['kind'][] = [
  'damage',
  'block',
  'heal',
  'status',
  'draw',
  'energy',
  'shuffleCurse',
];
const STATUS_TYPES: StatusEffectType[] = ['poison', 'burn', 'stun'];
const ALL_KEYWORD_KEYS: KeywordKey[] = [...CARD_EFFECT_KINDS, 'exhaust', ...STATUS_TYPES];

describe('KEYWORD_GLOSSARY', () => {
  test('has a non-empty entry for every CardEffect kind, the exhaust flag, and every status type', () => {
    for (const key of ALL_KEYWORD_KEYS) {
      expect(KEYWORD_GLOSSARY[key]).toBeTypeOf('string');
      expect(KEYWORD_GLOSSARY[key].trim().length).toBeGreaterThan(0);
    }
  });
});

describe('cardRulesLines', () => {
  test('lists multi-effect cards in effects array order (play order)', () => {
    const card: Pick<CardDef, 'effects' | 'exhaust'> = {
      effects: [
        { kind: 'draw', amount: 1 },
        { kind: 'block', amount: 2 },
      ],
    };

    const lines = cardRulesLines(card);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/draw/i);
    expect(lines[0]).toMatch(/1/);
    expect(lines[1]).toMatch(/block/i);
    expect(lines[1]).toMatch(/2/);
  });

  test('weaves amount, duration, and status name into a status effect line', () => {
    const card: Pick<CardDef, 'effects' | 'exhaust'> = {
      effects: [{ kind: 'status', status: 'poison', amount: 2, duration: 3 }],
    };

    const lines = cardRulesLines(card);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/2/);
    expect(lines[0]).toMatch(/poison/i);
    expect(lines[0]).toMatch(/3/);
  });

  test('appends a trailing exhaust line when the card carries the exhaust flag', () => {
    const card: Pick<CardDef, 'effects' | 'exhaust'> = {
      effects: [{ kind: 'draw', amount: 2 }],
      exhaust: true,
    };

    const lines = cardRulesLines(card);

    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/exhaust/i);
  });

  test('produces no exhaust line when the flag is absent', () => {
    const card: Pick<CardDef, 'effects' | 'exhaust'> = {
      effects: [{ kind: 'damage', amount: 5 }],
    };

    const lines = cardRulesLines(card);

    expect(lines).toHaveLength(1);
  });

  test('a real multi-effect CardDef (Cinder Hex-shaped) resolves in order', () => {
    const card: Pick<CardDef, 'effects' | 'exhaust'> = {
      effects: [
        { kind: 'damage', amount: 2 },
        { kind: 'status', status: 'burn', amount: 2, duration: 2 },
      ],
    };

    const lines = cardRulesLines(card);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/damage/i);
    expect(lines[1]).toMatch(/burn/i);
  });
});

describe('cardFaceText (upgraded cards must not display stale numbers)', () => {
  const base = () =>
    makeCard({
      id: 'sunder',
      name: 'Sunder',
      type: 'attack',
      tier: 3,
      cost: 2,
      color: 0,
      description: 'Deal 4, Vulnerable, then Deal 4',
      effects: [
        { kind: 'damage', amount: 4 },
        { kind: 'status', status: 'vulnerable', amount: 1, duration: 2 },
        { kind: 'damage', amount: 4 },
      ],
    });

  test('an unmodified card keeps its hand-authored blurb', () => {
    expect(cardFaceText(base())).toBe('Deal 4, Vulnerable, then Deal 4');
  });

  test('an upgraded card derives its face text from the live effects', () => {
    // upgradeCard rewrites effects but never description, so the face used to keep printing
    // the ORIGINAL numbers — the card lied about what it did.
    const card = upgradeCard(base());
    const text = cardFaceText(card);

    expect(text).not.toBe(card.description);
    expect(text).toContain('Deal 6');
    expect(text).not.toContain('Deal 4');
  });

  test('derived face text tracks every upgraded effect kind', () => {
    const card = upgradeCard(
      makeCard({
        id: 'field_dressing',
        name: 'Field Dressing',
        type: 'heal',
        tier: 1,
        cost: 1,
        color: 0,
        description: 'Gain 5 block, restore 2 HP',
        effects: [
          { kind: 'block', amount: 5 },
          { kind: 'heal', amount: 2 },
        ],
      }),
    );

    expect(cardFaceText(card)).toBe('Gain 8 block, Restore 5 HP');
  });
});
