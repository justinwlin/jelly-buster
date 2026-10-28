// Canvas drawing. Static art (background, board, slots, tray) and the cube picture are baked
// into offscreen layers; jellies, the moving belt and effects are drawn every frame.

import { TUNING, type Jelly, type SimEvent, type State } from '../sim/engine';
import { station, trackLength } from '../sim/track';
import { drawPropeller } from './boosterArt';
import { drawJelly, JELLY_FONT, shade } from './jelly';
import { computeLayout, stationPos, type Layout, type Pt } from './layout';

export { drawJelly, shade };

/** Scene colors in one place. */
export const THEME = {
  skyTop: '#76c3ff',
  skyMid: '#9aa8ff',
  skyBottom: '#c3a3f5',
  beltTop: '#353563',
  beltBottom: '#44447a',
  bedTop: '#e3e8f7',
  bedBottom: '#cfd7ee',
  fade0: 'rgba(195,163,245,0)',
  fade1: 'rgba(195,163,245,0.95)',
};

type Place = 'queue' | 'slot' | 'pending' | 'belt' | 'fly';

interface Vis {
  x: number;
  y: number;
  place: Place;
  /** Arc tween between places. */
  hop: { fx: number; fy: number; t: number; dur: number } | null;
  /** Squash spring. */
  sq: number;
  sqv: number;
  pulse: number;
  /** Recoil offset after a shot, decays. */
  rx: number;
  ry: number;
  wave: number;
  /** Time of the last shot, for the happy face. */
  shotAt: number;
  alarm: number;
  phase: number;
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
  rot: number;
  vr: number;
  kind: 'cube' | 'drop' | 'spark' | 'dust' | 'confetti';
  g: number;
}

interface Shot {
  from: Pt;
  to: Pt;
  t: number;
  dur: number;
  color: string;
  cell: number;
}

interface Ring {
  x: number;
  y: number;
  t: number;
  life: number;
  r: number;
  color: string;
}

interface Popup {
  x: number;
  y: number;
  text: string;
  t: number;
  life: number;
  color: string;
  size: number;
}

export interface View {
  st: State;
  l: Layout;
  dpr: number;
  time: number;
  vis: Map<number, Vis>;
  ghosts: Map<number, number>;
  shots: Shot[];
  parts: Particle[];
  rings: Ring[];
  popups: Popup[];
  /** Cubes flashing as they pop. */
  flashes: { cell: number; color: string; t: number }[];
  popping: { x: number; y: number; color: string; t: number }[];
  beltFlash: number;
  shake: { id: number; t: number } | null;
  /** Linked group to highlight after a blocked tap. */
  ropeHint: { link: number; t: number } | null;
  /** Price tag shown on locked slot sockets. */
  lockPrice: number;
  /** Jellies an armed booster can be used on (they glow), null when nothing is armed. */
  aim: Set<number> | null;
  /** Jellies squishing into a merged one: fly from (x, y) to the jelly `into`. */
  merging: { x: number; y: number; color: string; into: number; t: number }[];
  /** The crane's cable follows this jelly while it's carried to the belt. */
  craneFx: { id: number; t: number } | null;
  point: number | null;
  /** Screen shake amplitude in px, decays. */
  quake: number;
  launcherPulse: number;
  /** Win celebration clock (null until won). */
  won: number | null;
  /** Lose vignette clock. */
  lost: number | null;
  safeTop: number;
  safeBottom: number;
  // Baked layers.
  bg: HTMLCanvasElement | null;
  pic: HTMLCanvasElement | null;
  picDirty: boolean;
  cubeCache: Map<string, HTMLCanvasElement>;
  /** Original cells, for the completed-picture reveal. */
  full: number[];
  lastColor: Map<number, number>;
}

/** Slot sockets to lay out: open and locked ones, plus any added by continuing. */
const sockets = (st: State) => Math.max(st.lvl.sockets ?? st.lvl.slots, st.slots.length);

export function newView(st: State, W: number, H: number, dpr: number, safeTop = 0, safeBottom = 0): View {
  const v: View = {
    st,
    l: computeLayout(W, H, st.lvl.w, st.lvl.h, sockets(st), st.cols.length, safeTop, safeBottom, 0),
    dpr,
    time: 0,
    vis: new Map(),
    ghosts: new Map(),
    shots: [],
    parts: [],
    rings: [],
    popups: [],
    flashes: [],
    popping: [],
    beltFlash: 0,
    shake: null,
    ropeHint: null,
    aim: null,
    lockPrice: 0,
    merging: [],
    craneFx: null,
    point: null,
    quake: 0,
    launcherPulse: 0,
    won: null,
    lost: null,
    safeTop,
    safeBottom,
    bg: null,
    pic: null,
    picDirty: true,
    cubeCache: new Map(),
    full: st.lvl.cells.slice(),
    lastColor: new Map(),
  };
  snapAll(v);
  return v;
}

/** `bar` is the height kept free at the bottom for the booster bar. */
export function relayout(v: View, W: number, H: number, dpr: number, bar = v.l.bar.h) {
  v.dpr = dpr;
  v.l = computeLayout(W, H, v.st.lvl.w, v.st.lvl.h, sockets(v.st), v.st.cols.length, v.safeTop, v.safeBottom, bar);
  v.cubeCache.clear();
  v.bg = null;
  v.pic = null;
  v.picDirty = true;
  snapAll(v);
}

function newVis(x: number, y: number, place: Place, id: number): Vis {
  return { x, y, place, hop: null, sq: 0, sqv: 0, pulse: 0, rx: 0, ry: 0, wave: 0, shotAt: -9, alarm: 0, phase: (id * 1.618) % 1 };
}

function snapAll(v: View) {
  for (const [id, t] of targets(v)) {
    const old = v.vis.get(id);
    const n = newVis(t.x, t.y, t.place, id);
    if (old) Object.assign(n, { sq: old.sq, sqv: old.sqv, shotAt: old.shotAt });
    v.vis.set(id, n);
  }
}

/** Where every jelly should be right now. */
function targets(v: View): Map<number, Pt & { place: Place }> {
  const { st, l } = v;
  const out = new Map<number, Pt & { place: Place }>();
  st.cols.forEach((col, c) => col.forEach((j, d) => out.set(j.id, { x: l.qx[c], y: l.qy + d * l.qPitch, place: 'queue' })));
  st.slots.forEach((j, i) => j && i < l.slots.length && out.set(j.id, { ...l.slots[i], place: 'slot' }));
  st.pending.forEach((j, i) => out.set(j.id, { x: l.launcher.x - i * 5, y: l.launcher.y - l.beltSize * 0.1 + i * 5, place: 'pending' }));
  for (const r of st.belt) out.set(r.j.id, { ...stationPos(l, r.p / TUNING.sub), place: 'belt' });
  st.flyers.forEach((f, i) => out.set(f.j.id, { ...hover(v, i), place: 'fly' }));
  if (st.held) out.set(st.held.id, { x: l.launcher.x, y: l.launcher.y - l.beltSize * 0.1, place: 'pending' });
  return out;
}

/** Where a propeller jelly hovers: over the middle of the picture, drifting in a lazy loop. */
function hover(v: View, i: number): Pt {
  const l = v.l;
  const t = v.time + i * 2;
  return {
    x: l.px + (l.gw * l.cs) / 2 + Math.sin(t * 1.3) * l.cs * 1.6,
    y: l.py + (l.gh * l.cs) / 2 - l.cs * 0.8 + Math.sin(t * 2.6) * l.cs * 0.6,
  };
}

export function cellPt(l: Layout, cell: number, w: number): Pt {
  return { x: l.px + ((cell % w) + 0.5) * l.cs, y: l.py + (Math.floor(cell / w) + 0.5) * l.cs };
}

