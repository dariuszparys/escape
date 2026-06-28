export interface TitleLayout {
  titleY: number;
  subtitleY: number;
  heroY: number;
  objectiveY: number;
  sectionHeadingY: number;
  sectionTextY: number;
  instructionsBottom: number;
  promptY: number;
  promptTop: number;
}

const SECTION_LINE_COUNT = 3;
const SECTION_FONT_SIZE = 13;
const SECTION_LINE_SPACING = 5;
const PROMPT_FONT_SIZE = 18;

export function createTitleLayout(): TitleLayout {
  const sectionTextY = 430;
  const sectionTextHeight =
    SECTION_LINE_COUNT * SECTION_FONT_SIZE + (SECTION_LINE_COUNT - 1) * SECTION_LINE_SPACING;
  const promptY = 582;

  return {
    titleY: 122,
    subtitleY: 188,
    heroY: 284,
    objectiveY: 370,
    sectionHeadingY: 400,
    sectionTextY,
    instructionsBottom: sectionTextY + sectionTextHeight,
    promptY,
    promptTop: promptY - PROMPT_FONT_SIZE / 2,
  };
}
