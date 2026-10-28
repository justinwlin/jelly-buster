// Render the link-preview card (Open Graph / iMessage / Instagram) with the game's own jelly
// renderer and a real level picture. Usage: npm run og → public/og.jpg (1200×630)
import { chromium } from 'playwright';
import { buildSync } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { browserPath } from './browser';

const jelly = buildSync({ entryPoints: ['src/game/jelly.ts'], bundle: true, format: 'iife', globalName: 'J', write: false }).outputFiles[0].text;
const font = readFileSync('node_modules/@fontsource/baloo-2/files/baloo-2-latin-800-normal.woff2').toString('base64');
const levels = (JSON.parse(readFileSync('src/levels/campaign.json', 'utf8')) as { levels: { name: string; w: number; h: number; cells: number[]; palette: string[] }[] }).levels;
const pic = levels.find((l) => l.name === 'Rainbow')!;

const scene = `
async function drawCard(pic) {
  const face = new FontFace('Baloo 2', 'url(data:font/woff2;base64,${font})', { weight: '800' });
  await face.load();
  document.fonts.add(face);
  const W = 1200, H = 630;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const shade = J.shade;

  // Candy sky, a glow behind the board, light diagonal stripes, bokeh.
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#76c3ff'); g.addColorStop(0.55, '#9aa8ff'); g.addColorStop(1, '#c3a3f5');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const glow = x.createRadialGradient(880, 300, 0, 880, 300, 420);
  glow.addColorStop(0, 'rgba(255,255,255,0.5)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = glow; x.fillRect(0, 0, W, H);
  x.save(); x.globalAlpha = 0.07; x.strokeStyle = '#fff'; x.lineWidth = 34;
  for (let i = -H; i < W + H; i += 110) { x.beginPath(); x.moveTo(i, H); x.lineTo(i + H, 0); x.stroke(); }
  x.restore();
  for (const [bx, by, br] of [[90, 80, 40], [520, 560, 60], [1150, 90, 50], [610, 70, 24], [40, 520, 30]]) {
    x.fillStyle = 'rgba(255,255,255,0.16)'; x.beginPath(); x.arc(bx, by, br, 0, Math.PI * 2); x.fill();
  }

  // The board: wood rim, dark belt, felt bed, then the picture.
  const cs = 15.5;
  const pw = pic.w * cs, ph = pic.h * cs;
  const px = 880 - pw / 2, py = 318 - ph / 2;
  const lane = 74, gap = 52;
  const fx = px - gap - lane / 2, fy = py - gap - lane / 2, fw = pw + 2 * (gap + lane / 2), fh = ph + 2 * (gap + lane / 2);
  x.fillStyle = 'rgba(50,20,100,0.25)'; x.beginPath(); x.roundRect(fx - 10, fy + 4, fw + 20, fh + 22, 78); x.fill();
  const wood = x.createLinearGradient(0, fy, 0, fy + fh);
  wood.addColorStop(0, '#e9b27a'); wood.addColorStop(1, '#b87a45');
  x.fillStyle = wood; x.beginPath(); x.roundRect(fx - 12, fy - 12, fw + 24, fh + 24, 80); x.fill();
  const belt = x.createLinearGradient(0, fy, 0, fy + fh);
  belt.addColorStop(0, '#353563'); belt.addColorStop(1, '#44447a');
  x.fillStyle = belt; x.beginPath(); x.roundRect(fx, fy, fw, fh, 70); x.fill();
  // Treads.
  x.strokeStyle = 'rgba(255,255,255,0.09)'; x.lineWidth = 5; x.lineCap = 'round';
  const inner = { x: px - gap + lane / 2, y: py - gap + lane / 2 };
  for (let t = fx + 40; t < fx + fw - 40; t += 26) {
    x.beginPath(); x.moveTo(t, fy + 14); x.lineTo(t, fy + lane - 14); x.stroke();
    x.beginPath(); x.moveTo(t, fy + fh - lane + 14); x.lineTo(t, fy + fh - 14); x.stroke();
  }
  for (let t = fy + 40; t < fy + fh - 40; t += 26) {
    x.beginPath(); x.moveTo(fx + 14, t); x.lineTo(fx + lane - 14, t); x.stroke();
    x.beginPath(); x.moveTo(fx + fw - lane + 14, t); x.lineTo(fx + fw - 14, t); x.stroke();
  }
  const ix = px - gap + lane / 2 + 6, iy = py - gap + lane / 2 + 6, iw = pw + 2 * (gap - lane / 2 - 6), ih = ph + 2 * (gap - lane / 2 - 6);
  x.fillStyle = wood; x.beginPath(); x.roundRect(ix - 8, iy - 8, iw + 16, ih + 16, 34); x.fill();
  const bed = x.createLinearGradient(0, iy, 0, iy + ih);
  bed.addColorStop(0, '#e3e8f7'); bed.addColorStop(1, '#cfd7ee');
  x.fillStyle = bed; x.beginPath(); x.roundRect(ix, iy, iw, ih, 28); x.fill();

  // Cubes. A bite is already eaten out of the top-right, mid-game.
  const red = pic.palette.indexOf('#ff3d4f');
  const eaten = (i) => { const cx = i % pic.w, cy = Math.floor(i / pic.w); return pic.cells[i] === red && cx > pic.w * 0.5 && cy < pic.h * 0.5; };
  const cube = (cx, cy, s, col) => {
    x.fillStyle = shade(col, -0.35); x.beginPath(); x.roundRect(cx - s / 2, cy - s / 2, s, s, s * 0.22); x.fill();
    const cg = x.createLinearGradient(cx - s / 2, cy - s / 2, cx + s / 2, cy + s / 2);
    cg.addColorStop(0, shade(col, 0.22)); cg.addColorStop(1, shade(col, -0.04));
    x.fillStyle = cg; x.beginPath(); x.roundRect(cx - s / 2, cy - s / 2, s, s * 0.86, s * 0.22); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.45)'; x.beginPath(); x.roundRect(cx - s * 0.3, cy - s * 0.33, s * 0.32, s * 0.13, s * 0.06); x.fill();
  };
  pic.cells.forEach((k, i) => {
    if (k < 0 || eaten(i)) return;
    cube(px + ((i % pic.w) + 0.5) * cs, py + (Math.floor(i / pic.w) + 0.5) * cs, cs * 0.92, pic.palette[k]);
  });
  // Cube bits flying from the bite.
  [[0, -30, 0.6], [30, -10, 0.5], [-24, -48, 0.45], [40, -50, 0.4]].forEach(([dx, dy, s]) => cube(px + pw * 0.72 + dx, py + 26 + dy, cs * s, '#ff3d4f'));

  // Jellies riding the belt, looking at the picture.
  const jel = (jx, jy, size, col, n, look, mood) => J.drawJelly(x, jx, jy, size, col, n, { face: true, mood, look });
  const top = py - gap, bot = py + ph + gap, left = px - gap, right = px + pw + gap;
  // A shot from the top jelly into the bite.
  const sx = px + pw * 0.72;
  x.fillStyle = 'rgba(255,61,79,0.45)'; x.beginPath(); x.arc(sx, top + 38, 7, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#ff3d4f'; x.beginPath(); x.arc(sx, top + 56, 9, 0, Math.PI * 2); x.fill();
  x.fillStyle = 'rgba(255,255,255,0.8)'; x.beginPath(); x.arc(sx - 2.5, top + 53, 3.5, 0, Math.PI * 2); x.fill();
  jel(sx, top, 78, '#ff3d4f', 12, { x: 0, y: 1 }, 'shout');
  jel(right, py + ph * 0.55, 78, '#2f8cff', 20, { x: -1, y: 0 }, 'happy');
  jel(px + pw * 0.3, bot, 78, '#ffd21f', 15, { x: 0, y: -1 }, 'idle');
  jel(left, py + ph * 0.3, 78, '#9b3df0', 10, { x: 1, y: 0 }, 'happy');

  // Logo, the same two-tone letters as the title screen.
  const word = (text, y, size, fill, stroke, dx) => {
    x.font = '800 ' + size + 'px "Baloo 2"';
    x.textBaseline = 'alphabetic';
    let cx = 70 + dx;
    [...text].forEach((ch, i) => {
      const lift = [0, -8, 4, -4, 6, -6][i % 6];
      x.lineJoin = 'round';
      x.fillStyle = 'rgba(40,10,60,0.25)'; x.fillText(ch, cx + 2, y + lift + 16);
      x.lineWidth = size * 0.14; x.strokeStyle = stroke; x.strokeText(ch, cx, y + lift + 7); x.fillStyle = stroke; x.fillText(ch, cx, y + lift + 7);
      x.strokeText(ch, cx, y + lift);
      const lg = x.createLinearGradient(0, y + lift - size * 0.7, 0, y + lift);
      lg.addColorStop(0, shade(fill, 0.35)); lg.addColorStop(1, fill);
      x.fillStyle = lg; x.fillText(ch, cx, y + lift);
      x.fillStyle = 'rgba(255,255,255,0.45)'; x.beginPath(); x.ellipse(cx + size * 0.18, y + lift - size * 0.52, size * 0.08, size * 0.035, -0.5, 0, Math.PI * 2); x.fill();
      cx += x.measureText(ch).width + 2;
    });
  };
  word('Jelly', 205, 150, '#ff6fb5', '#9c1b62', 30);
  word('Buster', 355, 160, '#ffd21f', '#a35b00', 0);

  // Tagline pill and a "play" line.
  x.font = '800 34px "Baloo 2"';
  const tag = 'Munch the picture, one jelly at a time';
  const tw = x.measureText(tag).width;
  x.fillStyle = 'rgba(47,39,117,0.88)'; x.beginPath(); x.roundRect(64, 400, tw + 44, 62, 31); x.fill();
  x.fillStyle = '#fff'; x.textBaseline = 'middle'; x.fillText(tag, 86, 433);
  x.font = '800 28px "Baloo 2"'; x.fillStyle = '#ffffff';
  x.shadowColor = 'rgba(40,20,110,0.5)'; x.shadowBlur = 6;
  x.fillText('100 puzzles · free · plays in your browser', 76, 500);
  x.shadowBlur = 0;

  // The hero jelly waving from the bottom-left corner.
  J.drawJelly(x, 200, 600, 150, '#ff3d5f', '', { face: true, mood: 'happy', look: { x: 0.6, y: -0.3 }, wave: 0.6, smile: true });
  J.drawJelly(x, 330, 615, 96, '#ffd21f', '', { face: true, mood: 'happy', look: { x: 0.8, y: -0.2 } });
  return c.toDataURL('image/jpeg', 0.9);
}`;

const browser = await chromium.launch({ executablePath: browserPath() });
const page = await browser.newPage();
await page.setContent('<body></body>');
await page.addScriptTag({ content: jelly });
await page.addScriptTag({ content: scene });
const url = (await page.evaluate((p) => (window as unknown as { drawCard: (p: unknown) => Promise<string> }).drawCard(p), pic)) as string;
writeFileSync('public/og.jpg', Buffer.from(url.split(',')[1], 'base64'));
await browser.close();
console.log('public/og.jpg written');
