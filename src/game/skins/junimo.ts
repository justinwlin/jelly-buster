import type { JellyLook } from '../jelly';

const sprites = new Map<string, HTMLCanvasElement>();

function tint(hex: string, mix: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return `rgb(${c.map((v) => Math.round(mix >= 0 ? v + (255 - v) * mix : v * (1 + mix))).join(',')})`;
}

/** Twenty-pixel body inspired by the supplied Junimo reference. Faces and counts stay live. */
function sprite(color: string): HTMLCanvasElement {
  const cached = sprites.get(color);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = c.height = 20;
  const x = c.getContext('2d')!;
  const px = (a: number, b: number, w: number, h: number, fill: string) => { x.fillStyle = fill; x.fillRect(a, b, w, h); };
  const ink = '#211d1b';
  const dark = tint(color, -0.32);
  const light = tint(color, 0.38);
  // Twig arms, little feet and the stem above the head.
  px(1, 7, 1, 4, ink); px(2, 10, 2, 1, ink); px(18, 7, 1, 4, ink); px(16, 10, 2, 1, ink);
  px(2, 4, 1, 3, ink); px(3, 3, 1, 2, ink); px(16, 3, 1, 2, ink); px(17, 4, 1, 3, ink);
  px(9, 1, 2, 4, ink); px(9, 0, 1, 1, light);
  px(5, 16, 3, 2, ink); px(12, 16, 3, 2, ink);
  // Stepped black outline with rounded pixel corners.
  px(6, 3, 8, 1, ink); px(4, 4, 12, 1, ink); px(3, 5, 14, 10, ink);
  px(4, 15, 12, 2, ink); px(5, 5, 10, 10, color); px(4, 7, 12, 7, color);
  px(5, 13, 10, 2, dark); px(6, 15, 8, 1, dark);
  px(6, 5, 7, 2, light); px(6, 7, 3, 1, light); px(13, 6, 1, 2, light);
  px(5, 12, 2, 1, '#f6a3ae'); px(13, 12, 2, 1, '#f6a3ae');
  sprites.set(color, c);
  return c;
}

export function drawJunimo(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, n: number | string, o: JellyLook = {}) {
  const sc = o.scale ?? 1;
  if (sc <= 0.01) return;
  const sq = Math.max(-0.5, Math.min(0.5, o.squash ?? 0));
  const base = o.hidden ? '#9a96a6' : color;
  ctx.save();
  ctx.translate(x, y);
  if (o.dim) ctx.globalAlpha *= 0.78;
  ctx.fillStyle = 'rgba(30,18,10,0.22)';
  ctx.beginPath();
  ctx.ellipse(0, size * 0.37 * sc, size * 0.3 * sc, size * 0.055 * sc, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.scale(size * sc / 20 * (1 + sq * 0.22), size * sc / 20 * (1 - sq * 0.22));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite(base), -10, -10);
  if ((o.face ?? false) && !o.hidden) {
    if (o.blink || o.mood === 'sleep' || o.mood === 'happy') {
      ctx.fillStyle = '#211d1b';
      ctx.fillRect(-4, -3, 2, 1); ctx.fillRect(2, -3, 2, 1);
    } else {
      const glance = Math.round((o.look?.x ?? 0) * 0.5);
      ctx.fillStyle = '#211d1b';
      ctx.fillRect(-4 + glance, -4, 2, 2); ctx.fillRect(2 + glance, -4, 2, 2);
      ctx.fillStyle = '#fff';
      ctx.fillRect(-4 + glance, -4, 1, 1); ctx.fillRect(2 + glance, -4, 1, 1);
    }
  }
  const label = o.hidden ? '?' : String(n);
  if (label) {
    const fs = label.length > 2 ? 5.3 : 6;
    ctx.font = `900 ${fs * (1 + (o.pulse ?? 0) * 0.2)}px "Baloo 2", system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = 1.7; ctx.strokeStyle = '#211d1b'; ctx.strokeText(label, 0, 5);
    ctx.fillStyle = '#fff'; ctx.fillText(label, 0, 5);
  }
  if (o.alarm) { ctx.fillStyle = `rgba(255,42,42,${o.alarm * 0.4})`; ctx.fillRect(-7, -5, 14, 12); }
  if (o.glow) { ctx.strokeStyle = '#fff6a8'; ctx.lineWidth = 0.8; ctx.strokeRect(-8, -8, 16, 17); }
  if (o.ice && o.ice > 0) {
    ctx.fillStyle = 'rgba(170,225,250,0.5)'; ctx.fillRect(-8, -8, 16, 16);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.8; ctx.strokeRect(-8, -8, 16, 16);
    ctx.fillStyle = '#2f8fd0'; ctx.beginPath(); ctx.arc(6, -6, 3, 0, Math.PI * 2); ctx.fill();
    ctx.font = '800 4px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff'; ctx.fillText(String(o.ice), 6, -5.7);
  }
  ctx.restore();
}
