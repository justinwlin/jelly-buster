// Render the app icons with the game's own jelly renderer (src/game/jelly.ts).
// Usage: npm run icons → public/icons/*.png
import { chromium } from 'playwright';
import { buildSync } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { browserPath } from './browser';

const jelly = buildSync({ entryPoints: ['src/game/jelly.ts'], bundle: true, format: 'iife', globalName: 'J', write: false }).outputFiles[0].text;

/** Draws the icon scene at `size` px. `pad` shrinks the art into the maskable safe zone. */
const scene = `
function drawIcon(size, pad, round) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const S = size;
  if (round) { x.beginPath(); x.roundRect(0, 0, S, S, S * 0.22); x.clip(); }
  // Candy sky.
  const g = x.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, '#7fd0ff'); g.addColorStop(0.55, '#8f9cff'); g.addColorStop(1, '#b98af0');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  const glow = x.createRadialGradient(S * 0.5, S * 0.45, 0, S * 0.5, S * 0.45, S * 0.6);
  glow.addColorStop(0, 'rgba(255,255,255,0.55)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = glow; x.fillRect(0, 0, S, S);
  x.save(); x.globalAlpha = 0.08; x.strokeStyle = '#fff'; x.lineWidth = S * 0.05;
  for (let i = -S; i < S * 2; i += S * 0.16) { x.beginPath(); x.moveTo(i, S); x.lineTo(i + S, 0); x.stroke(); }
  x.restore();

  const k = 1 - pad * 2;
  x.translate(S * pad, S * pad);
  x.scale(k, k);

  // Pixel cubes floating around, like the pictures the jellies munch.
  const cube = (cx, cy, s, col) => {
    x.save(); x.translate(cx, cy);
    x.fillStyle = J.shade(col, -0.42); x.beginPath(); x.roundRect(-s / 2, -s / 2, s, s, s * 0.2); x.fill();
    const cg = x.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2);
    cg.addColorStop(0, J.shade(col, 0.25)); cg.addColorStop(1, J.shade(col, -0.05));
    x.fillStyle = cg; x.beginPath(); x.roundRect(-s / 2, -s / 2, s, s * 0.84, s * 0.2); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.5)'; x.beginPath(); x.roundRect(-s * 0.32, -s * 0.34, s * 0.34, s * 0.14, s * 0.07); x.fill();
    x.restore();
  };
  const u = S / 10;
  // A little pixel heart top-left and scattered cubes.
  const heart = ['.RR.RR.', 'RRRRRRR', 'RRRRRRR', '.RRRRR.', '..RRR..', '...R...'];
  heart.forEach((row, j) => [...row].forEach((ch, i) => ch === 'R' && cube(u * 0.9 + i * u * 0.42, u * 1.0 + j * u * 0.42, u * 0.4, '#ff6fb5')));
  [[7.6, 1.3, '#ffd21f'], [8.5, 1.3, '#ffd21f'], [8.05, 2.2, '#3fcf5c'], [8.95, 2.2, '#2f8cff'], [1.2, 8.3, '#ffd21f'], [8.7, 8.4, '#9b3df0'], [9.1, 7.5, '#27d8e0']]
    .forEach(([cx, cy, col]) => cube(cx * u, cy * u, u * 0.82, col));
  // Shots flying up from the jelly.
  [[3.2, 2.9, '#ffd21f'], [6.9, 3.2, '#ff6fb5']].forEach(([cx, cy, col]) => {
    x.fillStyle = col; x.globalAlpha = 0.45; x.beginPath(); x.arc(cx * u, (cy + 0.55) * u, u * 0.2, 0, Math.PI * 2); x.fill();
    x.globalAlpha = 1; x.beginPath(); x.arc(cx * u, cy * u, u * 0.28, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.8)'; x.beginPath(); x.arc((cx - 0.08) * u, (cy - 0.08) * u, u * 0.1, 0, Math.PI * 2); x.fill();
  });
  // A yellow buddy peeking from behind, then the hero jelly.
  J.drawJelly(x, u * 7.35, u * 6.75, u * 3.1, '#ffd21f', '', { face: true, mood: 'happy', look: { x: -0.6, y: 0 } });
  J.drawJelly(x, u * 4.6, u * 5.75, u * 6.4, '#ff3d5f', '', { face: true, mood: 'idle', look: { x: 0.2, y: 0.25 }, wave: 0.5, smile: true });
  return c.toDataURL('image/png');
}`;

const browser = await chromium.launch({ executablePath: browserPath() });
const page = await browser.newPage();
await page.setContent('<body></body>');
await page.addScriptTag({ content: jelly });
await page.addScriptTag({ content: scene });
const out: [string, number, number, boolean][] = [
  ['icon-192.png', 192, 0, false],
  ['icon-512.png', 512, 0, false],
  // Maskable: launchers crop to a circle or squircle; keep the art inside the 80% safe zone.
  ['icon-maskable-512.png', 512, 0.1, false],
  ['apple-touch-icon.png', 180, 0, false],
  ['favicon-64.png', 64, 0, true],
];
for (const [name, size, pad, round] of out) {
  const url = (await page.evaluate(([s, p, r]) => (window as unknown as { drawIcon: (a: number, b: number, c: boolean) => string }).drawIcon(s, p, r), [size, pad, round] as const)) as string;
  writeFileSync(`public/icons/${name}`, Buffer.from(url.split(',')[1], 'base64'));
}
await browser.close();
console.log('icons written');
