import { makePixelTexture, mirror, Palette } from './pixel';

// ---------------------------------------------------------------- hero

const HERO_PAL: Palette = {
  H: '#8a5a2b', // hair
  F: '#f2c79b', // skin
  E: '#22202a', // eyes
  G: '#3aa655', // tunic
  D: '#23703a', // tunic shade
  L: '#d9b06b', // legs
  B: '#5d3a1e', // boots
};

const HERO_DOWN_0 = [
  '......HHHH......',
  '.....HHHHHH.....',
  '....HFFFFFFH....',
  '....FFEFFEFF....',
  '....FFFFFFFF....',
  '.....FFFFFF.....',
  '....GGGGGGGG....',
  '...GGGGGGGGGG...',
  '...GGGDGGDGGG...',
  '...FGGGGGGGGF...',
  '....GGGGGGGG....',
  '....GGGGGGGG....',
  '.....LL..LL.....',
  '.....LL..LL.....',
  '....BBB..BBB....',
];

const HERO_DOWN_1 = [
  ...HERO_DOWN_0.slice(0, 12),
  '.....LL..LL.....',
  '....LL....LL....',
  '...BBB....BBB...',
];

const HERO_UP_0 = [
  '......HHHH......',
  '.....HHHHHH.....',
  '....HHHHHHHH....',
  '....HHHHHHHH....',
  '....HHHHHHHH....',
  '.....HHHHHH.....',
  '....GGGGGGGG....',
  '...GGGGGGGGGG...',
  '...GGGGGGGGGG...',
  '...FGGGGGGGGF...',
  '....GGGGGGGG....',
  '....GGGGGGGG....',
  '.....LL..LL.....',
  '.....LL..LL.....',
  '....BBB..BBB....',
];

const HERO_UP_1 = [
  ...HERO_UP_0.slice(0, 12),
  '.....LL..LL.....',
  '....LL....LL....',
  '...BBB....BBB...',
];

const HERO_RIGHT_0 = [
  '......HHHH......',
  '.....HHHHHH.....',
  '.....HHFFFF.....',
  '.....HHFEFF.....',
  '.....HHFFFF.....',
  '......FFFF......',
  '.....GGGGGG.....',
  '....GGGGGGGG....',
  '....GGGGGGGG....',
  '....GGGFFGGG....',
  '....GGGGGGGG....',
  '.....GGGGGG.....',
  '......LLLL......',
  '......LLLL......',
  '.....BBBBBB.....',
];

const HERO_RIGHT_1 = [
  ...HERO_RIGHT_0.slice(0, 12),
  '......LLLL......',
  '.....LL..LL.....',
  '....BBB..BBB....',
];

// ---------------------------------------------------------------- enemies

const SLIME_PAL: Palette = {
  S: '#4fc06a',
  D: '#2f8c47',
  W: '#ffffff',
  E: '#22202a',
  M: '#1d5c2f',
};

const SLIME = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '.....SSSSSS.....',
  '....SSSSSSSS....',
  '...SSSSSSSSSS...',
  '...SWESSSSWES...',
  '..SSSSSSSSSSSS..',
  '..SSSSSSSSSSSS..',
  '..SSSSSMMSSSSS..',
  '...SDSSSSSSDS...',
  '....DDDDDDDD....',
];

const BAT_PAL: Palette = {
  W: '#5b4a86',
  P: '#8a6dc4',
  E: '#ff5544',
  F: '#ffffff',
};

const BAT = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '.WW..........WW.',
  '.WWW.PPPPPP.WWW.',
  '..WWWPPPPPPWWW..',
  '...WPPEPPEPPW...',
  '....PPPPPPPP....',
  '.....PFPPFP.....',
  '......PPPP......',
];

const SKELETON_PAL: Palette = {
  W: '#e8e4d8',
  E: '#1a1822',
  T: '#9a958a',
};

