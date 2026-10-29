import type { Art } from './types';

type Paint = (x: number, y: number) => string;
const oval = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

function picture(name: string, paint: Paint): Art {
  const size = 22;
  return { name, rows: Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => paint((x + .5) / size * 2 - 1, (y + .5) / size * 2 - 1)).join('')) };
}

const capybara: Paint = (x, y) => {
  if (oval(x, y, -.08, .16, .82, .55)) {
    if (oval(x, y, .39, .1, .12, .1)) return 'D';
    if (oval(x, y, .38, .16, .29, .2)) return 'N';
    if (y > .48 && Math.abs(x) > .3) return 'N';
    return 'O';
  }
  if (oval(x, y, -.52, -.35, .16, .18) || oval(x, y, -.05, -.45, .16, .18)) return 'O';
  if (x > -.22 && x < .18 && y < -.2 && y > -.37) return 'G';
  return '.';
};

const fox: Paint = (x, y) => {
  if (oval(x, y, 0, .1, .72, .72)) {
    if (oval(x, y, -.29, -.05, .16, .16) || oval(x, y, .29, -.05, .16, .16)) return 'D';
    if (y > .27 && Math.abs(x) < .41) return 'W';
    if (Math.abs(x) < .07 && y > .22 && y < .4) return 'D';
    return 'O';
  }
  if (x < -.27 && y < -.38 && y > -.9 && x > -.79 + (y + .9) * .25) return 'O';
  if (x > .27 && y < -.38 && y > -.9 && x < .79 - (y + .9) * .25) return 'O';
  return '.';
};

const jellyfish: Paint = (x, y) => {
  if (oval(x, y, 0, -.28, .74, .53)) {
    if (y > -.08) return 'P';
    if (oval(x, y, -.23, -.28, .12, .12) || oval(x, y, .23, -.28, .12, .12)) return 'W';
    return 'K';
  }
  if (y > .1 && y < .82 && (Math.abs(x + .5) < .09 || Math.abs(x + .17) < .08 || Math.abs(x - .17) < .08 || Math.abs(x - .5) < .09)) return y > .52 && Math.abs(x) < .22 ? 'C' : 'P';
  return '.';
};

const koala: Paint = (x, y) => {
  if (oval(x, y, 0, .1, .66, .72)) {
    if (oval(x, y, -.27, -.02, .15, .14) || oval(x, y, .27, -.02, .15, .14)) return 'D';
    if (oval(x, y, 0, .28, .25, .19)) return 'W';
    if (Math.abs(x) < .1 && y > .12 && y < .32) return 'D';
    return 'G';
  }
  if (oval(x, y, -.48, -.5, .24, .24) || oval(x, y, .48, -.5, .24, .24)) return 'G';
  if (x > .48 && y > -.3 && y < .55) return 'B';
  return '.';
};

const chameleon: Paint = (x, y) => {
  if (oval(x, y, -.07, .14, .78, .48)) {
    if (oval(x, y, .26, -.03, .16, .16)) return 'Y';
    if (oval(x, y, .27, -.03, .07, .07)) return 'D';
    if (y > .38) return 'B';
    return 'G';
  }
  if (x > .55 && y > -.08 && y < .12) return 'G';
  if (x < -.48 && y < -.2 && y > -.52) return 'G';
  if (x < -.42 && y > .36 && y < .72) return 'G';
  if (x > .25 && x < .58 && y > .48 && y < .7) return 'G';
  if (x < -.45 && y < -.32 && y > -.6) return 'O';
  return '.';
};

export const NEW_CREATURES_4: Art[] = [
  picture('Capybara', capybara),
  picture('Fox', fox),
  picture('Jellyfish', jellyfish),
  picture('Koala', koala),
  picture('Chameleon', chameleon),
];
