// Build the first 100 levels from the picture packs, then verify 900 deterministic
// remixes with the bots. Runs one worker process per core slice for the originals.
// Usage: npm run levels [-- --only=starter] [-- --jobs=6] [-- --reuse-base]
import { spawn } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { BASE_LEVEL_COUNT, campaign, checkLevel, GEN_VERSION, interesting, needBand, passes, remixLevel, spamCap, searchLevel, type Built } from '../src/sim/levels';

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const only = arg('only');
const part = arg('part');
const reuseBase = process.argv.includes('--reuse-base');
const slots = campaign();
const all = slots.slice(0, BASE_LEVEL_COUNT).filter((s) => !only || s.pack === only);

if (part) {
  // Worker: build every n-th level and write them to a temp file.
  const [k, n] = part.split('/').map(Number);
  const out: Built[] = [];
  for (const slot of all.filter((_, i) => i % n === k)) out.push(searchLevel(slot));
  writeFileSync(`/tmp/jelly-levels-${k}.json`, JSON.stringify(out));
  process.exit(0);
}

const jobs = Math.max(1, Math.min(all.length, Number(arg('jobs') ?? Math.min(8, Math.max(1, cpus().length - 1)))));
const t0 = performance.now();
const built: Built[] = [];
let existing: (Built['level'] & { check: Built['check'] })[] | undefined;
if (reuseBase && !only) {
  const old = JSON.parse(readFileSync('src/levels/campaign.json', 'utf8')) as { gen: number; levels: (Built['level'] & { check: Built['check'] })[] };
  if (old.gen !== GEN_VERSION || old.levels.length < BASE_LEVEL_COUNT) throw new Error('A checked base campaign with the current seed version is required');
  existing = old.levels;
  built.push(...old.levels.slice(0, BASE_LEVEL_COUNT).map((level) => ({ level, check: level.check, attempts: 0 })));
} else {
  await Promise.all(
    Array.from({ length: jobs }, (_, k) =>
      new Promise<void>((res, rej) => {
        const args = ['tsx', 'scripts/build-levels.ts', `--part=${k}/${jobs}`, ...(only ? [`--only=${only}`] : [])];
        const p = spawn('npx', args, { stdio: 'inherit' });
        p.on('exit', (code) => (code ? rej(new Error(`worker ${k} failed`)) : res()));
      }),
    ),
  );
  for (let k = 0; k < jobs; k++) {
    built.push(...(JSON.parse(readFileSync(`/tmp/jelly-levels-${k}.json`, 'utf8')) as Built[]));
    rmSync(`/tmp/jelly-levels-${k}.json`);
  }
}
built.sort((a, b) => a.level.index - b.level.index);

if (!only) {
  const base = built.slice(0, BASE_LEVEL_COUNT);
  for (const slot of slots.slice(BASE_LEVEL_COUNT)) {
    // Fresh pictures alone need a new search. All other remixes were already checked and
    // have the same deterministic source, so reuse their shipped result during art work.
    const cached = reuseBase ? existing![slot.index] : undefined;
    if (cached?.name === slot.art.name) {
      const level = cached;
      built.push({ level, check: level.check, attempts: 0 });
      continue;
    }
    if (slot.fresh) {
      const candidate = searchLevel(slot);
      if (!passes(slot.index, candidate.check, candidate.level.slots)) throw new Error(`No beatable fresh picture for level ${slot.index + 1}`);
      built.push(candidate);
      if (built.length % 100 === 0) console.log(`Verified ${built.length} levels`);
      continue;
    }
    const source = base[slot.sourceIndex!];
    const first = 1 + ((slot.index + slot.remix!) % 7);
    const second = 1 + ((slot.index * 3 + slot.remix!) % 7);
    let best: Built | null = null;
    for (const variant of [...new Set([first, second, 0])]) {
      const level = remixLevel(source.level, slot.index, slot.remix!, variant);
      const check = checkLevel(level);
      if (!passes(slot.index, check, level.slots)) continue;
      const candidate = { level, check, attempts: variant === first ? 1 : variant === second ? 2 : 3 };
      if (interesting(slot.index, check)) { best = candidate; break; }
      if (!best || check.spam < best.check.spam) best = candidate;
    }
    if (!best) throw new Error(`No beatable remix for level ${slot.index + 1}`);
    built.push(best);
    if (built.length % 100 === 0) console.log(`Verified ${built.length} levels`);
  }
}

const pad = (s: string | number, n: number) => String(s).padEnd(n);
console.log(pad('#', 4) + pad('level', 33) + pad('cubes', 6) + pad('col', 4) + pad('jel', 4) + pad('need', 6) + pad('human', 6) + pad('greedy', 7) + pad('spam', 8) + pad('kit', 5) + pad('time', 6) + 'tries');
let fun = 0;
for (const b of built) {
  const { level: l, check: c } = b;
  const ok = interesting(l.index, c);
  fun += +ok;
  console.log(
    pad(l.index + 1, 4) + pad(l.id, 33) + pad(l.cells.filter((x) => x >= 0).length, 6) + pad(l.palette.length, 4) + pad(l.columns.flat().length, 4) +
      pad(`${c.need}/${needBand(l.index)[1]}`, 6) + pad(`${c.human}/${c.tries}`, 6) + pad(`${c.greedy}/${c.tries}`, 7) + pad(`${c.spam}/${c.spamTries}≤${spamCap(l.index)}`, 8) + pad(`${c.boosted}/${c.tries}`, 5) +
      pad(`${c.seconds.toFixed(0)}s`, 6) + b.attempts + (ok ? '' : ' (easier than target)'),
  );
}
if (!only) writeFileSync('src/levels/campaign.json', JSON.stringify({ gen: GEN_VERSION, levels: built.map((b) => ({ ...b.level, check: b.check })) }));
console.log(`${built.length} levels, ${fun} on target, in ${((performance.now() - t0) / 1000).toFixed(0)}s with ${jobs} workers`);
