import type { Art } from './types';

// Complete picture cards for the fourth fresh-art batch.
type Paint = (x: number, y: number) => string;
const oval = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const picture = (name: string, paint: Paint): Art => ({
  name,
  rows: Array.from({ length: 22 }, (_, j) =>
    Array.from({ length: 22 }, (_, i) => paint((i + .5) / 11 - 1, (j + .5) / 11 - 1)).join('')),
});

const lighthouse: Paint = (x, y) => {
  if (y > .67) return 'C';
  if (y > .42) return 'N';
  if (y > -.22 && y < .7 && Math.abs(x) < .32 - (y + .22) * .13) return y > .34 ? 'R' : 'W';
  if (y > -.45 && y < -.2 && Math.abs(x) < .43) return 'R';
  if (y > -.66 && y < -.42 && Math.abs(x) < .31) return 'D';
  if (y > -.59 && y < -.46 && Math.abs(x) < .19) return 'Y';
  if (Math.abs(y + .51) < .05 && Math.abs(x) < .88) return 'Y';
  return 'B';
};

const bobaTea: Paint = (x, y) => {
  if (y > -.75 && y < -.12 && Math.abs(x) < .075) return 'K';
  if (y > -.18 && y < -.02 && Math.abs(x) < .55) return 'W';
  if (y > -.02 && y < .71 && Math.abs(x) < .56 - (y + .02) * .12) {
    if (y > .42 && (oval(x, y, -.26, .54, .1, .1) || oval(x, y, 0, .58, .1, .1) || oval(x, y, .27, .52, .1, .1))) return 'D';
    if (y < .17) return 'W';
    return 'N';
  }
  if (y > .69 && Math.abs(x) < .4) return 'C';
  return '.';
};

const autumnTree: Paint = (x, y) => {
  if (y > .63) return 'G';
  if (y > -.05 && y < .67 && Math.abs(x) < .17 + (y - .05) * .13) return 'N';
  if (oval(x, y, 0, -.29, .68, .55)) {
    if (x > .22 && y < -.14) return 'R';
    if (x < -.22 && y > -.3) return 'Y';
    return 'O';
  }
  if (oval(x, y, -.72, .42, .06, .06) || oval(x, y, .65, .3, .06, .06)) return 'R';
  return '.';
};

const kiteFestival: Paint = (x, y) => {
  if (y > .57) return 'G';
  if (Math.abs(x) + Math.abs(y + .25) < .45) {
    if (x < 0) return 'R';
    if (y < -.25) return 'Y';
    return 'P';
  }
  if (x > -.03 && x < .07 && y > .1 && y < .64) return 'W';
  if (Math.abs(x - .04 - (y - .1) * .34) < .065 && y > .1 && y < .62) return 'C';
  if (oval(x, y, .35, .57, .06, .06) || oval(x, y, .56, .61, .05, .05)) return 'K';
  return 'B';
};

const flowerShop: Paint = (x, y) => {
  if (y > .58) return 'N';
  if (y > -.1 && y < .59 && Math.abs(x) < .78) {
    if (y > .24 && Math.abs(x) < .24) return 'D';
    return 'W';
  }
  if (y > -.43 && y < -.08 && Math.abs(x) < .82) return x < 0 ? 'K' : 'P';
  if (y > -.6 && y < -.4 && Math.abs(x) < .86) return 'Y';
  if (oval(x, y, -.53, .04, .14, .14) || oval(x, y, .52, .04, .14, .14)) return 'R';
  if (oval(x, y, -.53, .04, .05, .05) || oval(x, y, .52, .04, .05, .05)) return 'Y';
  return '.';
};

export const NEW_SCENES_4: Art[] = [
  picture('Lighthouse', lighthouse),
  picture('Boba Tea', bobaTea),
  picture('Autumn Tree', autumnTree),
  picture('Kite Festival', kiteFestival),
  picture('Flower Shop', flowerShop),
];
