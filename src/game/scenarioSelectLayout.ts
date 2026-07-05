export interface RectLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ScenarioSelectLayout {
  titleY: number;
  subtitleY: number;
  list: RectLayout;
  preview: RectLayout;
  rowH: number;
  confirmButton: { x: number; y: number };
  backButton: { x: number; y: number };
}

export function createScenarioSelectLayout(optionCount: number): ScenarioSelectLayout {
  const rowH = 74;
  const list: RectLayout = {
    x: 54,
    y: 142,
    w: 260,
    h: optionCount * rowH,
  };
  const preview: RectLayout = {
    x: 340,
    y: 142,
    w: 326,
    h: 318,
  };

  return {
    titleY: 50,
    subtitleY: 86,
    list,
    preview,
    rowH,
    confirmButton: { x: preview.x + preview.w / 2, y: 520 },
    backButton: { x: 96, y: 520 },
  };
}

export function rectsOverlap(a: RectLayout, b: RectLayout): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