const SKELETON = [
  '.....WWWWWW.....',
  '....WWWWWWWW....',
  '....WEEWWEEW....',
  '....WWWWWWWW....',
  '.....WTTTTW.....',
  '......WWWW......',
  '....WWWWWWWW....',
  '...W.WWWWWW.W...',
  '...W.W.WW.W.W...',
  '...W.WWWWWW.W...',
  '.....WWWWWW.....',
  '......WWWW......',
  '.....WW..WW.....',
  '.....WW..WW.....',
  '....WWW..WWW....',
];

// ---------------------------------------------------------------- more enemies
// A wider bestiary so each foe reads as its own creature instead of sharing one
// of three silhouettes. Same 16px-wide, viewer-facing convention as slime/skeleton.

const RAT_PAL: Palette = {
  B: '#7a6a55', // fur
  D: '#554736', // dark fur / feet
  E: '#22202a', // eyes
  T: '#c9b8a0', // ears / tail
  P: '#e08a9a', // nose
};

const RAT = [
  '................',
  '................',
  '....D......D....',
  '...DBD....DBD...',
  '...DBBBBBBBBD...',
  '..TBBEBBBBEBBT..',
  '..PBBBBBBBBBBP..',
  '...BBBBBBBBBB...',
  '...BBBBBBBBBB...',
  '....B.B..B.B....',
  '................',
  '..........TTTT..',
];

const GOBLIN_PAL: Palette = {
  G: '#6ba43a', // skin
  D: '#3f6a22', // dark skin / feet
  E: '#f1c40f', // eyes
  T: '#e8e4d8', // teeth
  R: '#8a5a2b', // leather
  S: '#aab2bd', // dagger
};

const GOBLIN = [
  '....G......G....',
  '...GG......GG...',
  '...GGG....GGG...',
  '....GGGGGGGG....',
  '...GGGGGGGGGG...',
  '...GEGGGGGGEG...',
  '...GGGDDGGGG....',
  '....GGTTTTGG....',
  '.....GGGGGG.....',
  '....RRGGGGRR....',
  '..S.RGGGGGGR....',
  '..S..GGGGGG.....',
  '.....GG..GG.....',
  '....GG....GG....',
  '...DD......DD...',
];

const OGRE_PAL: Palette = {
  S: '#9a8a5a', // sallow skin
  D: '#6b5d38', // dark skin / feet
  E: '#f1c40f', // eyes
  T: '#e8e4d8', // tusks
};

const OGRE = [
  '.....SSSSSS.....',
  '....SSSSSSSS....',
  '....SDSSSSDS....',
  '....SEESSEES....',
  '....SSSSSSSS....',
  '....STTSSTTS....',
  '.....SSSSSS.....',
  '...SSSSSSSSSS...',
  '..SSSSSSSSSSSS..',
  '..SSSSSSSSSSSS..',
  '..SSSDSSSSDSSS..',
  '...SSSSSSSSSS...',
  '....SS....SS....',
  '....SS....SS....',
  '...DDD....DDD...',
];

const ORC_PAL: Palette = {
  G: '#5a7a4a', // grey-green skin
  D: '#3a5230', // dark skin / feet
  E: '#e23b4e', // red eyes
  T: '#e8e4d8', // tusks
};

const ORC = [
  '.....GGGGGG.....',
  '....GGGGGGGG....',
  '....GDGGGGDG....',
  '....GEEGGEEG....',
  '....GGGGGGGG....',
  '....GTGGGGTG....',
  '.....GGGGGG.....',
  '...GGGGGGGGGG...',
  '..GGGGGGGGGGGG..',
  '..GGDGGGGGGDGG..',
  '...GGGGGGGGGG...',
  '....GG....GG....',
  '....GG....GG....',
  '...DDD....DDD...',
];

const GARGOYLE_PAL: Palette = {
  S: '#8a8f98', // stone
  D: '#565b64', // dark stone / claws
  E: '#e23b4e', // eyes
  W: '#6b7079', // wings
  H: '#3a4048', // horns
};

