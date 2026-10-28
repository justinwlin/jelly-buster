import { describe, expect, it } from 'vitest';
import { launch, launchGroup, legalLaunches, newState, revive, step, TUNING, type JellySpec, type Level, type State } from '../src/sim/engine';
import { firstInLine, station, trackLength } from '../src/sim/track';

/** A tiny level: `rows` of palette indices ('.' empty), and columns of jellies. */
function level(rows: string[], columns: JellySpec[][], slots = 5, belt = 5): Level {
  const w = rows[0].length;
  return {
    id: 'test',
    index: 0,
    name: 'test',
    w,
    h: rows.length,
    cells: rows.join('').split('').map((c) => (c === '.' ? -1 : Number(c))),
    palette: ['#f00', '#00f', '#0f0'],
    columns,
    slots,
    belt,
  };
}

const lap = (lvl: Level) => trackLength(lvl.w, lvl.h) * TUNING.sub + TUNING.spacing * TUNING.sub * 6;
function run(st: State, ticks: number) {
  for (let i = 0; i < ticks && st.status === 'play'; i++) step(st);
}

describe('track', () => {
  it('visits every row and column from both sides once per lap', () => {
    const w = 4;
    const h = 3;
    const seen = { 0: 0, 1: 0, 2: 0, 3: 0 } as Record<number, number>;
    for (let s = 0; s < trackLength(w, h); s++) {
      const st = station(w, h, s);
      if (st.side >= 0) seen[st.side]++;
    }
    expect(seen).toEqual({ 0: w, 1: h, 2: w, 3: h });
  });

  it('a station sees only the first cube in its line', () => {
    const cells = [0, 1, 1, 0];
    expect(firstInLine(cells, 4, 1, { side: 3, k: 0 })).toBe(0);
    expect(firstInLine(cells, 4, 1, { side: 1, k: 0 })).toBe(3);
    cells[0] = -1;
    expect(firstInLine(cells, 4, 1, { side: 3, k: 0 })).toBe(1);
  });
});

