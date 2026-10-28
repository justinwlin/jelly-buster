// Canvas drawing: the belt, the cube picture, jellies, shots and particles.

import { TUNING, locate, type SimEvent, type State } from '../sim/engine';
import { computeLayout, stationPos, type Layout, type Pt } from './layout';

export interface Shot {
  from: Pt;
  to: Pt;
  t: number;
  dur: number;
  color: string;
  cell: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  size: number;
  color: string;
  spin: number;
}

interface Vis {
  x: number;
  y: number;
  /** Squash-and-stretch bounce, decays to 0. */
  bounce: number;
  /** 1 = fully visible; used for the pop when a jelly finishes. */
  scale: number;
  onBelt: boolean;
}

export interface View {
  st: State;
  l: Layout;
  dpr: number;
  time: number;
  vis: Map<number, Vis>;
  /** Cells already removed in the sim but still drawn until their shot lands. */
  ghosts: Map<number, number>;
  shots: Shot[];
  parts: Particle[];
  /** Short-lived UI feedback. */
  beltFlash: number;
  shake: { id: number; t: number } | null;
  ropeHint: { a: number; b: number; t: number } | null;
  /** Jellies that just finished, drawn popping at their last belt spot. */
  popping: { id: number; x: number; y: number; color: string; t: number }[];
  /** Tutorial pointer target (jelly id) or null. */
  point: number | null;
  cubeCache: Map<string, HTMLCanvasElement>;
  safeTop: number;
  safeBottom: number;
}

export function newView(st: State, W: number, H: number, dpr: number, safeTop = 0, safeBottom = 0): View {
  const v: View = {
    st,
    l: computeLayout(W, H, st.lvl.w, st.lvl.h, st.slots.length, st.cols.length, safeTop, safeBottom),
    dpr,
    time: 0,
    vis: new Map(),
    ghosts: new Map(),
    shots: [],
    parts: [],
    beltFlash: 0,
    shake: null,
    ropeHint: null,
    popping: [],
    point: null,
    cubeCache: new Map(),
    safeTop,
    safeBottom,
  };
  snapAll(v);
  return v;
}

export function relayout(v: View, W: number, H: number, dpr: number) {
  v.dpr = dpr;
  v.l = computeLayout(W, H, v.st.lvl.w, v.st.lvl.h, v.st.slots.length, v.st.cols.length, v.safeTop, v.safeBottom);
  v.cubeCache.clear();
  snapAll(v);
}

function snapAll(v: View) {
  for (const [id, t] of targets(v)) v.vis.set(id, { x: t.x, y: t.y, bounce: 0, scale: 1, onBelt: t.onBelt });
}

/** Where every jelly should be right now. */
function targets(v: View): Map<number, Pt & { onBelt: boolean }> {
  const { st, l } = v;
  const out = new Map<number, Pt & { onBelt: boolean }>();
  st.cols.forEach((col, c) => col.forEach((j, d) => out.set(j.id, { x: l.qx[c], y: l.qy + d * l.qPitch, onBelt: false })));
  st.slots.forEach((j, i) => j && out.set(j.id, { ...l.slots[i], onBelt: false }));
  st.pending.forEach((j, i) => out.set(j.id, { x: l.launcher.x - i * 4, y: l.launcher.y + i * 4, onBelt: false }));
  for (const r of st.belt) out.set(r.j.id, { ...stationPos(l, r.p / TUNING.sub), onBelt: true });
  return out;
}

/** Cube center on screen. */
export function cellPt(l: Layout, cell: number, w: number): Pt {
  return { x: l.px + ((cell % w) + 0.5) * l.cs, y: l.py + (Math.floor(cell / w) + 0.5) * l.cs };
}

/** React to simulation events: shots, pops, landings. */
export function onEvents(v: View, evs: SimEvent[]) {
  const { st, l } = v;
  for (const e of evs) {
    if (e.k === 'shot') {
      const from = stationPos(l, e.s);
      const to = cellPt(l, e.cell, st.lvl.w);
      v.ghosts.set(e.cell, e.color);
      v.shots.push({ from, to, t: 0, dur: 0.11, color: st.lvl.palette[e.color], cell: e.cell });
      const vis = v.vis.get(e.id);
      if (vis) vis.bounce = Math.max(vis.bounce, 0.6);
    } else if (e.k === 'done') {
      const p = stationPos(l, e.s);
      const vis = v.vis.get(e.id);
      const color = st.lvl.palette[lastColor.get(e.id) ?? 0];
      v.popping.push({ id: e.id, x: vis?.x ?? p.x, y: vis?.y ?? p.y, color, t: 0 });
      burst(v, p.x, p.y, color, 14, l.beltSize * 0.12);
      v.vis.delete(e.id);
    } else if (e.k === 'park' || e.k === 'launch') {
      const vis = v.vis.get(e.id);
      if (vis) vis.bounce = 1;
    }
  }
}

