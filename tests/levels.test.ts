import { describe, expect, it } from 'vitest';
import campaign from '../src/levels/campaign.json';
import { playBot } from '../src/sim/bots';
import type { Level } from '../src/sim/engine';
import { buildLevel, campaign as slots, GEN_VERSION, isHard, needBand, recipe, stackPictures, TOUGH_FROM, untangles, type Check } from '../src/sim/levels';
import { PACKS } from '../src/sim/pictures';
import { COLORS } from '../src/sim/art';

const LEVELS = (campaign as unknown as { gen: number; levels: (Level & { check: Check })[] }).levels;

describe('pictures', () => {
  it('uses white only to hide the second picture where it extends beyond the first', () => {
    const { top, under } = stackPictures(['R.', '..'], ['.B', 'BB']);
    expect(top).toEqual(['R', 'W', 'W', 'W']);
    expect(under).toEqual(['.', 'B', 'B', 'B']);
  });
  for (const pack of PACKS)
    for (const art of pack.pictures)
      it(`${pack.id}/${art.name} follows the picture rules`, () => {
        const w = art.rows[0].length;
        expect(art.rows.every((r) => r.length === w)).toBe(true);
        expect(w).toBeGreaterThanOrEqual(16);
        expect(w).toBeLessThanOrEqual(24);
        expect(art.rows.length).toBeLessThanOrEqual(24);
        const counts = new Map<string, number>();
        for (const ch of art.rows.join('')) if (ch !== '.') counts.set(ch, (counts.get(ch) ?? 0) + 1);
        for (const [ch, n] of counts) {
          expect(COLORS[ch], `unknown color ${ch}`).toBeDefined();
          expect(n, `${ch} has only ${n} cubes`).toBeGreaterThanOrEqual(4);
        }
      });
});

describe('campaign.json', () => {
  it('is built from the current pictures and generator (run `npm run levels` if this fails)', () => {
    expect((campaign as { gen: number }).gen).toBe(GEN_VERSION);
    const s = slots();
    expect(LEVELS.length).toBe(s.length);
    LEVELS.forEach((l, i) => expect(l.name).toBe(s[i].art.name));
    // Candidate deals may change the queue, but retain the picture dimensions and colors.
    for (const i of [0, 17, 63]) {
      const candidate = buildLevel(s[i], recipe(i), 'jelly');
      expect([LEVELS[i].w, LEVELS[i].h, LEVELS[i].palette]).toEqual([candidate.w, candidate.h, candidate.palette]);
    }
  });

  it('layered levels reveal a different picture and cover its extra silhouette with white', () => {
    const s = slots();
    for (const l of LEVELS) {
      if (!l.under?.some((c) => c >= 0)) continue;
      expect(l.underName, l.id).toBeDefined();
      expect(l.underName, l.id).not.toBe(l.name);
      expect(s[l.index].underArt?.name, l.id).toBe(l.underName);
      for (let i = 0; i < l.under.length; i++)
        if (l.under[i] >= 0) expect(l.cells[i], `${l.id} exposes hidden cell ${i}`).toBeGreaterThanOrEqual(0);
    }
    expect(LEVELS.filter((l) => l.underName).length).toBeGreaterThanOrEqual(20);
    expect(LEVELS[15].slots).toBe(5);
    expect(LEVELS[15].check.greedy).toBe(LEVELS[15].check.tries);
  });

  it('every level has exactly enough jelly hits for its cubes, per color', () => {
    for (const l of LEVELS) {
      const cubes = l.palette.map((_, c) => l.cells.filter((x) => x === c).length + (l.under?.filter((x) => x === c).length ?? 0));
      const hits = l.palette.map((_, c) => l.columns.flat().filter((j) => j.color === c).reduce((a, j) => a + j.n, 0));
      expect(hits, l.id).toEqual(cubes);
    }
  });

  it('links tie 2–3 jellies and the queue can always be untangled', () => {
    for (const l of LEVELS) {
      const groups = new Map<number, { c: number; d: number }[]>();
      l.columns.forEach((col, c) => col.forEach((j, d) => j.link !== undefined && groups.set(j.link, [...(groups.get(j.link) ?? []), { c, d }])));
      for (const g of groups.values()) {
        expect(g.length, l.id).toBeGreaterThanOrEqual(2);
        expect(g.length, l.id).toBeLessThanOrEqual(3);
      }
      expect(untangles(l.columns), l.id).toBe(true);
    }
  });

  it('column counts vary across the campaign', () => {
    expect(new Set(LEVELS.map((l) => l.columns.length)).size).toBeGreaterThanOrEqual(3);
  });

  it('marks hard levels and keeps every win possible with the open slots', () => {
    for (const l of LEVELS) {
      expect(!!l.hard, l.id).toBe(isHard(l.index));
      expect(l.sockets, l.id).toBe(5);
      expect(l.check.need, l.id).toBeLessThanOrEqual(l.slots);
      if (l.index < 6) expect(l.slots, l.id).toBe(5);
      else if (l.hard) expect(l.slots, l.id).toBeLessThanOrEqual(4);
    }
  });

  it('every level is beatable with spare slots, and humans usually win (always, with boosters, on tough levels)', () => {
    for (const l of LEVELS) {
      const [, hi] = needBand(l.index, l.slots);
      expect(l.check.need, l.id).toBeLessThanOrEqual(hi);
      if (l.index >= TOUGH_FROM) {
        expect(l.check.human, l.id).toBeGreaterThanOrEqual(1);
        expect(l.check.boosted, l.id).toBe(l.check.tries);
      } else expect(l.check.human * 3, l.id).toBeGreaterThanOrEqual(l.check.tries * 2);
    }
  });

  it('the recorded check matches a replay (spot check)', () => {
    for (const i of [0, 12, 40, 77]) {
      const l = LEVELS[i];
      expect(playBot({ ...l, slots: l.check.need }, 'smart', 1).won, l.id).toBe(true);
    }
  });
});
