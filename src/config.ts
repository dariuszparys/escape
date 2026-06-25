// Logical pixel-art unit is 16px, displayed at 3x.
export const TILE = 48;
export const ROOM_COLS = 15;
export const ROOM_ROWS = 11;
export const ROOM_W = ROOM_COLS * TILE; // 720
export const ROOM_H = ROOM_ROWS * TILE; // 528
export const HUD_H = 112;
export const GAME_W = ROOM_W;
export const GAME_H = ROOM_H + HUD_H; // 640

export const MAX_DEPTH = 10;
export const MAX_HAND = 5;
export const MAX_INVENTORY = 3;
export const PLAYER_MAX_HP = 30;
export const POTION_HEAL = 8;
export const TRAP_DAMAGE = 4;
export const PUNCH_DAMAGE = 2; // innate attack, always available in battle
export const MAX_ARMOR = 3;

export const PLAYER_SPEED = 210;

export type Dir = 'N' | 'E' | 'S' | 'W';
export const DIRS: Dir[] = ['N', 'E', 'S', 'W'];
export const OPPOSITE: Record<Dir, Dir> = { N: 'S', S: 'N', E: 'W', W: 'E' };
export const DIR_VEC: Record<Dir, { x: number; y: number }> = {
  N: { x: 0, y: -1 },
  S: { x: 0, y: 1 },
  E: { x: 1, y: 0 },
  W: { x: -1, y: 0 },
};