const lastColor = new Map<number, number>();

function burst(v: View, x: number, y: number, color: string, n: number, size: number) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    const sp = 60 + Math.random() * 160;
    v.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, t: 0, life: 0.5 + Math.random() * 0.3, size: size * (0.6 + Math.random() * 0.8), color, spin: Math.random() * 6 });
  }
}

export function confetti(v: View) {
  const { W } = v.l;
  const colors = v.st.lvl.palette;
  for (let i = 0; i < 90; i++) {
    v.parts.push({
      x: Math.random() * W,
      y: -20 - Math.random() * 200,
      vx: (Math.random() - 0.5) * 80,
      vy: 120 + Math.random() * 160,
      t: 0,
      life: 2.5 + Math.random(),
      size: 5 + Math.random() * 6,
      color: colors[i % colors.length],
      spin: Math.random() * 8,
    });
  }
}

export function update(v: View, dt: number) {
  v.time += dt;
  for (const col of v.st.cols) for (const j of col) lastColor.set(j.id, j.color);
  for (const j of v.st.slots) if (j) lastColor.set(j.id, j.color);
  for (const r of v.st.belt) lastColor.set(r.j.id, r.j.color);
  for (const j of v.st.pending) lastColor.set(j.id, j.color);

  const tg = targets(v);
  const k = Math.min(1, dt * 14);
  for (const [id, t] of tg) {
    let vis = v.vis.get(id);
    if (!vis) {
      vis = { x: t.x, y: t.y, bounce: 0, scale: 1, onBelt: t.onBelt };
      v.vis.set(id, vis);
    }
    if (t.onBelt && vis.onBelt) {
      vis.x = t.x;
      vis.y = t.y;
    } else {
      vis.x += (t.x - vis.x) * k;
      vis.y += (t.y - vis.y) * k;
      if (t.onBelt && Math.hypot(t.x - vis.x, t.y - vis.y) < 4) vis.onBelt = true;
    }
    if (!t.onBelt) vis.onBelt = false;
    vis.bounce = Math.max(0, vis.bounce - dt * 4);
  }
  for (const id of [...v.vis.keys()]) if (!tg.has(id)) v.vis.delete(id);

  for (const s of v.shots) {
    s.t += dt;
    if (s.t >= s.dur) {
      v.ghosts.delete(s.cell);
      burst(v, s.to.x, s.to.y, s.color, 5, v.l.cs * 0.35);
    }
  }
  v.shots = v.shots.filter((s) => s.t < s.dur);
  for (const p of v.parts) {
    p.t += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 420 * dt;
  }
  v.parts = v.parts.filter((p) => p.t < p.life);
  for (const p of v.popping) p.t += dt;
  v.popping = v.popping.filter((p) => p.t < 0.35);
  v.beltFlash = Math.max(0, v.beltFlash - dt);
  if (v.shake && (v.shake.t -= dt) <= 0) v.shake = null;
  if (v.ropeHint && (v.ropeHint.t -= dt) <= 0) v.ropeHint = null;
}

// ---------------------------------------------------------------- drawing helpers

export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (amt >= 0) {
    r += (255 - r) * amt;
    g += (255 - g) * amt;
    b += (255 - b) * amt;
  } else {
    r *= 1 + amt;
    g *= 1 + amt;
    b *= 1 + amt;
  }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

