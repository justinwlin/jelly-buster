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
};

/** Propeller booster: ticks to fly up to the middle, then ticks between shots. */
export const FLY = { rise: 30, every: 6 };

export interface JellySpec {
  id: number;
  color: number;
  n: number;
  /** Frozen until this many more jellies have been sent out. */
  ice?: number;
  /** Link group: every jelly with the same link (2 or 3 of them) goes out together. */
  link?: number;
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
  /** Layered pictures: the cube sitting under each cell's cube (-1 for none). Popping the
   * top cube uncovers it in the same spot. */
  under?: number[];
  /** Hex color per color index. */
  palette: string[];
  columns: JellySpec[][];
  /** Slots open at the start. */
  slots: number;
  /** Slot sockets on screen (open + locked); locked ones can be unlocked for gold. */
  sockets?: number;
  belt: number;
  /** Every fifth level from 10 on: a tougher deal, fewer open slots, double gold. */
  hard?: boolean;
}

export interface Jelly {
  id: number;
  color: number;
  n: number;
  ice: number;
  /** Link group id, -1 when not linked. */
  link: number;
  hidden: boolean;
}

export interface Runner {
  j: Jelly;
  /** Ticks travelled since entering the belt. */
  p: number;
  /** Cubes hit since this jelly last passed the launcher. */
  lapHits: number;
}

/** A jelly lifted by a propeller: hovers over the middle and fires down until it's spent. */
export interface Flyer {
  j: Jelly;
  /** Ticks since lift-off. */
  t: number;
}

export type SimEvent =
  | { k: 'launch'; id: number; slot: number; col: number }
  | { k: 'enter'; id: number }
  /** `s` is the belt station it fired from, -1 for a flying jelly. */
  | { k: 'shot'; id: number; cell: number; color: number; s: number }
  | { k: 'done'; id: number; s: number }
  /** Boosters: a propeller lifts a jelly, the crane plucks one from the queue, slot jellies merge. */
  | { k: 'lift'; id: number; slot: number; col: number }
  | { k: 'crane'; id: number; col: number; depth: number }
  | { k: 'merge'; id: number; from: number[] }
  | { k: 'park'; id: number; slot: number }
  /** Queue is empty, so a jelly with hits left goes round again instead of parking. */
  | { k: 'loop'; id: number }
  | { k: 'thaw'; id: number }
  | { k: 'win' }
  | { k: 'lose'; reason: 'full' | 'stuck' };

export interface State {
  lvl: Level;
  tick: number;
  cells: number[];
  /** Cubes still under the top layer, -1 where there are none. */
  under: number[];
  /** Cubes left to pop, both layers. */
  left: number;
  cols: Jelly[][];
  slots: (Jelly | null)[];
  belt: Runner[];
  /** Launched but waiting for room behind the launcher. */
  pending: Jelly[];
  /** Jellies flying over the picture (propeller booster). */
  flyers: Flyer[];
  launches: number;
  /** Boosters used this game. */
  boosts: number;
  /** Locked slots opened with gold this game. */
  unlocks: number;
  status: 'play' | 'won' | 'lost';
  reason: 'full' | 'stuck' | null;
  /** The jelly that came back to full slots (kept so a revive can park it). */
  held: Jelly | null;
  revives: number;
  /** Most slots in use at any one time. */
  peak: number;
  shots: number;
  /** Tick of the most recent shot. */
  lastShot: number;
  events: SimEvent[];
  /** Headless runs turn this off so the event list doesn't grow. */
  log: boolean;
}

