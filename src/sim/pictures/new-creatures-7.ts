import type { Art } from './types';

type Paint = (x: number, y: number) => string;
const oval = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const picture = (name: string, paint: Paint): Art => ({
  name,
  rows: Array.from({ length: 22 }, (_, row) => Array.from({ length: 22 }, (_, col) => paint((col + .5) / 11 - 1, (row + .5) / 11 - 1)).join('')),
});

const alpaca: Paint = (x, y) => {
  if (oval(x, y, -.12, .22, .61, .49)) return oval(x, y, -.1, .1, .23, .22) ? 'W' : 'N';
  if (oval(x, y, .36, -.37, .28, .48)) return y < -.62 ? 'W' : 'N';
  if (y > .57 && (x < -.34 || x > .04) && Math.abs(x) < .7) return 'N';
  if (oval(x, y, .47, -.42, .06, .07)) return 'D';
  if (x > .43 && x < .67 && y > -.21 && y < -.05) return 'K';
  return '.';
};

const crab: Paint = (x, y) => {
  if (oval(x, y, 0, .2, .56, .38)) return 'R';
  if (oval(x, y, -.36, -.17, .1, .14) || oval(x, y, .36, -.17, .1, .14)) return 'W';
  if (oval(x, y, -.36, -.18, .035, .045) || oval(x, y, .36, -.18, .035, .045)) return 'D';
  if ((x < -.52 || x > .52) && y > -.05 && y < .5 && Math.abs(y - .18) < .75 - Math.abs(x)) return 'R';
  if (y > .52 && Math.abs(x) < .8) return 'O';
  if (y < -.4 && Math.abs(x) > .48 && Math.abs(x) < .72) return 'R';
  return '.';
};

const peacock: Paint = (x, y) => {
  if (oval(x, y, 0, -.2, .74, .69)) return 'B';
  if (oval(x, y, 0, -.2, .5, .55)) return 'G';
  if (oval(x, y, 0, -.2, .24, .3)) return 'Y';
  if (oval(x, y, 0, .37, .22, .6)) return 'B';
  if (oval(x, y, 0, -.65, .15, .22)) return 'B';
  if (oval(x, y, .04, -.68, .04, .05)) return 'D';
  return '.';
};

const seal: Paint = (x, y) => {
  if (oval(x, y, 0, .2, .72, .45)) return 'W';
  if (oval(x, y, .28, -.22, .38, .34)) return 'W';
  if (oval(x, y, .44, -.25, .055, .065)) return 'D';
  if (oval(x, y, .18, -.25, .055, .065)) return 'D';
  if (oval(x, y, .31, -.08, .07, .05)) return 'N';
  if (y > .46 && Math.abs(x) < .85) return 'C';
  if (x < -.58 && y > .1 && y < .45) return 'W';
  return '.';
};

const mouse: Paint = (x, y) => {
  if (oval(x, y, -.08, .12, .56, .49)) return 'D';
  if (oval(x, y, -.43, -.37, .26, .25) || oval(x, y, .27, -.37, .26, .25)) return 'D';
  if (oval(x, y, -.43, -.37, .13, .13) || oval(x, y, .27, -.37, .13, .13)) return 'K';
  if (oval(x, y, -.2, -.02, .055, .065) || oval(x, y, .13, -.02, .055, .065)) return 'W';
  if (oval(x, y, -.2, -.02, .025, .035) || oval(x, y, .13, -.02, .025, .035)) return 'D';
  if (oval(x, y, -.03, .2, .08, .06)) return 'K';
  if (x > .47 && y > .22 && y < .72 && x < .92) return 'K';
  return '.';
};

export const NEW_CREATURES_7: Art[] = [
  picture('Alpaca', alpaca), picture('Crab', crab), picture('Peacock', peacock), picture('Seal', seal), picture('Mouse', mouse),
];
