import type { Art } from './types';

// Each paint function describes one complete picture, sampled into a 22×22 grid.
// Empty cells stay transparent; the night garden deliberately fills its canvas.
type Paint = (x: number, y: number) => string;
const oval = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

function picture(name: string, paint: Paint): Art {
  const size = 22;
  return {
    name,
    rows: Array.from({ length: size }, (_, j) =>
      Array.from({ length: size }, (_, i) => paint((i + 0.5) / size * 2 - 1, (j + 0.5) / size * 2 - 1)).join('')),
  };
}

const hotAirBalloon: Paint = (x, y) => {
  if (y > 0.52 && y < 0.88 && Math.abs(x) < 0.34) return y < 0.62 ? 'D' : 'N';
  if (y > 0.2 && y <= 0.58 && (Math.abs(x + 0.22) < 0.055 || Math.abs(x - 0.22) < 0.055)) return 'D';
  if (oval(x, y, 0, -0.34, 0.77, 0.63)) {
    if (y > 0.08) return 'N';
    if (Math.abs(x) < 0.22) return 'Y';
    if (Math.abs(x) < 0.48) return 'W';
    return 'R';
  }
  return '.';
};

const teapot: Paint = (x, y) => {
  // A clear looping handle and a long spout give the shape its identity.
  const handle = oval(x, y, 0.63, 0.02, 0.35, 0.37) && !oval(x, y, 0.63, 0.02, 0.19, 0.22);
  if (handle) return 'C';
  if (y > -0.28 && y < 0.06 && x < -0.4 && x > -0.94 && y < -0.06 - (x + 0.94) * 0.22) return 'C';
  if (oval(x, y, 0, 0.2, 0.66, 0.54)) {
    if (oval(x, y, -0.25, -0.06, 0.17, 0.14)) return 'W';
    if (y > 0.46) return 'B';
    return 'C';
  }
  if (y > -0.38 && y < -0.25 && Math.abs(x) < 0.43) return 'B';
  if (oval(x, y, 0, -0.43, 0.2, 0.15)) return 'N';
  return '.';
};

const castle: Paint = (x, y) => {
  if (y > 0.72 && y < 0.9 && Math.abs(x) < 0.88) return 'G';
  if (y > -0.78 && y < -0.31 && Math.abs(x + 0.62) < 0.06) return 'N';
  if (y > -0.78 && y < -0.55 && x > -0.62 && x < -0.31) return 'Y';
  if (y > -0.5 && y < 0.78 && (Math.abs(x + 0.64) < 0.22 || Math.abs(x - 0.64) < 0.22)) {
    if (y < -0.28) return 'P';
    if (y < 0.14 && y > -0.06 && (Math.abs(x + 0.64) < 0.065 || Math.abs(x - 0.64) < 0.065)) return 'Y';
    return 'W';
  }
  if (y > -0.55 && y < -0.23 && Math.abs(x) < 0.47 - (y + 0.55) * 0.75) return 'P';
  if (y >= -0.23 && y < 0.78 && Math.abs(x) < 0.45) {
    if (y > 0.34 && oval(x, y, 0, 0.68, 0.18, 0.42)) return 'D';
    if (y > -0.02 && y < 0.16 && Math.abs(x) < 0.09) return 'Y';
    return 'W';
  }
  return '.';
};

const rocket: Paint = (x, y) => {
  if (y > 0.5 && y < 0.93 && Math.abs(x) < 0.2 - (y - 0.5) * 0.2) return y < 0.71 ? 'Y' : 'O';
  if (y > 0.23 && y < 0.66 && Math.abs(x) < 0.68 && Math.abs(x) > 0.22) return 'R';
  if (oval(x, y, 0, -0.06, 0.37, 0.69)) {
    if (y < -0.49) return 'R';
    if (oval(x, y, 0, -0.17, 0.2, 0.21)) return 'B';
    if (y > 0.32) return 'D';
    return 'W';
  }
  return '.';
};

const nightGarden: Paint = (x, y) => {
  // One edge-to-edge illustration: moonlit sky, hills, a little flower garden.
  if (y > 0.54 + 0.08 * Math.sin((x + 0.1) * 7)) {
    if (y < 0.69 && Math.abs(x + 0.43) < 0.09) return 'K';
    if (y < 0.77 && Math.abs(x - 0.48) < 0.1) return 'Y';
    return 'G';
  }
  if (y > 0.33 + 0.09 * Math.sin((x - 0.2) * 5)) return 'D';
  if (oval(x, y, 0.43, -0.4, 0.32, 0.32)) return 'Y';
  if ((Math.abs(x + 0.69) < 0.07 && y < -0.56) ||
      (Math.abs(x + 0.24) < 0.07 && y > -0.26 && y < -0.12) ||
      (Math.abs(x - 0.3) < 0.07 && y < -0.73)) return 'W';
  return 'B';
};

export const NEW_OBJECTS: Art[] = [
  picture('Hot Air Balloon', hotAirBalloon),
  picture('Teapot', teapot),
  picture('Castle', castle),
  picture('Rocket', rocket),
  picture('Night Garden', nightGarden),
];
