import { describe, expect, it } from 'vitest';
import campaign from '../src/levels/campaign.json';
import { playBot } from '../src/sim/bots';
import type { Level } from '../src/sim/engine';
import { buildLevel, campaign as slots, GEN_VERSION, needBand, recipe, type Check } from '../src/sim/levels';
import { PACKS } from '../src/sim/pictures';
import { COLORS } from '../src/sim/art';

const LEVELS = (campaign as unknown as { gen: number; levels: (Level & { check: Check })[] }).levels;

describe('pictures', () => {
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
    // Rebuilding a level from its picture gives the same cubes.
    for (const i of [0, 17, 63]) expect(buildLevel(s[i], recipe(i), 'jelly').cells).toEqual(LEVELS[i].cells);
  });

  it('every level has exactly enough jelly hits for its cubes, per color', () => {
    for (const l of LEVELS) {
      const cubes = l.palette.map((_, c) => l.cells.filter((x) => x === c).length);
      const hits = l.palette.map((_, c) => l.columns.flat().filter((j) => j.color === c).reduce((a, j) => a + j.n, 0));
      expect(hits, l.id).toEqual(cubes);
    }
  });

  it('ropes pair up across columns', () => {
    for (const l of LEVELS) {
      const all = l.columns.flatMap((c, ci) => c.map((j) => ({ ...j, ci })));
      for (const j of all) {
        if (j.rope === undefined) continue;
        const p = all.find((x) => x.id === j.rope)!;
        expect(p.rope, l.id).toBe(j.id);
        expect(p.ci, l.id).not.toBe(j.ci);
      }
    }
  });

  it('every level is beatable with spare slots and humans usually win', () => {
    for (const l of LEVELS) {
      const [, hi] = needBand(l.index, l.slots);
      expect(l.check.need, l.id).toBeLessThanOrEqual(hi);
      expect(l.check.human * 3, l.id).toBeGreaterThanOrEqual(l.check.tries * 2);
    }
  });

  it('the recorded check matches a replay (spot check)', () => {
    for (const i of [0, 12, 40, 77]) {
      const l = LEVELS[i];
      expect(playBot({ ...l, slots: l.check.need }, 'smart', 1).won, l.id).toBe(true);
    }
  });
});
