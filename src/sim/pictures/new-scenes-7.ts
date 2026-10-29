import type { Art } from './types';

type Paint = (x: number, y: number) => string;
const oval = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

function picture(name: string, paint: Paint): Art {
  const n = 22;
  return { name, rows: Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => paint((x + .5) / n * 2 - 1, (y + .5) / n * 2 - 1)).join('')) };
}

const donutShop: Paint = (x, y) => {
  if (y > .56 && Math.abs(x) < .86) return y > .77 ? 'N' : 'W';
  if (y > -.42 && y < .58 && Math.abs(x) > .66 && Math.abs(x) < .82) return 'N';
  if (y > -.54 && y < -.39 && Math.abs(x) < .87) return 'K';
  if (oval(x, y, 0, .02, .38, .3)) return oval(x, y, 0, .02, .14, .11) ? 'N' : (y < .02 ? 'K' : 'O');
  if (y > -.82 && y < -.52 && Math.abs(x) < .5) return 'Y';
  return '.';
};

const starryPlanet: Paint = (x, y) => {
  if (oval(x, y, .1, .11, .65, .6)) {
    if (y < -.28) return 'P';
    if (Math.sin(x * 9 - y * 5) > .45) return 'C';
    return 'B';
  }
  if ((Math.abs(x + .72) < .07 && Math.abs(y + .58) < .07) || (Math.abs(x - .75) < .06 && Math.abs(y - .46) < .06) || (Math.abs(x + .56) < .045 && Math.abs(y - .72) < .045)) return 'Y';
  return '.';
};

const picnicBasket: Paint = (x, y) => {
  if (y > .14 && y < .77 && Math.abs(x) < .65) return y < .25 || Math.abs(x) > .52 ? 'N' : (Math.abs(x) < .07 ? 'Y' : 'O');
  if (oval(x, y, 0, .1, .46, .53) && y < .22) return 'N';
  if (oval(x, y, -.38, -.33, .23, .17)) return 'R';
  if (oval(x, y, .34, -.34, .24, .18)) return 'G';
  return '.';
};

const potionShelf: Paint = (x, y) => {
  if (Math.abs(x) > .77 || y < -.84 || y > .82) return '.';
  if (Math.abs(x) > .67 || [-.25, .38].some(a => Math.abs(y - a) < .07)) return 'N';
  const bottle = (cx: number, color: string) => Math.abs(x - cx) < .16 && y > -.62 && y < -.28 ? color : '';
  if (bottle(-.4, 'P') || bottle(0, 'C') || bottle(.4, 'K')) return bottle(-.4, 'P') || bottle(0, 'C') || bottle(.4, 'K');
  if (y > -.08 && y < .28) return x < -.18 ? 'Y' : x < .22 ? 'G' : 'R';
  return 'D';
};

const springPond: Paint = (x, y) => {
  if (oval(x, y, 0, .31, .92, .5)) return y > .48 ? 'G' : 'C';
  if (oval(x, y, -.34, .18, .25, .12)) return 'G';
  if (oval(x, y, .37, .27, .22, .1)) return 'Y';
  if (Math.abs(x) < .06 && y > -.58 && y < -.06) return 'G';
  if (oval(x, y, 0, -.61, .18, .16)) return 'K';
  return '.';
};

export const NEW_SCENES_7: Art[] = [
  picture('Donut Shop', donutShop),
  picture('Starry Planet', starryPlanet),
  picture('Picnic Basket', picnicBasket),
  picture('Potion Shelf', potionShelf),
  picture('Spring Pond', springPond),
];
