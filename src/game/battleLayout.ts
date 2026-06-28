import { GAME_H, GAME_W } from '../config';

const BATTLE_CARD_H = 140;

export interface BattleRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BattleLayout {
  historyPanel: BattleRect;
  planningBoard: BattleRect;
  prompt: BattleRect;
  punchButton: BattleRect;
  itemButtons: BattleRect;
  handArea: BattleRect;
}

export function rectsOverlap(left: BattleRect, right: BattleRect): boolean {
  return (
    left.x < right.x + right.w &&
    left.x + left.w > right.x &&
    left.y < right.y + right.h &&
    left.y + left.h > right.y
  );
}

export function getBattleLayout(): BattleLayout {
  return {
    historyPanel: { x: 24, y: 112, w: 250, h: 220 },
    planningBoard: { x: 452, y: 112, w: 244, h: 190 },
    prompt: { x: GAME_W / 2 - 190, y: 340, w: 380, h: 34 },
    punchButton: { x: 550, y: 316, w: 130, h: 58 },
    itemButtons: { x: 510, y: 388, w: 190, h: 138 },
    handArea: { x: 40, y: GAME_H - BATTLE_CARD_H - 54, w: GAME_W - 80, h: BATTLE_CARD_H + 40 },
  };
}
