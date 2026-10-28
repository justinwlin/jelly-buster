import { describe, expect, it } from 'vitest';
import { launch, lift, lockedSlots, merge, newState, revive, step, TUNING, unlockSlot, type Jelly, type Level } from '../src/sim/engine';
import { trackLength } from '../src/sim/track';
import { buySlot, reward, slotPrice } from '../src/game/economy';
import { fresh } from '../src/game/save';
import { isHard, recipe } from '../src/sim/levels';

const level = (overrides: Partial<Level> = {}): Level => ({
  id: 'test', index: 0, name: 'test', w: 1, h: 1, cells: [0],
  palette: ['#f00', '#00f'], columns: [[{ id: 1, color: 0, n: 1 }], [{ id: 2, color: 1, n: 1 }]],
  slots: 3, sockets: 5, belt: 5, ...overrides,
});

describe('layered cubes', () => {
  it('counts both layers and uncovers the cube beneath the first hit', () => {
    const st = newState(level({ under: [1] }));
    expect(st.left).toBe(2);
    expect(launch(st, 1)).toBe(true);
    for (let i = 0; i < 500 && st.left === 2; i++) step(st);
    expect(st.cells).toEqual([1]);
    expect(st.under).toEqual([-1]);
    expect(st.left).toBe(1);
    expect(st.status).toBe('play');
  });
});

describe('locked slots', () => {
  it('slides waiting jellies left after launch, propeller lift, and merge', () => {
    const st = newState(level());
    const jelly = (id: number, color = 0): Jelly => ({ id, color, n: 1, ice: 0, link: -1, hidden: false });
    st.cols = [[]];
    st.slots = [jelly(10), jelly(11, 1), jelly(12), null, null];
    expect(launch(st, 10)).toBe(true);
    expect(st.slots.map((j) => j?.id ?? null)).toEqual([11, 12, null, null, null]);
    st.pending = [];
    expect(lift(st, 11)).toBe(true);
    expect(st.slots.map((j) => j?.id ?? null)).toEqual([12, null, null, null, null]);
    st.flyers = [];
    st.slots = [jelly(20), jelly(21, 1), jelly(22), null, null];
    expect(merge(st, 20)).toBe(true);
    expect(st.slots.map((j) => j?.id ?? null)).toEqual([20, 21, null, null, null]);
  });

  it('parks a returning jelly in the leftmost available slot', () => {
    const st = newState(level());
    st.slots = [null, null, null];
    st.belt = [{ j: { id: 10, color: 1, n: 1, ice: 0, link: -1, hidden: false }, p: trackLength(st.lvl.w, st.lvl.h) * TUNING.sub - 1, lapHits: 0 }];
    step(st);
    expect(st.slots.map((j) => j?.id ?? null)).toEqual([10, null, null]);
  });

  it('unlocks only available sockets and resets on a new attempt', () => {
    const lvl = level();
    const st = newState(lvl);
    expect(lockedSlots(st)).toBe(2);
    expect(unlockSlot(st)).toBe(true);
    expect(unlockSlot(st)).toBe(true);
    expect(unlockSlot(st)).toBe(false);
    expect(st.slots.length).toBe(5);
    expect(st.unlocks).toBe(2);
    expect(newState(lvl).slots.length).toBe(3);
  });

  it('charges more for each socket, refuses an unaffordable purchase, and charges only on success', () => {
    const st = newState(level());
    const save = fresh();
    expect(slotPrice(st)).toBe(50);
    save.coins = 49;
    expect(buySlot(save, st)).toBe(false);
    expect(save.coins).toBe(49);
    save.coins = 200;
    expect(buySlot(save, st)).toBe(true);
    expect(save.coins).toBe(150);
    expect(slotPrice(st)).toBe(80);
    expect(buySlot(save, st)).toBe(true);
    expect(save.coins).toBe(70);
    expect(buySlot(save, st)).toBe(false);
    expect(save.coins).toBe(70);
  });

  it('uses a locked socket for a revive and counts it as an unlock', () => {
    const st = newState(level());
    st.status = 'lost';
    st.reason = 'full';
    st.held = st.cols[0].shift()!;
    expect(revive(st)).toBe(true);
    expect(st.status).toBe('play');
    expect(st.slots.length).toBe(4);
    expect(st.unlocks).toBe(1);
    expect(lockedSlots(st)).toBe(1);
  });
});

describe('hard levels', () => {
  it('marks every fifth level from 10 and starts them with three open slots', () => {
    for (const n of [10, 15, 20, 100]) expect(isHard(n - 1)).toBe(true);
    for (const n of [5, 9, 11, 16]) expect(isHard(n - 1)).toBe(false);
    expect(recipe(5).open).toBe(5);
    expect(recipe(6).open).toBe(4);
  });

  it('doubles the gold reward', () => {
    for (const stars of [1, 2, 3]) expect(reward(stars, true)).toBe(reward(stars) * 2);
  });
});