describe('engine', () => {
  it('a jelly eats exposed cubes of its color and wins the level', () => {
    const lvl = level(['00', '00'], [[{ id: 1, color: 0, n: 4 }]]);
    const st = newState(lvl);
    expect(launch(st, 1)).toBe(true);
    run(st, lap(lvl));
    expect(st.status).toBe('won');
    expect(st.left).toBe(0);
  });

  it('cannot hit a cube hidden behind another color', () => {
    // A single row: blue in the middle is covered on both sides by red.
    const lvl = level(['010'], [[{ id: 1, color: 1, n: 1 }], [{ id: 2, color: 0, n: 2 }]]);
    const st = newState(lvl);
    launch(st, 1);
    // Blue sees it from above/below, so it does hit (top/bottom stations look down the column).
    run(st, lap(lvl));
    expect(st.cells[1]).toBe(-1);
  });

  // A red cube walled in by blue: red can't hit it until blue has cleared the ring.
  const walled = ['111', '101', '111'];

  it('with the queue empty, a jelly with hits left keeps going round instead of parking', () => {
    const lvl = level(walled, [[{ id: 1, color: 0, n: 1 }], [{ id: 2, color: 1, n: 8 }]]);
    const st = newState(lvl);
    launch(st, 1);
    launch(st, 2);
    run(st, lap(lvl) * 4);
    expect(st.status).toBe('won');
    expect(st.events.some((e) => e.k === 'park')).toBe(false);
    expect(st.events.some((e) => e.k === 'loop' && e.id === 1)).toBe(true);
  });

  it('auto-sends slot jellies once the queue is empty', () => {
    const lvl = level(walled, [[{ id: 1, color: 0, n: 1 }, { id: 2, color: 1, n: 8 }]]);
    const st = newState(lvl);
    launch(st, 1);
    run(st, lap(lvl));
    // Blue was still in the queue, so red parked.
    expect(st.slots[0]?.id).toBe(1);
    launch(st, 2);
    run(st, lap(lvl) * 4);
    expect(st.status).toBe('won');
    expect(st.slots.every((j) => j === null)).toBe(true);
  });

  it('a jelly with hits left comes back and parks in a slot', () => {
    const lvl = level(['0'], [[{ id: 1, color: 0, n: 1 }], [{ id: 2, color: 1, n: 3 }]]);
    const st = newState(lvl);
    launch(st, 2);
    run(st, lap(lvl));
    expect(st.slots[0]?.id).toBe(2);
    expect(st.slots[0]?.n).toBe(3);
  });

  it('coming back to full slots loses, and a revive adds a slot', () => {
    const lvl = level(['0'], [[{ id: 1, color: 0, n: 1 }], [{ id: 2, color: 1, n: 1 }, { id: 3, color: 1, n: 1 }]], 1);
    const st = newState(lvl);
    launch(st, 2);
    run(st, lap(lvl));
    expect(st.slots[0]?.id).toBe(2);
    launch(st, 3);
    run(st, lap(lvl));
    expect(st.status).toBe('lost');
    expect(st.reason).toBe('full');
    expect(revive(st)).toBe(true);
    expect(st.slots.length).toBe(2);
    expect(st.status).toBe('play');
    launch(st, 1);
    run(st, lap(lvl));
    expect(st.status).toBe('won');
  });

  it('respects the belt limit', () => {
    const cols = [[{ id: 1, color: 0, n: 9 }, { id: 2, color: 0, n: 9 }], [{ id: 3, color: 0, n: 9 }]];
    const st = newState(level(['0'], cols, 5, 2));
    expect(launch(st, 1)).toBe(true);
    expect(launch(st, 3)).toBe(true);
    expect(launchGroup(st, 2).why).toBe('belt');
  });

  it('only the front of a column can be sent', () => {
    const st = newState(level(['0'], [[{ id: 1, color: 0, n: 1 }, { id: 2, color: 0, n: 1 }]]));
    expect(launchGroup(st, 2).why).toBe('buried');
    expect(legalLaunches(st)).toEqual([1]);
  });

  it('ice thaws after that many jellies are sent', () => {
    const cols = [[{ id: 1, color: 1, n: 1 }, { id: 2, color: 1, n: 1 }], [{ id: 3, color: 0, n: 1, ice: 2 }]];
    const st = newState(level(['0'], cols));
    expect(launchGroup(st, 3).why).toBe('ice');
    launch(st, 1);
    expect(launchGroup(st, 3).why).toBe('ice');
    launch(st, 2);
    expect(launchGroup(st, 3).group).not.toBeNull();
  });

  it('linked jellies side by side go out together, only when both are free', () => {
    const cols = [[{ id: 1, color: 0, n: 1, link: 7 }], [{ id: 3, color: 1, n: 1 }, { id: 4, color: 0, n: 1, link: 7 }]];
    const st = newState(level(['00'], cols));
    expect(launchGroup(st, 1).why).toBe('rope');
    launch(st, 3);
    expect(launchGroup(st, 1).group?.map((j) => j.id)).toEqual([1, 4]);
    launch(st, 4);
    // Tapping either member sends the whole group, front-most first.
    expect(st.pending.map((j) => j.id)).toEqual([3, 1, 4]);
  });

  it('a jelly linked to the one behind it pulls it out too', () => {
    const cols = [[{ id: 1, color: 0, n: 1, link: 2 }, { id: 2, color: 0, n: 1, link: 2 }, { id: 3, color: 1, n: 1 }]];
    const st = newState(level(['00'], cols));
    expect(launch(st, 1)).toBe(true);
    expect(st.pending.map((j) => j.id)).toEqual([1, 2]);
    expect(st.cols[0].map((j) => j.id)).toEqual([3]);
  });

  it('a group of three needs every member free and room on the belt for all of them', () => {
    const cols = [
      [{ id: 1, color: 0, n: 1, link: 5 }, { id: 2, color: 0, n: 1, link: 5 }],
      [{ id: 3, color: 1, n: 1 }, { id: 4, color: 0, n: 1, link: 5 }],
    ];
    const st = newState(level(['00'], cols, 5, 4));
    expect(launchGroup(st, 1).why).toBe('rope');
    launch(st, 3);
    expect(launchGroup(st, 2).group?.map((j) => j.id)).toEqual([1, 4, 2]);
    // A belt of 3 with one jelly already out has no room for all three.
    const small = newState(level(['00'], cols, 5, 3));
    launch(small, 3);
    expect(launchGroup(small, 1).why).toBe('belt');
  });

  it('declares stuck when nothing can ever hit again', () => {
    // Blue jelly only, red cubes left: after it parks there's no useful move.
    const lvl = level(['0'], [[{ id: 1, color: 1, n: 1 }]]);
    const st = newState(lvl);
    launch(st, 1);
    run(st, lap(lvl) * 4);
    expect(st.status).toBe('lost');
    expect(st.reason).toBe('stuck');
  });

  it('is deterministic', () => {
    const lvl = level(['0110', '0220', '0000'], [[{ id: 1, color: 0, n: 8 }, { id: 2, color: 1, n: 2 }], [{ id: 3, color: 2, n: 2 }, { id: 4, color: 0, n: 2 }]]);
    const play = () => {
      const st = newState(lvl);
      st.log = false;
      for (let t = 0; t < 4000 && st.status === 'play'; t++) {
        if (t % 50 === 0) for (const id of legalLaunches(st)) launch(st, id);
        step(st);
      }
      return JSON.stringify([st.tick, st.cells, st.status, st.shots]);
    };
    expect(play()).toBe(play());
  });
});
