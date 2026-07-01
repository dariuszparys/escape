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
/** Rooms per stratum. The boss fires at every multiple of this depth (10, 20, 30, ...). */
export const STRATUM_SIZE = 10;
export const MAX_HAND = 5;
export const MAX_INVENTORY = 3;
export const PLAYER_MAX_HP = 34;
export const POTION_HEAL = 8;
export const TRAP_DAMAGE = 3;
export const VISION_RADIUS = 36; // trap-room field-of-view halo around the player
export const PUNCH_DAMAGE = 3; // innate attack, always available in battle
export const MATCHUP_BONUS_DAMAGE = 3; // player-only reward for correctly countering intent
export const MAX_ARMOR = 3;

export const PLAYER_SPEED = 210;
export const ROOM_THREAT_CONTACT_RADIUS = 34;
export const ROOM_THREAT_SAFE_RADIUS = TILE * 2.35;
export const ROOM_THREAT_MIN_X = TILE * 2;
export const ROOM_THREAT_MAX_X = ROOM_W - TILE * 2;
export const ROOM_THREAT_MIN_Y = TILE * 2;
export const ROOM_THREAT_MAX_Y = ROOM_H - TILE * 2;

export type Dir = 'N' | 'E' | 'S' | 'W';
export const DIRS: Dir[] = ['N', 'E', 'S', 'W'];
export const OPPOSITE: Record<Dir, Dir> = { N: 'S', S: 'N', E: 'W', W: 'E' };
export const DIR_VEC: Record<Dir, { x: number; y: number }> = {
  N: { x: 0, y: -1 },
  S: { x: 0, y: 1 },
  E: { x: 1, y: 0 },
  W: { x: -1, y: 0 },
};
