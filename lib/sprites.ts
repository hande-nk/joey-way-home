/**
 * Pixel art, stored as text. Each character is one pixel; '.' is transparent.
 * All sprites are original to this project. Edit the rows to redraw them.
 */

const PALETTE: Record<string, string> = {
  y: '#ffe600', // helmet
  s: '#ffc89a', // skin
  k: '#14142b', // eye, dark detail
  r: '#ff3b3b', // jersey
  b: '#3b7bff', // jeans, blue
  w: '#ffffff',
  g: '#aab0c8', // metal grey
  o: '#ff9d00', // orange
  l: '#5fe8ff', // glass, cyan
  e: '#9fb4d8', // elephant
  E: '#6f86b3', // elephant ear
  p: '#b45cff', // purple
  n: '#5a6082', // dark grey
  G: '#4dff88', // green
  P: '#ff7ad9', // pink
};

export type Sprite = string[];

export const JOEY_FRAMES: Sprite[] = [
  [
    '......yyyy......',
    '.....yyyyyy.....',
    '.....ssskss.....',
    '......ssss......',
    '....rrrrr.......',
    '...rrrrrrss.....',
    '...rrrrr..sgg...',
    '...bbbbb...g....',
    '..oobbboooog....',
    '.ww..bb.o.ww....',
    'w..w.b.o.w..w...',
    'w.gwoooo.w.gw...',
    'w..w.....w..w...',
    '.ww.......ww....',
  ],
  [
    '......yyyy......',
    '.....yyyyyy.....',
    '.....ssskss.....',
    '......ssss......',
    '....rrrrr.......',
    '...rrrrrrss.....',
    '...rrrrr..sgg...',
    '...bbbbb...g....',
    '..oobbboooog....',
    '.ww.bb..o.ww....',
    'wg.wb..o.wg.w...',
    'w..woooo.w..w...',
    'w..w.....w..w...',
    '.ww.......ww....',
  ],
];

/** Before the start: Joey is a passenger. */
export const CAR: Sprite = [
  '....wwwwwww.....',
  '...wllwllllw....',
  '..wwllwllllww...',
  '.wwwwwwwwwwwwww.',
  'ywwwwwwwwwwwwwwr',
  'wwwwwwwwwwwwwwww',
  '.wnnw......wnnw.',
  '..nn........nn..',
];

/** Finish line mascot. */
export const ELEPHANT: Sprite = [
  '.....eeeeee.....',
  '...eeeeeeeeeee..',
  '..eeEEeeeeeeeee.',
  '.eekEEEeeeeeeeee',
  '.eeeEEEeeeeeeeee',
  'eeeeeEeeeeeeeeee',
  'ee.eeeeeeeeeeee.',
  'ee.eeeeeeeeeeee.',
  'ee..eee.ee.eee..',
  '.e..eee.ee.eee..',
  '.ee.eee.ee.eee..',
];

export const FLAG: Sprite = [
  'gww.ww.w',
  'gw.ww.ww',
  'gww.ww.w',
  'gw.ww.ww',
  'g.......',
  'g.......',
  'g.......',
  'g.......',
];

export const GREMLIN_SPRITES: Record<string, Sprite> = {
  goose: [
    '.......nnn..',
    '......nnwnoo',
    '......nnnn..',
    '.......nn...',
    '.......nn...',
    '..wwwwwnn...',
    '.wwwwwwwww..',
    'wwwwwwwwww..',
    '.wwwwwwww...',
    '..wwwwww....',
    '...o..o.....',
    '..oo.oo.....',
  ],
  cone: [
    '.....oo.....',
    '.....oo.....',
    '....oooo....',
    '....wwww....',
    '...oooooo...',
    '...oooooo...',
    '..wwwwwwww..',
    '..oooooooo..',
    '.oooooooooo.',
    '.oooooooooo.',
    'oooooooooooo',
    'oooooooooooo',
  ],
  truck: [
    '............',
    'wwwwwwww....',
    'wwwwwwww....',
    'wrrwrrww.yy.',
    'wwwwwwwwyyyy',
    'wwwwwwwwylly',
    'wwwwwwwwyyyy',
    'rrrrrrrryyyy',
    'rrrrrrrryyyy',
    '.nn....nn...',
    '.nn....nn...',
    '............',
  ],
  pothole: [
    '............',
    '............',
    '...pppppp...',
    '.pppppppppp.',
    'ppwwppppwwpp',
    'ppwkppppwkpp',
    'pppppppppppp',
    '.ppkpkpkppp.',
    '...pppppp...',
    '............',
    '............',
    '............',
  ],
  rotary: [
    '...bbbbbb...',
    '..bbwwwwbb..',
    '.bbw....wbb.',
    'bbw..bb..wbb',
    'bw..bbbb..wb',
    'bw..bbbb.www',
    'bw..bbbb..w.',
    'bbw..bb.....',
    '.bbw....wbb.',
    '..bbwwwwbb..',
    '...bbbbbb...',
    '............',
  ],
};

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  centerX: number,
  centerY: number,
  scale: number,
  opts: { flip?: boolean; alpha?: number } = {},
) {
  const width = Math.max(...sprite.map((row) => row.length));
  const height = sprite.length;
  const left = Math.round(centerX - (width * scale) / 2);
  const top = Math.round(centerY - (height * scale) / 2);
  ctx.save();
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  for (let y = 0; y < height; y++) {
    const row = sprite[y];
    for (let x = 0; x < row.length; x++) {
      const color = PALETTE[row[x]];
      if (!color) continue;
      const drawX = opts.flip ? width - 1 - x : x;
      ctx.fillStyle = color;
      ctx.fillRect(left + drawX * scale, top + y * scale, scale, scale);
    }
  }
  ctx.restore();
}

/** Same sprite as CSS-free inline SVG, for use in the HUD. */
export function spriteToSvgRects(sprite: Sprite): { x: number; y: number; fill: string }[] {
  const rects: { x: number; y: number; fill: string }[] = [];
  sprite.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const fill = PALETTE[ch];
      if (fill) rects.push({ x, y, fill });
    });
  });
  return rects;
}
