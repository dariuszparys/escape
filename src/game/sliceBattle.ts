import { PLAYER_MAX_HP } from '../config';
import { Card, CARD_DEFS, CardDef, makeCard } from '../data/cards';
import { SLICE_ENEMIES, SliceEnemyDef } from '../data/enemies';
import { InventoryItem, makeItem } from '../data/items';

/**
 * The slice playground's fixed content (R13/R24). Everything here is private to
 * the sandbox: the deck is built fresh per battle, slice-only defs never join
 * `CARD_DEFS` (so no reward pool can roll them), and no run
 * state is read or written.
 */

/** Slice-only cantrips exercising the draw/energy effect kinds end to end. */
const SCAVENGE: CardDef = {
  id: 'slice_scavenge',
  name: 'Scavenge',
  type: 'utility',
  tier: 1,
  cost: 0,
  color: 0x16a085,
  description: 'Draw 2 cards',
  effects: [{ kind: 'draw', amount: 2 }],
};

const ADRENALINE: CardDef = {
  id: 'slice_adrenaline',
  name: 'Adrenaline',
  type: 'utility',
  tier: 1,
  cost: 1,
  color: 0xe74c3c,
  description: '+2 energy, draw 1',
  effects: [
    { kind: 'energy', amount: 2 },
    { kind: 'draw', amount: 1 },
  ],
};

function fromDef(id: string): Card {
  const def = CARD_DEFS.find((candidate) => candidate.id === id);
  if (!def) throw new Error(`Unknown card def: ${id}`);
  return makeCard(def);
}

/**
 * Fixed 10-card test deck covering every effect kind: damage, block, heal,
 * status (poison, stun; burn arrives from the enemy side), draw, and energy.
 * Costs come from the re-authored defs (U8).
 */
export function buildSliceDeck(): Card[] {
  return [
    fromDef('strike'),
    fromDef('strike'),
    fromDef('guard'),
    fromDef('guard'),
    fromDef('minor_heal'),
    fromDef('poison_dagger'),
    fromDef('heavy_strike'),
    fromDef('stunning_blow'),
    makeCard(SCAVENGE),
    makeCard(ADRENALINE),
  ];
}

/** All four item kinds, so free actions (R16) are fully exercisable in the slice. */
export function buildSliceItems(): InventoryItem[] {
  return [
    makeItem('small_potion'),
    makeItem('iron_armor'),
    makeItem('smoke_bomb'),
    makeItem('bomb'),
  ];
}

export function sliceEnemy(enemyId?: string): SliceEnemyDef {
  return SLICE_ENEMIES.find((enemy) => enemy.id === enemyId) ?? SLICE_ENEMIES[0];
}

/** Cycle to the next scripted enemy — the end panel's "Other enemy" button. */
export function nextSliceEnemy(currentId: string): SliceEnemyDef {
  const index = SLICE_ENEMIES.findIndex((enemy) => enemy.id === currentId);
  return SLICE_ENEMIES[(index + 1) % SLICE_ENEMIES.length];
}

export function slicePlayer(): { name: string; hp: number; maxHp: number; armor: number } {
  return { name: 'You', hp: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP, armor: 0 };
}
