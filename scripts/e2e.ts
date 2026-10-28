// End-to-end checks in a real browser on several screen sizes.
// Usage: npm run e2e [-- baseUrl]   (start `npm run dev` or `npm run preview` first)
import { chromium, type BrowserContextOptions, type Page } from 'playwright';
import { browserPath } from './browser';

const base = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:3002/';
const profiles: Record<string, BrowserContextOptions> = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  smallPhone: { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  tablet: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
};

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures++;
}
const z = <T>(page: Page, body: string) => page.evaluate(`(() => { const z = window.__jb; ${body} })()`) as Promise<T>;

const browser = await chromium.launch({ executablePath: browserPath() });
for (const [name, opts] of Object.entries(profiles)) {
  console.log(`\n[${name}]`);
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(base);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => (window as any).__jb?.mode === 'title');
  check('title screen shows', await page.isVisible('[data-act="play"]'));

  await page.click('[data-act="play"]', { force: true });
  await page.waitForTimeout(300);
  check('level 1 starts with the tutorial tip', (await z<string>(page, 'return z.mode')) === 'play' && (await page.isVisible('#tip')));

  // Tap the first front jelly with a real pointer event at its drawn position.
  const target = await z<{ x: number; y: number; id: number }>(page, `const v = z.view(); const s = z.state(); return { x: v.l.qx[0], y: v.l.qy, id: s.cols[0][0].id };`);
  if (opts.hasTouch) await page.touchscreen.tap(target.x, target.y);
  else await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(200);
  const sent = await z<boolean>(page, `const s = z.state(); return s.pending.concat(s.belt.map(r => r.j)).some(j => j.id === ${target.id});`);
  check('tapping a front jelly sends it out', sent);
  check('tutorial tip hides after the first tap', !(await page.isVisible('#tip')));

  // Every tappable jelly is on screen and inside the viewport.
  const fits = await z<boolean>(page, `const v = z.view(); const l = v.l; const pts = [...l.slots, ...l.qx.map(x => ({x, y: l.qy})), l.launcher];
    return pts.every(p => p.x > 0 && p.x < l.W && p.y > 0 && p.y < l.H) && l.frame.x >= 0 && l.frame.x + l.frame.w <= l.W && l.qy < l.qBottom;`);
  check('board, slots and queue fit the screen', fits);

  await z(page, 'z.win()');
  await page.waitForSelector('[data-act="next"]', { timeout: 4000 });
  check('winning shows the result with Next', true);
  const saved = await z<{ unlocked: number; coins: number }>(page, 'return z.save()');
  check('winning unlocks level 2 and pays coins', saved.unlocked === 1 && saved.coins > 200, JSON.stringify({ u: saved.unlocked, c: saved.coins }));
  await page.click('[data-act="next"]', { force: true });
  await page.waitForTimeout(300);
  check('Next starts level 2', (await page.textContent('#hud-level')) === 'Level 2');

  // Fill every slot with a dud, then send a jelly that can't finish: it comes back to full slots.
  await z(page, `const s = z.state(); s.slots = s.slots.map((j, i) => ({ id: 900 + i, color: 0, n: 1, ice: 0, link: -1, hidden: false }));
    s.cols[0][0].n = 999; z.tap(s.cols[0][0].id);`);
  await page.waitForSelector('[data-act="revive"]', { timeout: 20000 });
  check('coming back to full slots shows "Out of room"', (await page.textContent('.panel .ribbon')) === 'Out of room!');
  await page.click('[data-act="revive"]', { force: true });
  await page.waitForTimeout(300);
  const after = await z<{ mode: string; slots: number }>(page, 'return { mode: z.mode, slots: z.state().slots.length }');
  check('revive adds a slot and keeps playing', after.mode === 'play' && after.slots === 6, JSON.stringify(after));

  // Pause → menu → levels → reload keeps progress.
  await page.click('#btn-pause', { force: true });
  await page.click('[data-act="menu"]', { force: true });
  await page.reload();
  await page.waitForFunction(() => (window as any).__jb?.mode === 'title');
  check('progress survives a reload', (await page.textContent('[data-act="play"]'))?.includes('Level 2') ?? false);
  await page.click('[data-act="levels"]', { force: true });
  check('levels screen lists every level', (await page.locator('.lv').count()) === (await z<number>(page, 'return z.levels()')));

  // A late level with ice, ropes and hidden jellies plays without errors.
  await z(page, 'z.save().unlocked = 99; z.start(29)');
  await page.waitForTimeout(300);
  for (let t = 0; t < 24; t++) {
    await z(page, `const s = z.state(); if (s.status !== 'play') return; for (const id of [...s.slots.filter(Boolean).map(j => j.id), ...s.cols.map(c => c[0]?.id).filter(Boolean)]) z.tap(id);`);
    await page.waitForTimeout(250);
  }
  check('a mechanics level runs', (await z<number>(page, 'return z.state().shots')) > 0);

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}
await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