/** Unit vector from a belt station toward the picture. */
function inward(v: View, s: number): Pt {
  const st = station(v.st.lvl.w, v.st.lvl.h, Math.min(Math.floor(s), trackLength(v.st.lvl.w, v.st.lvl.h) - 1));
  return [{ x: 0, y: -1 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }][st.side] ?? { x: 0.7, y: -0.7 };
}

function spawn(v: View, p: Partial<Particle> & { x: number; y: number }) {
  v.parts.push({ vx: 0, vy: 0, t: 0, life: 0.6, size: 4, color: '#fff', rot: 0, vr: 0, kind: 'drop', g: 600, ...p });
}

function burst(v: View, x: number, y: number, color: string, n: number, size: number, speed = 180, kind: Particle['kind'] = 'drop') {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
    const sp = speed * (0.4 + Math.random() * 0.8);
    spawn(v, { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - speed * 0.35, life: 0.45 + Math.random() * 0.35, size: size * (0.5 + Math.random() * 0.8), color, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, kind });
  }
}

/** React to simulation events: shots, pops, landings. */
export function onEvents(v: View, evs: SimEvent[]) {
  const { st, l } = v;
  for (const e of evs) {
    const vis = v.vis.get((e as { id?: number }).id ?? -1);
    if (e.k === 'shot') {
      const from = e.s < 0 && vis ? { x: vis.x, y: vis.y + l.beltSize * 0.3 } : stationPos(l, Math.max(0, e.s));
      const to = cellPt(l, e.cell, st.lvl.w);
      v.ghosts.set(e.cell, e.color);
      const d = Math.hypot(to.x - from.x, to.y - from.y);
      v.shots.push({ from, to, t: 0, dur: Math.min(0.16, 0.05 + d / 2600), color: st.lvl.palette[e.color], cell: e.cell });
      if (vis) {
        const n = e.s < 0 ? { x: (from.x - to.x) / (d || 1), y: (from.y - to.y) / (d || 1) } : inward(v, e.s);
        vis.rx += (e.s < 0 ? 1 : -1) * n.x * l.beltSize * 0.12;
        vis.ry += (e.s < 0 ? 1 : -1) * n.y * l.beltSize * 0.12;
        vis.sqv += 5;
        vis.pulse = 1;
        vis.shotAt = v.time;
      }
    } else if (e.k === 'done') {
      const p = vis ? { x: vis.x, y: vis.y } : stationPos(l, e.s);
      const color = st.lvl.palette[v.lastColor.get(e.id) ?? 0];
      v.popping.push({ ...p, color, t: 0 });
      v.vis.delete(e.id);
    } else if (e.k === 'park') {
      if (vis) {
        vis.sqv += 9;
        vis.alarm = 0;
      }
    } else if (e.k === 'launch') {
      if (vis) {
        vis.sqv -= 8;
        vis.wave = 1;
      }
    } else if (e.k === 'loop') {
      // Going round again: a little hop of joy.
      if (vis) {
        vis.sqv -= 7;
        vis.shotAt = v.time;
      }
    } else if (e.k === 'enter') {
      v.launcherPulse = 1;
      if (vis) vis.sqv -= 6;
    } else if (e.k === 'lift') {
      if (vis) {
        vis.sqv -= 10;
        vis.wave = 1;
        burst(v, vis.x, vis.y, '#ffffff', 10, l.beltSize * 0.08, 200, 'spark');
      }
    } else if (e.k === 'crane') {
      v.craneFx = { id: e.id, t: 0 };
    } else if (e.k === 'merge') {
      for (const id of e.from) {
        const fv = v.vis.get(id);
        if (fv) v.merging.push({ x: fv.x, y: fv.y, color: st.lvl.palette[v.lastColor.get(id) ?? 0], into: e.id, t: 0 });
      }
    } else if (e.k === 'thaw') {
      if (vis) {
        burst(v, vis.x, vis.y - l.qSize * 0.1, '#dff6ff', 14, l.qSize * 0.1, 160, 'cube');
        vis.sqv += 8;
      }
    } else if (e.k === 'lose') {
      v.lost = 0;
      v.quake = 10;
      if (e.reason === 'full') {
        const j = st.held;
        if (j) {
          const hv = v.vis.get(j.id);
          if (hv) hv.alarm = 1;
        }
      }
    } else if (e.k === 'win') {
      v.won = 0;
    }
  }
}

export function popup(v: View, text: string, color = '#fff', size = 1) {
  const l = v.l;
  v.popups.push({ x: l.px + (l.gw * l.cs) / 2, y: l.py + (l.gh * l.cs) * 0.42, text, t: 0, life: 1.1, color, size });
}

export function confetti(v: View) {
  const { W } = v.l;
  const colors = [...v.st.lvl.palette, '#ffd21f', '#ffffff', '#ff69c8'];
  for (let i = 0; i < 140; i++) {
    spawn(v, {
      x: W / 2 + (Math.random() - 0.5) * 60,
      y: v.l.py + v.l.gh * v.l.cs * 0.5,
      vx: (Math.random() - 0.5) * 900,
      vy: -300 - Math.random() * 700,
      life: 2.2 + Math.random() * 1.2,
      size: 6 + Math.random() * 6,
      color: colors[i % colors.length],
      rot: Math.random() * 6,
      vr: (Math.random() - 0.5) * 16,
      kind: 'confetti',
      g: 700,
    });
  }
}

