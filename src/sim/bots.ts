// Headless players used to tune difficulty and to check generated levels are winnable.
//
//  spam    hammers the queue fronts as fast as it can, slots only as a last resort
//  random  taps any legal jelly whenever the belt has room
//  greedy  sends the jelly whose color has the most cubes exposed right now
//  smart   tries every legal tap in a cloned game for one lap and picks the best
//  human   smart, but slower to react and sometimes picks a worse option

import { cloneState, launch, legalLaunches, locate, newState, slotsUsed, stars, step, TUNING, type Level, type State } from './engine';
import { BOOSTERS, useBooster, type BoosterId, type Kit } from './boosters';
import { Rng } from './rng';
import { exposed, trackLength } from './track';

export type Policy = 'spam' | 'random' | 'greedy' | 'smart' | 'human';
export const POLICIES: Policy[] = ['spam', 'random', 'greedy', 'human', 'smart'];

export interface BotResult {
  won: boolean;
  reason: State['reason'];
  seconds: number;
  peak: number;
  launches: number;
  stars: number;
  /** Fraction of cubes cleared. */
  cleared: number;
  /** Boosters used. */
  boosts: number;
}

const REACT: Record<Policy, number> = { spam: 10, random: 30, greedy: 12, smart: 6, human: 36 };

function colorOf(st: State, id: number) {
  const at = locate(st, id)!;
  return at.slot >= 0 ? st.slots[at.slot]!.color : st.cols[at.col][at.depth].color;
}

function fromSlot(st: State, id: number) {
  return locate(st, id)!.slot >= 0;
}

/** Run the game forward without new taps for `ticks` (or until it ends). */
function coast(st: State, ticks: number) {
  for (let i = 0; i < ticks && st.status === 'play'; i++) step(st);
}

interface Option {
  id: number;
  hits: number;
  score: number;
}

/** Score every legal tap by playing one lap ahead in a copy of the game. */
export function rankOptions(st: State): Option[] {
  const legal = legalLaunches(st);
  if (!legal.length) return [];
  const lap = trackLength(st.lvl.w, st.lvl.h) * TUNING.sub + TUNING.spacing * TUNING.sub * (st.pending.length + 2);
  const base = cloneState(st);
  coast(base, lap);
  const baseShots = base.shots;
  const baseLost = base.status === 'lost';
  const out: Option[] = [];
  for (const id of legal) {
    const c = cloneState(st);
    const slotBefore = slotsUsed(c);
    const wasSlot = fromSlot(c, id);
    launch(c, id);
    coast(c, lap);
    const hits = c.shots - baseShots;
    let score = hits;
    if (c.status === 'lost' && !baseLost) score -= 1000;
    if (c.status === 'won') score += 1000;
    // Prefer taps that leave slots free: queue jellies that come back cost a slot.
    const slotAfter = slotsUsed(c);
    score -= (slotAfter - slotBefore) * (2 + 3 * slotBefore);
    if (wasSlot) score += 0.5;
    out.push({ id, hits, score });
  }
  return out.sort((a, b) => b.score - a.score || a.id - b.id);
}

function decide(st: State, policy: Policy, rng: Rng): number | null {
  const legal = legalLaunches(st);
  if (!legal.length) return null;
  const idle = !st.belt.length && !st.pending.length;

  if (policy === 'random') return rng.pick(legal);
  if (policy === 'spam') {
    // Blind spamming: hammer whatever is at the front of the queue, only touching slots
    // when nothing in the queue can go.
    const fronts = legal.filter((id) => !fromSlot(st, id));
    return rng.pick(fronts.length ? fronts : legal);
  }

  if (policy === 'greedy') {
    const ex = exposed(st.cells, st.lvl.w, st.lvl.h);
    const count = new Map<number, number>();
    for (const i of ex) count.set(st.cells[i], (count.get(st.cells[i]) ?? 0) + 1);
    let best: number | null = null;
    let bestScore = 0;
    for (const id of legal) {
      const s = (count.get(colorOf(st, id)) ?? 0) + (fromSlot(st, id) ? 0.5 : 0);
      if (s > bestScore && (count.get(colorOf(st, id)) ?? 0) > 0) [best, bestScore] = [id, s];
    }
    if (best !== null) return best;
    return idle ? rng.pick(legal) : null;
  }

  const opts = rankOptions(st);
  const useful = opts.filter((o) => o.hits > 0 && o.score > 0);
  if (policy === 'human') {
    if (rng.chance(0.06)) return rng.pick(legal);
    if (useful.length > 1 && rng.chance(0.25)) return useful[1].id;
  }
  if (useful.length) return useful[0].id;
  if (!idle) return null;
  // Nothing helps right now: dig into the queue with the least harmful tap (re-sending a
  // slot jelly that hits nothing just wastes a lap).
  const dig = opts.filter((o) => o.score > -1000 && !fromSlot(st, o.id));
  return (dig[0] ?? opts[0])?.id ?? null;
}

/**
 * Booster habits for a bot carrying a kit: merge and propeller when slots run low, the crane
 * when nothing in reach helps. Returns true if it used one.
 */
function useKit(st: State, kit: Kit): boolean {
  const has = (id: BoosterId) => (kit[id] ?? 0) > 0 && BOOSTERS[id].targets(st).length > 0;
  const spend = (id: BoosterId, target: number) => {
    if (!useBooster(st, id, target)) return false;
    kit[id]!--;
    return true;
  };
  const used = slotsUsed(st);
  const tight = used >= st.slots.length - 2;
  if (tight && has('merge')) return spend('merge', BOOSTERS.merge.targets(st)[0]);
  if (used >= st.slots.length - 1 && has('propeller')) {
    const slotIds = new Set(st.slots.filter((j) => j).map((j) => j!.id));
    const best = BOOSTERS.propeller.targets(st)
      .filter((id) => slotIds.has(id))
      .sort((a, b) => st.slots.find((j) => j?.id === b)!.n - st.slots.find((j) => j?.id === a)!.n)[0];
    if (best !== undefined) return spend('propeller', best);
  }
  if (tight && has('crane') && !st.belt.length && !st.pending.length) {
    const ex = exposed(st.cells, st.lvl.w, st.lvl.h);
    const want = new Set([...ex].map((i) => st.cells[i]));
    const pick = BOOSTERS.crane.targets(st).find((id) => want.has(colorOf(st, id)));
    if (pick !== undefined) return spend('crane', pick);
  }
  return false;
}

export function playBot(lvl: Level, policy: Policy, seed = 1, maxSeconds = 900, kit: Kit = {}): BotResult {
  const st = newState(lvl);
  kit = { ...kit };
  st.log = false;
  const rng = new Rng(seed);
  const react = REACT[policy];
  const total = st.left;
  const maxTicks = maxSeconds * TUNING.hz;
  let wait = 0;
  while (st.status === 'play' && st.tick < maxTicks) {
    if (wait <= 0 && useKit(st, kit)) wait = react;
    if (wait-- <= 0 && st.belt.length + st.pending.length < lvl.belt) {
      const id = decide(st, policy, rng);
      if (id !== null) launch(st, id);
      wait = react;
    }
    step(st);
  }
  return {
    won: st.status === 'won',
    reason: st.status === 'play' ? null : st.reason,
    seconds: st.tick / TUNING.hz,
    peak: st.peak,
    launches: st.launches,
    stars: st.status === 'won' ? stars(st) : 0,
    cleared: 1 - st.left / total,
    boosts: st.boosts,
  };
}
