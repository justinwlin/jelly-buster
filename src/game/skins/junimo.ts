import type { JellyLook } from '../jelly';

const W = 24, H = 24, INK = '#211d25';
const sprites = new Map<string, HTMLCanvasElement>();
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function tint(hex: string, mix: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return `rgb(${c.map((v) => Math.round(mix >= 0 ? v + (255 - v) * mix : v * (1 + mix))).join(',')})`;
}

/** Squat, domed pixel body. Limbs, stem and face are drawn live so they can move. */
function sprite(color: string): HTMLCanvasElement {
  const cached = sprites.get(color);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  const px = (a: number, b: number, w: number, h: number, fill: string) => { x.fillStyle = fill; x.fillRect(a, b, w, h); };
  const dark = tint(color, -0.3), light = tint(color, 0.34);
  // Rounded crown and wide cheeks; the body is nearly square below the stem.
  px(9, 5, 6, 1, INK); px(7, 6, 10, 1, INK); px(6, 7, 12, 1, INK);
  px(5, 8, 14, 2, INK); px(4, 10, 16, 9, INK);
  px(5, 19, 14, 1, INK); px(7, 20, 10, 1, INK);
  px(8, 6, 8, 1, color); px(7, 7, 10, 1, color); px(6, 8, 12, 2, color);
  px(5, 10, 14, 8, color); px(6, 18, 12, 1, dark); px(7, 19, 10, 1, dark);
  px(8, 8, 6, 2, light); px(7, 10, 3, 1, light); px(15, 8, 2, 2, light);
  px(8, 7, 2, 1, '#fff'); px(12, 8, 3, 1, '#fff');
  px(7, 15, 1, 1, dark); px(16, 16, 1, 1, dark);
  sprites.set(color, c);
  return c;
}

export function drawJunimo(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, n: number | string, o: JellyLook = {}) {
  const sc = o.scale ?? 1;
  if (sc <= 0.01) return;
  const sq = clamp(o.squash ?? 0, -0.5, 0.5);
  const base = o.hidden ? '#9a96a6' : color;
  const t = o.time ?? 0;
  const lively = o.mood === 'happy' || o.mood === 'shout' || (o.wave ?? 0) !== 0;
  const arm = Math.round(clamp(Math.sin(t * (lively ? 12 : 3.4)) * (lively ? 1.5 : 0.6) - (o.wave ?? 0) * 2 - (o.pulse ?? 0), -3, 2));
  const leaf = Math.round(Math.sin(t * 4.2) + (o.wave ?? 0));
  const px = (a: number, b: number, w: number, h: number, fill: string) => { ctx.fillStyle = fill; ctx.fillRect(a, b, w, h); };

  ctx.save();
  ctx.translate(x, y);
  if (o.dim) ctx.globalAlpha *= 0.78;
  ctx.fillStyle = 'rgba(30,18,10,0.22)';
  ctx.beginPath();
  ctx.ellipse(0, size * 0.41 * sc, size * 0.29 * sc, size * 0.045 * sc, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.scale(size * sc / H * (1 + sq * 0.14), size * sc / H * (1 - sq * 0.14));
  ctx.translate(-W / 2, -H / 2);
  ctx.imageSmoothingEnabled = false;

  // Bent twig arms bounce on hops, hits and celebrations.
  for (const side of [-1, 1]) {
    px(side < 0 ? 3 : 19, 12, 2, 2, INK);
    px(side < 0 ? 2 : 21, 8 + arm, 1, 5 - arm, INK);
    px(side < 0 ? 1 : 22, 6 + arm, 1, 3, INK);
    px(side < 0 ? 2 : 21, 5 + arm, 1, 2, INK);
  }
  const step = Math.sin(t * 9) > 0.55 ? 1 : 0;
  px(7, 20 + step, 3, 2, INK); px(14, 21 - step, 3, 1 + step, INK);
  ctx.drawImage(sprite(base), 0, 0);
  // A short sprout sways a pixel to either side.
  px(11, 1, 2, 5, INK); px(11, 0, 1, 1, tint(base, 0.25));
  px(12 + leaf, 1, 3, 1, '#6dbf54'); px(13 + leaf, 0, 2, 1, '#a4d96b');

  if ((o.face ?? false) && !o.hidden) {
    const closed = o.blink || o.mood === 'sleep' || o.mood === 'happy';
    const glance = clamp(Math.round((o.look?.x ?? 0) * 0.8), -1, 1);
    const eyeY = 11 + clamp(Math.round((o.look?.y ?? 0) * 0.6), -1, 1);
    if (closed) { px(8, eyeY + 1, 2, 1, INK); px(14, eyeY + 1, 2, 1, INK); }
    else for (const ex of [8, 14]) { px(ex + glance, eyeY, 2, 2, INK); px(ex + glance, eyeY, 1, 1, '#fff'); }
    px(6, 14, 2, 1, '#f5a1b3'); px(16, 14, 2, 1, '#f5a1b3');
    if (o.mood === 'shout' || o.smile) { px(11, 14, 2, 2, '#71313d'); px(11, 15, 1, 1, '#ff9ab0'); }
    else if (o.mood === 'worried') { px(11, 14, 2, 1, INK); px(7, 9, 2, 1, INK); px(15, 9, 2, 1, INK); }
    else if (o.mood !== 'sleep') px(11, 14, 2, 1, INK);
  }

  const label = o.hidden ? '?' : String(n);
  if (label) {
    const fs = (o.face ?? false) ? (label.length > 2 ? 5.2 : 6.5) : (label.length > 2 ? 6 : 7.5);
    ctx.font = `900 ${fs * (1 + (o.pulse ?? 0) * 0.13)}px "Baloo 2", system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = 1.8; ctx.strokeStyle = INK; ctx.strokeText(label, 12, (o.face ?? false) ? 18 : 15.5);
    ctx.fillStyle = '#fff'; ctx.fillText(label, 12, (o.face ?? false) ? 18 : 15.5);
  }
  if (o.alarm) { ctx.fillStyle = `rgba(255,42,42,${o.alarm * 0.4})`; ctx.fillRect(5, 8, 14, 12); }
  if (o.glow) {
    const sparkle = Math.round(Math.sin(o.glow * 10) * 2);
    px(2, 4 + sparkle, 2, 1, '#fff6a8'); px(20, 7 - sparkle, 2, 1, '#fff6a8');
  }
  if (o.ice && o.ice > 0) {
    ctx.fillStyle = 'rgba(170,225,250,0.5)'; ctx.fillRect(5, 7, 14, 13);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.8; ctx.strokeRect(5, 7, 14, 13);
    ctx.fillStyle = '#2f8fd0'; ctx.beginPath(); ctx.arc(18, 7, 3, 0, Math.PI * 2); ctx.fill();
    ctx.font = '800 4px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff'; ctx.fillText(String(o.ice), 18, 7.3);
  }
  ctx.restore();
}