const GARGOYLE = [
  '..H..........H..',
  '..HH........HH..',
  '...SSSS..SSSS...',
  'W...SSSSSSSS...W',
  'WW..SEESSEES..WW',
  'WWW.SSSSSSSS.WWW',
  'WWWWSDSSSSDSWWWW',
  'WWW.SSSSSSSS.WWW',
  '.WW.SSSSSSSS.WW.',
  '....SSSSSSSS....',
  '.....SS..SS.....',
  '....DDD..DDD....',
];

const KNIGHT_PAL: Palette = {
  A: '#aab2bd', // armor
  D: '#5e6a78', // dark armor / feet
  E: '#2a2f38', // visor slit
  P: '#e23b4e', // plume
  S: '#cdd3da', // sword
  G: '#f1c40f', // shield emblem
};

const KNIGHT = [
  '......PP........',
  '.....AAAA.......',
  '....AAAAAA......',
  '....AEEEEA......',
  '....AAAAAA...S..',
  '.....AAAA....S..',
  '...AAAAAAAA..S..',
  '..DAAAAAAAAD.S..',
  '..DAAGGGGAAD.S..',
  '..DAAAAAAAD.....',
  '...AAAAAAAA.....',
  '...AAA..AAA.....',
  '...AA....AA.....',
  '..DDD....DDD....',
];

const CULTIST_PAL: Palette = {
  R: '#6b2b3a', // robe
  D: '#43121f', // dark robe / hem
  E: '#f1c40f', // glowing eyes
  H: '#2a2f38', // hood shadow
  S: '#c9b8a0', // hands
};

const CULTIST = [
  '......RRRR......',
  '.....RRRRRR.....',
  '....RRHHHHRR....',
  '....RHEHHEHR....',
  '....RRHHHHRR....',
  '.....RRRRRR.....',
  '....RRRRRRRR....',
  '...RRRRRRRRRR...',
  '...RRRSRRSRRR...',
  '...RRRRRRRRRR...',
  '...RDRRRRRRDR...',
  '...RRRRRRRRRR...',
  '....RRRRRRRR....',
  '....DDD..DDD....',
];

const NECRO_PAL: Palette = {
  R: '#3d2b5e', // robe
  D: '#241a38', // dark robe / hem
  E: '#39e6e0', // eyes
  W: '#e8e4d8', // staff skull
  S: '#8a5a2b', // staff
  G: '#9b59ff', // gem
};

const NECROMANCER = [
  '.....RRRR.....W.',
  '....RRRRRR...WWW',
  '....RRDDRR...WWW',
  '....RDEEDR....W.',
  '....RRDDRR....S.',
  '.....RRRR.....S.',
  '....RRRRRR....S.',
  '...RRRRRRRR...S.',
  '...RRRGGRRR...S.',
  '...RRRRRRRR...S.',
  '...RRRRRRRR.....',
  '....RRRRRR......',
  '....RRRRRR......',
  '....DDD.DDD.....',
];

const WITCH_PAL: Palette = {
  H: '#2a2338', // hat
  G: '#7bbf5a', // skin
  D: '#4a7a35', // dark skin / mouth
  E: '#f1c40f', // eyes
  R: '#5b2b6b', // robe
  N: '#8a5a2b', // nose
};

const WITCH = [
  '.......H........',
  '......HH........',
  '.....HHH........',
  '....HHHHH.......',
  '...HHHHHHH......',
  '..HHHHHHHHH.....',
  '.....GGGG.......',
  '....GGGGGG......',
  '....GEGGEG......',
  '....GGNNGG......',
  '....GDDDDG......',
  '....RRRRRR......',
  '...RRRRRRRR.....',
  '...RRRRRRRR.....',
  '....RRR.RRR.....',
];

const WRAITH_PAL: Palette = {
  S: '#3a4358', // shroud
  D: '#232838', // hood shadow
  E: '#39e6e0', // eyes
};

