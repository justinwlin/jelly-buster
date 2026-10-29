import type { Art } from './types';

type Paint = (x: number, y: number) => string;
const oval = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

function picture(name: string, paint: Paint): Art {
  const size = 22;
  return { name, rows: Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => paint((x + 0.5) / size * 2 - 1, (y + 0.5) / size * 2 - 1)).join('')) };
}

const campfire: Paint = (x, y) => {
  if (y > 0.5 && Math.abs(x) < 0.85) return Math.abs(x) < 0.08 ? 'N' : (x * y > 0 ? 'N' : 'D');
  if (y > -0.1 && y < 0.64 && Math.abs(x) < 0.44 - Math.max(0, y) * 0.25) {
    if (y < 0.18 && Math.abs(x) < 0.17) return 'Y';
    return y < 0.39 ? 'O' : 'R';
  }
  if (y > -0.58 && y < -0.1 && Math.abs(x) < 0.2 - (y + 0.58) * 0.1) return 'Y';
  return '.';
};

const ramenBowl: Paint = (x, y) => {
  if (y > 0.15 && y < 0.78 && oval(x, y, 0, 0.22, 0.78, 0.58)) return y > 0.55 ? 'B' : 'R';
  if (y > -0.1 && y < 0.3 && Math.abs(x) < 0.72) return 'W';
  if (y > -0.33 && y < 0.1 && Math.abs(x) < 0.58) {
    if (Math.abs(x + 0.25) < 0.1 || Math.abs(x - 0.25) < 0.1) return 'G';
    return 'Y';
  }
  if (y < -0.1 && y > -0.86 && (Math.abs(x + 0.27) < 0.055 || Math.abs(x - 0.27) < 0.055)) return 'N';
  return '.';
};

const fairyMushroom: Paint = (x, y) => {
  if (y > 0.28 && y < 0.88 && Math.abs(x) < 0.27) return y > 0.72 ? 'N' : 'W';
  if (y > -0.43 && y < 0.34 && oval(x, y, 0, -0.03, 0.82, 0.48)) {
    if (oval(x, y, -0.29, -0.08, 0.13, 0.13) || oval(x, y, 0.3, 0.02, 0.13, 0.13)) return 'Y';
    return 'P';
  }
  if (y < -0.32 && y > -0.68 && Math.abs(x) < 0.16 - (y + 0.68) * 0.12) return 'P';
  if (y > 0.48 && Math.abs(x) > 0.3 && Math.abs(x) < 0.68 && y < 0.76) return 'G';
  return '.';
};

const vintageCamera: Paint = (x, y) => {
  if (y > -0.2 && y < 0.72 && Math.abs(x) < 0.82) {
    if (oval(x, y, 0.16, 0.25, 0.32, 0.32)) return 'D';
    if (oval(x, y, 0.16, 0.25, 0.2, 0.2)) return 'C';
    if (y < -0.02 && x < -0.32) return 'Y';
    return 'N';
  }
  if (y > -0.5 && y < -0.19 && x > -0.48 && x < 0.1) return 'D';
  if (y > -0.4 && y < -0.2 && x > 0.3 && x < 0.55) return 'N';
  return '.';
};

const iceCreamTruck: Paint = (x, y) => {
  if (y > 0.22 && y < 0.77 && x > -0.88 && x < 0.86) {
    if (y > 0.56 && (oval(x, y, -0.48, 0.67, 0.17, 0.17) || oval(x, y, 0.48, 0.67, 0.17, 0.17))) return 'D';
    if (x > 0.45 && y < 0.42) return 'W';
    if (y < 0.38 && x < 0.25) return 'K';
    return 'B';
  }
  if (y > -0.02 && y < 0.22 && x > -0.75 && x < 0.2) return 'W';
  if (y > -0.37 && y < 0.02 && x > -0.55 && x < -0.18) return 'Y';
  if (y < -0.35 && y > -0.78 && oval(x, y, -0.37, -0.51, 0.23, 0.27)) return y < -0.55 ? 'K' : 'W';
  return '.';
};

export const NEW_SCENES_5: Art[] = [
  picture('Campfire', campfire),
  picture('Ramen Bowl', ramenBowl),
  picture('Fairy Mushroom', fairyMushroom),
  picture('Vintage Camera', vintageCamera),
  picture('Ice Cream Truck', iceCreamTruck),
];
