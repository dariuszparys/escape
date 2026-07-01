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

export interface BattlePlanningBoardRegions {
  prediction: BattleRect;
  timeline: BattleRect;
  matchupHint: BattleRect;
  statusLanes: BattleRect;
  actualLine: BattleRect;
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
    planningBoard: { x: 452, y: 112, w: 244, h: 200 },
    prompt: { x: GAME_W / 2 - 190, y: 340, w: 380, h: 34 },
    punchButton: { x: 550, y: 316, w: 130, h: 58 },
    itemButtons: { x: 510, y: 388, w: 190, h: 138 },
    handArea: { x: 40, y: GAME_H - BATTLE_CARD_H - 54, w: GAME_W - 80, h: BATTLE_CARD_H + 40 },
  };
}

export function getBattlePlanningBoardRegions(rect: BattleRect): BattlePlanningBoardRegions {
  return {
    prediction: { x: 12, y: 32, w: rect.w - 24, h: 34 },
    timeline: { x: 12, y: 70, w: rect.w - 24, h: 27 },
    matchupHint: { x: 12, y: 100, w: rect.w - 24, h: 24 },
    statusLanes: { x: 12, y: 132, w: rect.w - 24, h: 52 },
    actualLine: { x: 12, y: rect.h - 14, w: rect.w - 24, h: 10 },
  };
}