export function newState(lvl: Level): State {
  const cells = lvl.cells.slice();
  const under = lvl.under?.slice() ?? cells.map(() => -1);
  return {
    lvl,
    tick: 0,
    cells,
    under,
    left: cells.filter((c) => c >= 0).length + under.filter((c) => c >= 0).length,
    cols: lvl.columns.map((col) =>
      col.map((j) => ({ id: j.id, color: j.color, n: j.n, ice: j.ice ?? 0, link: j.link ?? -1, hidden: !!j.hidden })),
    ),
    slots: Array.from({ length: lvl.slots }, () => null),
    belt: [],
    pending: [],
    flyers: [],
    launches: 0,
    boosts: 0,
    unlocks: 0,
    status: 'play',
    reason: null,
    held: null,
    revives: 0,
    peak: 0,
    shots: 0,
    lastShot: 0,
    events: [],
    log: true,
  };
}

export function cloneState(st: State): State {
  const cj = (j: Jelly): Jelly => ({ ...j });
  return {
    ...st,
    cells: st.cells.slice(),
    under: st.under.slice(),
    cols: st.cols.map((c) => c.map(cj)),
    slots: st.slots.map((j) => (j ? cj(j) : null)),
    belt: st.belt.map((r) => ({ j: cj(r.j), p: r.p, lapHits: r.lapHits })),
    pending: st.pending.map(cj),
    flyers: st.flyers.map((f) => ({ j: cj(f.j), t: f.t })),
    held: st.held ? cj(st.held) : null,
    events: [],
    log: false,
  };
}

const emit = (st: State, e: SimEvent) => {
  if (st.log) st.events.push(e);
};

/** Pop the top cube of a cell: the cube under it (if any) takes its place. */
function pop(st: State, i: number) {
  st.cells[i] = st.under[i];
  st.under[i] = -1;
  st.left--;
  st.shots++;
  st.lastShot = st.tick;
}

/** Slot sockets still locked. */
export const lockedSlots = (st: State) => Math.max(0, (st.lvl.sockets ?? st.lvl.slots) - st.slots.length);

/** Open a locked slot (bought with gold) for the rest of this game. */
export function unlockSlot(st: State): boolean {
  if (st.status !== 'play' || !lockedSlots(st)) return false;
  st.slots.push(null);
  st.unlocks++;
  return true;
}

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

/** Queue jellies sharing a link, with where they sit. */
function members(st: State, link: number) {
  const out: { j: Jelly; col: number; depth: number }[] = [];
  st.cols.forEach((col, c) => col.forEach((j, d) => j.link === link && out.push({ j, col: c, depth: d })));
  return out;
}

/**
 * Can a linked group leave right now (ignoring belt room)? Every member must be unfrozen
 * and have only fellow members ahead of it in its column.
 */
function linkReady(st: State, link: number): 'ice' | 'rope' | null {
  for (const m of members(st, link)) {
    if (m.j.ice > 0) return 'ice';
    if (!st.cols[m.col].slice(0, m.depth).every((x) => x.link === link)) return 'rope';
  }
  return null;
}

/**
 * The jellies a tap on `id` would send out (one, or a linked group), or null when the tap
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
    const j = st.cols[at.col][at.depth];
    if (j.link >= 0) {
      // Any member can be tapped; the group leaves front-most first.
      const why = linkReady(st, j.link);
      if (why) return { group: null, why: at.depth === 0 || why === 'ice' ? why : 'buried' };
      group = members(st, j.link)
        .sort((a, b) => a.depth - b.depth || a.col - b.col)
        .map((m) => m.j);
    } else {
      if (at.depth !== 0) return { group: null, why: 'buried' };
      if (j.ice > 0) return { group: null, why: 'ice' };
      group = [j];
    }
  }
  if (st.belt.length + st.pending.length + group.length > st.lvl.belt) return { group: null, why: 'belt' };
  return { group, why: null };
}

/** Send a jelly (and its linked group) out onto the belt. Returns false if not allowed. */
export function launch(st: State, id: number): boolean {
  const { group } = launchGroup(st, id);
  if (!group) return false;
  for (const j of group) {
    const at = locate(st, j.id)!;
    if (at.slot >= 0) st.slots[at.slot] = null;
    else st.cols[at.col].splice(at.depth, 1);
    j.link = -1;
    st.pending.push(j);
    st.launches++;
    emit(st, { k: 'launch', id: j.id, slot: at.slot, col: at.col });
  }
  thaw(st, group.length);
  return true;
}

