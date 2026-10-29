import type { Art } from './types';

type Paint = (x: number, y: number) => string;
const oval = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const picture = (name: string, paint: Paint): Art => ({
  name,
  rows: Array.from({ length: 22 }, (_, row) => Array.from({ length: 22 }, (_, col) => paint((col + .5) / 11 - 1, (row + .5) / 11 - 1)).join('')),
});

const llama: Paint = (x, y) => {
  if (oval(x, y, -.1, .16, .57, .52)) return oval(x, y, -.12, -.04, .17, .19) ? 'W' : 'N';
  if (oval(x, y, .35, -.49, .28, .49)) return y < -.66 ? 'W' : 'N';
  if (y > .5 && (x < -.35 || x > .08) && Math.abs(x) < .68) return 'N';
  if (x > .46 && x < .55 && y > -.57 && y < -.46) return 'D';
  if (x > .46 && x < .78 && y > -.46 && y < -.18) return 'P';
  return '.';
};

const squirrel: Paint = (x, y) => {
  if (oval(x, y, -.12, .26, .46, .48)) return 'O';
  if (oval(x, y, .34, -.22, .34, .32)) return 'O';
  if (oval(x, y, -.67, -.1, .34, .66) && !oval(x, y, -.7, .02, .18, .42)) return 'N';
  if (y > .6 && Math.abs(x) < .55) return 'N';
  if (x > .43 && x < .52 && y > -.29 && y < -.2) return 'D';
  if (oval(x, y, .6, -.48, .12, .16)) return 'O';
  return '.';
};

const puffin: Paint = (x, y) => {
  if (oval(x, y, -.07, .14, .57, .74)) {
    if (oval(x, y, .06, .24, .35, .53)) return 'W';
    return 'D';
  }
  if (oval(x, y, .47, -.08, .43, .2)) return x > .63 ? 'R' : 'O';
  if (y > .72 && Math.abs(x) < .63) return 'O';
  if (oval(x, y, .1, -.25, .07, .08)) return 'W';
  return '.';
};

const sloth: Paint = (x, y) => {
  if (oval(x, y, 0, .11, .6, .56)) return 'N';
  if (oval(x, y, 0, -.18, .38, .38)) {
    if (oval(x, y, -.16, -.18, .12, .14) || oval(x, y, .16, -.18, .12, .14)) return 'D';
    return 'W';
  }
  if (y > .52 && Math.abs(x) < .63) return 'N';
  if (y < -.48 && Math.abs(x) < .25) return 'N';
  if (oval(x, y, 0, .09, .08, .06)) return 'D';
  return '.';
};

const goldfish: Paint = (x, y) => {
  if (oval(x, y, -.09, .06, .58, .43)) {
    if (oval(x, y, -.22, -.02, .18, .22)) return 'Y';
    return 'O';
  }
  if (x > .45 && y > -.34 && y < .44 && Math.abs(y) < .7 - x) return 'O';
  if (y < -.42 && x < .15 && x > -.42) return 'Y';
  if (y > .42 && x < .15 && x > -.42) return 'Y';
  if (oval(x, y, -.35, -.04, .06, .06)) return 'D';
  if (y > .55 && Math.abs(x) < .85) return 'C';
  return '.';
};

export const NEW_CREATURES_6: Art[] = [
  picture('Llama', llama),
  picture('Squirrel', squirrel),
  picture('Puffin', puffin),
  picture('Sloth', sloth),
  picture('Goldfish', goldfish),
];
