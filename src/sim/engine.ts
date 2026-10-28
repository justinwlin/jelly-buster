// Deterministic Jelly Buster rules. Integer-only: no floats in the step, so a level
// played with the same launch commands on the same ticks always ends the same way.

import { exposed, firstInLine, station, trackLength } from './track';

export const TUNING = {
  /** Simulation ticks per second. */
  hz: 60,
  /** Ticks a jelly takes to move one station. */
  sub: 4,
  /** Free stations needed behind the launcher before the next jelly can enter. */
  spacing: 3,
  /** Jellies allowed on the belt at once (the "5/5" counter). */
  belt: 5,
  /** Waiting slots a returning jelly can park in. */
  slots: 5,
  /** Stations a jelly needs to reload after a shot (1 = can fire at every station). */
  reload: 1,
};

export interface JellySpec {
  id: number;
  color: number;
  n: number;
  /** Frozen until this many more jellies have been sent out. */
  ice?: number;
  /** Partner id: both must be sent out together. */
  rope?: number;
  /** Color is hidden until the jelly reaches the front of its column. */
  hidden?: boolean;
}

export interface Level {
  /** Stable id (seed + index) used for saves and tests. */
  id: string;
  index: number;
  name: string;
  w: number;
  h: number;
  /** Color index per cell, -1 for empty. Row-major, y down. */
  cells: number[];
  /** Hex color per color index. */
  palette: string[];
  columns: JellySpec[][];
  slots: number;
  belt: number;
}

export interface Jelly {
  id: number;
  color: number;
  n: number;
  ice: number;
  rope: number;
  hidden: boolean;
}

export interface Runner {
  j: Jelly;
  /** Ticks travelled since entering the belt. */
  p: number;
  /** Station index of the last shot (-99 if none yet). */
  last: number;
}

export type SimEvent =
  | { k: 'launch'; id: number; slot: number; col: number }
  | { k: 'enter'; id: number }
  | { k: 'shot'; id: number; cell: number; color: number; s: number }
  | { k: 'done'; id: number; s: number }
  | { k: 'park'; id: number; slot: number }
  | { k: 'thaw'; id: number }
  | { k: 'win' }
  | { k: 'lose'; reason: 'full' | 'stuck' };

export interface State {
  lvl: Level;
  tick: number;
  cells: number[];
  left: number;
  cols: Jelly[][];
  slots: (Jelly | null)[];
  belt: Runner[];
  /** Launched but waiting for room behind the launcher. */
  pending: Jelly[];
  launches: number;
  status: 'play' | 'won' | 'lost';
  reason: 'full' | 'stuck' | null;
  /** The jelly that came back to full slots (kept so a revive can park it). */
  held: Jelly | null;
  revives: number;
  /** Most slots in use at any one time. */
  peak: number;
  shots: number;
  events: SimEvent[];
  /** Headless runs turn this off so the event list doesn't grow. */
  log: boolean;
}

export function newState(lvl: Level): State {
  const cells = lvl.cells.slice();
  return {
    lvl,
    tick: 0,
    cells,
    left: cells.filter((c) => c >= 0).length,
    cols: lvl.columns.map((col) =>
      col.map((j) => ({ id: j.id, color: j.color, n: j.n, ice: j.ice ?? 0, rope: j.rope ?? -1, hidden: !!j.hidden })),
    ),
    slots: Array.from({ length: lvl.slots }, () => null),
    belt: [],
    pending: [],
    launches: 0,
    status: 'play',
    reason: null,
    held: null,
    revives: 0,
    peak: 0,
    shots: 0,
    events: [],
    log: true,
  };
}

export function cloneState(st: State): State {
  const cj = (j: Jelly): Jelly => ({ ...j });
  return {
    ...st,
    cells: st.cells.slice(),
    cols: st.cols.map((c) => c.map(cj)),
    slots: st.slots.map((j) => (j ? cj(j) : null)),
    belt: st.belt.map((r) => ({ j: cj(r.j), p: r.p, last: r.last })),
    pending: st.pending.map(cj),
    held: st.held ? cj(st.held) : null,
    events: [],
    log: false,
  };
}

const emit = (st: State, e: SimEvent) => {
  if (st.log) st.events.push(e);
};

/** Where a jelly is: a slot index, or a column and depth. */
export function locate(st: State, id: number): { slot: number; col: number; depth: number } | null {
  const slot = st.slots.findIndex((j) => j?.id === id);
  if (slot >= 0) return { slot, col: -1, depth: -1 };
  for (let c = 0; c < st.cols.length; c++) {
    const depth = st.cols[c].findIndex((j) => j.id === id);
    if (depth >= 0) return { slot: -1, col: c, depth };
  }
  return null;
}

/** True if this queue jelly is at the front of its column and not frozen. */
function frontReady(st: State, id: number): boolean {
  const at = locate(st, id);
  if (!at || at.slot >= 0 || at.depth !== 0) return false;
  return st.cols[at.col][0].ice <= 0;
}

/**
 * The jellies a tap on `id` would send out (one, or a roped pair), or null when the tap
 * is not allowed right now. `why` says what's blocking it for UI feedback.
 */
