import { GAME_H, GAME_W } from '../config';
import type { ArchetypeId } from '../data/cards';

export interface RectLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type CampfireBeat = 'class' | 'depart';

export interface CampfireClassLayout {
  titleY: number;
  cards: RectLayout[];
  description: RectLayout;
  continueButton: RectLayout;
}

export interface CampfireDepartLayout {
  titleY: number;
  statusY: number;
  chronicleY: number;
  classChip: RectLayout;
  changeClassButton: RectLayout;
  goal: RectLayout;
  primaryMode: RectLayout;
  secondaryMode: RectLayout;
  loadoutButton: { x: number; y: number };
}

const PAD = 36;
const CARD_GAP = 12;
const TITLE_Y = 52;
const CARD_Y = 120;
const CARD_H = 244;
const DESCRIPTION_GAP = 20;
const DESCRIPTION_H = 68;
const CONTINUE_W = 220;
const CONTINUE_H = 48;
const CONTINUE_Y = 492;
const CTA_FONT_SIZE = 18;

const DEPART_TITLE_Y = 50;
const STATUS_Y = 90;
const CHRONICLE_Y = 114;
const CHIP_Y = 148;
const CHIP_H = 52;
const GOAL_Y = 216;
const GOAL_H = 44;
const MODE_Y = 276;
const MODE_H = 170;
const MODE_GAP = 24;
const LOADOUT_Y = 520;

export function initialCampfireBeat(
  classConfirmedThisSession: boolean,
  activeArchetypeId: ArchetypeId | null,
): CampfireBeat {
  return classConfirmedThisSession || activeArchetypeId !== null ? 'depart' : 'class';
}

export function createCampfireClassLayout(optionCount: number): CampfireClassLayout {
  const cardW = Math.floor((GAME_W - PAD * 2 - CARD_GAP * (optionCount - 1)) / optionCount);
  const cards: RectLayout[] = [];
  for (let index = 0; index < optionCount; index += 1) {
    cards.push({
      x: PAD + index * (cardW + CARD_GAP),
      y: CARD_Y,
      w: cardW,
      h: CARD_H,
    });
  }

  const description: RectLayout = {
    x: PAD,
    y: CARD_Y + CARD_H + DESCRIPTION_GAP,
    w: GAME_W - PAD * 2,
    h: DESCRIPTION_H,
  };

  return {
    titleY: TITLE_Y,
    cards,
    description,
    continueButton: {
      x: Math.floor((GAME_W - CONTINUE_W) / 2),
      y: CONTINUE_Y,
      w: CONTINUE_W,
      h: CONTINUE_H,
    },
  };
}

export function createCampfireDepartLayout(): CampfireDepartLayout {
  const modeW = Math.floor((GAME_W - PAD * 2 - MODE_GAP) / 2);
  const classChip: RectLayout = {
    x: PAD,
    y: CHIP_Y,
    w: GAME_W - PAD * 2,
    h: CHIP_H,
  };

  return {
    titleY: DEPART_TITLE_Y,
    statusY: STATUS_Y,
    chronicleY: CHRONICLE_Y,
    classChip,
    changeClassButton: {
      x: classChip.x + classChip.w - 160,
      y: classChip.y + 8,
      w: 148,
      h: classChip.h - 16,
    },
    goal: {
      x: PAD,
      y: GOAL_Y,
      w: GAME_W - PAD * 2,
      h: GOAL_H,
    },
    primaryMode: {
      x: PAD,
      y: MODE_Y,
      w: modeW,
      h: MODE_H,
    },
    secondaryMode: {
      x: PAD + modeW + MODE_GAP,
      y: MODE_Y,
      w: modeW,
      h: MODE_H,
    },
    loadoutButton: { x: GAME_W / 2, y: LOADOUT_Y },
  };
}

export function rectsOverlap(a: RectLayout, b: RectLayout): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function continueTop(layout: CampfireClassLayout): number {
  return layout.continueButton.y;
}

export function descriptionBottom(layout: CampfireClassLayout): number {
  return layout.description.y + layout.description.h;
}

export function loadoutTop(layout: CampfireDepartLayout): number {
  return layout.loadoutButton.y - CTA_FONT_SIZE / 2;
}

export function modesBottom(layout: CampfireDepartLayout): number {
  return layout.primaryMode.y + layout.primaryMode.h;
}

export function layoutFitsCanvas(rect: RectLayout): boolean {
  return rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= GAME_W && rect.y + rect.h <= GAME_H;
}
