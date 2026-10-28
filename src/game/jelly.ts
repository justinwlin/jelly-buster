// The jelly creature: a squishy translucent cube with cat ears, a face and its hit count.
import { skinDrawer } from './skins';

export type Mood = 'idle' | 'happy' | 'worried' | 'sleep' | 'shout';

export interface JellyLook {
  /** Override the selected look, used by the skin picker previews. */
  skin?: string;
  /** Squash: >0 wide and short, <0 tall and thin. */
  squash?: number;
  /** 0..1 pulse on the number after a hit. */
  pulse?: number;
  mood?: Mood;
  /** Eyes closed this frame. */
  blink?: boolean;
  /** Where the eyes look, unit-ish vector. */
  look?: { x: number; y: number };
  dim?: boolean;
  ice?: number;
  hidden?: boolean;
  /** Overall scale (pop in/out). */
  scale?: number;
  /** Pulsing ring for the tutorial pointer. */
  glow?: number;
  /** Draw the face (belt and slots) or just the number (queue). */
  face?: boolean;
  /** Arm wave angle, radians. */
  wave?: number;
  /** Red flash 0..1 (came back to full slots). */
  alarm?: number;
  /** Open happy mouth (menus and the app icon). */
  smile?: boolean;
}

const cache = new Map<string, { hi: string; lo: string; mid: string; deep: string; rim: string; ink: string }>();

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Lighten (amt > 0) or darken (amt < 0) a hex color. */
export function shade(hex: string, amt: number, alpha = 1): string {
  let [r, g, b] = rgb(hex);
  if (amt >= 0) {
    r += (255 - r) * amt;
    g += (255 - g) * amt;
    b += (255 - b) * amt;
  } else {
    r *= 1 + amt;
    g *= 1 + amt;
    b *= 1 + amt;
  }
  return alpha < 1 ? `rgba(${r | 0},${g | 0},${b | 0},${alpha})` : `rgb(${r | 0},${g | 0},${b | 0})`;
}

function tones(hex: string) {
  let t = cache.get(hex);
  if (!t) {
    const [r, g, b] = rgb(hex);
    const lum = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
    t = {
      hi: shade(hex, 0.45),
      mid: hex,
      lo: shade(hex, -0.22),
      deep: shade(hex, -0.45),
      rim: shade(hex, 0.7, 0.8),
      // Number outline: dark version of the body, a touch darker for light colors.
      ink: shade(hex, lum > 0.7 ? -0.72 : -0.62),
    };
    cache.set(hex, t);
  }
  return t;
}

const FONT = '"Baloo 2", "Arial Rounded MT Bold", ui-rounded, system-ui, sans-serif';

/** Body outline: a rounded square that sags a little at the bottom, like jelly. */
function bodyPath(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const r = w * 0.34;
  const x0 = -w / 2;
  const x1 = w / 2;
  const y0 = -h / 2;
  const y1 = h / 2;
  const sag = h * 0.06;
  ctx.beginPath();
  ctx.moveTo(x0 + r, y0);
  ctx.lineTo(x1 - r, y0);
  ctx.quadraticCurveTo(x1, y0, x1, y0 + r);
  ctx.lineTo(x1 + w * 0.02, y1 - r * 0.8);
  ctx.quadraticCurveTo(x1 + w * 0.02, y1 + sag * 0.4, x1 - r * 0.9, y1);
  ctx.quadraticCurveTo(0, y1 + sag, x0 + r * 0.9, y1);
  ctx.quadraticCurveTo(x0 - w * 0.02, y1 + sag * 0.4, x0 - w * 0.02, y1 - r * 0.8);
  ctx.lineTo(x0, y0 + r);
  ctx.quadraticCurveTo(x0, y0, x0 + r, y0);
  ctx.closePath();
}

