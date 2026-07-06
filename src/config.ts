// Logical pixel-art unit is 16px, displayed at 3x.
export const TILE = 48;
export const ROOM_COLS = 15;
export const ROOM_ROWS = 11;
export const ROOM_W = ROOM_COLS * TILE; // 720
export const ROOM_H = ROOM_ROWS * TILE; // 528
export const HUD_H = 112;
export const GAME_W = ROOM_W;
export const GAME_H = ROOM_H + HUD_H; // 640

/** First-decade curve anchor: enemy/card/boss scaling holds a linear baseline through this depth,
 * then escalates past it. Numerically the first boss interval, kept as its own name so difficulty
 * tuning (U7) can move independently of the run's boss cadence. */
export const MAX_DEPTH = 10;
/** Total rooms in a run. Defeating the boss in the final room is the only victory (R1). */
export const RUN_LENGTH = 100;
/** A boss guards every room at a multiple of this interval (10, 20, ..., 100) (R3). */
export const BOSS_ROOM_INTERVAL = 10;
export const MAX_INVENTORY = 3;
export const PLAYER_MAX_HP = 34;
export const POTION_HEAL = 8;
export const TRAP_DAMAGE = 3;
export const VISION_RADIUS = 36; // trap-room field-of-view halo around the player
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