/** Every jelly leaving the queue or a slot counts toward melting the ice. */
function thaw(st: State, sent: number) {
  for (const col of st.cols)
    for (const j of col)
      if (j.ice > 0) {
        j.ice = Math.max(0, j.ice - sent);
        if (j.ice === 0) emit(st, { k: 'thaw', id: j.id });
      }
}

// ---------------------------------------------------------------- boosters
// Each booster is a target list (what it may be used on right now; empty means it can't be
// used) and an action. The registry in boosters.ts wires them to names and prices.

/** Propeller: any slot jelly, or a queue front that could leave on its own (no ice, no link). */
export function liftTargets(st: State): number[] {
  if (st.status !== 'play' || st.flyers.length) return [];
  const out: number[] = [];
  for (const j of st.slots) if (j) out.push(j.id);
  for (const col of st.cols) if (col[0] && !col[0].ice && col[0].link < 0) out.push(col[0].id);
  return out;
}

/** Fly a jelly up over the picture, where it fires at every cube of its color until spent. */
export function lift(st: State, id: number): boolean {
  if (!liftTargets(st).includes(id)) return false;
  const at = locate(st, id)!;
  let j: Jelly;
  if (at.slot >= 0) {
    j = st.slots[at.slot]!;
    st.slots[at.slot] = null;
  } else j = st.cols[at.col].shift()!;
  j.hidden = false;
  st.flyers.push({ j, t: 0 });
  st.launches++;
  emit(st, { k: 'lift', id, slot: at.slot, col: at.col });
  thaw(st, 1);
  return true;
}

/**
 * Crane: any queue jelly a tap couldn't send right now (buried, frozen or tied up), as long
 * as the belt has room for it.
 */
export function craneTargets(st: State): number[] {
  if (st.status !== 'play' || st.belt.length + st.pending.length >= st.lvl.belt) return [];
  return st.cols.flat().filter((j) => !launchGroup(st, j.id).group).map((j) => j.id);
}

/** Pluck a jelly out of the queue and set it on the belt: ice cracks, its rope is cut. */
export function crane(st: State, id: number): boolean {
  if (!craneTargets(st).includes(id)) return false;
  const at = locate(st, id)!;
  const [j] = st.cols[at.col].splice(at.depth, 1);
  if (j.link >= 0) {
    const rest = members(st, j.link);
    if (rest.length === 1) rest[0].j.link = -1;
    j.link = -1;
  }
  j.ice = 0;
  j.hidden = false;
  st.pending.push(j);
  st.launches++;
  emit(st, { k: 'crane', id, col: at.col, depth: at.depth });
  emit(st, { k: 'launch', id, slot: -1, col: at.col });
  thaw(st, 1);
  return true;
}

/** Merge: slot jellies that share a color with another slot jelly. */
export function mergeTargets(st: State): number[] {
  if (st.status !== 'play') return [];
  const count = new Map<number, number>();
  for (const j of st.slots) if (j) count.set(j.color, (count.get(j.color) ?? 0) + 1);
  return st.slots.filter((j) => j && count.get(j.color)! > 1).map((j) => j!.id);
}

/** Fold every slot jelly of this one's color into it, freeing their slots. */
export function merge(st: State, id: number): boolean {
  if (!mergeTargets(st).includes(id)) return false;
  const into = st.slots.find((j) => j?.id === id)!;
  const from: number[] = [];
  st.slots.forEach((j, i) => {
    if (!j || j === into || j.color !== into.color) return;
    into.n += j.n;
    from.push(j.id);
    st.slots[i] = null;
  });
  emit(st, { k: 'merge', id, from });
  return true;
}

