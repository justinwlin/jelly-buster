// Build every campaign level from the picture packs, check each with the bots, and write
// src/levels/campaign.json. Runs one worker process per core slice.
// Usage: npm run levels [-- --only=starter] [-- --jobs=6]
import { spawn } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { campaign, GEN_VERSION, interesting, needBand, spamCap, searchLevel, type Built } from '../src/sim/levels';

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const only = arg('only');
const part = arg('part');
const all = campaign().filter((s) => !only || s.pack === only);

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
await Promise.all(
  Array.from({ length: jobs }, (_, k) =>
    new Promise<void>((res, rej) => {
      const args = ['tsx', 'scripts/build-levels.ts', `--part=${k}/${jobs}`, ...(only ? [`--only=${only}`] : [])];
      const p = spawn('npx', args, { stdio: 'inherit' });
      p.on('exit', (code) => (code ? rej(new Error(`worker ${k} failed`)) : res()));
    }),
  ),
);
const built: Built[] = [];
for (let k = 0; k < jobs; k++) {
  built.push(...(JSON.parse(readFileSync(`/tmp/jelly-levels-${k}.json`, 'utf8')) as Built[]));
  rmSync(`/tmp/jelly-levels-${k}.json`);
}
built.sort((a, b) => a.level.index - b.level.index);

const pad = (s: string | number, n: number) => String(s).padEnd(n);
console.log(pad('#', 4) + pad('level', 33) + pad('rl', 3) + pad('cubes', 6) + pad('col', 4) + pad('jel', 4) + pad('need', 6) + pad('human', 6) + pad('greedy', 7) + pad('spam', 8) + pad('time', 6) + 'tries');
let fun = 0;
for (const b of built) {
  const { level: l, check: c } = b;
  const ok = interesting(l.index, c);
  fun += +ok;
  console.log(
    pad(l.index + 1, 4) + pad(l.id, 33) + pad(l.reload ?? 1, 3) + pad(l.cells.filter((x) => x >= 0).length, 6) + pad(l.palette.length, 4) + pad(l.columns.flat().length, 4) +
      pad(`${c.need}/${needBand(l.index)[1]}`, 6) + pad(`${c.human}/${c.tries}`, 6) + pad(`${c.greedy}/${c.tries}`, 7) + pad(`${c.spam}/${c.spamTries}≤${spamCap(l.index)}`, 8) +
      pad(`${c.seconds.toFixed(0)}s`, 6) + b.attempts + (ok ? '' : ' (easier than target)'),
  );
}
if (!only) writeFileSync('src/levels/campaign.json', JSON.stringify({ gen: GEN_VERSION, levels: built.map((b) => ({ ...b.level, check: b.check })) }));
console.log(`${built.length} levels, ${fun} on target, in ${((performance.now() - t0) / 1000).toFixed(0)}s with ${jobs} workers`);
