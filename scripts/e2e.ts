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
  check('hard levels have a grid badge', await page.locator('.lv.hard').count() === 19);

  // A hard level has locked sockets. Unlocking one costs gold for this attempt.
  await z(page, 'z.setSave({ coins: 400 }); z.start(9)');
  check('hard level has a red HUD badge', await page.locator('#hud-level.hard').count() === 1);
  if (await page.isVisible('[data-act="ok"]')) await page.click('[data-act="ok"]', { force: true });
  const locked = await z<{ x: number; y: number; slots: number; coins: number }>(page, 'const s = z.state(), v = z.view(); return { ...v.l.slots[s.slots.length], slots: s.slots.length, coins: z.save().coins };');
  await page.mouse.click(locked.x, locked.y);
  check('tapping a locked socket opens its price sheet', await page.isVisible('.panel.shop [data-act="buy"]'));
  await page.click('.panel.shop [data-act="buy"]', { force: true });
  const unlocked = await z<{ slots: number; coins: number }>(page, 'return { slots: z.state().slots.length, coins: z.save().coins };');
  check('unlocking adds a slot and spends gold', unlocked.slots === locked.slots + 1 && unlocked.coins === locked.coins - 50);

  // A late level with ice, ropes and hidden jellies plays without errors.
  await z(page, 'z.save().unlocked = 99; z.start(29)');
  await page.waitForTimeout(300);
  check('the booster gift shows once the shop opens', await page.isVisible('.panel.intro'));
  await page.click('[data-act="ok"]', { force: true });
  check('one of each booster is gifted', JSON.stringify(await z(page, 'return z.save().boosters')) === '{"propeller":1,"crane":1,"merge":1}');
  check('the booster bar shows', await page.isVisible('#boosters .boost'));
  for (let t = 0; t < 24; t++) {
    await z(page, `const s = z.state(); if (s.status !== 'play') return; for (const id of [...s.slots.filter(Boolean).map(j => j.id), ...s.cols.map(c => c[0]?.id).filter(Boolean)]) z.tap(id);`);
    await page.waitForTimeout(250);
  }
  check('a mechanics level runs', (await z<number>(page, 'return z.state().shots')) > 0);

  // Propeller: arm it, tap a glowing jelly on the canvas, it takes off.
  await z(page, 'z.start(29)');
  await page.waitForTimeout(200);
  await z(page, `z.booster('propeller')`);
  check('tapping a booster arms it', (await z<string>(page, 'return z.aim()')) === 'propeller' && (await page.isVisible('#aimhint')));
  const pt = await z<{ x: number; y: number }>(page, 'const v = z.view(); const vis = v.vis.get([...v.aim][0]); return { x: vis.x, y: vis.y };');
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(100);
  check('a propeller jelly takes off', (await z<number>(page, 'return z.state().flyers.length')) === 1 && (await z<number>(page, 'return z.save().boosters.propeller')) === 0);
  check('only one propeller at a time', (await page.getAttribute('[data-b="propeller"]', 'class'))?.includes('s-idle') ?? false);
  await page.waitForFunction(() => (window as any).__jb.state().flyers.length === 0, null, { timeout: 15000 });

  // Shop: out of propellers, so the next one is bought (and armed) from a sheet.
  await z(page, `z.setSave({ coins: 500 }); z.booster('propeller')`);
  check('buying shows a sheet with the price', await page.isVisible('.panel.shop'));
  await page.click('[data-act="buy"]', { force: true });
  await page.waitForTimeout(100);
  check('buying spends coins and arms the booster', (await z<number>(page, 'return z.save().coins')) === 380 && (await z<string>(page, 'return z.aim()')) === 'propeller');
  await z(page, `z.booster('propeller')`);

  // Crane: the whole queue in a scroll view; picking one drops it on the belt.
  await z(page, `z.booster('crane')`);
  check('the crane shows the whole queue', (await page.locator('.cj').count()) === (await z<number>(page, 'return z.state().cols.flat().length')));
  const lifted = await page.getAttribute('.cj:not(.off) >> nth=0', 'data-j');
  await page.click('.cj:not(.off) >> nth=0', { force: true });
  await page.waitForTimeout(100);
  check('the crane drops the jelly on the belt', (await z<number[]>(page, 'const s = z.state(); return [...s.pending, ...s.belt.map(r => r.j)].map(j => j.id)')).includes(Number(lifted)));

  // Lives: losing with one life left sends you to the out-of-lives screen on retry.
  await z(page, `z.setSave({ lives: 1, lifeAt: null, coins: 400 }); z.start(29)`);
  await page.waitForTimeout(200);
  await z(page, `const s = z.state(); s.slots = s.slots.map((j, i) => ({ id: 900 + i, color: 0, n: 1, ice: 0, link: -1, hidden: false }));
    const j = s.cols.find(c => c[0] && c[0].link < 0 && !c[0].ice)[0]; j.n = 999; z.tap(j.id);`);
  await page.waitForSelector('[data-act="revive"]', { timeout: 20000 });
  check('losing costs a life', (await z<number>(page, 'return z.save().lives')) === 0 && (await page.locator('.hearts span.crack').count()) === 1);
  await page.click('[data-act="retry"]', { force: true });
  check('no lives left: retry shows the wait-or-buy screen', await page.isVisible('.panel.nolives'));
  await page.click('[data-act="buy"]', { force: true });
  await page.waitForTimeout(200);
  check('buying a life starts the level', (await z<string>(page, 'return z.mode')) === 'play' && (await z<number>(page, 'return z.save().lives')) === 1);

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}
await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
