import type { Art } from './types';

type Paint = (x: number, y: number) => string;
const oval = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

function picture(name: string, paint: Paint): Art {
  const size = 22;
  return {
    name,
    rows: Array.from({ length: size }, (_, row) =>
      Array.from({ length: size }, (_, col) => paint((col + 0.5) / size * 2 - 1, (row + 0.5) / size * 2 - 1)).join('')),
  };
}

const redPanda: Paint = (x, y) => {
  const ear = (Math.abs(x) > 0.47 && y < -0.43 && y > -0.87) || (Math.abs(x) > 0.59 && y < -0.23 && y > -0.65);
  if (ear) return 'D';
  if (oval(x, y, 0, -0.05, 0.73, 0.79)) {
    if (y > 0.5) return 'N';
    if (oval(x, y, -0.3, -0.1, 0.23, 0.34) || oval(x, y, 0.3, -0.1, 0.23, 0.34)) return 'W';
    if (oval(x, y, -0.3, -0.13, 0.1, 0.12) || oval(x, y, 0.3, -0.13, 0.1, 0.12)) return 'D';
    if (oval(x, y, 0, 0.33, 0.34, 0.27)) return 'W';
    return 'O';
  }
  if (y > 0.53 && Math.abs(x) < 0.55) return 'N';
  return '.';
};

const pondFrog: Paint = (x, y) => {
  if (y > 0.53) return Math.abs(x) < 0.48 && y < 0.74 ? 'G' : 'B';
  if (oval(x, y, 0, 0.08, 0.66, 0.54)) {
    if (oval(x, y, -0.3, -0.21, 0.25, 0.27) || oval(x, y, 0.3, -0.21, 0.25, 0.27)) return 'W';
    if (oval(x, y, -0.3, -0.21, 0.09, 0.12) || oval(x, y, 0.3, -0.21, 0.09, 0.12)) return 'D';
    if (oval(x, y, 0, 0.25, 0.09, 0.07)) return 'G';
    return 'G';
  }
  if (y > 0.25 && Math.abs(x) > 0.35 && Math.abs(x) < 0.83) return 'G';
  if (y < -0.54 && Math.abs(x) < 0.06) return 'Y';
  return '.';
};

const sheep: Paint = (x, y) => {
  if (oval(x, y, 0.05, 0.15, 0.78, 0.57)) {
    if (x > 0.28 && y < 0.16 && oval(x, y, 0.42, -0.05, 0.4, 0.47)) {
      if (oval(x, y, 0.53, -0.12, 0.08, 0.1)) return 'W';
      if (y > 0.19) return 'D';
      return 'N';
    }
    return 'W';
  }
  if (y > 0.55 && Math.abs(x) > 0.33 && Math.abs(x) < 0.71) return 'D';
  return '.';
};

const seahorse: Paint = (x, y) => {
  if (oval(x, y, 0.08, -0.45, 0.37, 0.35)) {
    if (oval(x, y, 0.18, -0.51, 0.08, 0.09)) return 'O';
    return 'Y';
  }
  if (oval(x, y, -0.02, 0.02, 0.24, 0.61)) return y > 0.36 ? 'O' : 'Y';
  if (y > 0.34 && y < 0.7 && x < -0.04 && x > -0.56) return 'O';
  if (y > 0.55 && y < 0.87 && x > -0.38 && x < 0.26) return 'O';
  if (y > 0.67 && x > -0.13 && x < 0.48) return 'O';
  if (y > -0.05 && y < 0.35 && x > 0.14 && x < 0.54) return 'P';
  if (x < -0.4 && y < -0.55) return 'C';
  return '.';
};

const sleepyCat: Paint = (x, y) => {
  if (y < -0.35 && Math.abs(x) > 0.42 && Math.abs(x) < 0.77) return 'P';
  if (oval(x, y, 0, 0, 0.77, 0.72)) {
    if (y > 0.48) return 'K';
    if (y > -0.03 && y < 0.08 && Math.abs(x) > 0.22 && Math.abs(x) < 0.48) return 'D';
    if (oval(x, y, 0, 0.22, 0.12, 0.07)) return 'W';
    if (y > 0.26 && Math.abs(x) < 0.37) return 'W';
    return 'K';
  }
  if (y > 0.45 && x > 0.4 && x < 0.95) return 'K';
  return '.';
};

export const NEW_CREATURES_2: Art[] = [
  picture('Red Panda', redPanda),
  picture('Pond Frog', pondFrog),
  picture('Sheep', sheep),
  picture('Seahorse', seahorse),
  picture('Sleepy Cat', sleepyCat),
];