function cubeSprite(v: View, color: string): HTMLCanvasElement {
  const key = color;
  let c = v.cubeCache.get(key);
  if (c) return c;
  const s = Math.max(2, Math.round(v.l.cs * v.dpr));
  c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const x = c.getContext('2d')!;
  const r = s * 0.16;
  x.fillStyle = shade(color, -0.35);
  rrect(x, 0, 0, s, s, r);
  x.fill();
  x.fillStyle = color;
  rrect(x, 0, 0, s, s * 0.86, r);
  x.fill();
  x.fillStyle = shade(color, 0.35);
  rrect(x, s * 0.12, s * 0.1, s * 0.5, s * 0.16, r * 0.6);
  x.fill();
  x.fillStyle = 'rgba(0,0,0,0.12)';
  x.fillRect(0, s * 0.86 - 1, s, 1);
  v.cubeCache.set(key, c);
  return c;
}

export interface JellyLook {
  dim?: boolean;
  ice?: number;
  hidden?: boolean;
  face?: boolean;
  bounce?: number;
  scale?: number;
  glow?: boolean;
}

/** A jelly creature: squishy cube body with cat ears, a face and its count. */
export function drawJelly(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, n: number | string, o: JellyLook = {}) {
  const sq = (o.bounce ?? 0) * Math.sin((o.bounce ?? 0) * 12) * 0.12;
  const sc = o.scale ?? 1;
  const w = size * 0.8 * (1 + sq) * sc;
  const h = size * 0.72 * (1 - sq) * sc;
  const base = o.hidden ? '#8d8a96' : color;
  ctx.save();
  ctx.translate(x, y + size * 0.04);
  if (o.dim) ctx.globalAlpha *= 0.55;
  if (o.glow) {
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = size * 0.35;
  }
  // Shadow under the jelly.
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(0, h * 0.52, w * 0.46, h * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  // Ears.
  ctx.fillStyle = shade(base, -0.12);
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sx * w * 0.42, -h * 0.28);
    ctx.lineTo(sx * w * 0.34, -h * 0.66);
    ctx.lineTo(sx * w * 0.1, -h * 0.4);
    ctx.closePath();
    ctx.fill();
  }
  // Little arms.
  ctx.fillStyle = shade(base, -0.18);
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(sx * w * 0.5, h * 0.08, w * 0.09, h * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Body.
  const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  g.addColorStop(0, shade(base, 0.32));
  g.addColorStop(0.55, base);
  g.addColorStop(1, shade(base, -0.28));
  ctx.fillStyle = g;
  rrect(ctx, -w / 2, -h / 2, w, h, w * 0.3);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  rrect(ctx, -w * 0.32, -h * 0.4, w * 0.3, h * 0.14, h * 0.07);
  ctx.fill();
  // Face (on the belt) sits above the number.
  if (o.face) {
    ctx.fillStyle = '#2b2233';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sx * w * 0.2, -h * 0.2, w * 0.05, h * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Count.
  const label = o.hidden ? '?' : String(n);
  ctx.font = `900 ${Math.round(size * (label.length > 2 ? 0.3 : 0.36))}px "Baloo 2", "Arial Rounded MT Bold", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, size * 0.07);
  ctx.strokeStyle = 'rgba(30,20,40,0.85)';
  const ty = o.face ? h * 0.12 : h * 0.04;
  ctx.strokeText(label, 0, ty);
  ctx.fillStyle = '#fff';
  ctx.fillText(label, 0, ty);
  // Ice block.
  if (o.ice && o.ice > 0) {
    ctx.globalAlpha = 1;
    const iw = size * 0.92;
    const ih = size * 0.84;
    const ig = ctx.createLinearGradient(-iw / 2, -ih / 2, iw / 2, ih / 2);
    ig.addColorStop(0, 'rgba(225,248,255,0.7)');
    ig.addColorStop(1, 'rgba(140,205,240,0.6)');
    ctx.fillStyle = ig;
    rrect(ctx, -iw / 2, -ih / 2 - size * 0.04, iw, ih, size * 0.14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.moveTo(-iw * 0.3, -ih * 0.3);
    ctx.lineTo(-iw * 0.1, -ih * 0.42);
    ctx.moveTo(iw * 0.2, ih * 0.28);
    ctx.lineTo(iw * 0.36, ih * 0.12);
    ctx.stroke();
    ctx.font = `900 ${Math.round(size * 0.32)}px system-ui, sans-serif`;
    ctx.lineWidth = Math.max(2, size * 0.06);
    ctx.strokeStyle = '#2a6f9a';
    ctx.strokeText(`❄${o.ice}`, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillText(`❄${o.ice}`, 0, 0);
  }
  ctx.restore();
}

function drawRope(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, size: number, hot: boolean) {
  ctx.save();
  ctx.strokeStyle = hot ? '#ffe28a' : '#e0a060';
  ctx.lineWidth = Math.max(4, size * 0.12);
  ctx.lineCap = 'round';
  ctx.setLineDash([size * 0.12, size * 0.08]);
  ctx.beginPath();
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2 + size * 0.25;
  ctx.moveTo(a.x, a.y);
  ctx.quadraticCurveTo(mx, my, b.x, b.y);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- the frame

export function draw(ctx: CanvasRenderingContext2D, v: View) {
  const { l, st } = v;
  const { W, H } = l;
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
  // Background.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#8d8681');
  bg.addColorStop(1, '#6e6763');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  drawBoard(ctx, v);
  drawPicture(ctx, v);
  drawShots(ctx, v);
  drawPanel(ctx, v);
  drawBelt(ctx, v);

  for (const p of v.popping) {
    const k = p.t / 0.35;
    ctx.globalAlpha = 1 - k;
    drawJelly(ctx, p.x, p.y, l.beltSize, p.color, '', { scale: 1 + k * 0.6, face: true });
    ctx.globalAlpha = 1;
  }
  for (const p of v.parts) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
    ctx.translate(p.x, p.y);
    ctx.rotate(p.spin * p.t);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
    ctx.restore();
  }
  void st;
}

function drawBoard(ctx: CanvasRenderingContext2D, v: View) {
  const { l } = v;
  const f = l.frame;
  const lane = l.lane;
  // Wooden outer rim.
  ctx.fillStyle = '#5a3b22';
  rrect(ctx, f.x - 5, f.y - 3, f.w + 10, f.h + 12, f.r + 5);
  ctx.fill();
  ctx.fillStyle = '#c98a4b';
  rrect(ctx, f.x - 5, f.y - 5, f.w + 10, f.h + 10, f.r + 5);
  ctx.fill();
  // The belt.
  ctx.fillStyle = '#4b3d36';
  rrect(ctx, f.x, f.y, f.w, f.h, f.r);
  ctx.fill();
  // Inner wooden rim and the picture bed.
  const ix = f.x + lane;
  const iy = f.y + lane;
  const iw = f.w - 2 * lane;
  const ih = f.h - 2 * lane;
  ctx.fillStyle = '#5a3b22';
  rrect(ctx, ix - 4, iy - 2, iw + 8, ih + 8, f.r * 0.5 + 4);
  ctx.fill();
  ctx.fillStyle = '#c98a4b';
  rrect(ctx, ix - 4, iy - 4, iw + 8, ih + 8, f.r * 0.5 + 4);
  ctx.fill();
  const bed = ctx.createLinearGradient(0, iy, 0, iy + ih);
  bed.addColorStop(0, '#8f8984');
  bed.addColorStop(1, '#a29c97');
  ctx.fillStyle = bed;
  rrect(ctx, ix, iy, iw, ih, f.r * 0.5);
  ctx.fill();
  // Chevrons showing the direction of travel, drifting slowly.
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.09)';
  ctx.lineWidth = Math.max(2, lane * 0.12);
  ctx.lineCap = 'round';
  const step = lane * 1.6;
  const drift = (v.time * lane * 0.8) % step;
  const chev = (x: number, y: number, ang: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    const s = lane * 0.2;
    ctx.beginPath();
    ctx.moveTo(-s, -s * 1.2);
    ctx.lineTo(s * 0.4, 0);
    ctx.lineTo(-s, s * 1.2);
    ctx.stroke();
    ctx.restore();
  };
  const cy = f.y + f.h - lane / 2;
  for (let x = f.x + lane * 1.5 + drift; x < f.x + f.w - lane * 1.2; x += step) chev(x, cy, 0);
  const rx = f.x + f.w - lane / 2;
  for (let y = f.y + f.h - lane * 1.5 - drift; y > f.y + lane * 1.2; y -= step) chev(rx, y, -Math.PI / 2);
  const ty = f.y + lane / 2;
  for (let x = f.x + f.w - lane * 1.5 - drift; x > f.x + lane * 1.2; x -= step) chev(x, ty, Math.PI);
  const lx = f.x + lane / 2;
  for (let y = f.y + lane * 1.5 + drift; y < f.y + f.h - lane * 1.2; y += step) chev(lx, y, Math.PI / 2);
  ctx.restore();
}

function drawPicture(ctx: CanvasRenderingContext2D, v: View) {
  const { l, st } = v;
  const { w } = st.lvl;
  const cs = l.cs;
  for (let i = 0; i < st.cells.length; i++) {
    const c = st.cells[i] >= 0 ? st.cells[i] : v.ghosts.get(i);
    if (c === undefined || c < 0) continue;
    ctx.drawImage(cubeSprite(v, st.lvl.palette[c]), l.px + (i % w) * cs, l.py + Math.floor(i / w) * cs, cs, cs);
  }
}

function drawShots(ctx: CanvasRenderingContext2D, v: View) {
  const r = Math.max(3, v.l.cs * 0.42);
  for (const s of v.shots) {
    const k = s.t / s.dur;
    const x = s.from.x + (s.to.x - s.from.x) * k;
    const y = s.from.y + (s.to.y - s.from.y) * k;
    const tx = s.from.x + (s.to.x - s.from.x) * Math.max(0, k - 0.35);
    const ty = s.from.y + (s.to.y - s.from.y) * Math.max(0, k - 0.35);
    ctx.strokeStyle = s.color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = r * 1.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBelt(ctx: CanvasRenderingContext2D, v: View) {
  const { l, st } = v;
  // Launcher box and the free-belt counter.
  const L = l.launcher;
  const bs = l.beltSize;
  ctx.fillStyle = '#3a312d';
  rrect(ctx, L.x - bs * 0.7, L.y - bs * 0.45, bs * 1.1, bs * 0.9, bs * 0.15);
  ctx.fill();
  ctx.strokeStyle = '#d8d0c8';
  ctx.lineWidth = Math.max(2, bs * 0.08);
  for (let i = 0; i < 3; i++) {
    const x = L.x - bs * 0.45 + i * bs * 0.24;
    ctx.beginPath();
    ctx.moveTo(x, L.y - bs * 0.25);
    ctx.lineTo(x + bs * 0.14, L.y);
    ctx.lineTo(x, L.y + bs * 0.25);
    ctx.stroke();
  }
  const free = st.lvl.belt - st.belt.length - st.pending.length;
  ctx.font = `900 ${Math.round(bs * 0.42)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#2b2320';
  const tx = L.x - bs * 0.15;
  const ty = L.y + bs * 0.75;
  const flash = v.beltFlash > 0 && Math.floor(v.beltFlash * 10) % 2 === 0;
  ctx.strokeText(`${free}/${st.lvl.belt}`, tx, ty);
  ctx.fillStyle = flash ? '#ff5a5a' : '#fff';
  ctx.fillText(`${free}/${st.lvl.belt}`, tx, ty);

  for (const j of st.pending) {
    const vis = v.vis.get(j.id);
    if (vis) drawJelly(ctx, vis.x, vis.y, bs, st.lvl.palette[j.color], j.n, { face: true, bounce: vis.bounce });
  }
  for (const r of st.belt) {
    const vis = v.vis.get(r.j.id);
    if (vis) drawJelly(ctx, vis.x, vis.y, bs, st.lvl.palette[r.j.color], r.j.n, { face: true, bounce: vis.bounce });
  }
}

function drawPanel(ctx: CanvasRenderingContext2D, v: View) {
  const { l, st } = v;
  // Queue tray.
  const trayY = l.qy - l.qSize * 0.75;
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, trayY, l.W, l.H - trayY);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(0, trayY, l.W, 2);

  // Slots.
  const s = l.slotSize;
  l.slots.forEach((p, i) => {
    ctx.fillStyle = '#9c6a3c';
    rrect(ctx, p.x - s / 2, p.y - s / 2 + 4, s, s, s * 0.22);
    ctx.fill();
    ctx.fillStyle = i < st.lvl.slots ? '#e0a467' : '#9fd88a';
    rrect(ctx, p.x - s / 2, p.y - s / 2, s, s, s * 0.22);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    rrect(ctx, p.x - s * 0.38, p.y - s * 0.42, s * 0.76, s * 0.14, s * 0.07);
    ctx.fill();
  });
  // Warn when slots are nearly full.
  const used = st.slots.filter((j) => j).length;
  if (used >= st.slots.length - 1 && st.status === 'play') {
    const a = 0.35 + 0.25 * Math.sin(v.time * 8);
    ctx.strokeStyle = `rgba(255,80,80,${a})`;
    ctx.lineWidth = 3;
    const x0 = l.slots[0].x - s * 0.62;
    const x1 = l.slots[l.slots.length - 1].x + s * 0.62;
    rrect(ctx, x0, l.slots[0].y - s * 0.62, x1 - x0, s * 1.24 + 4, s * 0.3);
    ctx.stroke();
  }
  st.slots.forEach((j) => {
    if (!j) return;
    const vis = v.vis.get(j.id);
    if (!vis) return;
    drawJelly(ctx, vis.x + shakeX(v, j.id), vis.y, s * 1.0, st.lvl.palette[j.color], j.n, { bounce: vis.bounce, face: true, glow: v.point === j.id });
  });

  // Queue columns: front row bright, the next rows dimmed, deeper ones off screen.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, trayY, l.W, l.qBottom - trayY);
  ctx.clip();
  // Ropes first, so they run behind the jellies.
  const tags: Pt[] = [];
  for (const col of st.cols)
    for (const j of col) {
      if (j.rope < 0 || j.id > j.rope) continue;
      const a = v.vis.get(j.id);
      const b = v.vis.get(j.rope);
      if (!a || !b || !locate(st, j.rope)) continue;
      const hot = !!v.ropeHint && (v.ropeHint.a === j.id || v.ropeHint.b === j.id);
      const [top, bot] = a.y <= b.y ? [a, b] : [b, a];
      drawRope(ctx, top, bot, l.qSize, hot);
      if (bot.y > l.qBottom - l.qSize * 0.3) tags.push({ x: bot.x, y: l.qBottom - l.qSize * 0.22 });
    }
  st.cols.forEach((col) => {
    for (let d = col.length - 1; d >= 0; d--) {
      const j = col[d];
      const vis = v.vis.get(j.id);
      if (!vis || vis.y > l.qBottom + l.qSize) continue;
      const front = d === 0;
      drawJelly(ctx, vis.x + shakeX(v, j.id), vis.y, l.qSize, st.lvl.palette[j.color], j.n, {
        dim: !front,
        hidden: j.hidden && !front,
        ice: j.ice,
        bounce: vis.bounce,
        glow: v.point === j.id,
      });
      if (j.rope >= 0) {
        ctx.font = `${Math.round(l.qSize * 0.28)}px system-ui`;
        ctx.textAlign = 'center';
        ctx.fillText('🪢', vis.x + l.qSize * 0.36, vis.y - l.qSize * 0.3);
      }
    }
  });
  for (const t of tags) {
    ctx.font = `900 ${Math.round(l.qSize * 0.3)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe28a';
    ctx.fillText('▼', t.x, t.y);
  }
  ctx.restore();
  // Fade the deep rows out.
  const fade = ctx.createLinearGradient(0, l.qBottom - l.qSize * 0.9, 0, l.qBottom);
  fade.addColorStop(0, 'rgba(110,103,99,0)');
  fade.addColorStop(1, 'rgba(110,103,99,0.95)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, l.qBottom - l.qSize * 0.9, l.W, l.qSize * 0.9);
}

function shakeX(v: View, id: number) {
  if (!v.shake || v.shake.id !== id) return 0;
  return Math.sin(v.shake.t * 60) * 6 * (v.shake.t / 0.35);
}

/** Which jelly (if any) a tap at (x, y) hits: slots first, then the queue. */
export function hitTest(v: View, x: number, y: number): number | null {
  const { l, st } = v;
  const s = l.slotSize * 0.62;
  for (let i = 0; i < st.slots.length; i++) {
    const j = st.slots[i];
    const p = l.slots[i];
    if (j && Math.abs(x - p.x) < s && Math.abs(y - p.y) < s) return j.id;
  }
  const q = l.qSize * 0.6;
  for (let c = 0; c < st.cols.length; c++) {
    const col = st.cols[c];
    for (let d = 0; d < Math.min(col.length, 4); d++) {
      const p = { x: l.qx[c], y: l.qy + d * l.qPitch };
      if (Math.abs(x - p.x) < q && Math.abs(y - p.y) < l.qPitch / 2) return col[d].id;
    }
  }
  return null;
}
