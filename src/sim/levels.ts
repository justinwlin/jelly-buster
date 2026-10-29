// Level builder: picture → cubes → jellies dealt into columns, with ice, ropes and hidden
// colors layered on as levels go up. Levels are built and checked offline by
// `npm run levels`, which writes src/levels/campaign.json; phones only load that file.

import { COLORS } from './art';
import { playBot } from './bots';
import { BOOSTER_IDS, type Kit } from './boosters';
import { TUNING, type JellySpec, type Level } from './engine';
import { PACKS, type Art } from './pictures';
import { hash32, Rng } from './rng';
import { exposed } from './track';

/** Base deal seed version; keep stable when adding remixes so the first 100 stay unchanged. */
export const GEN_VERSION = 5;
/** Ten chapters of 100 levels: the original campaign plus nine verified remixes. */
export const CAMPAIGN_ROUNDS = 10;
export const BASE_LEVEL_COUNT = PACKS.reduce((n, p) => n + p.pictures.length * 2, 0);

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
  /** 0..1: chance each queue row is regrouped so same-color jellies sit side by side. */
  clump?: number;
  ice: number;
  /** Linked groups of neighbors (side by side or one behind the other). */
  ropes: number;
  /** Chance a linked group has 3 jellies instead of 2. */
  triples?: number;
  /** Linked pairs whose partner starts below the visible rows. */
  farRopes: number;
  hidden: number;
  /** Slots open at the start (the rest of the 5 sockets are locked, unlockable for gold). */
  open: number;
}

/** Every fifth level from level 10: tougher deal, fewer open slots, double gold. */
export const isHard = (index: number) => index >= 9 && (index + 1) % 5 === 0;

/** How hard level `index` (0-based) is, before the picture's own colors are counted. */
export function recipe(index: number): Recipe {
  const n = index + 1;
  // Columns vary level to level, so the queue comes up by twos, threes, fours or fives.
  const pick = (xs: number[]) => xs[hash32(`columns:${index}`) % xs.length];
  return {
    columns: n <= 4 ? 2 : n <= 10 ? pick([2, 3, 3]) : n <= 24 ? pick([2, 3, 3, 4]) : pick([2, 3, 4, 4, 5]),
    // Bigger jellies later on: they need more than one lap, so they come back to a slot.
    chunk: n <= 3 ? [30, 50] : n <= 12 ? [15, 40] : n <= 30 ? [15, 35] : [15, 45],
    scramble: Math.min(0.5, 0.05 + n * 0.015),
    blockers: n <= 3 ? 0 : Math.min(8, 1 + Math.floor(n / 6)),
    ice: n < 8 ? 0 : Math.min(4, 1 + Math.floor((n - 8) / 8)),
    ropes: n < 14 ? 0 : Math.min(3, 1 + Math.floor((n - 14) / 10)),
    triples: n < 26 ? 0 : 0.5,
    farRopes: n < 22 ? 0 : Math.min(2, 1 + Math.floor((n - 22) / 14)),
    hidden: n < 18 ? 0 : Math.min(5, 1 + Math.floor((n - 18) / 6)),
    open: n < 7 ? TUNING.slots : 4,
  };
}

export type Feature = 'locked' | 'ice' | 'hard' | 'rope' | 'layers' | 'hidden' | 'farRope';

/** What level `index` introduces, for the "new!" tip. */
export function newFeature(index: number): Feature | null {
  const n = index + 1;
  return n === 7 ? 'locked' : n === 8 ? 'ice' : n === 10 ? 'hard' : n === 14 ? 'rope' : n === 16 ? 'layers' : n === 18 ? 'hidden' : n === 22 ? 'farRope' : null;
}

/**
 * Cubes in the order a sensible player uncovers them: finish the front picture before
 * starting the hidden picture. Each picture peels from the outside in.
 */
