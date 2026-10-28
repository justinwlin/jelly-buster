// Level builder: picture → cubes → jellies dealt into columns, with ice, ropes and hidden
// colors layered on as levels go up. Levels are built and checked offline by
// `npm run levels`, which writes src/levels/campaign.json; the game only loads that file.

import { COLORS } from './art';
import { playBot } from './bots';
import { TUNING, type JellySpec, type Level } from './engine';
import { PACKS, type Art } from './pictures';
import { hash32, Rng } from './rng';
import { exposed } from './track';

/** Bump when built levels change shape, so saved progress can tell. */
export const GEN_VERSION = 1;

export interface Recipe {
  columns: number;
  /** Jelly sizes, multiples of 5. */
  chunk: [number, number];
  /** 0..1: how far the deal strays from the order cubes get uncovered. */
  scramble: number;
  /** Jellies pulled from late in the order up near the front: they must wait in a slot. */
  blockers: number;
  /** 0..1+: how far out of step the whole deal is with the order colors get uncovered. */
  disorder?: number;
  ice: number;
  /** Linked groups of neighbors (side by side or one behind the other). */
  ropes: number;
  /** Chance a linked group has 3 jellies instead of 2. */
  triples?: number;
  /** Linked pairs whose partner starts below the visible rows. */
  farRopes: number;
  hidden: number;
}

/** How hard level `index` (0-based) is, before the picture's own colors are counted. */
export function recipe(index: number): Recipe {
  const n = index + 1;
  // Columns vary level to level, so the queue comes up by twos, threes, fours or fives.
  const pick = (xs: number[]) => xs[hash32(`columns:${index}`) % xs.length];
  return {
    columns: n <= 4 ? 2 : n <= 10 ? pick([2, 3, 3]) : n <= 24 ? pick([2, 3, 3, 4]) : pick([2, 3, 4, 4, 5]),
    chunk: n <= 3 ? [30, 50] : n <= 12 ? [15, 40] : n <= 30 ? [10, 30] : [5, 25],
    scramble: Math.min(0.5, 0.05 + n * 0.015),
    blockers: n <= 3 ? 0 : Math.min(8, 1 + Math.floor(n / 6)),
    ice: n < 8 ? 0 : Math.min(4, 1 + Math.floor((n - 8) / 8)),
    ropes: n < 14 ? 0 : Math.min(3, 1 + Math.floor((n - 14) / 10)),
    triples: n < 26 ? 0 : 0.5,
    farRopes: n < 22 ? 0 : Math.min(2, 1 + Math.floor((n - 22) / 14)),
    hidden: n < 18 ? 0 : Math.min(5, 1 + Math.floor((n - 18) / 6)),
  };
}

export type Feature = 'ice' | 'rope' | 'hidden' | 'farRope';

/** What level `index` introduces, for the "new!" tip. */
export function newFeature(index: number): Feature | null {
  const n = index + 1;
  return n === 8 ? 'ice' : n === 14 ? 'rope' : n === 18 ? 'hidden' : n === 22 ? 'farRope' : null;
}

/** Cells in the order a sensible player uncovers them: outside layers first. */
export function peelOrder(cells: number[], w: number, h: number): number[] {
  const c = cells.slice();
  const order: number[] = [];
  for (;;) {
    const layer = [...exposed(c, w, h)].sort((a, b) => a - b);
    if (!layer.length) return order;
    for (const i of layer) {
      order.push(i);
      c[i] = -1;
    }
  }
}

function chunkSizes(total: number, [lo, hi]: [number, number], rng: Rng): number[] {
  const out: number[] = [];
  let left = total;
  while (left > 0) {
    if (left <= hi) {
      out.push(left);
      break;
    }
    const n = 5 * rng.int(lo / 5, hi / 5 + 1);
    out.push(n);
    left -= n;
  }
  // Fold a tiny remainder into the previous jelly.
  if (out.length > 1 && out[out.length - 1] < lo / 2) out[out.length - 2] += out.pop()!;
  return out;
}

/**
 * Can the queue be emptied at all with these links? A group leaves once every member has
 * only fellow members ahead of it. Crossed links (A tied below B's front while B is tied
 * below A's) deadlock, so the builder never makes them. Ice is ignored: it always melts.
 */
