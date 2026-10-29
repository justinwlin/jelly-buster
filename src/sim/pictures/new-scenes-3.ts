import type { Art } from './types';

// Five complete little scenes, each drawn directly onto the campaign's 22×22 canvas.
type Paint = (x: number, y: number) => string;
const oval = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const picture = (name: string, paint: Paint): Art => ({
  name,
  rows: Array.from({ length: 22 }, (_, j) =>
    Array.from({ length: 22 }, (_, i) => paint((i + 0.5) / 11 - 1, (j + 0.5) / 11 - 1)).join('')),
});

const windmill: Paint = (x, y) => {
  if (y > 0.63) return 'G';
  if (y > -0.05 && y < 0.67 && Math.abs(x) < 0.33 - (y + 0.05) * 0.17) return y > 0.4 ? 'N' : 'W';
  if (oval(x, y, 0, 0.48, 0.1, 0.17)) return 'D';
  if (Math.abs(x) < 0.065 && y > -0.9 && y < 0.15) return 'D';
  if (Math.abs(y + 0.34) < 0.065 && Math.abs(x) < 0.8) return 'R';
  if (Math.abs(x - y - 0.34) < 0.07 && y < -0.1 && y > -0.88) return 'Y';
  if (Math.abs(x + y + 0.34) < 0.07 && y < -0.1 && y > -0.88) return 'Y';
  return '.';
};

const strawberryCake: Paint = (x, y) => {
  if (y > 0.54 && y < 0.8 && Math.abs(x) < 0.79) return 'N';
  if (y > 0.18 && y < 0.58 && Math.abs(x) < 0.76) return y > 0.42 ? 'W' : 'Y';
  if (y > -0.1 && y < 0.2 && Math.abs(x) < 0.72) return 'K';
  if (oval(x, y, -0.35, -0.34, 0.24, 0.22) || oval(x, y, 0.34, -0.28, 0.24, 0.22)) return 'R';
  if (oval(x, y, -0.35, -0.34, 0.06, 0.06) || oval(x, y, 0.34, -0.28, 0.06, 0.06)) return 'Y';
  if (y > -0.56 && y < -0.1 && Math.abs(x) < 0.085) return 'G';
  return '.';
};

const moonlitTent: Paint = (x, y) => {
  if (y > 0.61) return 'G';
  if (oval(x, y, 0.48, -0.48, 0.27, 0.27)) return 'Y';
  if (y > -0.63 && y < 0.62 && Math.abs(x) < 0.82 - (y + 0.63) * 0.73) {
    if (Math.abs(x) < 0.11 && y > 0.08) return 'Y';
    return x < 0 ? 'P' : 'K';
  }
  if (Math.abs(x + 0.7) < 0.05 && y < -0.45) return 'W';
  return 'B';
};

const rainbowParrot: Paint = (x, y) => {
  if (oval(x, y, -0.1, 0.05, 0.53, 0.72)) {
    if (x > 0.28 && y < 0.15) return 'Y';
    if (y < -0.35) return 'R';
    if (y < -0.02) return 'O';
    if (y < 0.3) return 'G';
    return 'B';
  }
  if (oval(x, y, -0.47, 0.37, 0.45, 0.25)) return 'P';
  if (oval(x, y, 0.18, -0.24, 0.065, 0.075)) return 'D';
  return '.';
};

const tinySubmarine: Paint = (x, y) => {
  if (y > 0.62) return 'C';
  if (oval(x, y, 0, 0.2, 0.77, 0.4)) {
    if (oval(x, y, 0.25, 0.08, 0.17, 0.17)) return 'W';
    if (x < -0.42) return 'Y';
    return 'O';
  }
  if (y > -0.35 && y < 0.02 && Math.abs(x) < 0.21) return 'O';
  if (y > -0.56 && y < -0.31 && Math.abs(x) < 0.11) return 'D';
  if (x > 0.72 && Math.abs(y - 0.18) < 0.14) return 'R';
  if (oval(x, y, -0.7, -0.38, 0.07, 0.07) || oval(x, y, -0.52, -0.58, 0.05, 0.05)) return 'W';
  return 'B';
};

export const NEW_SCENES_3: Art[] = [
  picture('Windmill', windmill),
  picture('Strawberry Cake', strawberryCake),
  picture('Moonlit Tent', moonlitTent),
  picture('Rainbow Parrot', rainbowParrot),
  picture('Tiny Submarine', tinySubmarine),
];
