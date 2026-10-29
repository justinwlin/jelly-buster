import type { Art } from './types';

// Scene pictures are sampled onto the same small grid as the rest of the campaign.
type Paint = (x: number, y: number) => string;
const oval = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const picture = (name: string, paint: Paint): Art => ({
  name,
  rows: Array.from({ length: 22 }, (_, j) =>
    Array.from({ length: 22 }, (_, i) => paint((i + 0.5) / 11 - 1, (j + 0.5) / 11 - 1)).join('')),
});

const koiPond: Paint = (x, y) => {
  // A nearly full composition: water, lily pads and two curved orange koi.
  if (oval(x, y, -0.33, -0.25, 0.21, 0.11) || oval(x, y, 0.42, 0.42, 0.18, 0.1)) return 'G';
  if (oval(x, y, -0.5, 0.55, 0.1, 0.07) || oval(x, y, 0.55, -0.58, 0.12, 0.07)) return 'K';
  const koiA = oval(x, y, -0.2, 0.15, 0.48, 0.17) && y > 0.13 - 0.4 * x;
  const koiB = oval(x, y, 0.25, -0.32, 0.38, 0.14) && y < -0.28 + 0.35 * x;
  if (koiA || koiB) return Math.abs(x + y) < 0.07 ? 'W' : 'O';
  if (Math.abs((x * 8 + y * 5) % 1) < 0.055) return 'C';
  return 'B';
};

const cozyHouse: Paint = (x, y) => {
  if (y > 0.7) return 'G';
  if (y > -0.08 && y < 0.72 && Math.abs(x) < 0.62) {
    if (oval(x, y, 0, 0.57, 0.19, 0.33)) return 'D';
    if (y > 0.05 && y < 0.3 && (Math.abs(x - 0.36) < 0.11 || Math.abs(x + 0.36) < 0.11)) return 'Y';
    return 'W';
  }
  if (y > -0.75 && y < 0.1 && Math.abs(x) < 0.83 - (y + 0.75) * 0.72) return y < -0.18 ? 'R' : 'N';
  if (y > -0.93 && y < -0.48 && x > 0.38 && x < 0.57) return 'D';
  if (x < -0.67 && y > 0.18 && y < 0.73) return 'G';
  return '.';
};

const sunflower: Paint = (x, y) => {
  if (y > 0.05 && y < 0.88 && Math.abs(x) < 0.09) return 'G';
  if (y > 0.42 && y < 0.82 && x < -0.05 && x > -0.52 + y * 0.25) return 'G';
  if (y > 0.28 && y < 0.72 && x > 0.05 && x < 0.55 - y * 0.3) return 'G';
  const d = Math.hypot(x, y + 0.32);
  if (d < 0.75 && d > 0.29) return 'Y';
  if (d <= 0.34) return 'N';
  return '.';
};

const sailboat: Paint = (x, y) => {
  if (y > 0.48) return y > 0.78 ? 'B' : 'C';
  if (y > -0.6 && y < 0.5 && Math.abs(x) < 0.055) return 'D';
  if (y > -0.48 && y < 0.35 && x > 0.03 && x < 0.68 - y * 0.55) return 'W';
  if (y > -0.35 && y < 0.24 && x < -0.04 && x > -0.62 + y * 0.38) return 'R';
  if (y > 0.25 && y < 0.6 && Math.abs(x) < 0.72 - (y - 0.25) * 1.1) return 'N';
  if (oval(x, y, -0.64, -0.58, 0.18, 0.18)) return 'Y';
  return '.';
};

const treasureMap: Paint = (x, y) => {
  // Deliberately broad parchment picture, but below a full 22×22 fill.
  if (Math.abs(x) < 0.89 && Math.abs(y) < 0.8) {
    if (Math.abs(x) > 0.8 || Math.abs(y) > 0.7) return 'N';
    if (Math.abs(y - 0.23 * Math.sin((x + 0.4) * 7)) < 0.065) return 'R';
    if (oval(x, y, 0.42, -0.33, 0.18, 0.18)) return 'G';
    if (Math.abs(x + 0.35) < 0.08 && Math.abs(y - 0.25) < 0.08) return 'D';
    return 'Y';
  }
  return '.';
};

export const NEW_SCENES_2: Art[] = [
  picture('Koi Pond', koiPond),
  picture('Cozy House', cozyHouse),
  picture('Sunflower', sunflower),
  picture('Sailboat', sailboat),
  picture('Treasure Map', treasureMap),
];