export function untangles(columns: JellySpec[][]): boolean {
  const cols = columns.map((c) => c.slice());
  const ready = (link: number) =>
    cols.every((c) => {
      const at = c.findIndex((j) => j.link === link);
      return at < 0 || c.slice(0, at).every((j) => j.link === link);
    });
  for (;;) {
    if (cols.every((c) => !c.length)) return true;
    let moved = false;
    for (const c of cols) {
      const j = c[0];
      if (!j) continue;
      if (j.link === undefined) {
        c.shift();
        moved = true;
      } else if (ready(j.link)) {
        const link = j.link;
        for (const o of cols) for (let k = o.length - 1; k >= 0; k--) if (o[k].link === link) o.splice(k, 1);
        moved = true;
      }
    }
    if (!moved) return false;
  }
}

export interface Slot {
  /** Global level index. */
  index: number;
  pack: string;
  art: Art;
  /** Encore rounds replay every picture mirrored, with a harder deal. */
  mirror: boolean;
}

/** The campaign: every pack in order, then an encore round of all pictures mirrored. */
export function campaign(): Slot[] {
  const out: Slot[] = [];
  for (const mirror of [false, true])
    for (const pack of PACKS) {
      // Fewer colors first within a pack, so each pack ramps up.
      const arts = pack.pictures.map((art, k) => ({ art, k, colors: new Set(art.rows.join('').replace(/\./g, '')).size }));
      arts.sort((a, b) => a.colors - b.colors || a.k - b.k);
      if (pack.id === 'starter') arts.sort((a, b) => (a.art.name === 'Yin-yang' ? -1 : b.art.name === 'Yin-yang' ? 1 : 0));
      for (const { art } of arts) out.push({ index: out.length, pack: pack.id, art, mirror });
    }
  return out;
}