const WRAITH = [
  '.....SSSS.......',
  '....SSSSSS......',
  '....SDDDDS......',
  '....SDEEDS......',
  '....SSSSSS......',
  '...SSSSSSSS.....',
  '...SSSSSSSS.....',
  '..SSSSSSSSSS....',
  '..SSSSSSSSSS....',
  '...SSSSSSSS.....',
  '....SSSSSS......',
  '.....S.SS.......',
  '......S.S.......',
  '.......S........',
];

const IMP_PAL: Palette = {
  R: '#c0392b', // skin
  D: '#7d1f14', // dark skin / feet
  E: '#f1c40f', // eyes
  W: '#4a1f2a', // wings
  H: '#2a2533', // horns
  F: '#ffffff', // fangs
};

const IMP = [
  '...H......H.....',
  '...RR....RR.....',
  '....RRRRRR......',
  '....REEERR......',
  '....RRRRRR......',
  '..W.RRFFRR.W....',
  '..WWRRRRRRWW....',
  '...WRRRRRRW.....',
  '....RRRRRR......',
  '....RR..RR......',
  '...DD....DD.....',
  '.........RRR....',
];

const BANDIT_PAL: Palette = {
  S: '#c9a06a', // hood cloth
  F: '#e8c79b', // face
  E: '#22202a', // eyes
  M: '#3a4150', // mask
  L: '#5c3a1c', // leather
  K: '#aab2bd', // knife
};

const BANDIT = [
  '.....SSSS.......',
  '....SSSSSS......',
  '....SFFFFS......',
  '....SEFFES......',
  '....SMMMMS......',
  '.....FFFF.......',
  '....LLLLLL...K..',
  '...LLLLLLLL..K..',
  '...LLLLLLLL..K..',
  '...LLLLLLLL.....',
  '....LLLLLL......',
  '....LL..LL......',
  '...LL....LL.....',
  '..LLL....LLL....',
];

// ---------------------------------------------------------------- bosses
// Bosses are authored as a 12px left half and mirrored to 24px.

function symmetric(rows: string[]): string[] {
  return rows.map((r) => {
    const left = r.padEnd(12, '.');
    return left + left.split('').reverse().join('');
  });
}

const MINOTAUR_PAL: Palette = {
  H: '#e8ddc0', // horns
  M: '#8a5a30', // fur
  D: '#5c3a1c', // dark fur / belt
  E: '#ff3b30', // eyes
  N: '#f1c40f', // nose ring
};

const MINOTAUR = symmetric([
  '...HH.......',
  '..HHH.......',
  '..HH..MMMMMM',
  '..H..MMMMMMM',
  '.....MMEMMMM',
  '.....MMMMMMM',
  '......MDDDDD',
  '......MDNDDD',
  '.......MMMMM',
  '....MMMMMMMM',
  '...MMMMMMMMM',
  '..MMMMMMMMMM',
  '..MMM.MMMMMM',
  '..MMM.MMMMMM',
  '..MMM.MDDDMM',
  '..MMM.DDDDDD',
  '.....MMMM...',
  '.....MMMM...',
  '.....MMM....',
  '.....DDD....',
]);

const LICH_PAL: Palette = {
  C: '#f1c40f', // crown
  W: '#e8e4d8', // skull
  E: '#39e6e0', // glowing eyes
  T: '#9a958a', // teeth
  L: '#3d2b5e', // robe
  G: '#39e6e0', // rune glow
};

const LICH = symmetric([
  '..........CC',
  '.........CCC',
  '........WWWW',
  '.......WWWWW',
  '.......WWEEW',
  '.......WWWWW',
  '........WTTW',
  '......LLLLLL',
  '.....LLLLLLL',
  '....LLLLLLLL',
  '....LLLLLLGG',
  '...LLLLLLLGG',
  '...LLLLLLLLL',
  '...LLLLLLLLL',
  '..LLLLLLLLLL',
  '..LLLLLLLLLL',
  '..LLLLLLLLLL',
  '.LLLLLLLLLLL',
  '.LLLLLLLLLLL',
  '.LLLLLLLLLLL',
]);

