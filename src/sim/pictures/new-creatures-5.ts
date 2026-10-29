import type { Art } from './types';

type Paint = (x: number, y: number) => string;
const oval = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const picture = (name: string, paint: Paint): Art => ({
  name,
  rows: Array.from({ length: 22 }, (_, row) => Array.from({ length: 22 }, (_, col) => paint((col + .5) / 11 - 1, (row + .5) / 11 - 1)).join('')),
});

const penguin: Paint = (x, y) => {
  if (oval(x, y, 0, 0.18, 0.58, 0.72)) {
    if (oval(x, y, 0, 0.25, 0.34, 0.5)) return y > 0.58 ? 'W' : 'W';
    if (oval(x, y, -.23, -0.12, .08, .09) || oval(x, y, .23, -0.12, .08, .09)) return 'W';
    return 'D';
  }
  if (y > .72 && Math.abs(x) < .63) return 'O';
  if (y > -.08 && y < .38 && Math.abs(x) > .53 && Math.abs(x) < .82) return 'D';
  if (oval(x, y, 0, .02, .12, .09)) return 'O';
  return '.';
};

const bee: Paint = (x, y) => {
  if (oval(x, y, -.32, -.3, .36, .3) || oval(x, y, .32, -.3, .36, .3)) return 'W';
  if (oval(x, y, 0, .12, .62, .47)) {
    if (Math.abs(x) < .12) return 'D';
    if (Math.abs(x) < .32) return 'Y';
    return 'D';
  }
  if (oval(x, y, .67, .12, .16, .18)) return 'D';
  if (y > .48 && Math.abs(x) < .18) return 'D';
  return '.';
};

const flamingo: Paint = (x, y) => {
  if (oval(x, y, -.16, .14, .55, .5)) return 'K';
  if (x > .16 && x < .43 && y > -.58 && y < .27) return 'K';
  if (oval(x, y, .33, -.62, .3, .22)) return x > .52 ? 'D' : 'K';
  if (y > .56 && y < .9 && x > -.03 && x < .11) return 'K';
  if (y > .82 && x > -.03 && x < .48) return 'D';
  if (oval(x, y, -.33, .08, .16, .25)) return 'P';
  return '.';
};

const turtle: Paint = (x, y) => {
  if (oval(x, y, -.1, .12, .64, .47)) {
    if (oval(x, y, -.1, .12, .38, .29)) return 'N';
    return 'G';
  }
  if (oval(x, y, .68, .11, .28, .23)) return 'G';
  if (y > .45 && (x < -.4 || x > .16) && Math.abs(x) < .76) return 'G';
  if (oval(x, y, .75, .04, .04, .05)) return 'D';
  return '.';
};

const bat: Paint = (x, y) => {
  if (oval(x, y, 0, .05, .3, .47)) return y > .33 ? 'D' : 'P';
  if (y > -.15 && y < .4 && Math.abs(x) > .2 && Math.abs(x) < .9) {
    const wing = 1 - Math.abs(x) * .7;
    return y > -wing ? 'P' : '.';
  }
  if (y < -.35 && Math.abs(x) < .25) return 'D';
  return '.';
};

export const NEW_CREATURES_5: Art[] = [
  picture('Penguin', penguin),
  picture('Bee', bee),
  picture('Flamingo', flamingo),
  picture('Turtle', turtle),
  picture('Bat', bat),
];