export function launchGroup(st: State, id: number): { group: Jelly[]; why: null } | { group: null; why: 'belt' | 'ice' | 'rope' | 'buried' | 'over' } {
  if (st.status !== 'play') return { group: null, why: 'over' };
  const at = locate(st, id);
  if (!at) return { group: null, why: 'buried' };
  let group: Jelly[];
  if (at.slot >= 0) {
    group = [st.slots[at.slot]!];
  } else {
    if (at.depth !== 0) return { group: null, why: 'buried' };
    const j = st.cols[at.col][0];
    if (j.ice > 0) return { group: null, why: 'ice' };
    if (j.rope >= 0) {
      if (!frontReady(st, j.rope)) return { group: null, why: 'rope' };
      const pat = locate(st, j.rope)!;
      group = [j, st.cols[pat.col][0]];
    } else group = [j];
  }
  if (st.belt.length + st.pending.length + group.length > st.lvl.belt) return { group: null, why: 'belt' };
  return { group, why: null };
}

/** Send a jelly (and its rope partner) out onto the belt. Returns false if not allowed. */
export function launch(st: State, id: number): boolean {
  const { group } = launchGroup(st, id);
  if (!group) return false;
  for (const j of group) {
    const at = locate(st, j.id)!;
    if (at.slot >= 0) st.slots[at.slot] = null;
    else st.cols[at.col].shift();
    j.rope = -1;
    st.pending.push(j);
    st.launches++;
    emit(st, { k: 'launch', id: j.id, slot: at.slot, col: at.col });
  }
  for (const col of st.cols)
    for (const j of col)
      if (j.ice > 0) {
        j.ice = Math.max(0, j.ice - group.length);
        if (j.ice === 0) emit(st, { k: 'thaw', id: j.id });
      }
  return true;
}

/** Every jelly id a tap could send out right now. */
export function legalLaunches(st: State): number[] {
  const out: number[] = [];
  for (const j of st.slots) if (j && launchGroup(st, j.id).group) out.push(j.id);
  for (const col of st.cols) if (col.length && launchGroup(st, col[0].id).group) out.push(col[0].id);
  return out;
}

/** Could anything ever be sent out again, ignoring the belt limit? */
function anyMove(st: State): boolean {
  if (st.slots.some((j) => j)) return true;
  for (const col of st.cols) {
    const j = col[0];
    if (!j || j.ice > 0) continue;
    if (j.rope < 0 || frontReady(st, j.rope)) return true;
  }
  return false;
}

/**
 * Nothing on the belt, no queue jelly can be sent, and no slot jelly matches any cube a
 * jelly could reach: the only taps left would loop forever without a hit.
 */
function deadlocked(st: State): boolean {
  for (const col of st.cols) if (col.length && launchGroup(st, col[0].id).group) return false;
  // Re-sending slot jellies still melts ice, so a frozen front isn't a dead end yet.
  if (st.slots.some((j) => j) && st.cols.some((c) => c.some((j) => j.ice > 0))) return false;
  const { w, h } = st.lvl;
  const want = new Set(st.slots.filter((j) => j).map((j) => j!.color));
  for (const i of exposed(st.cells, w, h)) if (want.has(st.cells[i])) return false;
  return true;
}

export const slotsUsed = (st: State) => st.slots.reduce((n, j) => n + (j ? 1 : 0), 0);

export function step(st: State) {
  if (st.status !== 'play') return;
  st.tick++;
  const { sub, spacing } = TUNING;
  const { w, h } = st.lvl;
  const L = trackLength(w, h);

  if (st.pending.length && !st.belt.some((r) => r.p < spacing * sub)) {
    const j = st.pending.shift()!;
    st.belt.push({ j, p: 0, last: -99 });
    emit(st, { k: 'enter', id: j.id });
  }

  for (const r of st.belt.slice()) {
    r.p++;
    if (r.p % sub) continue;
    const s = r.p / sub;
    if (s >= L) {
      st.belt.splice(st.belt.indexOf(r), 1);
      const free = st.slots.indexOf(null);
      if (free < 0) {
        st.held = r.j;
        st.status = 'lost';
        st.reason = 'full';
        emit(st, { k: 'lose', reason: 'full' });
        return;
      }
      st.slots[free] = r.j;
      st.peak = Math.max(st.peak, slotsUsed(st));
      emit(st, { k: 'park', id: r.j.id, slot: free });
      continue;
    }
    if (s - r.last < TUNING.reload) continue;
    const at = station(w, h, s);
    if (at.side < 0) continue;
    const i = firstInLine(st.cells, w, h, at);
    if (i < 0 || st.cells[i] !== r.j.color) continue;
    st.cells[i] = -1;
    st.left--;
    st.shots++;
    r.last = s;
    r.j.n--;
    emit(st, { k: 'shot', id: r.j.id, cell: i, color: r.j.color, s });
    if (r.j.n <= 0) {
      st.belt.splice(st.belt.indexOf(r), 1);
      emit(st, { k: 'done', id: r.j.id, s });
    }
  }

  if (st.left <= 0) {
    st.status = 'won';
    emit(st, { k: 'win' });
    return;
  }
  if (!st.belt.length && !st.pending.length && (!anyMove(st) || deadlocked(st))) {
    st.status = 'lost';
    st.reason = 'stuck';
    emit(st, { k: 'lose', reason: 'stuck' });
  }
}

/** Continue after running out of slots: add one slot and park the jelly that came back. */
export function revive(st: State): boolean {
  if (st.status !== 'lost' || st.reason !== 'full' || !st.held) return false;
  st.slots.push(st.held);
  emit(st, { k: 'park', id: st.held.id, slot: st.slots.length - 1 });
  st.held = null;
  st.status = 'play';
  st.reason = null;
  st.revives++;
  st.peak = Math.max(st.peak, slotsUsed(st));
  return true;
}

/** 3 stars when you never needed more than two slots, 1 star after a revive. */
export function stars(st: State): number {
  if (st.revives) return 1;
  if (st.peak <= 2) return 3;
  if (st.peak <= 4) return 2;
  return 1;
}
