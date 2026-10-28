// Screenshots of the boosters and lives: the bar, aiming, a propeller in flight, the crane
// picker, merging, the shop sheet and the out-of-lives screen.
// Usage: npx tsx scripts/shots-boosters.ts [baseUrl] [--only=phone] → e2e-out/boost-<profile>-<name>.png
import { chromium, type BrowserContextOptions, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';
import { browserPath } from './browser';

const base = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:3003/';
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
mkdirSync('e2e-out', { recursive: true });
const profiles: Record<string, BrowserContextOptions> = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  smallPhone: { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const browser = await chromium.launch({ executablePath: browserPath() });
const z = (page: Page, fn: string) => page.evaluate(`(() => { const z = window.__jb; ${fn} })()`);
const errors: string[] = [];

for (const [name, opts] of Object.entries(profiles)) {
  if (only && name !== only) continue;
  const page = await (await browser.newContext(opts)).newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  const shot = (s: string) => page.screenshot({ path: `e2e-out/boost-${name}-${s}.png` });
  await page.goto(base);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(400);
  await z(page, `z.setSave({ unlocked: 30, coins: 500, seen: ['tutorial', 'slots', 'feature:ice', 'feature:rope', 'feature:hidden', 'feature:farRope'] }); z.start(24)`);
  await page.waitForTimeout(700);
  await shot('intro');
  await page.click('[data-act="ok"]', { force: true });
  // Send a few jellies, let some come back to the slots.
  for (let t = 0; t < 14; t++) {
    await z(page, `const s = z.state(); for (const c of s.cols) if (c[0]) z.tap(c[0].id);`);
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(1500);
  await shot('bar');
  await z(page, `z.booster('propeller')`);
  await page.waitForTimeout(400);
  await shot('aim');
  await z(page, `const s = z.state(); const v = z.view(); const id = [...v.aim][0]; z.view().aim && window.dispatchEvent(new Event('noop')); window.__pick = id;`);
  // Tap the first target through the real canvas handler.
  const pt = await page.evaluate(() => {
    const z = (window as any).__jb;
    const v = z.view();
    const id = [...v.aim][0];
    const vis = v.vis.get(id);
    return { x: vis.x, y: vis.y };
  });
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(1100);
  await shot('flying');
  await page.waitForTimeout(1500);
  await shot('flying2');
  await z(page, `z.booster('crane')`);
  await page.waitForTimeout(500);
  await shot('crane');
  await page.click('.cj:not(.off) >> nth=3', { force: true }).catch(() => {});
  await page.waitForTimeout(350);
  await shot('crane-lift');
  // Force a merge setup: two same-color jellies in the slots.
  await z(page, `const s = z.state(); const c = s.cols.flat().slice(-2); s.slots[0] = { ...c[0], color: 1, link: -1, ice: 0 }; s.slots[1] = { ...c[1], id: 9999, color: 1, link: -1, ice: 0 };`);
  await page.waitForTimeout(300);
  await shot('merge-ready');
  await z(page, `z.booster('merge')`);
  await page.waitForTimeout(150);
  await shot('merging');
  await page.waitForTimeout(500);
  // Shop sheet: out of propellers.
  await z(page, `z.setSave({ boosters: {}, coins: 500 }); z.booster('merge'); z.booster('propeller')`);
  await page.waitForTimeout(400);
  await shot('shop');
  await page.click('[data-act="cancel"]', { force: true }).catch(() => {});
  // Out of lives.
  await z(page, `z.setSave({ lives: 0, lifeAt: Date.now() - 120000, coins: 400 }); z.toTitleForTest?.()`);
  await page.click('#btn-pause', { force: true });
  await page.waitForTimeout(300);
  await shot('pause');
  await page.click('[data-act="menu"]', { force: true });
  await page.waitForTimeout(400);
  await shot('title-lives');
  await page.click('[data-act="play"]', { force: true });
  await page.waitForTimeout(400);
  await shot('nolives');
}
await browser.close();
console.log(errors.length ? errors.join('\n') : 'no page errors');