export function peelOrder(cells: number[], w: number, h: number, under: number[] = []): { i: number; color: number }[] {
  const order: { i: number; color: number }[] = [];
  for (const picture of [cells, under]) {
    const c = picture.slice();
    for (;;) {
      const layer = [...exposed(c, w, h)].sort((a, b) => a - b);
      if (!layer.length) break;
      for (const i of layer) {
        order.push({ i, color: c[i] });
        c[i] = -1;
      }
    }
  }
  return order;
}

/**
 * Center two different pictures on one grid. White playable cubes fill only the places
 * where the hidden picture would otherwise stick out past the front picture.
 */
export function stackPictures(front: string[], back: string[], mirror = false): { w: number; h: number; top: string[]; under: string[] } {
  const w = Math.max(...front.map((r) => r.length), ...back.map((r) => r.length));
  const h = Math.max(front.length, back.length);
  const place = (rows: string[]) => {
    const out = Array<string>(w * h).fill('.');
    const dx = Math.floor((w - Math.max(0, ...rows.map((r) => r.length))) / 2);
    const dy = Math.floor((h - rows.length) / 2);
    rows.forEach((row, y) => [...row].forEach((ch, x) => { out[(y + dy) * w + x + dx] = ch; }));
    return out;
  };
  const top = place(front);
  const under = place(back);
  for (let i = 0; i < top.length; i++) if (top[i] === '.' && under[i] !== '.') top[i] = 'W';
  if (mirror) {
    for (const cells of [top, under])
      for (let y = 0; y < h; y++) cells.splice(y * w, w, ...cells.slice(y * w, (y + 1) * w).reverse());
  }
  return { w, h, top, under };
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
  /** A different picture revealed after the first is completely cleared. */
  underArt?: Art;
  /** Encore rounds replay every picture mirrored, with a harder deal. */
  mirror: boolean;
  /** Zero for the original campaign; later rounds reuse its art with a fresh layout. */
  remix?: number;
  sourceIndex?: number;
}

/** Original pictures and encore, then nine chapters that remix their verified deals. */
export function campaign(): Slot[] {
  const out: Slot[] = [];
  for (const mirror of [false, true])
    for (const pack of PACKS) {
      // Fewer colors first within a pack, so each pack ramps up.
      const arts = pack.pictures.map((art, k) => ({ art, k, colors: new Set(art.rows.join('').replace(/\./g, '')).size }));
      arts.sort((a, b) => a.colors - b.colors || a.k - b.k);
      if (pack.id === 'starter') arts.sort((a, b) => (a.art.name === 'Yin-yang' ? -1 : b.art.name === 'Yin-yang' ? 1 : 0));
      for (let k = 0; k < arts.length; k++) {
        const index = out.length;
        const underArt = index >= 15 && (index - 15) % 4 === 0 && arts.length > 1 ? arts[(k + 1) % arts.length].art : undefined;
        out.push({ index, pack: pack.id, art: arts[k].art, underArt, mirror });
      }
    }
  const originals = out.slice();
  for (let round = 1; round < CAMPAIGN_ROUNDS; round++)
    for (let j = 0; j < originals.length; j++) {
      // Level 5 was an easy teaching level; later fifth levels stay genuinely hard.
      const sourceIndex = j === 4 ? 9 : j;
      out.push({ ...originals[sourceIndex], index: out.length, remix: round, sourceIndex });
    }
  return out;
}

/** Rotate saturated colors while leaving white and gray cover tiles neutral. */
function rotateHue(hex: string, degrees: number): string {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const hi = Math.max(...rgb), lo = Math.min(...rgb), d = hi - lo;
  if (d < 0.08) return hex;
  const light = (hi + lo) / 2;
  const sat = d / (1 - Math.abs(2 * light - 1));
  const at = rgb.indexOf(hi);
  const hue = (at === 0 ? ((rgb[1] - rgb[2]) / d) % 6 : at === 1 ? (rgb[2] - rgb[0]) / d + 2 : (rgb[0] - rgb[1]) / d + 4) * 60;
  const shifted = (hue + degrees + 360) % 360;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs((shifted / 60) % 2 - 1));
  const sector = Math.floor(shifted / 60);
  const channels = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][sector];
  return `#${channels.map((v) => Math.round((v + light - c / 2) * 255).toString(16).padStart(2, '0')).join('')}`;
}

