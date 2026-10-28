// Screen layout: where the picture, the belt, the slots and the queue go for a viewport.

import { CORNER, station, trackLength } from '../sim/track';

export interface Pt {
  x: number;
  y: number;
}

export interface Layout {
  W: number;
  H: number;
  /** Cube size in CSS px. */
  cs: number;
  /** Picture top-left. */
  px: number;
  py: number;
  gw: number;
  gh: number;
  /** Belt centerline distance from the picture edge, and belt width. */
  gap: number;
  lane: number;
  /** Belt bounding box (outer edge). */
  frame: { x: number; y: number; w: number; h: number; r: number };
  launcher: Pt;
  /** Slot centers and size. */
  slots: Pt[];
  slotSize: number;
  /** Queue: column centers (x), front row y, row pitch, jelly size. */
  qx: number[];
  qy: number;
  qPitch: number;
  qSize: number;
  /** Lowest y where queue rows are still drawn. */
  qBottom: number;
  /** Left edge and width of the slots + queue panel. */
  panelX: number;
  panelW: number;
  /** Size of a jelly on the belt. */
  beltSize: number;
  landscape: boolean;
}

const TOP_BAR = 78;

export function computeLayout(W: number, H: number, gw: number, gh: number, nSlots: number, nCols: number, safeTop = 0, safeBottom = 0): Layout {
  const landscape = W > H * 1.15;
  // Board size in cube units: picture + belt on both sides.
  const gapU = 2.3;
  const laneU = 4.4;
  const bw = gw + 2 * (gapU + laneU / 2 + 0.4);
  const bh = gh + 2 * (gapU + laneU / 2 + 0.4);
  const top = TOP_BAR + safeTop;
  let cs: number;
  let boardX: number;
  let boardY: number;
  let panel: { x: number; y: number; w: number; h: number };
  if (landscape) {
    const availH = H - top - 34 - safeBottom;
    const availW = W * 0.58;
    cs = Math.min(availW / bw, availH / bh);
    boardX = Math.max(12, (W * 0.58 - bw * cs) / 2);
    boardY = top + (availH - bh * cs) / 2;
    panel = { x: boardX + bw * cs + 16, y: top, w: W - (boardX + bw * cs + 16) - 12, h: availH };
  } else {
    // Leave room below for slots + about 2.6 queue rows.
    const below = Math.min(H * 0.4, 380);
    const availH = H - top - below - safeBottom;
    cs = Math.min((W - 16) / bw, availH / bh);
    boardX = (W - bw * cs) / 2;
    boardY = top + Math.max(0, (availH - bh * cs) / 2);
    const y = boardY + bh * cs + 8;
    panel = { x: 8, y, w: W - 16, h: H - y - safeBottom - 6 };
  }
  cs = Math.floor(cs * 4) / 4;
  const gap = gapU * cs;
  const lane = laneU * cs;
  const px = boardX + (bw * cs - gw * cs) / 2;
  const py = boardY + (bh * cs - gh * cs) / 2;
  const outer = gap + lane / 2;
  const frame = { x: px - outer, y: py - outer, w: gw * cs + 2 * outer, h: gh * cs + 2 * outer, r: lane * 1.1 };

  const slotSize = Math.min(64, (panel.w - 16) / (nSlots + 0.8), panel.h * 0.2);
  const slotY = panel.y + slotSize * 0.65 + 12;
  const slotGap = Math.min(slotSize * 0.25, (panel.w - slotSize * nSlots) / Math.max(1, nSlots + 1));
  const slotsW = nSlots * slotSize + (nSlots - 1) * slotGap;
  const slots = Array.from({ length: nSlots }, (_, i) => ({ x: panel.x + (panel.w - slotsW) / 2 + slotSize / 2 + i * (slotSize + slotGap), y: slotY }));

  const qTop = slotY + slotSize * 0.75;
  const qSize = Math.min(86, slotSize * 1.3, (panel.w - 20) / (nCols * 1.22), (panel.y + panel.h - slotY - slotSize) / 2.4);
  const qPitch = qSize * 1.05;
  const qx = Array.from({ length: nCols }, (_, i) => panel.x + panel.w / 2 + (i - (nCols - 1) / 2) * qSize * 1.18);
  const qy = qTop + qSize * 0.62;

  return {
    W,
    H,
    cs,
    px,
    py,
    gw,
    gh,
    gap,
    lane,
    frame,
    launcher: { x: px - gap * 0.72, y: py + gh * cs + gap * 0.72 },
    slots,
    slotSize,
    qx,
    qy,
    qPitch,
    qSize,
    qBottom: panel.y + panel.h,
    panelX: landscape ? panel.x - 8 : 0,
    panelW: landscape ? W - panel.x + 8 : W,
    beltSize: lane * 1.02,
    landscape,
  };
}

/** Position of belt station `s` (fractional) on screen. */
export function stationPos(l: Layout, s: number): Pt {
  const L = trackLength(l.gw, l.gh);
  if (s >= L) return cornerPt(l, 0, 0);
  const a = Math.floor(s);
  const t = s - a;
  const p0 = stationPt(l, a);
  const p1 = a + 1 >= L ? cornerPt(l, 0, 0) : stationPt(l, a + 1);
  return { x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t };
}

/** Corner arcs, clockwise from bottom-left (0) to top-left (3); u in 0..1 along the arc. */
export function cornerPt(l: Layout, c: number, u: number): Pt {
  const { px, py, gw, gh, cs, gap } = l;
  const centers = [
    { x: px, y: py + gh * cs },
    { x: px + gw * cs, y: py + gh * cs },
    { x: px + gw * cs, y: py },
    { x: px, y: py },
  ];
  // Start/end angles (screen coords, y down) for each corner, going around the loop.
  const from = [Math.PI, Math.PI / 2, 0, -Math.PI / 2][c];
  const ang = from - (Math.PI / 2) * u;
  const k = centers[c];
  return { x: k.x + Math.cos(ang) * gap, y: k.y + Math.sin(ang) * gap };
}

function stationPt(l: Layout, s: number): Pt {
  const st = station(l.gw, l.gh, s);
  const { px, py, gw, gh, cs, gap } = l;
  if (st.side === 0) return { x: px + (st.k + 0.5) * cs, y: py + gh * cs + gap };
  if (st.side === 1) return { x: px + gw * cs + gap, y: py + (st.k + 0.5) * cs };
  if (st.side === 2) return { x: px + (st.k + 0.5) * cs, y: py - gap };
  if (st.side === 3) return { x: px - gap, y: py + (st.k + 0.5) * cs };
  // Corner station: which corner and how far along it.
  const seg = [0, CORNER + gw, 2 * CORNER + gw + gh, 3 * CORNER + 2 * gw + gh];
  const c = st.k;
  const i = s - seg[c];
  return cornerPt(l, c, (i + 1) / (CORNER + 1));
}
