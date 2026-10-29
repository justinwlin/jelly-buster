import type { Art } from './types';

type Paint = (x: number, y: number) => string;
const oval = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

function picture(name: string, paint: Paint): Art {
  const n = 22;
  return { name, rows: Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => paint((x + .5) / n * 2 - 1, (y + .5) / n * 2 - 1)).join('')) };
}

const lanternFestival: Paint = (x, y) => {
  if (y > .64) return 'D';
  if (Math.abs(x + .55) < .035 && y > -.76 && y < .5) return 'N';
  if (Math.abs(x - .52) < .035 && y > -.48 && y < .55) return 'N';
  if (Math.abs(x) < .035 && y > -.9 && y < .25) return 'N';
  const at = [[-.55, -.35], [0, -.64], [.52, -.1]].find(([a, b]) => oval(x, y, a, b, .22, .24));
  if (at) return y < at[1] - .12 ? 'Y' : 'R';
  return '.';
};

const cozyBookshelf: Paint = (x, y) => {
  if (Math.abs(x) > .78 || y < -.88 || y > .86) return '.';
  if (Math.abs(x) > .66 || y < -.72 || y > .72 || [-.25, .25].some(a => Math.abs(y - a) < .055)) return 'N';
  if (y < -.28) return x < -.18 ? 'R' : x < .18 ? 'Y' : 'B';
  if (y < .22) return x < -.4 ? 'P' : x < 0 ? 'G' : x < .42 ? 'Y' : 'R';
  if (x > .18 && oval(x, y, .43, .43, .24, .23)) return 'W';
  return x < -.24 ? 'B' : x < .18 ? 'P' : 'G';
};

const sushiPlate: Paint = (x, y) => {
  if (oval(x, y, 0, .36, .88, .43)) return y > .55 ? 'B' : 'W';
  if (oval(x, y, -.42, .03, .28, .26)) return oval(x, y, -.42, .03, .23, .19) ? 'R' : 'D';
  if (oval(x, y, .18, -.1, .3, .27)) return oval(x, y, .18, -.1, .15, .13) ? 'O' : 'D';
  if (oval(x, y, .55, .18, .2, .21)) return oval(x, y, .55, .18, .1, .1) ? 'G' : 'D';
  return '.';
};

const cactusSunset: Paint = (x, y) => {
  const trunk = Math.abs(x + .2) < .13 && y > -.04 && y < .67;
  const leftArm = x < -.2 && x > -.55 && y > .12 && y < .28;
  const rightArm = x > -.08 && x < .34 && y > -.2 && y < -.04;
  const armUp = (x < -.43 && y > -.18 && y < .27) || (x > .2 && y > -.4 && y < -.03);
  if (trunk || leftArm || rightArm || armUp) return 'G';
  if (y > .58) return 'O';
  if (oval(x, y, .42, -.42, .34, .34)) return 'Y';
  if (y > -.75 && y <= .58) return 'P';
  return 'P';
};

const snowGlobe: Paint = (x, y) => {
  if (y > .6 && Math.abs(x) < .66) return y < .76 ? 'N' : 'D';
  if (!oval(x, y, 0, -.08, .7, .72)) return '.';
  if (y > .43) return 'W';
  if (Math.abs(x) < .08 && y > -.33 && y < .42) return 'G';
  if (y > -.04 && Math.abs(x) < .38 - y * .32) return 'G';
  if ((Math.abs(x + .33) < .04 && y < -.28) || (Math.abs(x - .34) < .04 && y < .13) || (Math.abs(x) < .04 && y < -.58)) return 'W';
  return 'C';
};

export const NEW_SCENES_6: Art[] = [
  picture('Lantern Festival', lanternFestival),
  picture('Cozy Bookshelf', cozyBookshelf),
  picture('Sushi Plate', sushiPlate),
  picture('Cactus Sunset', cactusSunset),
  picture('Snow Globe', snowGlobe),
];
