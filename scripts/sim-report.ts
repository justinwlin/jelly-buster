// Difficulty report for the shipped levels (src/levels/campaign.json): what each bot does.
// Usage: npm run sim [-- seeds=5]
import data from '../src/levels/campaign.json';
import { POLICIES, playBot } from '../src/sim/bots';
import type { Level } from '../src/sim/engine';
import type { Check } from '../src/sim/levels';

const seeds = +(process.argv[2] ?? 5);
const levels = (data as unknown as { levels: (Level & { check: Check })[] }).levels;
const pad = (s: string | number, n: number) => String(s).padEnd(n);
console.log(pad('#', 4) + pad('level', 32) + pad('need', 6) + POLICIES.map((p) => pad(p, 16)).join(''));
const totals = POLICIES.map(() => 0);
for (const l of levels) {
  const cells = POLICIES.map((p, k) => {
    let w = 0;
    let sec = 0;
    for (let s = 0; s < seeds; s++) {
      const r = playBot(l, p, 100 + s);
      w += +r.won;
      sec += r.seconds;
    }
    totals[k] += w;
    return pad(`${Math.round((w / seeds) * 100)}% ${Math.round(sec / seeds)}s`, 16);
  });
  console.log(pad(l.index + 1, 4) + pad(l.id, 32) + pad(`${l.check.need}/${l.slots}`, 6) + cells.join(''));
}
console.log('overall: ' + POLICIES.map((p, k) => `${p} ${Math.round((totals[k] / (levels.length * seeds)) * 100)}%`).join(', '));
