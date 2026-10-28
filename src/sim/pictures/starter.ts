// Starter pack: bold, simple icons drawn from shape math, mostly 2–3 colors.
import type { Art } from './types';

type Paint = (x: number, y: number) => string;

/** Sample a paint function over a size×size grid in [-1, 1] coordinates. */
function draw(name: string, size: number, paint: Paint): Art {
  const rows: string[] = [];
  for (let j = 0; j < size; j++) {
    let line = '';
    for (let i = 0; i < size; i++) line += paint(((i + 0.5) / size) * 2 - 1, ((j + 0.5) / size) * 2 - 1);
    rows.push(line);
  }
  return { name, rows };
}

const r2 = (x: number, y: number) => x * x + y * y;
const disc = (x: number, y: number, cx: number, cy: number, r: number) => r2(x - cx, y - cy) <= r * r;

const yinYang: Paint = (x, y) => {
  if (r2(x, y) > 1) return '.';
  if (disc(x, y, 0, -0.5, 0.16)) return 'Y';
  if (disc(x, y, 0, 0.5, 0.16)) return 'P';
  if (disc(x, y, 0, -0.5, 0.5)) return 'P';
  if (disc(x, y, 0, 0.5, 0.5)) return 'Y';
  return x < 0 ? 'P' : 'Y';
};

const heart: Paint = (x, y) => {
  const X = x * 1.2;
  const Y = -y * 1.2 + 0.3;
  if ((X * X + Y * Y - 1) ** 3 - X * X * Y ** 3 > 0) return '.';
  return disc(x, y, -0.42, -0.35, 0.16) ? 'W' : 'R';
};

const smiley: Paint = (x, y) => {
  if (r2(x, y) > 1) return '.';
  if (disc(x, y, -0.35, -0.3, 0.15) || disc(x, y, 0.35, -0.3, 0.15)) return 'D';
  const m = r2(x, y - 0.05);
  if (y > 0.2 && m < 0.42 && m > 0.2) return 'D';
  if (disc(x, y, -0.6, 0.15, 0.14) || disc(x, y, 0.6, 0.15, 0.14)) return 'K';
  return 'Y';
};

const STAR = Array.from({ length: 10 }, (_, i) => {
  const a = -Math.PI / 2 + (i * Math.PI) / 5;
  const r = i % 2 ? 0.42 : 1;
  return [Math.cos(a) * r, Math.sin(a) * r + 0.08];
});
function inPoly(x: number, y: number, poly: number[][]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const star: Paint = (x, y) => {
  if (!inPoly(x, y, STAR)) return '.';
  return inPoly(x * 1.6, (y - 0.08) * 1.6 + 0.08, STAR) ? 'Y' : 'O';
};

const moon: Paint = (x, y) => {
  if (disc(x, y, 0.05, 0, 0.92) && !disc(x, y, 0.45, -0.18, 0.72)) return 'Y';
  if (disc(x, y, 0.62, 0.42, 0.13) || disc(x, y, 0.35, 0.75, 0.09) || disc(x, y, 0.8, -0.7, 0.1)) return 'W';
  return r2(x, y) <= 1 ? 'B' : '.';
};

const sun: Paint = (x, y) => {
  const r = Math.hypot(x, y);
  if (r < 0.55) {
    if (disc(x, y, -0.2, -0.1, 0.08) || disc(x, y, 0.2, -0.1, 0.08)) return 'D';
    if (y > 0.12 && y < 0.28 && Math.abs(x) < 0.25 - (y - 0.2) * 0.5) return 'D';
    return 'Y';
  }
  const a = Math.atan2(y, x);
  const ray = Math.cos(a * 8);
  return r < 0.98 && ray > 0.35 && r > 0.62 ? 'O' : '.';
};

const beachBall: Paint = (x, y) => {
  if (r2(x, y) > 1) return '.';
  if (r2(x, y) < 0.05) return 'W';
  const a = (Math.atan2(y, x) + Math.PI) / (Math.PI * 2);
  return ['R', 'W', 'B', 'W', 'Y', 'W'][Math.floor(a * 6) % 6];
};

const bullseye: Paint = (x, y) => {
  const r = Math.hypot(x, y);
  if (r > 1) return '.';
  return ['R', 'W', 'R', 'W', 'R'][Math.min(4, Math.floor(r * 5))];
};

const rainbow: Paint = (x, y) => {
  const cy = 0.5;
  const r = Math.hypot(x, y - cy);
  if (y < cy + 0.05 && r <= 1.05 && r > 0.33) return ['P', 'B', 'G', 'Y', 'O', 'R'][Math.min(5, Math.floor((r - 0.33) / 0.12))];
  if (disc(x, y, -0.72, 0.68, 0.24) || disc(x, y, -0.45, 0.75, 0.2) || disc(x, y, 0.72, 0.68, 0.24) || disc(x, y, 0.45, 0.75, 0.2)) return 'W';
  return '.';
};

const balloon: Paint = (x, y) => {
  if (r2(x / 0.8, (y + 0.22) / 0.75) <= 1) return disc(x, y, -0.3, -0.5, 0.13) ? 'W' : 'K';
  if (y > 0.5 && y < 0.62 && Math.abs(x) < 0.12) return 'K';
  if (y >= 0.62 && Math.abs(x - Math.sin(y * 9) * 0.08) < 0.12) return 'D';
  return '.';
};

const umbrella: Paint = (x, y) => {
  if (y < 0.05 && r2(x, y - 0.05) <= 0.95 && !(y > -0.08 && (Math.abs(x - 0.32) < 0.18 || Math.abs(x + 0.32) < 0.18 || Math.abs(x) > 0.82)))
    return Math.floor((x + 1) * 3) % 2 ? 'B' : 'C';
  if (y >= -0.1 && Math.abs(x) < 0.07 && y < 0.8) return 'N';
  if (y >= 0.68 && y < 0.92 && x < 0 && x > -0.32 && (y > 0.8 || x < -0.22)) return 'N';
  return '.';
};

const clover: Paint = (x, y) => {
  const leaf = (cx: number, cy: number) => disc(x, y, cx - 0.17, cy, 0.25) || disc(x, y, cx + 0.17, cy, 0.25) || disc(x, y, cx, cy + 0.14, 0.24);
  if (leaf(0, -0.55) || leaf(-0.48, -0.1) || leaf(0.48, -0.1)) return 'G';
  if (y > -0.1 && Math.abs(x - (y - 0.1) * 0.35) < 0.08 && y < 0.95) return 'N';
  return '.';
};

export const STARTER: Art[] = [
  draw('Yin-yang', 20, yinYang),
  draw('Heart', 20, heart),
  draw('Smiley', 20, smiley),
  draw('Star', 21, star),
  draw('Moon', 20, moon),
  draw('Bullseye', 20, bullseye),
  draw('Sun', 22, sun),
  draw('Beach ball', 20, beachBall),
  draw('Balloon', 20, balloon),
  draw('Clover', 20, clover),
  draw('Rainbow', 22, rainbow),
  draw('Umbrella', 22, umbrella),
];