/** A remix changes the picture orientation and queue column order, never its hit totals. */
export function remixLevel(base: Level, index: number, round: number, variant: number): Level {
  const flipX = !!(variant & 1), flipY = !!(variant & 2);
  const flip = (cells: number[]) => {
    const out = Array<number>(cells.length);
    for (let y = 0; y < base.h; y++) for (let x = 0; x < base.w; x++)
      out[y * base.w + x] = cells[(flipY ? base.h - 1 - y : y) * base.w + (flipX ? base.w - 1 - x : x)];
    return out;
  };
  return {
    id: `${base.id}/remix-${round}-${index + 1}`,
    index,
    name: base.name,
    ...(base.underName ? { underName: base.underName } : {}),
    w: base.w, h: base.h,
    cells: flip(base.cells),
    ...(base.under ? { under: flip(base.under) } : {}),
    palette: base.palette.map((color) => rotateHue(color, round * 37)),
    columns: (variant & 4 ? base.columns.slice().reverse() : base.columns).map((col) => col.map((j) => ({ ...j }))),
    slots: base.slots, sockets: base.sockets, belt: base.belt,
    ...(base.hard ? { hard: true } : {}),
  };
}

/** Deal jellies for a picture. `attempt` reshuffles; `r` sets how mean the deal is. */
export function buildLevel(slot: Slot, r: Recipe, seed: string, attempt = 0): Level {
  const rng = new Rng(hash32(`${seed}:${slot.index}:${GEN_VERSION}:${attempt}`));
  const { w, h, top: topChars, under: underChars } = stackPictures(slot.art.rows, slot.underArt?.rows ?? [], slot.mirror);
  const letters: string[] = [];
  const numberCells = (chars: string[]) => chars.map((ch) => {
    if (ch === '.') return -1;
    let k = letters.indexOf(ch);
    if (k < 0) k = letters.push(ch) - 1;
    return k;
  });
  const top = numberCells(topChars);
  const under = numberCells(underChars);

  // One jelly per chunk of a color's cubes, in the order those cubes get uncovered.
  const order = peelOrder(top, w, h, under).map((o, k) => ({ ...o, k }));
  const seq: { color: number; n: number; need: number }[] = [];
  // Inner colors (nothing of theirs is reachable at the start) come in small jellies: they
  // are the decoys that punish tapping without looking.
  const first = letters.map((_, c) => order.findIndex((o) => o.color === c));
  const innerAt = order.length * 0.15;
  letters.forEach((_, color) => {
    const list = order.filter((o) => o.color === color);
    if (!list.length) return;
    const inner = first[color] > innerAt;
    let at = 0;
    for (const n of chunkSizes(list.length, inner ? [5, Math.max(5, Math.min(10, r.chunk[0]))] : r.chunk, rng)) {
      seq.push({ color, n, need: list[at].k });
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

  // Clumping: regroup neighbors so a row of fronts often shows the same color several
  // times. Sending them all at once wastes all but the first; careful players pace them.
  if (r.clump) {
    const C = r.columns;
    for (let i = 0; i + C <= seq.length; i += C) {
      if (!rng.chance(r.clump)) continue;
      const win = seq.slice(i, i + 2 * C);
      const count = new Map<number, number>();
      for (const j of win) count.set(j.color, (count.get(j.color) ?? 0) + 1);
      win.sort((a, b) => count.get(b.color)! - count.get(a.color)! || a.color - b.color);
      seq.splice(i, win.length, ...win);
    }
  }

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
    id: `${slot.pack}/${slot.art.name}${slot.mirror ? '/encore' : ''}${slot.remix ? `/remix-${slot.remix}-${slot.index + 1}` : ''}`,
    index: slot.index,
    name: slot.art.name,
    ...(slot.underArt ? { underName: slot.underArt.name } : {}),
    w,
    h,
    cells: top,
    ...(under.some((c) => c >= 0) ? { under } : {}),
    palette: letters.map((l) => COLORS[l]),
    columns,
    slots: r.open,
    sockets: TUNING.slots,
    belt: TUNING.belt,
    ...(isHard(slot.index) ? { hard: true } : {}),
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
  /** Queue-spamming bot wins out of `spamTries`: blind spamming shouldn't reliably win. */
  spam: number;
  spamTries: number;
  /** Human-like bot wins out of `tries` carrying one of each booster. */
  boosted: number;
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
  let boosted = 0;
  let seconds = 0;
  for (let t = 0; t < tries; t++) {
    const h = playBot(lvl, 'human', 11 + t);
    human += +h.won;
    seconds += h.seconds;
    greedy += +playBot(lvl, 'greedy', 21 + t).won;
    boosted += +(h.won || playBot(helped(lvl), 'human', 11 + t, 900, KIT).won);
  }
  const spamTries = SPAM_TRIES;
  const spam = spamWins(lvl, spamTries, 31);
  return { need, human, tries, greedy, spam, spamTries, boosted, seconds: seconds / tries };
}

const SPAM_TRIES = 8;
/** What a player who bought a little help carries: one of each booster... */
const KIT: Kit = Object.fromEntries(BOOSTER_IDS.map((id) => [id, 1]));
/** ...and one locked slot opened with gold, if the level has one. */
const helped = (lvl: Level): Level => ({ ...lvl, slots: Math.min(lvl.sockets ?? lvl.slots, lvl.slots + 1) });
/** From here on a level may lean on boosters: a booster-less human only has to win sometimes. */
export const TOUGH_FROM = 20;

function spamWins(lvl: Level, n = SPAM_TRIES, seed = 31) {
  let w = 0;
  for (let t = 0; t < n; t++) w += +playBot(lvl, 'spam', seed + t).won;
  return w;
}

/** Wins (out of 3) for a careful player who only sends jellies whose color is showing. */
function carefulWins(lvl: Level) {
  return [1, 2, 3].reduce((n, s) => n + +playBot(lvl, 'greedy', s).won, 0);
}

/**
 * Re-order the queue against blind spamming: keep swapping jellies (one near the front,
 * one anywhere) when the spam bot does no better and a careful player still always wins.
 * Stops once spam wins no more than `target` of its tries. A `tough` level goes one step
 * further: the careful player may lose one game in three (boosters cover the gap).
 */
export function harden(lvl: Level, target: number, rng: Rng, iters = 3000, tough = false): Level {
  const floor = tough ? 2 : 3;
  const scoreOf = (spam: number, careful: number) => spam + (tough ? (careful - floor) * 3 : 0);
  let best = lvl;
  let spam = spamWins(best);
  let score = scoreOf(spam, tough ? carefulWins(best) : floor);
  for (let it = 0; it < iters && score > target; it++) {
    const cols = best.columns.map((c) => c.map((j) => ({ ...j })));
    const a = rng.int(0, cols.length);
    const b = rng.int(0, cols.length);
    const da = rng.int(0, Math.min(4, cols[a].length));
    const db = rng.int(0, cols[b].length);
    const A = cols[a][da];
    const B = cols[b][db];
    if (!A || !B || A === B || A.link !== undefined || B.link !== undefined || A.ice || B.ice) continue;
    cols[a][da] = B;
    cols[b][db] = A;
    if (!untangles(cols)) continue;
    const cand = { ...best, columns: cols };
    const sp = spamWins(cand);
    if (sp > spam) continue;
    const careful = carefulWins(cand);
    const sc = scoreOf(sp, careful);
    if (sc <= score && careful >= floor) {
      best = cand;
      spam = sp;
      score = sc;
    }
  }
  return best;
}

/**
 * Slots the level may need, out of the `open` ones (locked slots never count): early levels
 * keep two spare, later and hard ones at least one.
 */
export function needBand(index: number, open = TUNING.slots): [number, number] {
  return [index < 12 ? 1 : 2, Math.max(2, index < 12 && !isHard(index) ? open - 2 : open - 1)];
}

/** Hard levels and everything from TOUGH_FROM on may lean on boosters. */
export const tough = (index: number) => isHard(index) || index >= TOUGH_FROM;

/** Most spam-bot wins (out of 8) a level may allow and still count as interesting. */
export function spamCap(index: number): number {
  const cap = index < 6 ? 8 : index < 15 ? 5 : index < 30 ? 4 : index < 50 ? 3 : 2;
  return isHard(index) ? Math.max(1, cap - 1) : cap;
}

/** Interesting: blind spamming doesn't reliably beat it. */
export function interesting(index: number, c: Check): boolean {
  return c.spam <= spamCap(index);
}

/**
 * A check passes when the level is winnable with margin (the smart bot never needs the last
 * slot) and humans usually win. Later levels may be tougher, as long as a human with one of
 * each booster always wins and one without still wins sometimes.
 */
export function passes(index: number, c: Check, slots = TUNING.slots): boolean {
  const [, hi] = needBand(index, slots);
  if (c.need > hi) return false;
  if (tough(index)) return c.human >= 1 && c.boosted === c.tries;
  return c.human * 3 >= c.tries * 2;
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
  // The first reveal is a teaching level: give players room to discover the second
  // picture before the later paired pictures start asking for tighter slot play.
  if (slot.index === 15) {
    const r = { ...base, chunk: [10, 30] as [number, number], blockers: 0, ice: 0, ropes: 0, farRopes: 0, hidden: 0, scramble: 0, disorder: 0, clump: 0, open: TUNING.slots };
    const level = buildLevel(slot, r, seed, 99);
    const check = checkLevel(level);
    if (!passes(slot.index, check, level.slots)) throw new Error('The introductory reveal must be beatable');
    return { level, check, attempts: 1 };
  }
  if (isHard(slot.index)) {
    base.open = 3;
  }
  const cap = spamCap(slot.index);
  const rng = new Rng(hash32(`${seed}:${slot.index}:harden`));
  // Gentlest first: the base deal, then smaller jellies, then bigger
  // jellies (which need more than one lap, so they come back to a slot more often).
  const variants: Partial<Recipe>[] = [{}, { chunk: [10, 30] }, { chunk: [20, 50] }, ...(isHard(slot.index) ? [{ open: 4 }] : [])];
  const tries = slot.index < 6 ? variants.slice(0, 1) : slot.index < 15 ? variants.slice(0, 2) : variants;
  let best: Built | null = null;
  let attempts = 0;
  for (const v of tries)
    for (let k = 0; k < 2; k++) {
      attempts++;
      const r: Recipe = { ...base, ...v, ropes: k === 1 && attempts > 4 ? 0 : base.ropes };
      let level = buildLevel(slot, r, seed, attempts);
      if (slot.index >= 6) level = harden(level, cap, rng, 3000, tough(slot.index));
      const check = checkLevel(level);
      if (!passes(slot.index, check, level.slots)) continue;
      const built = { level, check, attempts };
      if (interesting(slot.index, check)) return built;
      if (!best || check.spam < best.check.spam) best = built;
    }
  if (best) return best;
  const r = { ...base, blockers: 0, ice: 0, ropes: 0, farRopes: 0, hidden: 0, scramble: 0, disorder: 0, clump: 0, open: isHard(slot.index) ? 4 : TUNING.slots };
  for (let k = 99; k < 120; k++) {
    const level = buildLevel(slot, r, seed, k);
    const check = checkLevel(level);
    if (passes(slot.index, check, level.slots)) return { level, check, attempts: attempts + k - 98 };
  }
  throw new Error(`Could not make ${slot.art.name} beatable with the available slots`);
}
