import { describe, expect, test } from 'vitest';
import type { CardDef, CardEffect, StatusEffectType } from './cards';
import { cardRulesLines, KEYWORD_GLOSSARY, type KeywordKey } from './keywords';

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