const DEMON_PAL: Palette = {
  H: '#2b2533', // horns
  R: '#c0392b', // skin
  D: '#7d1f14', // dark skin
  E: '#f1c40f', // eyes
  F: '#ffffff', // fangs
  W: '#4a3258', // wings
};

const DEMON = symmetric([
  '.H..........',
  '.HH.........',
  '..HH....RRRR',
  '...H...RRRRR',
  '.......RREER',
  '.......RRRRR',
  '........RFFR',
  'W......RRRRR',
  'WW....RRRRRR',
  'WWW..RRRRRRR',
  'WWWW.RRRRRRR',
  'WWWWWRRRRRRR',
  'WWWW.RRRRRRR',
  'WWW..RRDDRRR',
  'WW...RRDDRRR',
  '.....RRRRRRR',
  '......RRRR..',
  '......RRR...',
  '......RR....',
  '......DD....',
]);

// ---------------------------------------------------------------- items

const CHEST_PAL: Palette = {
  B: '#8a5a2b',
  D: '#5c3a1c',
  Y: '#f1c40f',
  K: '#241a10',
};

const CHEST_CLOSED = [
  '................',
  '................',
  '................',
  '...BBBBBBBBBB...',
  '..BBBBBBBBBBBB..',
  '..BDDDDDDDDDDB..',
  '..BBBBBBBBBBBB..',
  '..YYYYYYYYYYYY..',
  '..BBBBBYYBBBBB..',
  '..BBBBBYYBBBBB..',
  '..BBBBBBBBBBBB..',
  '..BBBBBBBBBBBB..',
  '...DDDDDDDDDD...',
];

const CHEST_OPEN = [
  '................',
  '...BBBBBBBBBB...',
  '..BDDDDDDDDDDB..',
  '..BBBBBBBBBBBB..',
  '..BKKKKKKKKKKB..',
  '..BKYYKYYKYYKB..',
  '..BBBBBBBBBBBB..',
  '..YYYYYYYYYYYY..',
  '..BBBBBBBBBBBB..',
  '..BBBBBBBBBBBB..',
  '..BBBBBBBBBBBB..',
  '..BBBBBBBBBBBB..',
  '...DDDDDDDDDD...',
];

const POTION_PAL: Palette = {
  C: '#8a5a2b',
  G: '#bcd8e8',
  R: '#e23b4e',
};

const POTION = [
  '................',
  '................',
  '................',
  '.......CC.......',
  '.......CC.......',
  '......GGGG......',
  '......GGGG......',
  '.....GGRRGG.....',
  '....GRRRRRRG....',
  '....GRRRRRRG....',
  '....GRRRRRRG....',
  '.....GRRRRG.....',
  '......GGGG......',
];

const POTION_LARGE_PAL: Palette = {
  C: '#8a5a2b',
  G: '#bcd8e8',
  P: '#5fe07a',
};

const POTION_LARGE = [
  '................',
  '.......CC.......',
  '.......CC.......',
  '......GGGG......',
  '.....GGGGGG.....',
  '....GGPPPPGG....',
  '...GPPPPPPPPG...',
  '...GPPPPPPPPG...',
  '...GPPPPPPPPG...',
  '...GPPPPPPPPG...',
  '....GPPPPPPG....',
  '.....GPPPPG.....',
  '......GGGG......',
];

const BOMB_PAL: Palette = {
  B: '#2a2833',
  H: '#5d5670',
  F: '#8a5a2b',
  S: '#f1c40f',
  R: '#e23b4e',
};

