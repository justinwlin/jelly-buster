// Screenshots of the main screens on phone, landscape and desktop.
// Usage: npx tsx scripts/shots.ts [baseUrl] → e2e-out/shot-<profile>-<name>.png
import { chromium, type BrowserContextOptions, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';
import { browserPath } from './browser';

const base = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:3002/';
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
mkdirSync('e2e-out', { recursive: true });
const profiles: Record<string, BrowserContextOptions> = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  smallPhone: { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
};
const browser = await chromium.launch({ executablePath: browserPath() });
const z = (page: Page, fn: string) => page.evaluate(`(() => { const z = window.__jb; ${fn} })()`);

/** Tap whatever jelly the bot-ish rule likes: slot jellies first, then fronts. */
async function autoplay(page: Page, seconds: number) {
  for (let t = 0; t < seconds * 4; t++) {
    await z(page, `const s = z.state(); if (!s || s.status !== 'play') return;
      const ids = [...s.slots.filter(Boolean).map(j => j.id), ...s.cols.map(c => c[0]?.id).filter(Boolean)];
      for (const id of ids) z.tap(id);`);
    await page.waitForTimeout(250);
  }
}

for (const [name, opts] of Object.entries(profiles)) {
  if (only && name !== only) continue;
  const page = await (await browser.newContext(opts)).newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = (s: string) => page.screenshot({ path: `e2e-out/shot-${name}-${s}.png` });
  await page.goto(base);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(500);
  await shot('title');
  await page.click('[data-act="play"]', { force: true });
  await page.waitForTimeout(600);
  await shot('tutorial');
  await z(page, `z.tap(z.state().cols[0][0].id); z.tap(z.state().cols[1][0].id);`);
  await page.waitForTimeout(2500);
  await shot('playing');
  await autoplay(page, 6);
  await shot('later');
  await z(page, 'z.win()');
  await page.waitForTimeout(700);
  await shot('reveal');
  await page.waitForTimeout(2600);
  await shot('win');
  // A level with ice and ropes.
  await z(page, 'z.save().unlocked = 99; z.start(29)');
  await page.waitForTimeout(800);
  await shot('mechanics-tip');
  await page.click('[data-act="ok"]', { force: true }).catch(() => {});
  await page.waitForTimeout(400);
  await shot('mechanics');
  await autoplay(page, 5);
  await shot('mechanics-later');
  await z(page, `const s = z.state(); s.slots = s.slots.map((j, i) => j ?? { id: 900 + i, color: 0, n: 5, ice: 0, rope: -1, hidden: false });`);
  await autoplay(page, 1);
  await page.waitForTimeout(9000);
  await shot('lose');
  await z(page, 'z.start(0)');
  await page.click('#btn-pause', { force: true });
  await page.waitForTimeout(300);
  await page.click('[data-act="menu"]', { force: true });
  await page.click('[data-act="levels"]', { force: true });
  await page.waitForTimeout(300);
  await shot('levels');
  if (errors.length) console.log(name, 'ERRORS', errors);
  await page.context().close();
}
await browser.close();
console.log('done');
