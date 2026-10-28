import type { JellyLook } from '../jelly';

const W = 24, H = 24, INK = '#14241a';
const sprites = new Map<string, HTMLCanvasElement>();
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function tint(hex: string, mix: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return `rgb(${c.map((v) => Math.round(mix >= 0 ? v + (255 - v) * mix : v * (1 + mix))).join(',')})`;
}

/** Broad, rounded pixel body. Limbs, stem and face are drawn live so they can move. */
function sprite(color: string): HTMLCanvasElement {
  const cached = sprites.get(color);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  const px = (a: number, b: number, w: number, h: number, fill: string) => { x.fillStyle = fill; x.fillRect(a, b, w, h); };
  const dark = tint(color, -0.54), shade = tint(color, -0.23);
  const light = tint(color, 0.24), glint = tint(color, 0.46);
  // A wide, almost square body with stepped shoulders and soft bottom corners.
  px(8, 5, 8, 1, INK); px(6, 6, 12, 1, INK); px(5, 7, 14, 1, INK);
  px(4, 8, 16, 1, INK); px(3, 9, 18, 8, INK);
  px(4, 17, 16, 1, INK); px(5, 18, 14, 1, INK); px(7, 19, 10, 1, INK);
  px(8, 6, 8, 1, dark); px(6, 7, 12, 1, dark); px(5, 8, 14, 1, dark);
  px(4, 9, 16, 8, color); px(5, 17, 14, 1, shade); px(7, 18, 10, 1, dark);
  // The recessed crown and its U-shaped bright rim are the defining detail.
  px(8, 7, 8, 1, shade); px(7, 8, 10, 1, shade);
  px(7, 9, 2, 2, glint); px(15, 9, 2, 2, glint);
  px(8, 11, 8, 1, light); px(9, 8, 6, 1, dark);
  px(9, 9, 6, 2, shade); px(10, 10, 4, 1, dark);
  px(8, 8, 2, 1, glint); px(15, 8, 1, 1, glint);
  px(5, 10, 1, 2, shade); px(18, 10, 1, 2, shade);
  px(5, 15, 3, 2, light); px(16, 15, 3, 2, light);
  px(6, 16, 2, 1, shade); px(16, 16, 2, 1, shade);
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
  px(7, 19 + step, 3, 2, INK); px(14, 19 - step, 3, 2, INK);
  ctx.drawImage(sprite(base), 0, 0);
  // A slim stem with one tiny leaf; it stays readable at tray size.
  px(11, 1, 2, 6, INK); px(9 + leaf, 3, 5, 1, INK);
  px(11, 0, 2, 1, tint(base, 0.2));

  if (o.ice && o.ice > 0) {
    // Faceted frost follows the rounded body rather than boxing it in.
    px(6, 7, 12, 2, 'rgba(202,246,255,0.42)');
    px(4, 10, 2, 6, 'rgba(135,220,247,0.4)');
    px(18, 10, 2, 6, 'rgba(135,220,247,0.4)');
    px(6, 17, 12, 1, 'rgba(125,217,246,0.45)');
    px(5, 9, 3, 1, '#d6f8ff'); px(8, 8, 2, 1, '#f5fdff');
    px(16, 10, 1, 3, '#d6f8ff'); px(15, 12, 3, 1, '#d6f8ff');
    px(7, 15, 1, 2, '#c4f3ff'); px(8, 16, 2, 1, '#c4f3ff');
  }

  if ((o.face ?? false) && !o.hidden) {
    const closed = o.blink || o.mood === 'sleep' || o.mood === 'happy';
    const glance = clamp(Math.round((o.look?.x ?? 0) * 0.8), -1, 1);
    const eyeY = 13 + clamp(Math.round((o.look?.y ?? 0) * 0.6), -1, 1);
    if (closed) { px(8, eyeY + 1, 2, 1, INK); px(14, eyeY + 1, 2, 1, INK); }
    else for (const ex of [8, 14]) px(ex + glance, eyeY, 2, 2, INK);
    px(6, 16, 2, 1, '#f5a1b3'); px(16, 16, 2, 1, '#f5a1b3');
    if (o.mood === 'shout' || o.smile) { px(11, 16, 2, 2, '#71313d'); px(11, 17, 1, 1, '#ff9ab0'); }
    else if (o.mood === 'worried') { px(11, 16, 2, 1, INK); px(7, 12, 2, 1, INK); px(15, 12, 2, 1, INK); }
    else if (o.mood !== 'sleep') px(11, 16, 2, 1, INK);
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
    px(19, 5, 3, 1, '#9be8fb'); px(18, 6, 5, 3, '#2f8fd0'); px(19, 9, 3, 1, '#176baf');
    ctx.font = '800 4px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff'; ctx.fillText(String(o.ice), 20.5, 7.4);
  }
  ctx.restore();
}