/** Deal jellies for a picture. `attempt` reshuffles; `r` sets how mean the deal is. */
export function buildLevel(slot: Slot, r: Recipe, seed: string, attempt = 0): Level {
  const rng = new Rng(hash32(`${seed}:${slot.index}:${GEN_VERSION}:${attempt}`));
  const rows = slot.mirror ? slot.art.rows.map((row) => [...row].reverse().join('')) : slot.art.rows;
  const w = Math.max(...rows.map((row) => row.length));
  const h = rows.length;
  const letters: string[] = [];
  const cells: number[] = [];
  for (const row of rows)
    for (const ch of row.padEnd(w, '.')) {
      if (ch === '.') cells.push(-1);
      else {
        let k = letters.indexOf(ch);
        if (k < 0) k = letters.push(ch) - 1;
        cells.push(k);
      }
    }

  // One jelly per chunk of a color's cubes, in the order those cubes get uncovered.
  const order = peelOrder(cells, w, h);
  const rank = new Map(order.map((i, k) => [i, k]));
  const seq: { color: number; n: number; need: number }[] = [];
  // Inner colors (nothing of theirs is reachable at the start) come in small jellies: they
  // are the decoys that punish tapping without looking.
  const first = letters.map((_, c) => order.findIndex((i) => cells[i] === c));
  const innerAt = order.length * 0.15;
  letters.forEach((_, color) => {
    const list = order.filter((i) => cells[i] === color);
    const inner = first[color] > innerAt;
    let at = 0;
    for (const n of chunkSizes(list.length, inner ? [5, Math.max(5, Math.min(10, r.chunk[0]))] : r.chunk, rng)) {
      seq.push({ color, n, need: rank.get(list[at])! });
      at += n;
    }
  });
  // Disorder: each jelly's place in line is its need plus noise, so with more disorder
  // more jellies show up before their color can be reached.
  const dis = (r.disorder ?? 0) * order.length;
  const key = new Map(seq.map((j) => [j, j.need + (rng.float() + rng.float() - 1) * dis]));
  seq.sort((a, b) => key.get(a)! - key.get(b)!);

  // Scramble: nudge jellies a little earlier or later than they're needed.
  const swaps = Math.round(seq.length * r.scramble);
  for (let s = 0; s < swaps; s++) {
    const i = rng.int(0, seq.length - 1);
    const d = Math.min(seq.length - 1 - i, rng.int(1, 3));
    [seq[i], seq[i + d]] = [seq[i + d], seq[i]];
  }
  // Blockers: inner-color jellies dealt early (spread through the first half), so careless
  // taps park jellies that can't be used for a long time.
  const late = seq
    .map((j, k) => ({ j, k }))
    .filter((x) => first[x.j.color] > innerAt && x.k > seq.length * 0.3)
    .sort((a, b) => first[b.j.color] - first[a.j.color] || b.k - a.k);
  const blockers = late.slice(0, r.blockers).map((x) => x.j);
  blockers.forEach((j, b) => {
    seq.splice(seq.indexOf(j), 1);
    const span = Math.max(1, Math.floor(seq.length * 0.5));
    seq.splice(Math.min(seq.length, Math.floor(((b + rng.float()) / Math.max(1, blockers.length)) * span)), 0, j);
  });

  const columns: JellySpec[][] = Array.from({ length: r.columns }, () => []);
  let id = 1;
  for (const j of seq) {
    const min = Math.min(...columns.map((c) => c.length));
    const open = columns.map((c, k) => (c.length === min ? k : -1)).filter((k) => k >= 0);
    columns[rng.pick(open)].push({ id: id++, color: j.color, n: j.n });
  }

  // Ice: frozen for about as many launches as it takes to reach the front.
  const deep = columns.flatMap((c) => c.map((j, d) => ({ j, d }))).filter((x) => x.d >= 1);
  const ahead = (d: number) => columns.reduce((n, c) => n + Math.min(c.length, d), 0);
  for (const x of rng.shuffle(deep).slice(0, r.ice)) {
    // Never more than the jellies dealt ahead of it, so it always thaws in time.
    x.j.ice = Math.max(2, Math.min(ahead(x.d), Math.round(x.d * r.columns * rng.range(0.7, 1.3)) + 1));
  }

  // Links: groups of 2–3 neighbors (side by side, or one behind the other in a column)
  // that leave together. Far links tie a pair whose partner starts 3+ rows down.
  const free = (j: JellySpec | undefined): j is JellySpec => !!j && j.link === undefined && !j.ice;
  let nextLink = 0;
  const tie = (far: boolean) => {
    for (let tries = 0; tries < 60; tries++) {
      const a = rng.int(0, r.columns);
      const da = rng.int(0, Math.max(1, columns[a].length - 1));
      const A = columns[a][da];
      if (!free(A)) continue;
      const group: { c: number; d: number }[] = [{ c: a, d: da }];
      if (far) {
        if (r.columns < 2) return;
        const b = (a + rng.int(1, r.columns)) % r.columns;
        const db = da + rng.int(3, 5);
        if (!free(columns[b][db])) continue;
        group.push({ c: b, d: db });
      } else {
        const size = rng.chance(r.triples ?? 0) ? 3 : 2;
        while (group.length < size) {
          const near = group
            .flatMap((g) => [
              { c: g.c - 1, d: g.d },
              { c: g.c + 1, d: g.d },
              { c: g.c, d: g.d + 1 },
            ])
            .filter((p) => p.c >= 0 && p.c < r.columns && free(columns[p.c][p.d]) && !group.some((g) => g.c === p.c && g.d === p.d));
          if (!near.length) break;
          group.push(rng.pick(near));
        }
        if (group.length < 2) continue;
      }
      const id = nextLink++;
      for (const g of group) columns[g.c][g.d].link = id;
      if (untangles(columns)) return;
      for (const g of group) delete columns[g.c][g.d].link;
    }
  };
  for (let i = 0; i < r.ropes; i++) tie(false);
  for (let i = 0; i < r.farRopes; i++) tie(true);

  const hidable = columns.flatMap((c) => c.slice(1)).filter((j) => !j.ice);
  for (const j of rng.shuffle(hidable).slice(0, r.hidden)) j.hidden = true;

  return {
    id: `${slot.pack}/${slot.art.name}${slot.mirror ? '/encore' : ''}`,
    index: slot.index,
    name: slot.art.name,
    w,
    h,
    cells,
    palette: letters.map((l) => COLORS[l]),
    columns,
    slots: TUNING.slots,
    belt: TUNING.belt,
  };
}