export function update(v: View, dt: number) {
  v.time += dt;
  const { st, l } = v;
  for (const col of st.cols) for (const j of col) v.lastColor.set(j.id, j.color);
  for (const j of st.slots) if (j) v.lastColor.set(j.id, j.color);
  for (const r of st.belt) v.lastColor.set(r.j.id, r.j.color);
  for (const j of st.pending) v.lastColor.set(j.id, j.color);

  const tg = targets(v);
  const k = Math.min(1, dt * 16);
  for (const [id, t] of tg) {
    let vis = v.vis.get(id);
    if (!vis) {
      vis = newVis(t.x, t.y, t.place, id);
      v.vis.set(id, vis);
    }
    if (vis.place !== t.place) {
      // Changing place: hop along an arc (except slot/queue → pending → belt, which chains).
      const dur = t.place === 'belt' && vis.place === 'pending' ? 0.12 : t.place === 'fly' ? 0.5 : v.craneFx?.id === id ? 0.65 : t.place === 'slot' ? 0.32 : 0.28;
      vis.hop = { fx: vis.x, fy: vis.y, t: 0, dur };
      vis.place = t.place;
    }
    if (vis.hop) {
      vis.hop.t += dt;
      const u = Math.min(1, vis.hop.t / vis.hop.dur);
      const e = u * u * (3 - 2 * u);
      const lift = Math.sin(u * Math.PI) * Math.min(90, 30 + Math.hypot(t.x - vis.hop.fx, t.y - vis.hop.fy) * 0.25);
      vis.x = vis.hop.fx + (t.x - vis.hop.fx) * e;
      vis.y = vis.hop.fy + (t.y - vis.hop.fy) * e - lift;
      if (u >= 1) {
        vis.hop = null;
        vis.sqv += 7;
        if (t.place === 'slot') dust(v, t.x, t.y + l.slotSize * 0.38);
      }
    } else if (t.place === 'belt' || t.place === 'fly') {
      vis.x = t.x;
      vis.y = t.y;
    } else {
      const far = Math.hypot(t.x - vis.x, t.y - vis.y);
      vis.x += (t.x - vis.x) * k;
      vis.y += (t.y - vis.y) * k;
      if (far > 2 && Math.hypot(t.x - vis.x, t.y - vis.y) <= 2) vis.sqv += 4;
    }
    // Squash spring.
    const acc = -180 * vis.sq - 11 * vis.sqv;
    vis.sqv += acc * dt;
    vis.sq += vis.sqv * dt;
    vis.pulse = Math.max(0, vis.pulse - dt * 5);
    vis.rx *= Math.exp(-dt * 14);
    vis.ry *= Math.exp(-dt * 14);
    vis.wave = Math.max(0, vis.wave - dt * 2.5);
    vis.alarm = Math.max(0, vis.alarm - dt * 0.6);
  }
  for (const id of [...v.vis.keys()]) if (!tg.has(id)) v.vis.delete(id);

  for (const s of v.shots) {
    s.t += dt;
    if (s.t >= s.dur) {
      v.ghosts.delete(s.cell);
      v.picDirty = true;
      v.flashes.push({ cell: s.cell, color: s.color, t: 0 });
      const n = 3 + ((Math.random() * 3) | 0);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 70 + Math.random() * 130;
        spawn(v, { x: s.to.x, y: s.to.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, life: 0.5 + Math.random() * 0.3, size: l.cs * (0.32 + Math.random() * 0.25), color: s.color, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 18, kind: 'cube', g: 900 });
      }
      spawn(v, { x: s.to.x, y: s.to.y, life: 0.18, size: l.cs * 1.3, color: '#fff', kind: 'spark', g: 0 });
    }
  }
  v.shots = v.shots.filter((s) => s.t < s.dur);
  for (const f of v.flashes) f.t += dt;
  v.flashes = v.flashes.filter((f) => f.t < 0.16);
  for (const p of v.popping) {
    const before = p.t;
    p.t += dt;
    if (before < 0.12 && p.t >= 0.12) {
      burst(v, p.x, p.y, p.color, 18, l.beltSize * 0.14, 260);
      burst(v, p.x, p.y, '#ffffff', 6, l.beltSize * 0.06, 200, 'spark');
      v.rings.push({ x: p.x, y: p.y, t: 0, life: 0.4, r: l.beltSize * 1.1, color: p.color });
      v.quake = Math.max(v.quake, 3);
    }
  }
  v.popping = v.popping.filter((p) => p.t < 0.2);
  for (const m of v.merging) {
    const before = m.t;
    m.t += dt;
    const into = v.vis.get(m.into);
    if (before < 0.3 && m.t >= 0.3 && into) {
      into.sqv += 12;
      into.pulse = 1;
      burst(v, into.x, into.y, m.color, 12, l.slotSize * 0.12, 200);
      v.rings.push({ x: into.x, y: into.y, t: 0, life: 0.35, r: l.slotSize, color: m.color });
    }
  }
  v.merging = v.merging.filter((m) => m.t < 0.3);
  if (v.craneFx && (v.craneFx.t += dt) > 0.8) v.craneFx = null;
  for (const p of v.parts) {
    p.t += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += p.g * dt;
    if (p.kind === 'confetti') {
      p.vx *= Math.exp(-dt * 1.6);
      p.vy = Math.min(p.vy, 220);
    }
    p.rot += p.vr * dt;
  }
  v.parts = v.parts.filter((p) => p.t < p.life);
  for (const r of v.rings) r.t += dt;
  v.rings = v.rings.filter((r) => r.t < r.life);
  for (const p of v.popups) p.t += dt;
  v.popups = v.popups.filter((p) => p.t < p.life);
  v.beltFlash = Math.max(0, v.beltFlash - dt);
  v.launcherPulse = Math.max(0, v.launcherPulse - dt * 3);
  v.quake *= Math.exp(-dt * 9);
  if (v.won !== null) v.won += dt;
  if (v.lost !== null) v.lost += dt;
  if (v.shake && (v.shake.t -= dt) <= 0) v.shake = null;
  if (v.ropeHint && (v.ropeHint.t -= dt) <= 0) v.ropeHint = null;
}

// ---------------------------------------------------------------- baked layers

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
}

