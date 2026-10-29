import type { Art } from './types';

type Paint = (x: number, y: number) => string;
const oval = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

function picture(name: string, paint: Paint): Art {
  const size = 22;
  return { name, rows: Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => paint((x + .5) / size * 2 - 1, (y + .5) / size * 2 - 1)).join('')) };
}

const otter: Paint = (x, y) => {
  if (oval(x, y, 0, 0.1, .78, .62)) {
    if (oval(x, y, -.28, -.06, .16, .13) || oval(x, y, .28, -.06, .16, .13)) return 'D';
    if (oval(x, y, 0, .24, .30, .19)) return 'W';
    if (Math.abs(x) < .08 && y > .18 && y < .35) return 'D';
    return 'N';
  }
  if (oval(x, y, -.48, -.57, .22, .2) || oval(x, y, .48, -.57, .22, .2)) return 'N';
  if (y > .55 && Math.abs(x) > .28 && Math.abs(x) < .7) return 'N';
  return '.';
};

const raccoon: Paint = (x, y) => {
  if (oval(x, y, 0, .05, .76, .69)) {
    if (oval(x, y, -.27, -.04, .30, .24) || oval(x, y, .27, -.04, .30, .24)) return 'D';
    if (oval(x, y, 0, .25, .28, .19)) return 'W';
    if (Math.abs(x) < .07 && y > .18 && y < .35) return 'D';
    return 'G';
  }
  if (oval(x, y, -.46, -.57, .22, .21) || oval(x, y, .46, -.57, .22, .21)) return 'D';
  if (y > .62 && Math.abs(x) > .3 && Math.abs(x) < .67) return 'D';
  return '.';
};

const narwhal: Paint = (x, y) => {
  if (oval(x, y, -.05, .13, .86, .52)) {
    if (oval(x, y, .22, .05, .14, .14)) return 'D';
    if (y > .35) return 'B';
    return 'C';
  }
  if (x > .55 && y < .02 && y > -.18) return 'C';
  if (x < -.55 && y < -.05 && y > -.4) return 'C';
  if (x > -.16 && x < .22 && y < -.35) return y < -.65 ? 'W' : 'Y';
  return '.';
};

const owl: Paint = (x, y) => {
  if (oval(x, y, 0, .08, .72, .75)) {
    if (oval(x, y, -.28, -.1, .23, .23) || oval(x, y, .28, -.1, .23, .23)) return 'W';
    if ((Math.abs(x + .28) < .07 || Math.abs(x - .28) < .07) && y > -.17 && y < -.02) return 'D';
    if (Math.abs(x) < .15 && y > .13 && y < .33) return 'Y';
    if (y > .48) return 'N';
    return 'P';
  }
  if (x < -.4 && y < -.42 && y > -.77) return 'P';
  if (x > .4 && y < -.42 && y > -.77) return 'P';
  return '.';
};

const hedgehog: Paint = (x, y) => {
  if (oval(x, y, -.07, .18, .86, .57)) {
    if (x < -.12 && y < .18) return 'N';
    if (oval(x, y, .35, .26, .48, .42)) {
      if (oval(x, y, .32, .16, .13, .13)) return 'D';
      if (y > .42) return 'W';
      return 'O';
    }
    return 'N';
  }
  if (x < -.65 && y < -.15 && y > -.6) return 'N';
  return '.';
};

export const NEW_CREATURES_3: Art[] = [
  picture('Otter', otter),
  picture('Raccoon', raccoon),
  picture('Narwhal', narwhal),
  picture('Owl', owl),
  picture('Hedgehog', hedgehog),
];
