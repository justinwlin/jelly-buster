import { describe, expect, it } from 'vitest';
import { BOOSTER_IDS, BOOSTERS, canUse, useBooster } from '../src/sim/boosters';
import { FLY, launch, newState, step, TUNING, type JellySpec, type Level, type State } from '../src/sim/engine';
import { trackLength } from '../src/sim/track';
import { buyBooster, buyLife, canPlay, giftBoosters, LIVES, loseLife, nextLifeIn, syncLives } from '../src/game/economy';
import { fresh } from '../src/game/save';

function level(rows: string[], columns: JellySpec[][], slots = 5, belt = 5): Level {
  return {
    id: 'test',
    index: 0,
    name: 'test',
    w: rows[0].length,
    h: rows.length,
    cells: rows.join('').split('').map((c) => (c === '.' ? -1 : Number(c))),
    palette: ['#f00', '#00f', '#0f0'],
    columns,
    slots,
    belt,
  };
}
function run(st: State, ticks: number) {
  for (let i = 0; i < ticks && st.status === 'play'; i++) step(st);
}
const lap = (lvl: Level) => trackLength(lvl.w, lvl.h) * TUNING.sub + TUNING.spacing * TUNING.sub * 6;

describe('booster registry', () => {
  it('every booster has a name, price and pick mode, and is unusable once the game ends', () => {
    const st = newState(level(['0'], [[{ id: 1, color: 0, n: 1 }]]));
    st.status = 'won';
    for (const id of BOOSTER_IDS) {
      const d = BOOSTERS[id];
      expect(d.id).toBe(id);
      expect(d.price).toBeGreaterThan(0);
      expect(['board', 'queue']).toContain(d.pick);
      expect(canUse(st, id)).toBe(false);
    }
  });

  it('refuses a target that is not on the list and changes nothing', () => {
    const st = newState(level(['00'], [[{ id: 1, color: 0, n: 2 }]]));
    expect(useBooster(st, 'merge', 1)).toBe(false);
    expect(useBooster(st, 'propeller', 99)).toBe(false);
    expect(st.boosts).toBe(0);
    expect(st.cols[0].length).toBe(1);
  });
});

describe('propeller', () => {
  it('lifts a slot jelly over the picture and clears even cubes buried inside it', () => {
    // A blue core no belt station can see, wrapped in red.
    const lvl = level(['000', '010', '000'], [[{ id: 1, color: 1, n: 1 }], [{ id: 2, color: 0, n: 8 }]]);
    const st = newState(lvl);
    st.slots[0] = st.cols[0].shift()!;
    expect(BOOSTERS.propeller.targets(st)).toEqual([1, 2]);
    expect(useBooster(st, 'propeller', 1)).toBe(true);
    expect(st.slots[0]).toBeNull();
    expect(st.flyers.length).toBe(1);
    // Only one propeller in the air at a time.
    expect(canUse(st, 'propeller')).toBe(false);
    run(st, FLY.rise + FLY.every);
    expect(st.cells[4]).toBe(-1);
    expect(st.flyers.length).toBe(0);
    expect(st.boosts).toBe(1);
  });

  it('fires every few ticks until it runs out, then the level can still be won', () => {
    const lvl = level(['00', '00'], [[{ id: 1, color: 0, n: 4 }]]);
    const st = newState(lvl);
    useBooster(st, 'propeller', 1);
    run(st, FLY.rise + FLY.every * 3 + 1);
    expect(st.status).toBe('won');
    expect(st.launches).toBe(1);
  });

  it('counts as a send-out for melting ice, and skips frozen or tied fronts', () => {
    const lvl = level(['01'], [[{ id: 1, color: 0, n: 1 }], [{ id: 2, color: 1, n: 1, ice: 1 }]]);
    const st = newState(lvl);
    expect(BOOSTERS.propeller.targets(st)).toEqual([1]);
    useBooster(st, 'propeller', 1);
    expect(st.cols[1][0].ice).toBe(0);
  });

  it('keeps the game alive while it flies, even with nothing else to do', () => {
    const lvl = level(['000'], [[{ id: 1, color: 0, n: 3 }]]);
    const st = newState(lvl);
    useBooster(st, 'propeller', 1);
    run(st, 10);
    expect(st.status).toBe('play');
    run(st, 200);
    expect(st.status).toBe('won');
  });
});