const BOMB = [
  '................',
  '.............S..',
  '............SR..',
  '...........FS...',
  '..........F.....',
  '.........F......',
  '........BB......',
  '......BBBBBB....',
  '.....BBBBBBBB...',
  '....BBBBBBBBBB..',
  '....BBHBBBBBBB..',
  '....BBBBBBBBBB..',
  '.....BBBBBBBB...',
  '......BBBBBB....',
  '................',
];

const SMOKE_PAL: Palette = {
  S: '#8a8494',
  D: '#4a4658',
  W: '#d8d4e0',
};

const SMOKE_BOMB = [
  '................',
  '....W...WW......',
  '...WWW.WWWW.W...',
  '..WW.WWWWWWWW...',
  '...WWWWWWWW.W...',
  '....WW.WWW......',
  '......SSSS......',
  '.....SDDDDS.....',
  '.....SDDDDS.....',
  '.....SDDDDS.....',
  '......SSSS......',
  '................',
];

const ARMOR_PAL: Palette = {
  S: '#aab2bd',
  D: '#5e6a78',
};

const ARMOR = [
  '................',
  '................',
  '................',
  '................',
  '...SS......SS...',
  '..SSSSSSSSSSSS..',
  '..SSSSSSSSSSSS..',
  '...SSSSSSSSSS...',
  '...SSSSDDSSSS...',
  '...SSSSDDSSSS...',
  '....SSSSSSSS....',
  '.....SSSSSS.....',
  '......SSSS......',
];

const SPIKES_PAL: Palette = {
  W: '#d8dde4',
  S: '#7d8794',
  B: '#3a4150',
};

const SPIKES = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '..W...W...W...W.',
  '.WSW.WSW.WSW.WSW',
  'WSSSWSSSWSSSWSSS',
  'BBBBBBBBBBBBBBBB',
];

const HEART_PAL: Palette = { H: '#e23b4e', S: '#8e1f2d' };
const HEART_EMPTY_PAL: Palette = { H: '#3a3544', S: '#262230' };

const HEART = [
  '.HH..HH.',
  'HHHHHHHH',
  'HHHHHHHH',
  'HHHHHHHH',
  '.HHHHHH.',
  '..HHHH..',
  '..SHHS..',
  '...HH...',
];

// ---------------------------------------------------------------- tiles (programmatic)

function makeFloor(
  scene: Phaser.Scene,
  key: string,
  base: string,
  speck: string,
  seed: number,
): void {
  const tex = scene.textures.createCanvas(key, 16, 16);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = speck;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if ((x * 7 + y * 13 + seed * 5) % 23 === 0) ctx.fillRect(x, y, 1, 1);
    }
  }
  // faint tile seams
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 0, 16, 1);
  ctx.fillRect(0, 0, 1, 16);
  tex.refresh();
}

function makeWall(scene: Phaser.Scene): void {
  const tex = scene.textures.createCanvas('wall', 16, 16);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.fillStyle = '#4a4458';
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = '#2c2838';
  // mortar lines: brick rows of height 4, offset every other row
  for (let row = 0; row < 4; row++) {
    ctx.fillRect(0, row * 4, 16, 1);
    const offset = row % 2 === 0 ? 0 : 8;
    ctx.fillRect((offset + 4) % 16, row * 4, 1, 4);
    ctx.fillRect((offset + 12) % 16, row * 4, 1, 4);
  }
  ctx.fillStyle = '#5d5670';
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if ((x * 11 + y * 3) % 29 === 0) ctx.fillRect(x, y, 1, 1);
    }
  }
  tex.refresh();
}

function makeDoorBlocked(scene: Phaser.Scene): void {
  const tex = scene.textures.createCanvas('door_blocked', 16, 16);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.fillStyle = '#16121e';
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = '#8a8494';
  for (let x = 1; x < 16; x += 4) ctx.fillRect(x, 0, 2, 16);
  ctx.fillStyle = '#6a6478';
  ctx.fillRect(0, 3, 16, 1);
  ctx.fillRect(0, 11, 16, 1);
  tex.refresh();
}