export function drawJelly(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, n: number | string, o: JellyLook = {}) {
  const alternate = skinDrawer(o.skin);
  if (alternate) return alternate(ctx, x, y, size, color, n, o);
  const sq = Math.max(-0.5, Math.min(0.5, o.squash ?? 0));
  const sc = o.scale ?? 1;
  if (sc <= 0.01) return;
  const base = o.hidden ? '#9a96a6' : color;
  const t = tones(base);
  const w = size * 0.8 * (1 + sq * 0.3) * sc;
  const h = size * 0.7 * (1 - sq * 0.3) * sc;
  ctx.save();
  // Keep the feet planted while squashing.
  ctx.translate(x, y + size * 0.06 + (size * 0.7 * sc - h) / 2);
  if (o.dim) ctx.globalAlpha *= 0.78;

  // Ground shadow.
  ctx.fillStyle = 'rgba(30,18,10,0.28)';
  ctx.beginPath();
  ctx.ellipse(0, h * 0.5 + size * 0.03, w * 0.48, size * 0.07 * sc, 0, 0, Math.PI * 2);
  ctx.fill();

  if (o.glow && o.glow > 0) {
    ctx.save();
    ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.5 * Math.sin(o.glow * 6)})`;
    ctx.lineWidth = size * 0.06;
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = size * 0.3;
    bodyPath(ctx, w * 1.12, h * 1.14);
    ctx.stroke();
    ctx.restore();
  }

  // Ears (behind the body).
  for (const sx of [-1, 1]) {
    ctx.fillStyle = t.lo;
    ctx.beginPath();
    ctx.moveTo(sx * w * 0.46, -h * 0.22);
    ctx.quadraticCurveTo(sx * w * 0.44, -h * 0.62, sx * w * 0.36, -h * 0.7);
    ctx.quadraticCurveTo(sx * w * 0.24, -h * 0.58, sx * w * 0.1, -h * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade(base, 0.25);
    ctx.beginPath();
    ctx.moveTo(sx * w * 0.38, -h * 0.36);
    ctx.quadraticCurveTo(sx * w * 0.37, -h * 0.56, sx * w * 0.34, -h * 0.6);
    ctx.quadraticCurveTo(sx * w * 0.26, -h * 0.5, sx * w * 0.2, -h * 0.4);
    ctx.closePath();
    ctx.fill();
  }

  // Arms (little nubs; they wave when launched).
  const wave = o.wave ?? 0;
  for (const sx of [-1, 1]) {
    ctx.save();
    ctx.translate(sx * w * 0.47, h * 0.06);
    ctx.rotate(sx * (0.25 + wave));
    ctx.fillStyle = t.lo;
    ctx.beginPath();
    ctx.ellipse(sx * w * 0.04, 0, w * 0.1, h * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Body: vertical shading, then a soft inner glow for the translucent look.
  bodyPath(ctx, w, h);
  const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  g.addColorStop(0, t.hi);
  g.addColorStop(0.45, t.mid);
  g.addColorStop(1, t.deep);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  const ig = ctx.createRadialGradient(-w * 0.1, -h * 0.05, 0, 0, 0, w * 0.6);
  ig.addColorStop(0, 'rgba(255,255,255,0.28)');
  ig.addColorStop(0.6, 'rgba(255,255,255,0.05)');
  ig.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = ig;
  ctx.fillRect(-w, -h, w * 2, h * 2);
  // Bottom bounce light.
  const bl = ctx.createLinearGradient(0, h * 0.25, 0, h * 0.55);
  bl.addColorStop(0, 'rgba(255,255,255,0)');
  bl.addColorStop(1, shade(base, 0.35, 0.45));
  ctx.fillStyle = bl;
  ctx.fillRect(-w, h * 0.25, w * 2, h);
  ctx.restore();
  // Rim.
  ctx.lineWidth = Math.max(1, size * 0.028);
  ctx.strokeStyle = t.deep;
  bodyPath(ctx, w, h);
  ctx.stroke();

  // Dozing jellies further back get a soft lavender veil instead of going see-through.
  if (o.dim) {
    ctx.fillStyle = 'rgba(205,200,240,0.38)';
    bodyPath(ctx, w, h);
    ctx.fill();
  }

  // Speculars.
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.ellipse(-w * 0.24, -h * 0.3, w * 0.13, h * 0.06, -0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-w * 0.06, -h * 0.36, w * 0.03, 0, Math.PI * 2);
  ctx.fill();

  const mood = o.mood ?? 'idle';
  const face = o.face ?? false;
  const label = o.hidden ? '?' : String(n);
  // Face.
  if (face && !o.hidden) {
    const ex = w * 0.19;
    const ey = -h * 0.12;
    const lx = (o.look?.x ?? 0) * w * 0.03;
    const ly = (o.look?.y ?? 0) * h * 0.03;
    const ink = '#2a1f2e';
    ctx.lineCap = 'round';
    if (o.blink || mood === 'sleep') {
      ctx.strokeStyle = ink;
      ctx.lineWidth = size * 0.035;
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(sx * ex, ey - h * 0.02, w * 0.06, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
      }
    } else if (mood === 'happy') {
      ctx.strokeStyle = ink;
      ctx.lineWidth = size * 0.04;
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(sx * ex, ey + h * 0.03, w * 0.065, 1.15 * Math.PI, 1.85 * Math.PI);
        ctx.stroke();
      }
    } else {
      for (const sx of [-1, 1]) {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.ellipse(sx * ex, ey, w * 0.075, h * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = ink;
        ctx.beginPath();
        ctx.ellipse(sx * ex + lx, ey + ly + h * 0.01, w * 0.048, h * 0.07, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(sx * ex + lx - w * 0.018, ey + ly - h * 0.025, w * 0.018, 0, Math.PI * 2);
        ctx.fill();
      }
      if (mood === 'worried') {
        ctx.strokeStyle = ink;
        ctx.lineWidth = size * 0.03;
        for (const sx of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(sx * (ex - w * 0.08), ey - h * 0.15);
          ctx.lineTo(sx * (ex + w * 0.06), ey - h * 0.2);
          ctx.stroke();
        }
      }
    }
    if (o.smile) {
      const my = ey + h * 0.14;
      ctx.fillStyle = '#5a1a2a';
      ctx.beginPath();
      ctx.moveTo(-w * 0.1, my);
      ctx.quadraticCurveTo(0, my + h * 0.005, w * 0.1, my);
      ctx.quadraticCurveTo(w * 0.09, my + h * 0.15, 0, my + h * 0.15);
      ctx.quadraticCurveTo(-w * 0.09, my + h * 0.15, -w * 0.1, my);
      ctx.fill();
      ctx.fillStyle = '#ff7f9c';
      ctx.beginPath();
      ctx.ellipse(0, my + h * 0.11, w * 0.05, h * 0.03, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Blush.
    ctx.fillStyle = 'rgba(255,110,150,0.35)';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sx * w * 0.31, ey + h * 0.1, w * 0.07, h * 0.04, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Count, on the belly when there's a face, centered otherwise.
  const pulse = 1 + (o.pulse ?? 0) * 0.35;
  const fs = size * (label.length > 2 ? 0.3 : 0.38) * sc * (face ? 0.86 : 1.05) * pulse;
  ctx.font = `800 ${Math.round(fs)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const ty = face ? h * 0.2 : h * 0.06;
  ctx.lineWidth = Math.max(2.5, fs * 0.22);
  ctx.strokeStyle = t.ink;
  ctx.strokeText(label, 0, ty + fs * 0.06);
  ctx.fillStyle = '#fff';
  ctx.fillText(label, 0, ty + fs * 0.06);

  // Alarm tint.
  if (o.alarm && o.alarm > 0) {
    ctx.globalAlpha = o.alarm * 0.6;
    ctx.fillStyle = '#ff2a2a';
    bodyPath(ctx, w, h);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Ice: a translucent block, color still visible, with a counter badge.
  if (o.ice && o.ice > 0) {
    const iw = size * 0.98 * sc;
    const ih = size * 0.92 * sc;
    const iy = -size * 0.08;
    ctx.save();
    const ig2 = ctx.createLinearGradient(-iw / 2, iy - ih / 2, iw / 2, iy + ih / 2);
    ig2.addColorStop(0, 'rgba(235,250,255,0.62)');
    ig2.addColorStop(0.5, 'rgba(170,225,250,0.38)');
    ig2.addColorStop(1, 'rgba(120,190,235,0.6)');
    ctx.fillStyle = ig2;
    ctx.beginPath();
    ctx.roundRect(-iw / 2, iy - ih / 2, iw, ih, size * 0.14);
    ctx.fill();
    ctx.lineWidth = size * 0.035;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = size * 0.03;
    ctx.beginPath();
    ctx.moveTo(-iw * 0.36, iy - ih * 0.18);
    ctx.lineTo(-iw * 0.14, iy - ih * 0.38);
    ctx.moveTo(-iw * 0.36, iy - ih * 0.02);
    ctx.lineTo(-iw * 0.24, iy - ih * 0.12);
    ctx.moveTo(iw * 0.2, iy + ih * 0.36);
    ctx.lineTo(iw * 0.38, iy + ih * 0.18);
    ctx.stroke();
    // Badge.
    const bx = iw * 0.36;
    const by = iy - ih * 0.36;
    const br = size * 0.17;
    ctx.fillStyle = '#2f8fd0';
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = size * 0.035;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `800 ${Math.round(br * 1.25)}px ${FONT}`;
    ctx.fillText(String(o.ice), bx, by + br * 0.08);
    ctx.restore();
  }
  ctx.restore();
}

/** Font stack used for numbers and canvas text. */
export const JELLY_FONT = FONT;