/** Deterministic hash noise for wood grain and cube variation. */
function hash(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function wood(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, light: string, dark: string, seed: number) {
  ctx.save();
  rr(ctx, x, y, w, h, r);
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  ctx.globalAlpha = 0.09;
  ctx.strokeStyle = '#4a2a10';
  for (let i = 0; i < 40; i++) {
    const yy = y + hash(seed + i) * h;
    ctx.lineWidth = 0.6 + hash(seed + i * 3) * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.bezierCurveTo(x + w * 0.3, yy + (hash(i + seed * 2) - 0.5) * 8, x + w * 0.7, yy + (hash(i * 7) - 0.5) * 8, x + w, yy + (hash(i * 5) - 0.5) * 6);
    ctx.stroke();
  }
  ctx.restore();
}

function bakeBg(v: View) {
  const { l, dpr } = v;
  const c = document.createElement('canvas');
  c.width = Math.round(l.W * dpr);
  c.height = Math.round(l.H * dpr);
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  // Candy sky: blue fading to lavender, a soft glow behind the board, light diagonal
  // stripes and a few bokeh dots.
  const g = ctx.createLinearGradient(0, 0, 0, l.H);
  g.addColorStop(0, THEME.skyTop);
  g.addColorStop(0.55, THEME.skyMid);
  g.addColorStop(1, THEME.skyBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, l.W, l.H);
  const glow = ctx.createRadialGradient(l.frame.x + l.frame.w / 2, l.frame.y + l.frame.h / 2, 0, l.frame.x + l.frame.w / 2, l.frame.y + l.frame.h / 2, Math.max(l.frame.w, l.frame.h) * 0.85);
  glow.addColorStop(0, 'rgba(255,255,255,0.35)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, l.W, l.H);
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 18;
  for (let x = -l.H; x < l.W; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, l.H);
    ctx.lineTo(x + l.H, 0);
    ctx.stroke();
  }
  ctx.restore();
  for (let i = 0; i < 14; i++) {
    const x = hash(i * 3.1) * l.W;
    const y = hash(i * 7.7) * l.H;
    const r = 6 + hash(i * 1.3) * 26;
    const b = ctx.createRadialGradient(x, y, 0, x, y, r);
    b.addColorStop(0, 'rgba(255,255,255,0.18)');
    b.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = b;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const f = l.frame;
  const lane = l.lane;
  // Board drop shadow.
  ctx.save();
  ctx.shadowColor = 'rgba(40,30,110,0.35)';
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = '#6b4424';
  rr(ctx, f.x - 7, f.y - 7, f.w + 14, f.h + 14, f.r + 7);
  ctx.fill();
  ctx.restore();
  // Outer rim: wood with a bevel.
  wood(ctx, f.x - 7, f.y - 7, f.w + 14, f.h + 14, f.r + 7, '#e3a463', '#a8692f', 1);
  ctx.strokeStyle = 'rgba(255,240,210,0.5)';
  ctx.lineWidth = 2;
  rr(ctx, f.x - 6, f.y - 6, f.w + 12, f.h + 12, f.r + 6);
  ctx.stroke();
  // Belt bed (rubber), inner shadow along the top edge.
  rr(ctx, f.x, f.y, f.w, f.h, f.r);
  const bg = ctx.createLinearGradient(0, f.y, 0, f.y + f.h);
  bg.addColorStop(0, THEME.beltTop);
  bg.addColorStop(1, THEME.beltBottom);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.save();
  rr(ctx, f.x, f.y, f.w, f.h, f.r);
  ctx.clip();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 6;
  rr(ctx, f.x - 3, f.y - 3, f.w + 6, f.h + 6, f.r + 3);
  ctx.stroke();
  ctx.restore();
  // Inner island: wood rim, then the felt bed with a peg grid.
  const ix = f.x + lane;
  const iy = f.y + lane;
  const iw = f.w - 2 * lane;
  const ih = f.h - 2 * lane;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = '#9b602b';
  rr(ctx, ix - 6, iy - 6, iw + 12, ih + 12, f.r * 0.5 + 6);
  ctx.fill();
  ctx.restore();
  wood(ctx, ix - 6, iy - 6, iw + 12, ih + 12, f.r * 0.5 + 6, '#e8ad6c', '#b0733a', 7);
  rr(ctx, ix, iy, iw, ih, f.r * 0.5);
  const felt = ctx.createLinearGradient(0, iy, 0, iy + ih);
  felt.addColorStop(0, THEME.bedTop);
  felt.addColorStop(1, THEME.bedBottom);
  ctx.fillStyle = felt;
  ctx.fill();
  ctx.save();
  rr(ctx, ix, iy, iw, ih, f.r * 0.5);
  ctx.clip();
  ctx.strokeStyle = 'rgba(40,40,90,0.25)';
  ctx.lineWidth = 5;
  ctx.shadowColor = 'rgba(40,40,90,0.35)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  rr(ctx, ix - 3, iy - 3, iw + 6, ih + 6, f.r * 0.5 + 3);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = 'rgba(60,70,130,0.08)';
  for (let y = 0; y < l.gh; y++)
    for (let x = 0; x < l.gw; x++) {
      ctx.beginPath();
      ctx.arc(l.px + (x + 0.5) * l.cs, l.py + (y + 0.5) * l.cs, Math.max(0.8, l.cs * 0.1), 0, Math.PI * 2);
      ctx.fill();
    }
  // Queue tray: a frosted glass panel with soft wells under each column.
  const trayY = l.qy - l.qSize * 0.78;
  const tx = l.panelX + 8;
  const tw = l.panelW - 16;
  ctx.save();
  ctx.shadowColor = 'rgba(40,30,110,0.18)';
  ctx.shadowBlur = 16;
  ctx.fillStyle = 'rgba(255,255,255,0.26)';
  rr(ctx, tx, trayY, tw, l.H - trayY + 30, 28);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  rr(ctx, tx, trayY, tw, l.H - trayY + 30, 28);
  ctx.stroke();
  for (const x of l.qx) {
    const lg = ctx.createLinearGradient(0, trayY, 0, l.qBottom);
    lg.addColorStop(0, 'rgba(80,70,170,0.14)');
    lg.addColorStop(1, 'rgba(80,70,170,0)');
    ctx.fillStyle = lg;
    rr(ctx, x - l.qSize * 0.52, trayY + l.qSize * 0.12, l.qSize * 1.04, l.qBottom - trayY, l.qSize * 0.4);
    ctx.fill();
  }

  // Slot sockets: carved wooden squares.
  const s = l.slotSize;
  const open = v.st.lvl.sockets ?? v.st.lvl.slots;
  l.slots.forEach((p, i) => {
    // Sockets past the level's own (added by continuing) are green; locked ones are dark.
    const extra = i >= open;
    const locked = !extra && i >= v.st.slots.length;
    ctx.save();
    ctx.shadowColor = 'rgba(40,20,5,0.4)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = extra ? '#5aa04a' : '#a86e3a';
    rr(ctx, p.x - s / 2, p.y - s / 2 + 3, s, s, s * 0.24);
    ctx.fill();
    ctx.restore();
    if (extra) {
      rr(ctx, p.x - s / 2, p.y - s / 2, s, s, s * 0.24);
      ctx.fillStyle = '#9fe08a';
      ctx.fill();
    } else if (locked) wood(ctx, p.x - s / 2, p.y - s / 2, s, s, s * 0.24, '#b58660', '#8f6343', 20 + i);
    else wood(ctx, p.x - s / 2, p.y - s / 2, s, s, s * 0.24, '#f0b877', '#d08f4f', 20 + i);
    ctx.save();
    rr(ctx, p.x - s * 0.36, p.y - s * 0.34, s * 0.72, s * 0.7, s * 0.16);
    ctx.clip();
    ctx.fillStyle = 'rgba(90,50,20,0.22)';
    ctx.fillRect(p.x - s, p.y - s, s * 2, s * 2);
    ctx.shadowColor = 'rgba(60,30,10,0.6)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 3;
    ctx.strokeStyle = 'rgba(60,30,10,0.6)';
    ctx.lineWidth = 4;
    rr(ctx, p.x - s * 0.36 - 2, p.y - s * 0.34 - 2, s * 0.72 + 4, s * 0.7 + 4, s * 0.16);
    ctx.stroke();
    ctx.restore();
  });
  v.bg = c;
}

function cubeSprite(v: View, color: string): HTMLCanvasElement {
  let c = v.cubeCache.get(color);
  if (c) return c;
  const s = Math.max(3, Math.round(v.l.cs * v.dpr));
  c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const x = c.getContext('2d')!;
  const r = s * 0.18;
  const depth = Math.max(1, s * 0.16);
  // Side (depth) and face.
  x.fillStyle = shade(color, -0.42);
  rr(x, 0.5, 0.5, s - 1, s - 1, r);
  x.fill();
  const g = x.createLinearGradient(0, 0, s, s - depth);
  g.addColorStop(0, shade(color, 0.22));
  g.addColorStop(1, shade(color, -0.08));
  x.fillStyle = g;
  rr(x, 0.5, 0.5, s - 1, s - depth, r);
  x.fill();
  // Bevel highlight and gloss.
  x.strokeStyle = shade(color, 0.5, 0.7);
  x.lineWidth = Math.max(1, s * 0.07);
  x.beginPath();
  x.moveTo(r, s * 0.1);
  x.lineTo(s - r, s * 0.1);
  x.stroke();
  x.fillStyle = 'rgba(255,255,255,0.4)';
  rr(x, s * 0.16, s * 0.16, s * 0.34, s * 0.16, s * 0.08);
  x.fill();
  v.cubeCache.set(color, c);
  return c;
}

const picPad = (v: View) => Math.ceil(v.l.cs * 0.25 * v.dpr);

function bakePicture(v: View) {
  const { l, st, dpr } = v;
  if (!v.pic) {
    v.pic = document.createElement('canvas');
    v.pic.width = Math.ceil((l.gw * l.cs + 8) * dpr);
    // Extra room above the top row for raised (layered) cubes.
    v.pic.height = Math.ceil((l.gh * l.cs + 8) * dpr) + picPad(v);
  }
  const ctx = v.pic.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, v.pic.width, v.pic.height);
  ctx.translate(0, picPad(v));
  const cs = l.cs * dpr;
  const { w } = st.lvl;
  // A cube still flying toward its shot is drawn as it was, on top of whatever it uncovers.
  const top = (i: number) => v.ghosts.get(i) ?? st.cells[i];
  const below = (i: number) => (v.ghosts.has(i) ? st.cells[i] : st.under[i]);
  // Soft contact shadow under the cubes.
  ctx.fillStyle = 'rgba(40,25,20,0.28)';
  for (let i = 0; i < st.cells.length; i++) if (top(i) >= 0) ctx.fillRect((i % w) * cs + cs * 0.12, Math.floor(i / w) * cs + cs * 0.22, cs, cs);
  // Layered cells: the cube underneath shows, and the top cube sits on it, raised a little,
  // so the color that comes next peeks out along the bottom edge.
  const lift = cs * 0.2;
  for (let i = 0; i < st.cells.length; i++) {
    const c = top(i);
    if (c < 0) continue;
    const x = (i % w) * cs;
    const y = Math.floor(i / w) * cs;
    const u = below(i);
    if (u >= 0) {
      ctx.drawImage(cubeSprite(v, st.lvl.palette[u]), x, y, cs, cs);
      ctx.fillStyle = 'rgba(30,15,40,0.35)';
      ctx.fillRect(x + cs * 0.08, y + cs - lift - cs * 0.06, cs * 0.84, cs * 0.08);
      ctx.drawImage(cubeSprite(v, st.lvl.palette[c]), x, y - lift, cs, cs);
    } else ctx.drawImage(cubeSprite(v, st.lvl.palette[c]), x, y, cs, cs);
  }
  v.picDirty = false;
}

// ---------------------------------------------------------------- the frame

export function draw(ctx: CanvasRenderingContext2D, v: View) {
  const { l, st, dpr } = v;
  if (!v.bg) bakeBg(v);
  if (v.picDirty || !v.pic) bakePicture(v);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(v.bg!, 0, 0);
  const qx = (Math.random() - 0.5) * v.quake;
  const qy = (Math.random() - 0.5) * v.quake;
  ctx.setTransform(dpr, 0, 0, dpr, qx * dpr, qy * dpr);

  drawTreads(ctx, v);
  // The picture: baked cubes, a white flash on cubes that just popped.
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, (l.px + qx) * dpr, (l.py + qy) * dpr - picPad(v));
  ctx.drawImage(v.pic!, 0, 0);
  ctx.restore();
  for (const f of v.flashes) {
    const u = f.t / 0.16;
    const p = cellPt(l, f.cell, st.lvl.w);
    const s = l.cs * (1 + u * 0.6);
    ctx.globalAlpha = 1 - u;
    ctx.fillStyle = '#fff';
    rr(ctx, p.x - s / 2, p.y - s / 2, s, s, s * 0.2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (v.won !== null) drawReveal(ctx, v);

  drawShots(ctx, v);
  drawLauncher(ctx, v);
  drawPanel(ctx, v);
  drawBeltJellies(ctx, v);
  drawMerging(ctx, v);
  drawCrane(ctx, v);
  drawFlyers(ctx, v);
  drawAimMarks(ctx, v);

  for (const p of v.popping) {
    const u = p.t / 0.2;
    drawJelly(ctx, p.x, p.y, l.beltSize, p.color, '', { scale: 1 + u * 0.5, squash: 0.3 * Math.sin(u * 9), face: true, mood: 'happy' });
  }
  for (const r of v.rings) {
    const u = r.t / r.life;
    ctx.strokeStyle = r.color;
    ctx.globalAlpha = 1 - u;
    ctx.lineWidth = 6 * (1 - u) + 1;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r * (0.3 + u * 0.9), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  drawParticles(ctx, v);
  drawPopups(ctx, v);

  if (v.lost !== null) {
    const a = Math.min(0.5, v.lost * 1.2) * (0.75 + 0.25 * Math.sin(v.lost * 6));
    const g = ctx.createRadialGradient(l.W / 2, l.H / 2, Math.min(l.W, l.H) * 0.3, l.W / 2, l.H / 2, Math.max(l.W, l.H) * 0.75);
    g.addColorStop(0, 'rgba(200,0,0,0)');
    g.addColorStop(1, `rgba(200,20,20,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(-20, -20, l.W + 40, l.H + 40);
  }
}

/** Moving rubber cleats, in step with the jellies riding on them. */
function drawTreads(ctx: CanvasRenderingContext2D, v: View) {
  const { l, st } = v;
  const L = trackLength(st.lvl.w, st.lvl.h);
  const moving = st.status === 'play' && st.belt.length + st.pending.length > 0 && !v.aim;
  const phase = ((v.time * TUNING.hz) / TUNING.sub) % 1;
  const ph = moving ? phase : st.belt.length ? 0 : (v.time * 1.5) % 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.09)';
  ctx.lineWidth = Math.max(2, l.cs * 0.28);
  ctx.lineCap = 'round';
  const half = l.lane * 0.36;
  for (let k = 0; k < L; k++) {
    const s = (k + ph) % L;
    const a = stationPos(l, s);
    const b = stationPos(l, Math.min(L - 0.001, s + 0.05));
    let tx = b.x - a.x;
    let ty = b.y - a.y;
    const m = Math.hypot(tx, ty) || 1;
    tx /= m;
    ty /= m;
    ctx.beginPath();
    ctx.moveTo(a.x - ty * half, a.y + tx * half);
    ctx.lineTo(a.x + ty * half, a.y - tx * half);
    ctx.stroke();
  }
  // Direction chevrons painted on the rim between cleats.
  ctx.strokeStyle = 'rgba(200,210,255,0.2)';
  ctx.lineWidth = Math.max(2, l.lane * 0.07);
  for (let k = 3; k < L; k += 6) {
    const s = (k + ph) % L;
    const a = stationPos(l, s);
    const b = stationPos(l, Math.min(L - 0.001, s + 0.3));
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(ang);
    const z = l.lane * 0.13;
    ctx.beginPath();
    ctx.moveTo(-z, -z * 1.3);
    ctx.lineTo(z * 0.5, 0);
    ctx.lineTo(-z, z * 1.3);
    ctx.stroke();
    ctx.restore();
  }
}

function drawReveal(ctx: CanvasRenderingContext2D, v: View) {
  const { l, st, dpr } = v;
  const t = v.won!;
  const a = Math.min(1, t / 0.6);
  const W = l.gw * l.cs;
  const H = l.gh * l.cs;
  // The finished picture fades back in, with a shine sweeping across it.
  const c = document.createElement('canvas');
  c.width = Math.ceil(W * dpr);
  c.height = Math.ceil(H * dpr);
  const x = c.getContext('2d')!;
  x.scale(dpr, dpr);
  const { w } = st.lvl;
  for (let i = 0; i < v.full.length; i++) {
    const k = v.full[i];
    if (k >= 0) x.drawImage(cubeSprite(v, st.lvl.palette[k]), (i % w) * l.cs, Math.floor(i / w) * l.cs, l.cs, l.cs);
  }
  const sx = -W + ((t * 0.9) % 1.6) * W * 2;
  const g = x.createLinearGradient(sx, 0, sx + W * 0.6, H);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.globalCompositeOperation = 'source-atop';
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  const grow = 0.9 + 0.1 * a;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(l.px + W / 2, l.py + H / 2);
  ctx.scale(grow, grow);
  ctx.drawImage(c, -W / 2, -H / 2, W, H);
  ctx.restore();
}

function drawShots(ctx: CanvasRenderingContext2D, v: View) {
  const r = Math.max(3, v.l.cs * 0.48);
  for (const s of v.shots) {
    const u = s.t / s.dur;
    for (let i = 4; i >= 0; i--) {
      const k = Math.max(0, u - i * 0.07);
      const x = s.from.x + (s.to.x - s.from.x) * k;
      const y = s.from.y + (s.to.y - s.from.y) * k;
      ctx.globalAlpha = i === 0 ? 1 : 0.5 - i * 0.09;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(x, y, r * (1 - i * 0.14), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const x = s.from.x + (s.to.x - s.from.x) * u;
    const y = s.from.y + (s.to.y - s.from.y) * u;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.38, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawLauncher(ctx: CanvasRenderingContext2D, v: View) {
  const { l, st } = v;
  const L = l.launcher;
  const bs = l.beltSize;
  const w = bs * 1.25;
  const h = bs * 1.05;
  const x = L.x - w * 0.62;
  const y = L.y - h * 0.5;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 4;
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, '#5d58b0');
  g.addColorStop(1, '#2e2a6e');
  ctx.fillStyle = g;
  rr(ctx, x, y, w, h, bs * 0.2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 2;
  rr(ctx, x + 1, y + 1, w - 2, h - 2, bs * 0.19);
  ctx.stroke();
  // Chevrons light up when a jelly enters.
  const glow = v.launcherPulse;
  for (let i = 0; i < 3; i++) {
    const cx = x + w * 0.22 + i * w * 0.2;
    const lit = glow > 0 && Math.floor((1 - glow) * 6) % 3 === i;
    ctx.strokeStyle = lit ? '#ffe28a' : 'rgba(230,220,210,0.75)';
    ctx.lineWidth = Math.max(2, bs * 0.09);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, L.y - h * 0.24);
    ctx.lineTo(cx + w * 0.12, L.y);
    ctx.lineTo(cx, L.y + h * 0.24);
    ctx.stroke();
  }
  // Belt capacity: pips plus the n/5 count.
  const free = st.lvl.belt - st.belt.length - st.pending.length;
  const flash = v.beltFlash > 0 && Math.floor(v.beltFlash * 10) % 2 === 0;
  const pw = bs * 1.5;
  const px = l.frame.x + l.lane * 1.25;
  const py = l.frame.y + l.frame.h + 4;
  ctx.fillStyle = flash ? 'rgba(200,30,30,0.92)' : 'rgba(36,26,20,0.9)';
  rr(ctx, px, py - bs * 0.22, pw, bs * 0.44, bs * 0.22);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,230,190,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.font = `800 ${Math.round(bs * 0.34)}px ${JELLY_FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(`${free}/${st.lvl.belt}`, px + bs * 0.13, py + bs * 0.02);
  for (let i = 0; i < st.lvl.belt; i++) {
    ctx.fillStyle = i < free ? '#7be37b' : 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.arc(px + bs * 0.82 + i * bs * 0.13, py, bs * 0.048, 0, Math.PI * 2);
    ctx.fill();
  }
}

function look(v: View, x: number, y: number) {
  const l = v.l;
  const cx = l.px + (l.gw * l.cs) / 2;
  const cy = l.py + (l.gh * l.cs) / 2;
  const d = Math.hypot(cx - x, cy - y) || 1;
  return { x: (cx - x) / d, y: (cy - y) / d };
}

function blink(v: View, vis: Vis) {
  return (v.time + vis.phase * 4) % 3.6 < 0.12;
}

function drawBeltJellies(ctx: CanvasRenderingContext2D, v: View) {
  const { l, st } = v;
  const bs = l.beltSize;
  const draw1 = (j: Jelly) => {
    const vis = v.vis.get(j.id);
    if (!vis) return;
    const happy = v.time - vis.shotAt < 0.35 || v.won !== null;
    const hopY = v.won !== null ? -Math.abs(Math.sin(v.time * 9 + vis.phase * 6)) * bs * 0.25 : 0;
    drawJelly(ctx, vis.x + vis.rx, vis.y + vis.ry + hopY, bs, st.lvl.palette[j.color], j.n, {
      face: true,
      squash: vis.sq,
      pulse: vis.pulse,
      mood: happy ? 'happy' : 'idle',
      blink: blink(v, vis),
      look: look(v, vis.x, vis.y),
      wave: vis.wave * Math.sin(v.time * 30) * 0.6,
      alarm: vis.alarm,
    });
  };
  for (const j of st.pending) draw1(j);
  for (const r of st.belt) draw1(r.j);
  if (st.held) draw1(st.held);
  // Jellies mid-hop to a slot are drawn over everything.
  for (const j of st.slots) if (j && v.vis.get(j.id)?.hop) drawSlotJelly(ctx, v, j);
}

/** Propeller jellies, over everything, with a soft shadow on the picture below. */
function drawFlyers(ctx: CanvasRenderingContext2D, v: View) {
  const { l, st } = v;
  const size = l.beltSize * 1.3;
  for (const f of st.flyers) {
    const vis = v.vis.get(f.j.id);
    if (!vis) continue;
    const up = vis.hop ? Math.min(1, vis.hop.t / vis.hop.dur) : 1;
    ctx.fillStyle = `rgba(40,20,90,${0.22 * up})`;
    ctx.beginPath();
    ctx.ellipse(vis.x, vis.y + size * 0.95, size * 0.42, size * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    const bob = Math.sin(v.time * 7) * size * 0.03;
    const x = vis.x + vis.rx;
    const y = vis.y + vis.ry + bob;
    drawJelly(ctx, x, y, size, st.lvl.palette[f.j.color], f.j.n, {
      face: true,
      squash: vis.sq,
      pulse: vis.pulse,
      mood: v.time - vis.shotAt < 0.35 ? 'shout' : 'happy',
      blink: blink(v, vis),
      look: { x: 0, y: 1 },
      wave: Math.sin(v.time * 12) * 0.5,
    });
    drawPropeller(ctx, x, y - size * 0.52, size * 0.95, v.time);
  }
}

/** An armed booster's targets: a pulsing gold ring and a bouncing arrow over each. */
function drawAimMarks(ctx: CanvasRenderingContext2D, v: View) {
  if (!v.aim) return;
  const { l } = v;
  const pulse = 0.5 + 0.5 * Math.sin(v.time * 7);
  for (const id of v.aim) {
    const vis = v.vis.get(id);
    if (!vis) continue;
    const size = vis.place === 'slot' ? l.slotSize : l.qSize;
    ctx.save();
    ctx.strokeStyle = `rgba(255,214,60,${0.6 + 0.4 * pulse})`;
    ctx.shadowColor = '#ffd23c';
    ctx.shadowBlur = 10 + pulse * 10;
    ctx.lineWidth = 4;
    rr(ctx, vis.x - size * 0.6, vis.y - size * 0.6, size * 1.2, size * 1.2, size * 0.3);
    ctx.stroke();
    ctx.restore();
    const ay = vis.y - size * 0.82 - Math.abs(Math.sin(v.time * 5)) * size * 0.12;
    ctx.fillStyle = '#ffd23c';
    ctx.strokeStyle = '#a35b00';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(vis.x - size * 0.16, ay - size * 0.14);
    ctx.lineTo(vis.x + size * 0.16, ay - size * 0.14);
    ctx.lineTo(vis.x, ay + size * 0.06);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

/** Slot jellies sliding into the one they merged with. */
function drawMerging(ctx: CanvasRenderingContext2D, v: View) {
  const l = v.l;
  for (const m of v.merging) {
    const into = v.vis.get(m.into);
    if (!into) continue;
    const u = Math.min(1, m.t / 0.3);
    const e = u * u;
    const x = m.x + (into.x - m.x) * e;
    const y = m.y + (into.y - m.y) * e - Math.sin(u * Math.PI) * l.slotSize * 0.6;
    drawJelly(ctx, x, y, l.slotSize * (1 - u * 0.5), m.color, '', { face: true, mood: 'happy', squash: -0.2 * Math.sin(u * Math.PI), look: { x: Math.sign(into.x - m.x), y: 0 } });
  }
}

/** The crane's cable and claw, hanging from the top of the screen down to the jelly it carries. */
function drawCrane(ctx: CanvasRenderingContext2D, v: View) {
  const fx = v.craneFx;
  if (!fx) return;
  const vis = v.vis.get(fx.id);
  if (!vis) return;
  const s = (vis.place === 'queue' ? v.l.qSize : v.l.beltSize) * 0.5;
  const a = fx.t > 0.6 ? 1 - (fx.t - 0.6) / 0.2 : 1;
  const top = vis.y - s * 1.1;
  ctx.save();
  ctx.globalAlpha = Math.max(0, a);
  ctx.strokeStyle = '#4b4f66';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(vis.x, -10);
  ctx.lineTo(vis.x, top);
  ctx.stroke();
  ctx.strokeStyle = '#6b6f86';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(vis.x, top);
    ctx.quadraticCurveTo(vis.x + d * s * 1.1, top + s * 0.2, vis.x + d * s * 0.85, top + s * 0.9);
    ctx.stroke();
  }
  ctx.fillStyle = '#ffc21a';
  ctx.beginPath();
  ctx.roundRect(vis.x - s * 0.35, top - s * 0.2, s * 0.7, s * 0.32, 4);
  ctx.fill();
  ctx.restore();
}

function drawSlotJelly(ctx: CanvasRenderingContext2D, v: View, j: Jelly) {
  const { l, st } = v;
  const vis = v.vis.get(j.id);
  if (!vis) return;
  const used = st.slots.filter((x) => x).length;
  const worried = used >= st.slots.length - 1 && st.status === 'play';
  drawJelly(ctx, vis.x + shakeX(v, j.id), vis.y, l.slotSize * 1.02, st.lvl.palette[j.color], j.n, {
    face: true,
    squash: vis.sq,
    pulse: vis.pulse,
    mood: worried ? 'worried' : 'idle',
    blink: blink(v, vis),
    look: { x: 0, y: -1 },
    glow: v.point === j.id || v.aim?.has(j.id) ? v.time : 0,
    dim: !!v.aim && !v.aim.has(j.id),
    alarm: vis.alarm,
  });
}

function drawPanel(ctx: CanvasRenderingContext2D, v: View) {
  const { l, st } = v;
  // Slots: warn when nearly full.
  const s = l.slotSize;
  const used = st.slots.filter((j) => j).length;
  if (used >= st.slots.length - 1 && st.status === 'play') {
    const a = 0.45 + 0.35 * Math.sin(v.time * 8);
    ctx.save();
    ctx.strokeStyle = `rgba(255,70,70,${a})`;
    ctx.shadowColor = 'rgba(255,40,40,0.8)';
    ctx.shadowBlur = 12;
    ctx.lineWidth = 3;
    const x0 = l.slots[0].x - s * 0.64;
    const x1 = l.slots[l.slots.length - 1].x + s * 0.64;
    rr(ctx, x0, l.slots[0].y - s * 0.64, x1 - x0, s * 1.28 + 4, s * 0.3);
    ctx.stroke();
    ctx.restore();
  }
  for (const j of st.slots) if (j && !v.vis.get(j.id)?.hop) drawSlotJelly(ctx, v, j);
  for (let i = st.slots.length; i < l.slots.length; i++) drawLock(ctx, v, l.slots[i]);

  // Queue: front row bright and awake, the rest dimmed and dozing.
  const trayY = l.qy - l.qSize * 0.78;
  ctx.save();
  ctx.beginPath();
  ctx.rect(l.panelX, trayY, l.panelW, l.qBottom - trayY);
  ctx.clip();
  // Links first, so they sit behind the jellies: gooey bridges between neighbors, a long
  // rope (and an arrow) when the partner is further down.
  const tags: Pt[] = [];
  const groups = new Map<number, { j: Jelly; c: number; d: number }[]>();
  st.cols.forEach((col, c) => col.forEach((j, d) => j.link >= 0 && groups.set(j.link, [...(groups.get(j.link) ?? []), { j, c, d }])));
  for (const [link, ms] of groups) {
    ms.sort((a, b) => a.d - b.d || a.c - b.c);
    const hot = v.ropeHint?.link === link;
    for (let i = 1; i < ms.length; i++) {
      // Tie each member to the nearest one before it.
      let best = ms[0];
      for (let k = 0; k < i; k++) if (Math.abs(ms[k].c - ms[i].c) + Math.abs(ms[k].d - ms[i].d) < Math.abs(best.c - ms[i].c) + Math.abs(best.d - ms[i].d)) best = ms[k];
      const a = v.vis.get(best.j.id);
      const b = v.vis.get(ms[i].j.id);
      if (!a || !b) continue;
      const adjacent = Math.abs(best.c - ms[i].c) + Math.abs(best.d - ms[i].d) === 1;
      if (adjacent) drawBridge(ctx, a, b, st.lvl.palette[best.j.color], st.lvl.palette[ms[i].j.color], l.qSize, hot, best.d > 0 && ms[i].d > 0);
      else {
        const [top, bot] = a.y <= b.y ? [a, b] : [b, a];
        drawRope(ctx, top, bot, l.qSize, hot, v.time);
        if (bot.y > l.qBottom - l.qSize * 0.3) tags.push({ x: bot.x, y: l.qBottom - l.qSize * 0.25 });
      }
    }
  }
  st.cols.forEach((col) => {
    for (let d = Math.min(col.length - 1, 5); d >= 0; d--) {
      const j = col[d];
      const vis = v.vis.get(j.id);
      if (!vis || vis.hop) continue;
      const front = d === 0;
      const ready = front && !j.ice && j.link < 0;
      const bob = ready ? Math.sin(v.time * 3 + vis.phase * 6) * l.qSize * 0.02 : 0;
      drawJelly(ctx, vis.x + shakeX(v, j.id), vis.y + bob, l.qSize, st.lvl.palette[j.color], j.n, {
        dim: !front,
        hidden: j.hidden && !front,
        ice: j.ice,
        squash: vis.sq,
        face: front,
        mood: front ? 'idle' : 'sleep',
        blink: front && blink(v, vis),
        look: { x: 0, y: -1 },
        glow: v.point === j.id || v.aim?.has(j.id) ? v.time : 0,
      });
    }
  });
  for (const t of tags) {
    const b = Math.sin(v.time * 5) * 3;
    ctx.fillStyle = '#ffe28a';
    ctx.beginPath();
    ctx.moveTo(t.x - 9, t.y - 6 + b);
    ctx.lineTo(t.x + 9, t.y - 6 + b);
    ctx.lineTo(t.x, t.y + 6 + b);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // Fade the deep rows into the tray.
  const fade = ctx.createLinearGradient(0, l.qBottom - l.qSize, 0, l.qBottom);
  fade.addColorStop(0, THEME.fade0);
  fade.addColorStop(1, THEME.fade1);
  ctx.fillStyle = fade;
  ctx.fillRect(l.panelX, l.qBottom - l.qSize, l.panelW, l.qSize);
}

/** A locked slot socket: a padlock and the gold it costs to open. */
function drawLock(ctx: CanvasRenderingContext2D, v: View, p: Pt) {
  const s = v.l.slotSize;
  const wob = Math.sin(v.time * 2.2 + p.x) * 0.06;
  ctx.save();
  ctx.translate(p.x, p.y - s * 0.08);
  ctx.rotate(wob);
  // Shackle.
  ctx.strokeStyle = '#8d93ad';
  ctx.lineWidth = s * 0.09;
  ctx.beginPath();
  ctx.arc(0, -s * 0.08, s * 0.15, Math.PI, 0);
  ctx.lineTo(s * 0.15, s * 0.02);
  ctx.moveTo(-s * 0.15, -s * 0.08);
  ctx.lineTo(-s * 0.15, s * 0.02);
  ctx.stroke();
  // Body.
  const g = ctx.createLinearGradient(0, -s * 0.05, 0, s * 0.28);
  g.addColorStop(0, '#ffd75e');
  g.addColorStop(1, '#e09a00');
  ctx.fillStyle = g;
  rr(ctx, -s * 0.24, -s * 0.04, s * 0.48, s * 0.34, s * 0.08);
  ctx.fill();
  ctx.fillStyle = '#9c5d00';
  ctx.beginPath();
  ctx.arc(0, s * 0.1, s * 0.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-s * 0.02, s * 0.1, s * 0.04, s * 0.1);
  ctx.restore();
  // Price tag.
  if (v.lockPrice > 0 && v.st.status === 'play') {
    const label = String(v.lockPrice);
    ctx.font = `800 ${Math.round(s * 0.24)}px ${JELLY_FONT}`;
    const tw = ctx.measureText(label).width + s * 0.34;
    const ty = p.y + s * 0.4;
    ctx.fillStyle = '#fff4cc';
    rr(ctx, p.x - tw / 2, ty - s * 0.15, tw, s * 0.3, s * 0.15);
    ctx.fill();
    ctx.fillStyle = '#f5a800';
    ctx.beginPath();
    ctx.arc(p.x - tw / 2 + s * 0.15, ty, s * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6b3d22';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, p.x - tw / 2 + s * 0.28, ty + s * 0.01);
  }
}

/** A squishy bridge between two linked neighbors, with a band around the middle. */
function drawBridge(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, ca: string, cb: string, size: number, hot: boolean, dim: boolean) {
  const t = size * 0.3;
  ctx.save();
  if (dim) ctx.globalAlpha = 0.7;
  ctx.lineCap = 'round';
  if (hot) {
    ctx.shadowColor = '#fff6b0';
    ctx.shadowBlur = size * 0.4;
  }
  const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
  g.addColorStop(0.2, shade(ca, -0.15));
  g.addColorStop(0.8, shade(cb, -0.15));
  ctx.strokeStyle = g;
  ctx.lineWidth = t;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.shadowBlur = 0;
  const hg = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
  hg.addColorStop(0.2, shade(ca, 0.45));
  hg.addColorStop(0.8, shade(cb, 0.45));
  ctx.strokeStyle = hg;
  ctx.lineWidth = t * 0.28;
  const nx = -(b.y - a.y);
  const ny = b.x - a.x;
  const m = Math.hypot(nx, ny) || 1;
  const off = t * 0.18;
  const sx = (nx / m) * off * (ny > 0 ? -1 : 1);
  const sy = (ny / m) * off * (ny > 0 ? -1 : 1);
  ctx.beginPath();
  ctx.moveTo(a.x + sx, a.y + sy - off);
  ctx.lineTo(b.x + sx, b.y + sy - off);
  ctx.stroke();
  // Band.
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.translate(mx, my);
  ctx.rotate(ang);
  ctx.fillStyle = hot ? '#ffe28a' : '#f4c56a';
  ctx.strokeStyle = '#a8701f';
  ctx.lineWidth = Math.max(1.5, size * 0.03);
  ctx.beginPath();
  ctx.roundRect(-t * 0.28, -t * 0.72, t * 0.56, t * 1.44, t * 0.2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawRope(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, size: number, hot: boolean, time: number) {
  ctx.save();
  const sway = Math.sin(time * 2) * size * 0.05;
  const mx = (a.x + b.x) / 2 + sway;
  const my = (a.y + b.y) / 2 + size * 0.3;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(mx, my, b.x, b.y);
  };
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(40,20,5,0.35)';
  ctx.lineWidth = Math.max(5, size * 0.14);
  ctx.translate(0, 3);
  path();
  ctx.stroke();
  ctx.translate(0, -3);
  ctx.strokeStyle = hot ? '#ffe28a' : '#d99a58';
  ctx.lineWidth = Math.max(4, size * 0.11);
  path();
  ctx.stroke();
  // Twisted strands.
  ctx.strokeStyle = hot ? '#fff3c4' : '#8a5a2c';
  ctx.lineWidth = Math.max(1.5, size * 0.035);
  ctx.setLineDash([size * 0.08, size * 0.08]);
  path();
  ctx.stroke();
  ctx.restore();
}

function drawParticles(ctx: CanvasRenderingContext2D, v: View) {
  for (const p of v.parts) {
    const u = p.t / p.life;
    ctx.save();
    ctx.globalAlpha = p.kind === 'confetti' ? Math.min(1, (1 - u) * 3) : 1 - u * u;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    if (p.kind === 'cube') {
      const s = p.size * (1 - u * 0.4);
      ctx.fillStyle = shade(p.color, -0.3);
      rr(ctx, -s / 2, -s / 2, s, s, s * 0.2);
      ctx.fill();
      ctx.fillStyle = p.color;
      rr(ctx, -s / 2, -s / 2, s, s * 0.82, s * 0.2);
      ctx.fill();
    } else if (p.kind === 'confetti') {
      ctx.fillStyle = p.color;
      ctx.scale(1, Math.cos(p.t * 9 + p.rot));
      ctx.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6);
    } else if (p.kind === 'spark') {
      ctx.fillStyle = p.color;
      const s = p.size * (0.5 + u);
      ctx.globalAlpha = (1 - u) * 0.8;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = i % 2 ? s * 0.18 : s * 0.5;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    } else if (p.kind === 'dust') {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(0, 0, p.size * (1 + u), 0, Math.PI * 2);
      ctx.fill();
    } else {
      const s = p.size * (1 - u * 0.5);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(0, 0, s / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.arc(-s * 0.15, -s * 0.15, s * 0.15, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawPopups(ctx: CanvasRenderingContext2D, v: View) {
  for (const p of v.popups) {
    const u = p.t / p.life;
    const pop = u < 0.15 ? 0.5 + (u / 0.15) * 0.7 : u < 0.25 ? 1.2 - ((u - 0.15) / 0.1) * 0.2 : 1;
    ctx.save();
    ctx.globalAlpha = u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1;
    ctx.translate(p.x, p.y - u * 30);
    ctx.scale(pop, pop);
    ctx.rotate(-0.06);
    const fs = Math.round(Math.min(v.l.W * 0.12, 46) * p.size);
    ctx.font = `800 ${fs}px ${JELLY_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = fs * 0.24;
    ctx.strokeStyle = '#5a2a8a';
    ctx.strokeText(p.text, 0, 0);
    const g = ctx.createLinearGradient(0, -fs / 2, 0, fs / 2);
    g.addColorStop(0, '#fff6b0');
    g.addColorStop(1, p.color);
    ctx.fillStyle = g;
    ctx.fillText(p.text, 0, 0);
    ctx.restore();
  }
}

function shakeX(v: View, id: number) {
  if (!v.shake || v.shake.id !== id) return 0;
  return Math.sin(v.shake.t * 60) * 7 * (v.shake.t / 0.35);
}

/** Which jelly (if any) a tap at (x, y) hits: slots first, then the queue. */
export function hitTest(v: View, x: number, y: number): number | null {
  const { l, st } = v;
  const s = l.slotSize * 0.62;
  for (let i = 0; i < st.slots.length && i < l.slots.length; i++) {
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

/** Is (x, y) on a locked slot socket? */
export function hitLocked(v: View, x: number, y: number): boolean {
  const { l, st } = v;
  const s = l.slotSize * 0.62;
  for (let i = st.slots.length; i < l.slots.length; i++) if (Math.abs(x - l.slots[i].x) < s && Math.abs(y - l.slots[i].y) < s) return true;
  return false;
}

/** A small puff of dust, e.g. when a jelly lands in a slot. */
export function dust(v: View, x: number, y: number) {
  for (let i = 0; i < 6; i++) spawn(v, { x: x + (Math.random() - 0.5) * 20, y, vx: (Math.random() - 0.5) * 80, vy: -20 - Math.random() * 30, life: 0.45, size: 4 + Math.random() * 3, color: 'rgba(240,225,200,0.6)', kind: 'dust', g: 0 });
}