/** The cube a flying jelly fires at next: the nearest of its color to the middle. */
function flyTarget(st: State, color: number): number {
  const { w, h } = st.lvl;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < st.cells.length; i++) {
    if (st.cells[i] !== color) continue;
    const dx = 2 * (i % w) + 1 - w;
    const dy = 2 * Math.floor(i / w) + 1 - h;
    const d = dx * dx + dy * dy;
    if (d < bestD) [best, bestD] = [i, d];
  }
  return best;
}

function stepFlyers(st: State) {
  for (const f of st.flyers.slice()) {
    f.t++;
    if (f.t < FLY.rise || (f.t - FLY.rise) % FLY.every) continue;
    const i = flyTarget(st, f.j.color);
    if (i >= 0) {
      pop(st, i);
      f.j.n--;
      emit(st, { k: 'shot', id: f.j.id, cell: i, color: f.j.color, s: -1 });
    }
    // Cubes of a color always add up to the hits its jellies have left, so a flyer runs out
    // of cubes and hits together; the check on i is only a guard.
    if (f.j.n <= 0 || i < 0) {
      st.flyers.splice(st.flyers.indexOf(f), 1);
      emit(st, { k: 'done', id: f.j.id, s: -1 });
    }
  }
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
    if (j.link < 0 || !linkReady(st, j.link)) return true;
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

  // Nothing left in the queue: there's no choice to make, so slot jellies go back out on
  // their own whenever the belt has room.
  const queueEmpty = st.cols.every((c) => !c.length);
  if (queueEmpty && st.belt.length + st.pending.length < st.lvl.belt) {
    const j = st.slots.find((x) => x);
    if (j) launch(st, j.id);
  }

  if (st.pending.length && !st.belt.some((r) => r.p < spacing * sub)) {
    const j = st.pending.shift()!;
    st.belt.push({ j, p: 0, lapHits: 0 });
    emit(st, { k: 'enter', id: j.id });
  }

  for (const r of st.belt.slice()) {
    r.p++;
    if (r.p % sub) continue;
    const s = r.p / sub;
    if (s >= L) {
      // With the queue empty, keep going round. Only a jelly that hit nothing all lap
      // steps aside, and only when another is waiting in a slot for belt room.
      if (queueEmpty && !(r.lapHits === 0 && st.slots.some((x) => x))) {
        r.p = 0;
        r.lapHits = 0;
        emit(st, { k: 'loop', id: r.j.id });
        continue;
      }
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
    const at = station(w, h, s);
    if (at.side < 0) continue;
    const i = firstInLine(st.cells, w, h, at);
    if (i < 0 || st.cells[i] !== r.j.color) continue;
    pop(st, i);
    r.lapHits++;
    r.j.n--;
    emit(st, { k: 'shot', id: r.j.id, cell: i, color: r.j.color, s });
    if (r.j.n <= 0) {
      st.belt.splice(st.belt.indexOf(r), 1);
      emit(st, { k: 'done', id: r.j.id, s });
    }
  }

  stepFlyers(st);

  if (st.left <= 0) {
    st.status = 'won';
    emit(st, { k: 'win' });
    return;
  }
  // Looping jellies that go two full laps without a single hit will never hit again.
  const dry = queueEmpty && st.tick - st.lastShot > 2 * (L + spacing * st.lvl.belt) * sub;
  if (dry || (!st.belt.length && !st.pending.length && !st.flyers.length && (!anyMove(st) || deadlocked(st)))) {
    st.status = 'lost';
    st.reason = 'stuck';
    emit(st, { k: 'lose', reason: 'stuck' });
  }
}

/** Continue after running out of slots: add one slot and park the jelly that came back. */
export function revive(st: State): boolean {
  if (st.status !== 'lost' || st.reason !== 'full' || !st.held) return false;
  // A locked socket is the natural place for the extra slot.
  if (lockedSlots(st)) st.unlocks++;
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
