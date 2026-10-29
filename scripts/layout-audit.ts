// Responsive check of every screen on every device profile: reports menus whose content
// overflows the viewport (sideways ever, or vertically where it should fit), and in-game
// HUD pieces or booster buttons that overlap or leave the screen. Saves a screenshot of each.
// Usage: npx tsx scripts/layout-audit.ts [baseUrl] [--only=phone,desktop]
//   → e2e-out/layout/<profile>-<screen>.png
import { chromium, type BrowserContextOptions, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';
import { browserPath } from './browser';

const base = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:3003/';
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
mkdirSync('e2e-out/layout', { recursive: true });

const PROFILES: Record<string, BrowserContextOptions> = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  smallPhone: { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  tinyPhone: { viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  phoneLandscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  tablet: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  fullHd: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  laptop: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
};

interface Row {
  profile: string;
  screen: string;
  problem: string | null;
  note: string;
}
const rows: Row[] = [];
const z = (page: Page, body: string) => page.evaluate(`(() => { const z = window.__jb; ${body} })()`);

/** A menu screen: nothing spills sideways and the screen itself doesn't need scrolling. */
async function menu(page: Page, profile: string, screen: string) {
  await page.waitForTimeout(450); // let the pop-in animation settle
  const m = await page.evaluate(() => {
    const el = document.getElementById('screen')!;
    let right = 0;
    for (const c of el.querySelectorAll<HTMLElement>('*')) right = Math.max(right, c.getBoundingClientRect().right);
    return { overX: Math.max(0, Math.round(right - innerWidth)), overY: Math.max(0, el.scrollHeight - el.clientHeight) };
  });
  const problem = m.overX > 0 ? `spills ${m.overX}px sideways` : m.overY > 0 ? `scrolls ${m.overY}px` : null;
  rows.push({ profile, screen, problem, note: 'fits' });
  await page.screenshot({ path: `e2e-out/layout/${profile}-${screen}.png` });
}

/** In a level: HUD pieces don't overlap each other, and everything tappable is on screen. */
async function inGame(page: Page, profile: string, screen: string) {
  await page.waitForTimeout(400);
  const problem = await page.evaluate(() => {
    const box = (el: Element) => el.getBoundingClientRect();
    const onScreen = (r: DOMRect) => r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5;
    const hits = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const hud = ['.coins', '.lvl-wrap', '.lives', '#btn-pause'].map((s) => [s, box(document.querySelector(s)!)] as const);
    for (const [s, r] of hud) if (!onScreen(r)) return `${s} off screen`;
    for (let i = 0; i < hud.length; i++) for (let j = i + 1; j < hud.length; j++) if (hits(hud[i][1], hud[j][1])) return `${hud[i][0]} overlaps ${hud[j][0]}`;
    const level = box(document.querySelector('#hud-level')!);
    const ui = Number(getComputedStyle(document.documentElement).getPropertyValue('--ui')) || 1;
    if (level.height > 40 * ui) return 'level title wraps';
    const boosts = [...document.querySelectorAll('#boosters:not(.hidden) .boost')].map(box);
    for (const r of boosts) if (!onScreen(r)) return 'booster button off screen';
    const l = (window as any).__jb.view().l;
    // The queue's front row must sit above the booster bar.
    if (boosts.length && l.qy + l.qSize * 0.5 > Math.min(...boosts.map((r) => r.top))) return 'booster bar covers the queue front';
    if (l.slots.some((p: { y: number }) => p.y - l.slotSize / 2 < l.frame.y + l.frame.h - 4) && !l.landscape) return 'slots overlap the board';
    return null;
  });
  rows.push({ profile, screen, problem, note: 'hud ok' });
  await page.screenshot({ path: `e2e-out/layout/${profile}-${screen}.png` });
}

const browser = await chromium.launch({ executablePath: browserPath() });
for (const [name, opts] of Object.entries(PROFILES)) {
  if (only && !only.includes(name)) continue;
  // No service worker: its first install can reload the page mid-audit.
  const page = await (await browser.newContext({ ...opts, serviceWorkers: 'block' })).newPage();
  // tsx names arrow functions with a __name helper that doesn't exist inside the page.
  await page.addInitScript('window.__name = (f) => f');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => (window as any).__jb?.mode === 'title');
  await z(page, `z.setSave({ unlocked: 40, coins: 1234, lives: 2, lifeAt: Date.now() - 60000, seen: ['tutorial', 'slots'] }); z.title()`);
  await page.waitForTimeout(600);
  await menu(page, name, 'title');
  await page.click('[data-act="skins"]', { force: true });
  await menu(page, name, 'skins');
  await page.click('[data-act="back"]', { force: true });
  await page.click('[data-act="levels"]', { force: true });
  await menu(page, name, 'levels');
  await page.click('[data-act="chapter-next"]', { force: true });
  await menu(page, name, 'levels-remix');
  // A level: the boosters gift, a new-mechanic tip, then play.
  await z(page, 'z.start(29)');
  await menu(page, name, 'boosters-intro');
  await page.click('[data-act="ok"]', { force: true });
  await z(page, 'z.start(7)');
  await menu(page, name, 'feature-tip');
  await page.click('[data-act="ok"]', { force: true });
  for (const i of [29, 60, 95]) {
    await z(page, `z.start(${i})`);
    await inGame(page, name, `play-${i + 1}`);
  }
  await z(page, `z.setSave({ boosters: {} }); z.booster('propeller')`);
  await menu(page, name, 'shop');
  await page.click('[data-act="cancel"]', { force: true });
  await z(page, `z.setSave({ boosters: { crane: 1 } }); z.booster('crane')`);
  await menu(page, name, 'crane');
  await page.click('[data-act="cancel"]', { force: true });
  await page.click('#btn-pause', { force: true });
  await menu(page, name, 'pause');
  await page.click('[data-act="resume"]', { force: true });
  // Lose (out of room), then out of lives, then a win.
  await z(page, `const s = z.state(); s.slots = s.slots.map((j, i) => ({ id: 900 + i, color: 0, n: 1, ice: 0, link: -1, hidden: false }));
    const j = s.cols.find(c => c[0] && c[0].link < 0 && !c[0].ice)[0]; j.n = 999; s.pending.push(...s.cols.splice(s.cols.indexOf(s.cols.find(c => c[0] === j)), 1)[0].splice(0, 1));`);
  await page.waitForSelector('[data-act="revive"]', { timeout: 20000 });
  await menu(page, name, 'lose');
  await z(page, `z.setSave({ lives: 0, lifeAt: Date.now() })`);
  await page.click('[data-act="retry"]', { force: true });
  await menu(page, name, 'no-lives');
  await z(page, `z.setSave({ lives: 3, lifeAt: null }); z.start(29); z.win()`);
  await page.waitForSelector('.panel.win', { timeout: 10000 });
  await page.waitForTimeout(1600);
  await menu(page, name, 'win');
  if (errors.length) rows.push({ profile: name, screen: 'errors', problem: errors.slice(0, 2).join(' | '), note: '' });
  await page.close();
}
await browser.close();

let bad = 0;
for (const r of rows) {
  if (r.problem) bad++;
  console.log(`${r.problem ? '✗' : '✓'} ${r.profile.padEnd(15)} ${r.screen.padEnd(15)} ${r.problem ?? r.note}`);
}
console.log(`\n${rows.length} screens checked, ${bad} problems. Screenshots in e2e-out/layout/`);
process.exit(bad ? 1 : 0);