function makeDoorOpen(scene: Phaser.Scene): void {
  const tex = scene.textures.createCanvas('door_open', 16, 16);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.fillStyle = '#16121e';
  ctx.fillRect(0, 0, 16, 16);
  // light spilling into the passage
  ctx.fillStyle = '#2c2440';
  ctx.fillRect(2, 0, 12, 16);
  ctx.fillStyle = '#3a3052';
  ctx.fillRect(5, 0, 6, 16);
  tex.refresh();
}

function makeExit(scene: Phaser.Scene): void {
  const tex = scene.textures.createCanvas('exit', 16, 16);
  if (!tex) return;
  const ctx = tex.getContext();
  const shades = ['#a89868', '#7d7048', '#574e30', '#332d1a', '#171408'];
  for (let i = 0; i < shades.length; i++) {
    ctx.fillStyle = shades[i];
    ctx.fillRect(i, i, 16 - i * 2, 16 - i * 2);
  }
  ctx.fillStyle = '#f1e3a8';
  ctx.fillRect(7, 5, 2, 6); // light from above
  tex.refresh();
}

// ---------------------------------------------------------------- entry point

export function createAllTextures(scene: Phaser.Scene): void {
  const px = (key: string, rows: string[], pal: Palette) => makePixelTexture(scene, key, rows, pal);

  px('hero_down_0', HERO_DOWN_0, HERO_PAL);
  px('hero_down_1', HERO_DOWN_1, HERO_PAL);
  px('hero_up_0', HERO_UP_0, HERO_PAL);
  px('hero_up_1', HERO_UP_1, HERO_PAL);
  px('hero_right_0', HERO_RIGHT_0, HERO_PAL);
  px('hero_right_1', HERO_RIGHT_1, HERO_PAL);
  px('hero_left_0', mirror(HERO_RIGHT_0), HERO_PAL);
  px('hero_left_1', mirror(HERO_RIGHT_1), HERO_PAL);

  px('slime', SLIME, SLIME_PAL);
  px('bat', BAT, BAT_PAL);
  px('skeleton', SKELETON, SKELETON_PAL);

  px('rat', RAT, RAT_PAL);
  px('goblin', GOBLIN, GOBLIN_PAL);
  px('ogre', OGRE, OGRE_PAL);
  px('orc', ORC, ORC_PAL);
  px('gargoyle', GARGOYLE, GARGOYLE_PAL);
  px('knight', KNIGHT, KNIGHT_PAL);
  px('cultist', CULTIST, CULTIST_PAL);
  px('necromancer', NECROMANCER, NECRO_PAL);
  px('witch', WITCH, WITCH_PAL);
  px('wraith', WRAITH, WRAITH_PAL);
  px('imp', IMP, IMP_PAL);
  px('bandit', BANDIT, BANDIT_PAL);

  px('boss_minotaur', MINOTAUR, MINOTAUR_PAL);
  px('boss_lich', LICH, LICH_PAL);
  px('boss_demon', DEMON, DEMON_PAL);

  px('chest_closed', CHEST_CLOSED, CHEST_PAL);
  px('chest_open', CHEST_OPEN, CHEST_PAL);
  px('potion', POTION, POTION_PAL);
  px('potion_large', POTION_LARGE, POTION_LARGE_PAL);
  px('bomb', BOMB, BOMB_PAL);
  px('smoke_bomb', SMOKE_BOMB, SMOKE_PAL);
  px('armor', ARMOR, ARMOR_PAL);
  px('spikes', SPIKES, SPIKES_PAL);
  px('heart', HEART, HEART_PAL);
  px('heart_empty', HEART, HEART_EMPTY_PAL);

  makeFloor(scene, 'floor_a', '#6b5e4a', '#5c5040', 0);
  makeFloor(scene, 'floor_b', '#675a46', '#574c3c', 1);
  makeWall(scene);
  makeDoorBlocked(scene);
  makeDoorOpen(scene);
  makeExit(scene);
}
