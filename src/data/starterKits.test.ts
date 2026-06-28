import { describe, expect, test } from 'vitest';
import { CARD_DEFS, type CardDef } from './cards';
import { STARTER_KITS, starterKitDef } from './starterKits';

function cardDef(id: string): CardDef {
  const card = CARD_DEFS.find((candidate) => candidate.id === id);
  if (!card) throw new Error(`Missing card def ${id}`);
  return card;
}

describe('starter kits', () => {
  test('defines the first three starter kits with stable ids and costs', () => {
    expect(STARTER_KITS.map((kit) => kit.id)).toEqual(['duelist', 'warden', 'hexbinder']);
    expect(new Set(STARTER_KITS.map((kit) => kit.id)).size).toBe(STARTER_KITS.length);

    for (const kit of STARTER_KITS) {
      expect(kit.cost).toBe(6);
      expect(kit.archetype.length).toBeGreaterThan(0);
      expect(kit.description.length).toBeGreaterThan(0);
    }
  });

  test('references existing signature card ids', () => {
    const cardIds = new Set(CARD_DEFS.map((card) => card.id));

    expect(STARTER_KITS.map((kit) => kit.signatureCardId)).toEqual([
      'riposte',
      'field_dressing',
      'cinder_hex',
    ]);
    expect(STARTER_KITS.every((kit) => cardIds.has(kit.signatureCardId))).toBe(true);
  });

  test('defines horizontal tier-one signature cards', () => {
    expect(cardDef('riposte')).toMatchObject({
      name: 'Riposte',
      type: 'utility',
      tier: 1,
      starterKitOnly: true,
      effects: [
        { kind: 'damage', amount: 5 },
        { kind: 'block', amount: 2 },
      ],
    });
    expect(cardDef('field_dressing')).toMatchObject({
      name: 'Field Dressing',
      type: 'heal',
      tier: 1,
      starterKitOnly: true,
      effects: [
        { kind: 'block', amount: 5 },
        { kind: 'heal', amount: 2 },
      ],
    });
    expect(cardDef('cinder_hex')).toMatchObject({
      name: 'Cinder Hex',
      type: 'status',
      tier: 1,
      starterKitOnly: true,
      effects: [
        { kind: 'damage', amount: 2 },
        { kind: 'status', status: 'burn', amount: 2, duration: 2 },
      ],
    });
  });

  test('does not encode raw permanent stat upgrades in signature cards', () => {
    for (const kit of STARTER_KITS) {
      const card = cardDef(kit.signatureCardId);
      expect(
        card.effects.every((effect) => ['damage', 'block', 'heal', 'status'].includes(effect.kind)),
      ).toBe(true);
    }
  });

  test('throws a useful error for unknown kit ids', () => {
    expect(() => starterKitDef('unknown-kit')).toThrow('Unknown starter kit: unknown-kit');
  });
});