export interface Check {
  /** Fewest slots the smart bot needs to win (slots + 1 if it can't win at all). */
  need: number;
  /** Human-like bot wins out of `tries` with the normal slot count. */
  human: number;
  tries: number;
  /** Greedy bot (no lookahead) wins out of `tries`. */
  greedy: number;
  /** Random tapper wins out of `randTries`: a level random taps can beat isn't much of a puzzle. */
  random: number;
  randTries: number;
  seconds: number;
}

/** Play a level with the bots to see how many slots it really needs and how humans fare. */
export function checkLevel(lvl: Level, tries = 3): Check {
  let need = lvl.slots + 1;
  for (let s = 1; s <= lvl.slots; s++) {
    if (playBot({ ...lvl, slots: s }, 'smart', 1).won) {
      need = s;
      break;
    }
  }
  let human = 0;
  let greedy = 0;
  let seconds = 0;
  for (let t = 0; t < tries; t++) {
    const h = playBot(lvl, 'human', 11 + t);
    human += +h.won;
    seconds += h.seconds;
    greedy += +playBot(lvl, 'greedy', 21 + t).won;
  }
  const randTries = 6;
  let random = 0;
  for (let t = 0; t < randTries; t++) random += +playBot(lvl, 'random', 31 + t).won;
  return { need, human, tries, greedy, random, randTries, seconds: seconds / tries };
}

/** Slots the level may need: early levels keep two spare, later ones at least one. */
export function needBand(index: number, slots = TUNING.slots): [number, number] {
  return [index < 12 ? 1 : 2, index < 12 ? slots - 2 : slots - 1];
}

/** Most random-tap wins (out of 6) a level may allow and still count as interesting. */
export function randomCap(index: number): number {
  return index < 6 ? 6 : index < 15 ? 5 : index < 30 ? 4 : index < 50 ? 3 : 2;
}

/** Interesting: random tapping doesn't reliably beat it. */
export function interesting(index: number, c: Check): boolean {
  return c.random <= randomCap(index);
}

/** A check passes when the level is winnable with margin and humans usually win. */
export function passes(index: number, c: Check, slots = TUNING.slots): boolean {
  const [, hi] = needBand(index, slots);
  return c.need <= hi && c.human * 3 >= c.tries * 2;
}

export interface Built {
  level: Level;
  check: Check;
  attempts: number;
}

/**
 * Search deals for a picture, gentlest first, and ship the first that is beatable with
 * margin and interesting. Never bullies: if nothing interesting passes, it ships the
 * passing deal random tapping does worst on; if nothing passes, it strips the mechanics.
 */
export function searchLevel(slot: Slot, seed = 'jelly'): Built {
  const base = recipe(slot.index + (slot.mirror ? 12 : 0));
  let fallback: Built | null = null;
  const ATTEMPTS = 16;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const meaner = attempt / (ATTEMPTS - 1);
    const r: Recipe = {
      ...base,
      blockers: base.blockers + Math.round(meaner * 12),
      disorder: attempt >= ATTEMPTS / 2 ? 0.1 + 0.15 * meaner : 0,
      ropes: attempt % 4 === 3 ? 0 : base.ropes,
      farRopes: attempt % 4 === 3 ? 0 : base.farRopes,
    };
    const level = buildLevel(slot, r, seed, attempt);
    const check = checkLevel(level);
    if (!passes(slot.index, check)) continue;
    const built = { level, check, attempts: attempt + 1 };
    if (interesting(slot.index, check)) return built;
    if (!fallback || check.random < fallback.check.random) fallback = built;
  }
  if (fallback) return fallback;
  const r = { ...base, blockers: 0, ice: 0, ropes: 0, farRopes: 0, hidden: 0, scramble: 0 };
  const level = buildLevel(slot, r, seed, 99);
  return { level, check: checkLevel(level), attempts: ATTEMPTS + 1 };
}