describe('crane', () => {
  it('plucks a buried jelly onto the belt, cracking its ice', () => {
    const lvl = level(['01'], [[{ id: 1, color: 0, n: 1 }, { id: 2, color: 1, n: 1, ice: 5, hidden: true }]]);
    const st = newState(lvl);
    expect(BOOSTERS.crane.targets(st)).toEqual([2]);
    expect(useBooster(st, 'crane', 2)).toBe(true);
    expect(st.pending.map((j) => j.id)).toEqual([2]);
    expect(st.pending[0].ice).toBe(0);
    expect(st.pending[0].hidden).toBe(false);
  });

  it('cuts a rope: a pair partner is freed, a triple keeps its other two tied', () => {
    const lvl = level(['012'], [
      [{ id: 1, color: 0, n: 1, link: 7 }, { id: 4, color: 1, n: 1, link: 8 }],
      [{ id: 2, color: 1, n: 1, link: 8 }],
      [{ id: 3, color: 2, n: 1, link: 8 }],
    ]);
    const st = newState(lvl);
    useBooster(st, 'crane', 4);
    expect(st.cols[1][0].link).toBe(8);
    expect(st.cols[2][0].link).toBe(8);
    const st2 = newState(level(['01'], [[{ id: 1, color: 0, n: 1, link: 3 }, { id: 3, color: 0, n: 1 }], [{ id: 5, color: 1, n: 1 }, { id: 2, color: 1, n: 1, link: 3 }]]));
    useBooster(st2, 'crane', 2);
    expect(st2.cols[0][0].link).toBe(-1);
  });

  it('needs room on the belt and never offers a jelly a plain tap could send', () => {
    const lvl = level(['00'], [[{ id: 1, color: 0, n: 1 }, { id: 2, color: 0, n: 1 }]], 5, 1);
    const st = newState(lvl);
    expect(BOOSTERS.crane.targets(st)).toEqual([2]);
    launch(st, 1);
    expect(canUse(st, 'crane')).toBe(false);
  });
});

describe('merge', () => {
  it('folds same-color slot jellies into the tapped one and frees their slots', () => {
    const lvl = level(['0000', '1111'], [[]]);
    const st = newState(lvl);
    st.slots = [
      { id: 1, color: 0, n: 2, ice: 0, link: -1, hidden: false },
      { id: 2, color: 1, n: 4, ice: 0, link: -1, hidden: false },
      { id: 3, color: 0, n: 1, ice: 0, link: -1, hidden: false },
      null,
      { id: 4, color: 0, n: 1, ice: 0, link: -1, hidden: false },
    ];
    expect(BOOSTERS.merge.targets(st)).toEqual([1, 3, 4]);
    expect(useBooster(st, 'merge', 3)).toBe(true);
    expect(st.slots.map((j) => j?.n ?? null)).toEqual([null, 4, 4, null, null]);
    expect(canUse(st, 'merge')).toBe(false);
  });

  it('a merged jelly still clears the level', () => {
    const lvl = level(['000'], [[]]);
    const st = newState(lvl);
    st.slots[0] = { id: 1, color: 0, n: 2, ice: 0, link: -1, hidden: false };
    st.slots[1] = { id: 2, color: 0, n: 1, ice: 0, link: -1, hidden: false };
    useBooster(st, 'merge', 1);
    run(st, lap(lvl) * 2);
    expect(st.status).toBe('won');
  });
});

describe('lives', () => {
  const T = 1_000_000;
  it('losing costs a life and starts the clock; one comes back every 10 minutes', () => {
    const s = fresh();
    loseLife(s, 5, T);
    expect(s.lives).toBe(2);
    expect(nextLifeIn(s, T)).toBe(LIVES.regenMs);
    loseLife(s, 5, T + 1000);
    expect(s.lives).toBe(1);
    syncLives(s, T + LIVES.regenMs);
    expect(s.lives).toBe(2);
    expect(nextLifeIn(s, T + LIVES.regenMs)).toBe(LIVES.regenMs);
    syncLives(s, T + 5 * LIVES.regenMs);
    expect(s.lives).toBe(3);
    expect(s.lifeAt).toBeNull();
  });

  it('the tutorial levels are free, and you cannot play with no lives', () => {
    const s = fresh();
    loseLife(s, 0, T);
    expect(s.lives).toBe(3);
    for (let i = 0; i < 4; i++) loseLife(s, 5, T);
    expect(s.lives).toBe(0);
    expect(canPlay(s, 5, T)).toBe(false);
    expect(canPlay(s, 1, T)).toBe(true);
  });

  it('a life can only be bought when you are out of them', () => {
    const s = fresh();
    s.coins = 1000;
    expect(buyLife(s, T)).toBe(false);
    for (let i = 0; i < 3; i++) loseLife(s, 5, T);
    expect(buyLife(s, T)).toBe(true);
    expect(s.lives).toBe(1);
    expect(s.coins).toBe(1000 - LIVES.price);
    expect(buyLife(s, T)).toBe(false);
  });
});

describe('shop', () => {
  it('only sells a booster that can be used right now, and only with enough coins', () => {
    const s = fresh();
    const st = newState(level(['00'], [[{ id: 1, color: 0, n: 2 }]]));
    s.coins = 1000;
    expect(buyBooster(s, st, 'merge')).toBe(false);
    expect(buyBooster(s, st, 'propeller')).toBe(true);
    expect(s.boosters.propeller).toBe(1);
    // Owned already: use it before buying another.
    expect(buyBooster(s, st, 'propeller')).toBe(false);
    s.coins = 10;
    s.boosters = {};
    expect(buyBooster(s, st, 'propeller')).toBe(false);
  });

  it('gifts one of each booster once, when the shop opens', () => {
    const s = fresh();
    expect(giftBoosters(s)).toBe(false);
    s.unlocked = 3;
    expect(giftBoosters(s)).toBe(true);
    expect(giftBoosters(s)).toBe(false);
    expect(s.boosters).toEqual({ propeller: 1, crane: 1, merge: 1 });
  });
});
