import '@fontsource/baloo-2/latin-700.css';
import '@fontsource/baloo-2/latin-800.css';
import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { launch, launchGroup, legalLaunches, locate, lockedSlots, newState, revive, stars, step, TUNING, type Level, type State } from './sim/engine';
import { BOOSTER_IDS, BOOSTERS, useBooster, type BoosterId } from './sim/boosters';
import { newFeature, type Feature } from './sim/levels';
import { PACKS } from './sim/pictures';
import { exposed } from './sim/track';
import campaignData from './levels/campaign.json';
import { buzz, setMusic, setSound, sfx, unlockAudio } from './game/audio';
import { confetti, draw, drawJelly, hitLocked, hitTest, newView, onEvents, popup, relayout, shade, update, type View } from './game/render';
import { load, store, type Save } from './game/save';
import { drawBoosterIcon } from './game/boosterArt';
import { uiScale } from './game/layout';
import {
  boostersOpen, boosterStatus, buyBooster, buyLife, canBuyLife, canPlay, clock, giftBoosters, LIVES, livesApply, loseLife, nextLifeIn, owned,
  buySlot, refundLife, REVIVE_COST, reward, slotPrice, spendBooster, syncLives,
} from './game/economy';

registerSW({ immediate: true });

/** Shown on the home screen: package version, commit and build time. */
const VERSION_LABEL = `v${__APP_VERSION__} · ${__BUILD_SHA__} · ${new Date(__BUILD_TIME__).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
const LEVELS = (campaignData as unknown as { levels: Level[] }).levels;
const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const hud = $('hud');
const screen = $('screen');
const tipEl = $('tip');
const toastEl = $('toast');
const ffEl = $('ff');
const barEl = $('boosters');
const aimEl = $('aimhint');
/** Height of the booster bar strip. */
const BAR_H = 78;

let save: Save = load();
setSound(save.settings.sound);
setMusic(save.settings.music);
let mode: 'title' | 'play' | 'paused' | 'over' = 'title';
let st: State | null = null;
let view: View | null = null;
let levelIndex = 0;
let acc = 0;
let last = performance.now();
let tutorial: 'tap' | 'slot' | null = null;
/** Sim speed multiplier; ramps up to FAST when the jellies are on autopilot. */
let speed = 1;
const FAST = 3;
/** Title-screen attract mode: a level playing itself behind the menu. */
let demo: { st: State; view: View; wait: number; next: number } | null = null;
/** The booster waiting for a target, if any. The belt stands still while one is armed. */
let aim: BoosterId | null = null;
/** Level waiting on the out-of-lives screen. */
let waitingFor: number | null = null;

// ---------------------------------------------------------------- sizing

function viewport() {
  return { W: window.innerWidth, H: window.innerHeight, dpr: Math.min(3, window.devicePixelRatio || 1) };
}

function safeInsets() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:env(safe-area-inset-top);bottom:env(safe-area-inset-bottom);visibility:hidden';
  document.body.append(probe);
  const r = probe.getBoundingClientRect();
  probe.remove();
  return { top: r.top, bottom: window.innerHeight - r.bottom };
}

/** Big-screen UI scale (see uiScale in layout.ts); the HTML UI is zoomed by it via --ui. */
let ui = 1;

function resize() {
  const { W, H, dpr } = viewport();
  ui = uiScale(W, H);
  document.documentElement.style.setProperty('--ui', String(ui));
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  if (view) relayout(view, W, H, dpr, barH());
  if (demo) relayout(demo.view, W, H, dpr, 0);
  placeBar();
}
window.addEventListener('resize', resize);

// ---------------------------------------------------------------- screens

function show(html: string, handlers: Record<string, () => void> = {}, cls = '') {
  screen.className = `screen ${cls}`;
  screen.innerHTML = html;
  for (const [id, fn] of Object.entries(handlers)) {
    screen.querySelectorAll<HTMLElement>(`[data-act="${id}"]`).forEach((el) =>
      el.addEventListener('click', () => {
        unlockAudio();
        sfx.click();
        fn();
      }),
    );
  }
}

function hideScreen() {
  screen.className = 'screen hidden';
  screen.innerHTML = '';
}

let toastTimer = 0;
function toast(msg: string, ms = 1400) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  toastEl.style.animation = 'none';
  void toastEl.offsetWidth;
  toastEl.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.add('hidden'), ms);
}

/** A jelly portrait for menus and tips. */
function jellyCanvas(color: string, n: number | string, size = 64, face = true, cls = '', extra: Parameters<typeof drawJelly>[6] = {}) {
  const c = document.createElement('canvas');
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  c.width = c.height = size * dpr;
  c.style.width = c.style.height = `${size}px`;
  if (cls) c.className = cls;
  const x = c.getContext('2d')!;
  x.scale(dpr, dpr);
  drawJelly(x, size / 2, size / 2 + size * 0.04, size * 0.95, color, n, { face, mood: 'idle', look: { x: 0, y: 0.3 }, ...extra });
  return c;
}

/** A booster icon as a canvas, for the bar and menus. */
function boosterCanvas(id: BoosterId, size: number) {
  const c = document.createElement('canvas');
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  c.width = c.height = Math.round(size * dpr);
  c.style.width = c.style.height = `${size}px`;
  const x = c.getContext('2d')!;
  x.scale(dpr, dpr);
  drawBoosterIcon(x, id, size, 0.6);
  return c;
}

const HEART = '<svg class="heart" viewBox="0 0 24 22" aria-hidden="true"><path d="M12 21.2 10.4 19.8C4.6 14.6 1 11.3 1 7.2 1 3.9 3.6 1.3 6.9 1.3c1.9 0 3.7.9 5.1 2.3 1.4-1.4 3.2-2.3 5.1-2.3 3.3 0 5.9 2.6 5.9 5.9 0 4.1-3.6 7.4-9.4 12.6Z"/><ellipse cx="7" cy="6.4" rx="2.6" ry="1.6" fill="#fff" opacity=".55" transform="rotate(-30 7 6.4)"/></svg>';

/** "Full" or the countdown to the next life. */
function lifeClock() {
  const ms = nextLifeIn(save, Date.now());
  return ms === null ? 'Full' : clock(ms);
}

/** Lives pill for the title screen: hearts plus the recharge clock. */
function livesPill() {
  syncLives(save, Date.now());
  return `<div class="lives-pill">${HEART}<b class="js-lives">${save.lives}</b><small class="js-life-clock">${lifeClock()}</small></div>`;
}

/** Once a second: lives recharge and every lives readout follows. */
function tickLives() {
  const before = save.lives;
  syncLives(save, Date.now());
  if (save.lives !== before) store(save);
  document.querySelectorAll('.js-lives').forEach((el) => (el.textContent = String(save.lives)));
  document.querySelectorAll('.js-life-clock').forEach((el) => (el.textContent = lifeClock()));
  if (waitingFor !== null && save.lives > 0) livesBack(waitingFor);
}
setInterval(tickLives, 1000);

function packOf(i: number) {
  const id = LEVELS[i].id.split('/')[0];
  return PACKS.find((p) => p.id === id)!;
}

const thumbs = new Map<string, string>();
/** A picture as a small data-URL image; locked pictures show as a dark silhouette. */
function thumbUrl(lvl: Level, locked = false): string {
  const key = `${lvl.id}:${locked}`;
  let url = thumbs.get(key);
  if (!url) {
    const s = 4;
    const c = document.createElement('canvas');
    c.width = lvl.w * s;
    c.height = lvl.h * s;
    const x = c.getContext('2d')!;
    lvl.cells.forEach((k, i) => {
      if (k < 0) return;
      x.fillStyle = locked ? 'rgba(60,40,30,0.35)' : lvl.palette[k];
      x.fillRect((i % lvl.w) * s, Math.floor(i / lvl.w) * s, s - (locked ? 0 : 0.6), s - (locked ? 0 : 0.6));
    });
    url = c.toDataURL();
    thumbs.set(key, url);
  }
  return url;
}

function settingsToggles() {
  return `<div class="toggles">
    <button class="toggle ${save.settings.sound ? 'on' : ''}" data-act="sound" aria-pressed="${save.settings.sound}"><i>🔊</i>Sound</button>
    <button class="toggle ${save.settings.music ? 'on' : ''}" data-act="music" aria-pressed="${save.settings.music}"><i>🎵</i>Music</button>
    <button class="toggle ${save.settings.haptics ? 'on' : ''}" data-act="haptics" aria-pressed="${save.settings.haptics}"><i>📳</i>Haptics</button>
  </div>`;
}

function toggleHandlers(rerender: () => void) {
  return {
    sound: () => {
      save.settings.sound = !save.settings.sound;
      setSound(save.settings.sound);
      store(save);
      rerender();
    },
    music: () => {
      save.settings.music = !save.settings.music;
      setMusic(save.settings.music);
      store(save);
      rerender();
    },
    haptics: () => {
      save.settings.haptics = !save.settings.haptics;
      store(save);
      if (save.settings.haptics) buzz(true, 20);
      rerender();
    },
  };
}

function startDemo() {
  const pool = [0, 1, 3, 5, 12, 14, 24, 37];
  const i = pool[Math.floor(Math.random() * pool.length)];
  const s = newState(LEVELS[i]);
  const { W, H, dpr } = viewport();
  demo = { st: s, view: newView(s, W, H, dpr, safeInsets().top, safeInsets().bottom), wait: 0, next: 0 };
}

function toTitle() {
  mode = 'title';
  st = null;
  view = null;
  waitingFor = null;
  disarm();
  hud.classList.add('hidden');
  barEl.classList.add('hidden');
  toastEl.classList.add('hidden');
  ffEl.classList.add('hidden');
  hideTip();
  if (!demo) startDemo();
  const next = Math.min(save.unlocked, LEVELS.length - 1);
  const starsTotal = Object.values(save.stars).reduce((a, b) => a + b, 0);
  show(
    `<div class="title-wrap">
      <div class="logo" aria-label="Jelly Buster">${[...'Jelly'].map((ch, i) => `<b style="--i:${i}">${ch}</b>`).join('')}<span>${[...'Buster'].map((ch, i) => `<b style="--i:${i + 5}">${ch}</b>`).join('')}</span></div>
      <div class="mascots" id="mascots"></div>
      <div class="panel title-panel">
        <button class="btn big pulse" data-act="play"><small>Level ${next + 1}</small>Play</button>
        <div class="row">
          <button class="btn blue" data-act="levels">Levels</button>
        </div>
        <div class="title-stats"><span>⭐ ${starsTotal}</span>${livesPill()}<span><i class="coin sm"></i> ${save.coins}</span></div>
        ${settingsToggles()}
      </div>
      <div class="version" id="version">${VERSION_LABEL}</div>
    </div>`,
    { play: () => play(next), levels: levelsScreen, ...toggleHandlers(toTitle) },
    'title',
  );
  const m = $('mascots');
  [['#9b3df0', 50], ['#ff3d4f', ''], ['#ffd21f', 40]].forEach(([c, n], i) => m.append(jellyCanvas(c as string, n as string, i === 1 ? 92 : 66, true, `bob b${i}`)));
}

function levelsScreen() {
  const groups: { name: string; from: number; to: number }[] = [];
  let i = 0;
  while (i < LEVELS.length) {
    const encore = LEVELS[i].id.endsWith('/encore');
    const p = packOf(i);
    const from = i;
    while (i < LEVELS.length && packOf(i) === p && LEVELS[i].id.endsWith('/encore') === encore) i++;
    groups.push({ name: `${p.name}${encore ? ' · Encore' : ''}`, from, to: i });
  }
  const packs = groups.map((g) => {
    let got = 0;
    let cells = '';
    for (let k = g.from; k < g.to; k++) {
      const locked = k > save.unlocked;
      const s = save.stars[LEVELS[k].id] ?? 0;
      got += s;
      cells += `<button class="lv ${locked ? 'locked' : ''} ${k === save.unlocked ? 'current' : ''}" data-act="lv${k}" ${locked ? 'disabled' : ''} aria-label="Level ${k + 1}">
        <img src="${thumbUrl(LEVELS[k], locked)}" alt="">
        <b>${k + 1}</b><small>${[1, 2, 3].map((n) => `<i class="${n <= s ? 'on' : ''}">★</i>`).join('')}</small></button>`;
    }
    return `<div class="pack"><h3>${g.name}<em>★ ${got}/${(g.to - g.from) * 3}</em></h3><div class="grid">${cells}</div></div>`;
  });
  const handlers: Record<string, () => void> = { back: toTitle };
  for (let k = 0; k <= Math.min(save.unlocked, LEVELS.length - 1); k++) handlers[`lv${k}`] = () => play(k);
  show(`<div class="panel levels"><div class="ribbon">Levels</div>${livesPill()}<div class="packs">${packs.join('')}</div><button class="btn ghost" data-act="back">Back</button></div>`, handlers);
  screen.querySelector('.lv.current')?.scrollIntoView({ block: 'center' });
}

// ---------------------------------------------------------------- tips

const FEATURE_TIPS: Record<Feature, { title: string; text: string }> = {
  locked: { title: 'Locked slots', text: 'Some levels start with fewer open slots. Tap a lock to open it with gold, for this level only.' },
  hard: { title: 'Hard levels', text: 'Every fifth level is a hard one: a tougher deal and fewer open slots, but double gold. Boosters help!' },
  layers: { title: 'Layered pictures', text: 'Some cubes sit on top of another. Pop the top one and the cube under it shows up. Its color peeks out underneath.' },
  ice: { title: 'Frozen jellies', text: 'They thaw after you send out as many jellies as the number on the ice.' },
  rope: { title: 'Linked jellies', text: 'Linked jellies go out together, two or three at a time. Every one of them must be free to leave.' },
  hidden: { title: 'Mystery jellies', text: 'Their color stays hidden until they reach the front.' },
  farRope: { title: 'Long ropes', text: 'Some ropes lead off screen. Dig down until both ends are at the front!' },
};

function showTip(html: string, where: 'top' | 'middle' = 'middle') {
  tipEl.querySelector('p')!.innerHTML = html;
  tipEl.classList.remove('hidden');
  tipEl.style.animation = 'none';
  void tipEl.offsetWidth;
  tipEl.style.animation = '';
  const l = view?.l;
  // The tip is zoomed by --ui, so its top is in zoomed pixels.
  tipEl.style.top = where === 'top' || !l ? 'calc(88px + env(safe-area-inset-top))' : `${Math.max(88, (l.frame.y + l.frame.h * 0.42) / ui)}px`;
  const face = tipEl.querySelector('canvas')!;
  const x = face.getContext('2d')!;
  x.clearRect(0, 0, 120, 120);
  drawJelly(x, 60, 64, 108, '#ff3d4f', '', { face: true, mood: 'happy', wave: 0.6 });
}

function hideTip() {
  tipEl.classList.add('hidden');
  if (view) view.point = null;
}

function seen(key: string) {
  if (save.seen.includes(key)) return true;
  save.seen.push(key);
  store(save);
  return false;
}

// ---------------------------------------------------------------- play

const streaks = new Map<number, { n: number; at: number }>();
let chain = { n: 0, at: -99, level: 0 };
const COMBOS = [
  { at: 12, text: 'Nice!', color: '#7be37b' },
  { at: 24, text: 'Great!', color: '#5ab0ff' },
  { at: 40, text: 'Awesome!', color: '#ff8a1f' },
  { at: 60, text: 'Jelly-licious!', color: '#ff69c8' },
];

function setHud() {
  if (!st) return;
  $('hud-level').textContent = `Level ${levelIndex + 1}`;
  $('hud-coins').textContent = String(save.coins);
  syncLives(save, Date.now());
  $('hud-lives').textContent = String(save.lives);
}

/** Start a level if a life is available, otherwise offer to wait or buy one. */
function play(i: number) {
  if (canPlay(save, i, Date.now())) startLevel(i);
  else noLives(i);
}

function noLives(i: number) {
  mode = mode === 'title' ? 'title' : 'over';
  waitingFor = i;
  hud.classList.add('hidden');
  barEl.classList.add('hidden');
  const can = canBuyLife(save);
  show(
    `<div class="panel nolives">
      <div class="ribbon red">Out of lives</div>
      <div class="big-heart broken">${HEART}</div>
      <p>A new life arrives in <b class="js-life-clock">${lifeClock()}</b></p>
      <button class="btn orange big" data-act="buy" ${can ? '' : 'disabled'}><small>Get a life now</small><i class="coin sm"></i> ${LIVES.price}</button>
      ${can ? '' : `<p class="hint">You have <i class="coin sm"></i> ${save.coins}. Lives come back on their own, one every ${LIVES.regenMs / 60000} minutes.</p>`}
      <button class="btn ghost" data-act="back">Back</button>
    </div>`,
    {
      buy: () => {
        if (!buyLife(save, Date.now())) return;
        store(save);
        sfx.buy();
        waitingFor = null;
        startLevel(i);
      },
      back: () => {
        waitingFor = null;
        toTitle();
      },
    },
  );
}

/** A life came back while the out-of-lives screen was up. */
function livesBack(i: number) {
  waitingFor = null;
  sfx.star(0);
  show(
    `<div class="panel nolives">
      <div class="ribbon">Life refilled!</div>
      <div class="big-heart pop">${HEART}</div>
      <p>You have ${save.lives} ${save.lives === 1 ? 'life' : 'lives'}. Go get it!</p>
      <button class="btn big" data-act="go">Play level ${i + 1}</button>
      <button class="btn ghost" data-act="back">Back</button>
    </div>`,
    { go: () => startLevel(i), back: toTitle },
  );
}

let lastPct = -1;
function updateProgress() {
  if (!st) return;
  const total = st.lvl.cells.filter((c) => c >= 0).length;
  const pct = Math.round((1 - st.left / total) * 100);
  if (pct === lastPct) return;
  lastPct = pct;
  $('hud-bar').style.width = `${pct}%`;
}

function startLevel(i: number) {
  levelIndex = i;
  demo = null;
  waitingFor = null;
  disarm();
  const lvl = LEVELS[i];
  st = newState(lvl);
  const { W, H, dpr } = viewport();
  const safe = safeInsets();
  view = newView(st, W, H, dpr, safe.top, safe.bottom);
  resize();
  barEl.classList.toggle('hidden', !barH());
  lastBar = '';
  mode = 'play';
  acc = 0;
  lastPct = -1;
  speed = 1;
  streaks.clear();
  chain = { n: 0, at: -99, level: 0 };
  hideScreen();
  hideTip();
  hud.classList.remove('hidden');
  setHud();
  updateProgress();
  tutorial = null;
  if (i === 0 && !save.seen.includes('tutorial')) {
    tutorial = 'tap';
    showTip('<span class="hl">Tap a jelly</span> to send it around the belt!');
    view.point = st.cols[0][0]?.id ?? null;
    return;
  }
  const f = newFeature(i);
  if (giftBoosters(save)) {
    store(save);
    boostersIntro();
  } else if (f && !seen(`feature:${f}`)) {
    mode = 'paused';
    const tip = FEATURE_TIPS[f];
    show(
      `<div class="panel"><div class="ribbon">New!</div><div id="feat-j" class="mascots"></div><h2>${tip.title}</h2><p>${tip.text}</p><button class="btn" data-act="ok">Got it</button></div>`,
      { ok: () => resume() },
    );
    const box = $('feat-j');
    if (f === 'locked' || f === 'hard') box.innerHTML = `<span class="feat-emoji">${f === 'locked' ? '🔒' : '🔥'}</span>`;
    else if (f === 'layers') box.append(layersCanvas());
    else if (f === 'hidden') box.append(jellyCanvas('#9a96a6', '?', 84, false));
    else if (f === 'ice') {
      const c = document.createElement('canvas');
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      c.width = c.height = 84 * dpr;
      c.style.width = c.style.height = '84px';
      const x = c.getContext('2d')!;
      x.scale(dpr, dpr);
      drawJelly(x, 42, 46, 76, '#2f8cff', 20, { ice: 3 });
      box.append(c);
    } else box.append(jellyCanvas('#2f8cff', 20, 76, false), jellyCanvas('#ff8a1f', 15, 76, false), jellyCanvas('#3fcf5c', 10, 76, false));
  } else if (i === 1 && !seen('slots')) {
    showTip('If a jelly comes back and <span class="hl">every slot is full</span>, you lose!', 'top');
    setTimeout(hideTip, 3800);
  }
}

/** Two stacked cubes, as layered pictures draw them, for the "new" tip. */
function layersCanvas() {
  const c = document.createElement('canvas');
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  c.width = 150 * dpr;
  c.height = 84 * dpr;
  c.style.width = '150px';
  c.style.height = '84px';
  const x = c.getContext('2d')!;
  x.scale(dpr, dpr);
  const cube = (cx: number, cy: number, s: number, col: string) => {
    x.fillStyle = shade(col, -0.42);
    x.beginPath();
    x.roundRect(cx, cy, s, s, s * 0.18);
    x.fill();
    x.fillStyle = shade(col, 0.1);
    x.beginPath();
    x.roundRect(cx, cy, s, s * 0.84, s * 0.18);
    x.fill();
    x.fillStyle = 'rgba(255,255,255,0.4)';
    x.beginPath();
    x.roundRect(cx + s * 0.16, cy + s * 0.16, s * 0.34, s * 0.16, s * 0.08);
    x.fill();
  };
  const pairs: [string, string][] = [['#2f8cff', '#ffd21f'], ['#ff3d4f', '#3fcf5c'], ['#9b3df0', '#ff8a1f']];
  pairs.forEach(([top, under], k) => {
    const cx = 8 + k * 48;
    cube(cx, 34, 40, under);
    cube(cx, 34 - 9, 40, top);
  });
  return c;
}

function resume() {
  hideScreen();
  mode = 'play';
  last = performance.now();
}

// ---------------------------------------------------------------- boosters

const barH = () => (boostersOpen(save) ? Math.round(BAR_H * ui) : 0);

/** The bar's buttons, built once from the registry. */
const barButtons = new Map<BoosterId, { el: HTMLButtonElement; ctx: CanvasRenderingContext2D }>();
function buildBar() {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  for (const id of BOOSTER_IDS) {
    const el = document.createElement('button');
    el.className = 'boost';
    el.dataset.b = id;
    el.setAttribute('aria-label', BOOSTERS[id].name);
    el.innerHTML = `<canvas></canvas><span class="badge"></span><span class="tag"><i class="coin sm"></i>${BOOSTERS[id].price}</span>`;
    const c = el.querySelector('canvas')!;
    c.width = c.height = 50 * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      tapBooster(id);
    });
    barEl.append(el);
    barButtons.set(id, { el, ctx });
  }
}

function placeBar() {
  const b = view?.l.bar;
  if (!b || !b.h) return;
  Object.assign(barEl.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
}

let lastBar = '';
/** Badges and states follow the game: count, buy (+ price), too poor, or nothing to use it on. */
function refreshBar(time: number) {
  if (!st || barEl.classList.contains('hidden')) return;
  const sig: string[] = [aim ?? '', String(save.coins)];
  for (const id of BOOSTER_IDS) {
    const { ctx } = barButtons.get(id)!;
    const status = boosterStatus(save, st, id);
    const n = owned(save, id);
    sig.push(`${id}:${status}:${n}`);
    ctx.clearRect(0, 0, 50, 50);
    drawBoosterIcon(ctx, id, 50, aim === id || status === 'use' || status === 'buy' ? time : 0.6);
  }
  const key = sig.join('|');
  if (key === lastBar) return;
  lastBar = key;
  for (const id of BOOSTER_IDS) {
    const { el } = barButtons.get(id)!;
    const status = boosterStatus(save, st, id);
    const n = owned(save, id);
    el.className = `boost s-${status} ${n > 0 ? 'has' : 'none'} ${aim === id ? 'armed' : ''}`;
    el.querySelector('.badge')!.textContent = n > 0 ? String(n) : '+';
  }
}

function tapBooster(id: BoosterId) {
  unlockAudio();
  if (!st || !view || mode !== 'play') return;
  if (aim === id) {
    sfx.click();
    disarm();
    return;
  }
  disarm();
  const def = BOOSTERS[id];
  const status = boosterStatus(save, st, id);
  const el = barButtons.get(id)!.el;
  if (status === 'idle' || status === 'poor') {
    sfx.deny();
    buzz(save.settings.haptics, 25);
    toast(status === 'idle' ? def.unusable : `${def.name} costs ${def.price} coins`);
    el.classList.remove('nope');
    void el.offsetWidth;
    el.classList.add('nope');
    return;
  }
  sfx.click();
  if (status === 'buy') shopSheet(id);
  else arm(id);
}

/** Open a locked slot for gold, for the rest of this game. */
function slotSheet() {
  if (!st || !view) return;
  const price = slotPrice(st);
  const can = save.coins >= price;
  sfx.click();
  mode = 'paused';
  show(
    `<div class="panel shop">
      <div class="ribbon">Unlock a slot</div>
      <div class="feat-emoji">🔓</div>
      <p>One more spot for jellies to wait in when they come back. It stays open until this level ends.</p>
      <button class="btn big" data-act="buy" ${can ? '' : 'disabled'}><small>Unlock for this level</small><i class="coin sm"></i> ${price}</button>
      <p class="hint">You have <i class="coin sm"></i> ${save.coins}</p>
      <button class="btn ghost" data-act="cancel">Not now</button>
    </div>`,
    {
      buy: () => {
        if (!st || !view || !buySlot(save, st)) return resume();
        store(save);
        sfx.buy();
        setHud();
        view.bg = null;
        resume();
      },
      cancel: resume,
    },
  );
}

/** Buying is a deliberate step: pause and show what it does and what it costs. */
function shopSheet(id: BoosterId) {
  if (!st) return;
  const def = BOOSTERS[id];
  mode = 'paused';
  show(
    `<div class="panel shop">
      <div class="ribbon">${def.name}</div>
      <div class="shop-icon" id="shop-icon"></div>
      <p>${def.desc}</p>
      <button class="btn big" data-act="buy"><small>Buy and use</small><i class="coin sm"></i> ${def.price}</button>
      <p class="hint">You have <i class="coin sm"></i> ${save.coins}</p>
      <button class="btn ghost" data-act="cancel">Not now</button>
    </div>`,
    {
      buy: () => {
        if (!st || !buyBooster(save, st, id)) return resume();
        store(save);
        sfx.buy();
        setHud();
        resume();
        arm(id);
      },
      cancel: resume,
    },
  );
  $('shop-icon').append(boosterCanvas(id, 96));
}

/** Get a booster ready: pick a target on the board, or open the crane's queue view. */
function arm(id: BoosterId) {
  if (!st || !view) return;
  const def = BOOSTERS[id];
  const targets = def.targets(st);
  if (!targets.length) return;
  if (def.pick === 'queue') return cranePicker(id);
  const auto = def.autoPick?.(st);
  if (auto !== null && auto !== undefined) return applyBooster(id, auto);
  aim = id;
  view.aim = new Set(targets);
  aimEl.textContent = def.hint;
  aimEl.style.top = `${(view.l.bar.y - 44 * ui) / ui}px`;
  aimEl.classList.remove('hidden');
}

function disarm() {
  if (!aim) return;
  aim = null;
  if (view) view.aim = null;
  aimEl.classList.add('hidden');
}

function applyBooster(id: BoosterId, target: number) {
  disarm();
  if (!st || !useBooster(st, id, target)) return;
  spendBooster(save, id);
  store(save);
  buzz(save.settings.haptics, [15, 30, 15]);
}

/** The crane's view: every jelly in the queue, scrollable, with the ones it can grab lit up. */
function cranePicker(id: BoosterId) {
  if (!st) return;
  const s = st;
  mode = 'paused';
  const ok = new Set(BOOSTERS[id].targets(s));
  const handlers: Record<string, () => void> = { cancel: resume };
  const cols = s.cols
    .map(
      (col) =>
        `<div class="ccol">${col
          .map((j) => {
            if (ok.has(j.id))
              handlers[`cj${j.id}`] = () => {
                resume();
                applyBooster(id, j.id);
              };
            return `<button class="cj ${ok.has(j.id) ? '' : 'off'}" data-act="cj${j.id}" data-j="${j.id}" ${ok.has(j.id) ? '' : 'disabled'}>${j.link >= 0 ? '<i class="tie">🔗</i>' : ''}</button>`;
          })
          .join('')}</div>`,
    )
    .join('');
  show(
    `<div class="panel crane-panel">
      <div class="ribbon">Crane</div>
      <p class="hint">${BOOSTERS[id].hint}. Scroll to see the whole queue.</p>
      <div class="cscroll"><div class="ccols">${cols}</div></div>
      <button class="btn ghost" data-act="cancel">Cancel</button>
    </div>`,
    handlers,
  );
  for (const col of s.cols)
    for (const j of col) {
      const b = screen.querySelector<HTMLElement>(`[data-j="${j.id}"]`);
      b?.prepend(jellyCanvas(s.lvl.palette[j.color], j.n, 54, false, '', { ice: j.ice }));
    }
}

function boostersIntro() {
  mode = 'paused';
  show(
    `<div class="panel intro">
      <div class="ribbon">Boosters!</div>
      <p>Stuck? Boosters bail you out. Here's one of each, on the house.</p>
      <div class="intro-list">${BOOSTER_IDS.map((id) => `<div class="intro-row"><span data-icon="${id}"></span><div><b>${BOOSTERS[id].name}</b><small>${BOOSTERS[id].desc}</small></div></div>`).join('')}</div>
      <p class="hint">More cost gold, and the shop only sells one when you can use it.</p>
      <button class="btn" data-act="ok">Let's go</button>
    </div>`,
    { ok: resume },
  );
  for (const id of BOOSTER_IDS) screen.querySelector(`[data-icon="${id}"]`)?.append(boosterCanvas(id, 58));
}

function tryLaunch(id: number) {
  if (!st || !view || mode !== 'play') return;
  const res = launchGroup(st, id);
  if (!res.group) {
    sfx.deny();
    buzz(save.settings.haptics, 25);
    if (res.why === 'belt') {
      view.beltFlash = 0.6;
      toast('Belt full: wait for one to come back');
    } else if (res.why === 'ice') {
      view.shake = { id, t: 0.35 };
      toast('Frozen! Send out more jellies');
    } else if (res.why === 'rope') {
      const j = st.cols.flat().find((x) => x.id === id);
      if (j && j.link >= 0) view.ropeHint = { link: j.link, t: 1.2 };
      view.shake = { id, t: 0.35 };
      toast('Linked: free every jelly in the group first');
    } else if (res.why === 'buried') {
      view.shake = { id, t: 0.35 };
    }
    return;
  }
  launch(st, id);
  buzz(save.settings.haptics, 12);
  if (tutorial === 'tap') {
    tutorial = 'slot';
    hideTip();
  } else if (tutorial === 'slot' && view.point === id) {
    tutorial = null;
    hideTip();
    seen('tutorial');
  }
}

canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  if (!view || mode !== 'play') return;
  if (!aim && hitLocked(view, e.clientX, e.clientY)) return slotSheet();
  const id = hitTest(view, e.clientX, e.clientY);
  if (aim) {
    // Armed booster: a glowing jelly takes it, anything else puts it away.
    if (id !== null && view.aim?.has(id)) applyBooster(aim, id);
    else disarm();
    return;
  }
  if (id !== null) tryLaunch(id);
});

function handleEvents() {
  if (!st || !view) return;
  const evs = st.events;
  if (!evs.length) return;
  st.events = [];
  onEvents(view, evs);
  for (const e of evs) {
    if (e.k === 'shot') {
      const s = streaks.get(e.id);
      const n = s && st.tick - s.at < 40 ? s.n + 1 : 0;
      streaks.set(e.id, { n, at: st.tick });
      sfx.pop(n);
      chain = st.tick - chain.at < 30 ? { ...chain, n: chain.n + 1, at: st.tick } : { n: 1, at: st.tick, level: 0 };
      const c = COMBOS[chain.level];
      if (c && chain.n >= c.at) {
        popup(view, c.text, c.color, chain.level >= 3 ? 0.9 : 1);
        sfx.combo(chain.level);
        buzz(save.settings.haptics, 15);
        chain.level++;
      }
    } else if (e.k === 'done') {
      sfx.done();
      buzz(save.settings.haptics, 18);
    } else if (e.k === 'launch') sfx.launch();
    else if (e.k === 'loop') sfx.enter();
    else if (e.k === 'lift') sfx.lift();
    else if (e.k === 'crane') sfx.crane();
    else if (e.k === 'merge') sfx.merge();
    else if (e.k === 'thaw') sfx.thaw();
    else if (e.k === 'enter') sfx.enter();
    else if (e.k === 'park') {
      sfx.park();
      const used = st.slots.filter((j) => j).length;
      if (used === st.slots.length - 1) {
        sfx.warn();
        toast('Only one slot left!');
        buzz(save.settings.haptics, [30, 40, 30]);
      }
      if (tutorial === 'slot') {
        showTip('It came back with hits left. <span class="hl">Tap it</span> to send it again!');
        view.point = e.id;
      }
    } else if (e.k === 'win') won();
    else if (e.k === 'lose') setTimeout(() => lost(e.reason), 900);
  }
}

function countUp(el: HTMLElement, from: number, to: number, ms: number, tick?: () => void) {
  const t0 = performance.now();
  const stepFn = (now: number) => {
    const u = Math.min(1, (now - t0) / ms);
    const v = Math.round(from + (to - from) * (1 - Math.pow(1 - u, 3)));
    if (el.textContent !== String(v)) {
      el.textContent = String(v);
      tick?.();
    }
    if (u < 1) requestAnimationFrame(stepFn);
  };
  requestAnimationFrame(stepFn);
}

/** Coins fly from the reward pill up to the HUD counter. */
function flyCoins(from: HTMLElement, n: number) {
  const a = from.getBoundingClientRect();
  const b = $('hud-coin-icon').getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i');
    c.className = 'coin fly';
    c.style.left = `${a.left + a.width / 2 - 13 + (Math.random() - 0.5) * 40}px`;
    c.style.top = `${a.top + a.height / 2 - 13 + (Math.random() - 0.5) * 20}px`;
    document.body.append(c);
    setTimeout(() => {
      c.style.transform = `translate(${b.left - parseFloat(c.style.left)}px, ${b.top - parseFloat(c.style.top)}px) scale(0.8)`;
      c.style.opacity = '0.9';
    }, 30 + i * 60);
    setTimeout(() => {
      c.remove();
      sfx.coin();
      const hc = $('hud-coins');
      hc.parentElement!.classList.remove('bump');
      void hc.offsetWidth;
      hc.parentElement!.classList.add('bump');
    }, 650 + i * 60);
  }
}

function won() {
  if (!st || !view) return;
  mode = 'over';
  hideTip();
  const s = stars(st);
  const lvl = st.lvl;
  const gold = reward(s, !!lvl.hard);
  const before = save.coins;
  save.coins += gold;
  save.stars[lvl.id] = Math.max(save.stars[lvl.id] ?? 0, s);
  if (levelIndex + 1 > save.unlocked) save.unlocked = Math.min(LEVELS.length, levelIndex + 1);
  if (levelIndex === 0) seen('tutorial');
  store(save);
  buzz(save.settings.haptics, [20, 40, 20, 40, 60]);
  setTimeout(() => {
    if (!view) return;
    sfx.win();
    confetti(view);
  }, 350);
  const hasNext = levelIndex + 1 < LEVELS.length;
  const packDone = hasNext && packOf(levelIndex + 1) !== packOf(levelIndex);
  setTimeout(() => {
    if (mode !== 'over' || !st) return;
    const hint = s < 3 ? `<p class="hint">${st.revives ? 'Finish without a revive for more stars.' : 'Use fewer slots for more stars.'}</p>` : '<p class="hint">Perfect!</p>';
    show(
      `<div class="panel win">
        <div class="ribbon">${packDone ? `${packOf(levelIndex).name} complete!` : `Level ${levelIndex + 1} complete!`}</div>
        <div class="stars">${[1, 2, 3].map((k) => `<span class="star ${k <= s ? 'on' : ''}" style="--d:${0.25 + k * 0.3}s">★</span>`).join('')}</div>
        <img class="thumb" src="${thumbUrl(lvl)}" alt="${lvl.name}">
        <h2>${lvl.name}</h2>
        ${hint}
        <div class="reward" id="reward"><i class="coin"></i><b>+<span id="reward-n">0</span></b>${lvl.hard ? '<em class="x2">Hard ×2</em>' : ''}</div>
        ${hasNext ? '<button class="btn big" data-act="next">Next level</button>' : '<p>You cleared every picture! More packs coming soon.</p>'}
        <button class="btn ghost" data-act="menu">Menu</button>
      </div>`,
      { next: () => play(levelIndex + 1), menu: toTitle },
    );
    for (let k = 0; k < s; k++) setTimeout(() => sfx.star(k), (0.25 + (k + 1) * 0.3) * 1000 + 150);
    setTimeout(() => {
      const el = $('reward-n');
      if (!el) return;
      countUp(el, 0, gold, 600, () => sfx.coin());
      setTimeout(() => {
        const r = document.getElementById('reward');
        if (r) flyCoins(r, 6);
        const hc = $('hud-coins');
        setTimeout(() => countUp(hc, before, save.coins, 500), 650);
      }, 700);
    }, 1300);
  }, 1700);
}

/** A row of hearts; `cracked` marks the one that was just lost. */
function heartsRow(cracked: number) {
  return `<div class="hearts">${Array.from({ length: LIVES.max }, (_, k) => `<span class="${k < save.lives ? 'on' : ''} ${k === cracked ? 'crack' : ''}">${HEART}</span>`).join('')}</div>`;
}

function lost(reason: 'full' | 'stuck') {
  if (!st) return;
  mode = 'over';
  hideTip();
  disarm();
  sfx.lose();
  buzz(save.settings.haptics, [60, 60, 60]);
  // The life goes now (so closing the app doesn't dodge it); continuing gives it back.
  const costsLife = livesApply(levelIndex);
  loseLife(save, levelIndex, Date.now());
  store(save);
  setHud();
  if (costsLife) setTimeout(() => sfx.heart(), 500);
  // Continuing opens a locked socket if there is one, at the unlock price.
  const cost = lockedSlots(st) ? slotPrice(st) : REVIVE_COST * (st.revives + 1);
  const can = reason === 'full' && save.coins >= cost;
  const total = st.lvl.cells.filter((c) => c >= 0).length;
  const pct = Math.round((1 - st.left / total) * 100);
  const out = costsLife && save.lives <= 0;
  show(
    `<div class="panel lose">
      <div class="ribbon red">${reason === 'full' ? 'Out of room!' : 'No moves left'}</div>
      <div id="sad-j" class="mascots"></div>
      <p>${reason === 'full' ? 'A jelly came back with hits left and every slot was full.' : 'Nothing left can reach a cube of its color.'}</p>
      <div class="meter"><div style="width:${pct}%"></div><span>${pct}% cleared</span></div>
      ${costsLife ? heartsRow(save.lives) : ''}
      ${reason === 'full' ? `<button class="btn orange big" data-act="revive" ${can ? '' : 'disabled'}><small>+1 slot, keep going${costsLife ? ' and keep your life' : ''}</small><i class="coin sm"></i> ${cost}</button>` : ''}
      <button class="btn" data-act="retry">${out ? `Out of lives · <span class="js-life-clock">${lifeClock()}</span>` : 'Try again'}</button>
      <button class="btn ghost" data-act="menu">Menu</button>
    </div>`,
    {
      revive: () => {
        if (!st || !view || save.coins < cost) return;
        save.coins -= cost;
        refundLife(save, levelIndex);
        store(save);
        revive(st);
        view.lost = null;
        setHud();
        const { W, H, dpr } = viewport();
        relayout(view, W, H, dpr);
        resume();
      },
      retry: () => play(levelIndex),
      menu: toTitle,
    },
  );
  const c = document.createElement('canvas');
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  c.width = c.height = 84 * dpr;
  c.style.width = c.style.height = '84px';
  const x = c.getContext('2d')!;
  x.scale(dpr, dpr);
  drawJelly(x, 42, 46, 78, st.held ? st.lvl.palette[st.held.color] : '#ff3d4f', st.held?.n ?? '', { face: true, mood: 'worried', look: { x: 0, y: 0.4 } });
  $('sad-j').append(c);
}

function pauseMenu() {
  if (mode !== 'play') return;
  disarm();
  mode = 'paused';
  // Walking out of a level you've started costs the life it would have cost to lose it.
  const quitCost = !!st && st.status === 'play' && st.launches > 0 && livesApply(levelIndex);
  const quit = (then: () => void) => () => {
    if (quitCost) {
      loseLife(save, levelIndex, Date.now());
      store(save);
      sfx.heart();
    }
    then();
  };
  const cost = quitCost ? ` <span class="cost">−1 ${HEART}</span>` : '';
  show(
    `<div class="panel"><div class="ribbon">Paused</div>
      <button class="btn big" data-act="resume">Resume</button>
      <button class="btn blue" data-act="restart">Restart level${cost}</button>
      ${settingsToggles()}
      <button class="btn ghost" data-act="menu">Menu${cost}</button></div>`,
    {
      resume,
      restart: quit(() => play(levelIndex)),
      menu: quit(toTitle),
      ...toggleHandlers(() => {
        mode = 'play';
        pauseMenu();
      }),
    },
  );
}
$('btn-pause').addEventListener('click', () => {
  unlockAudio();
  sfx.click();
  pauseMenu();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseMenu();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'p') {
    if (mode === 'play') pauseMenu();
    else if (mode === 'paused') resume();
  }
});
window.addEventListener('pointerdown', () => unlockAudio(), { once: true });

// ---------------------------------------------------------------- loop

/** Demo player: sends a jelly whose color is showing, slot jellies first. */
function demoPick(s: State): number | null {
  const legal = legalLaunches(s);
  if (!legal.length) return null;
  const ex = exposed(s.cells, s.lvl.w, s.lvl.h);
  const want = new Set([...ex].map((i) => s.cells[i]));
  const color = (id: number) => {
    const at = locate(s, id)!;
    return at.slot >= 0 ? s.slots[at.slot]!.color : s.cols[at.col][0].color;
  };
  const good = legal.filter((id) => want.has(color(id)));
  if (good.length) return good[Math.floor(Math.random() * good.length)];
  return !s.belt.length && !s.pending.length ? legal[0] : null;
}

function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const h = 1 / TUNING.hz;
  if (st && view) {
    // Once the queue is empty the jellies play themselves, so fast-forward to the finish.
    const auto = mode === 'play' && st.status === 'play' && st.cols.every((c) => !c.length);
    speed += ((auto ? FAST : 1) - speed) * Math.min(1, dt * 3);
    ffEl.classList.toggle('hidden', speed < 1.3);
    if (mode === 'play' && !aim) {
      acc += dt * speed;
      while (acc >= h) {
        step(st);
        handleEvents();
        acc -= h;
      }
      updateProgress();
    } else if (mode === 'over') {
      // Keep the belt running for the celebration (no new events matter).
      st.events = [];
    }
    update(view, mode === 'paused' ? 0 : dt * (mode === 'play' && !aim ? speed : 1));
    draw(ctx, view);
    refreshBar(now / 1000);
  } else if (demo) {
    const d = demo;
    acc += dt;
    while (acc >= h) {
      if (d.wait-- <= 0 && d.st.status === 'play' && d.st.belt.length + d.st.pending.length < d.st.lvl.belt) {
        const id = demoPick(d.st);
        if (id !== null) launch(d.st, id);
        d.wait = 24;
      }
      step(d.st);
      const evs = d.st.events;
      d.st.events = [];
      onEvents(d.view, evs);
      if (d.st.status !== 'play') {
        d.next += h;
        if (d.next > 3) startDemo();
        break;
      }
      acc -= h;
    }
    if (demo) {
      update(demo.view, dt);
      draw(ctx, demo.view);
    }
  } else {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#9aa8ff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  requestAnimationFrame(frame);
}

buildBar();
resize();
toTitle();
requestAnimationFrame(frame);

// Test hooks for the e2e script.
(window as unknown as { __jb: unknown }).__jb = {
  get mode() {
    return mode;
  },
  levels: () => LEVELS.length,
  state: () => st,
  view: () => view,
  save: () => save,
  start: (i: number) => startLevel(i),
  title: () => toTitle(),
  tap: (id: number) => tryLaunch(id),
  booster: (id: BoosterId) => tapBooster(id),
  aim: () => aim,
  setSave: (patch: Partial<Save>) => {
    Object.assign(save, patch);
    store(save);
  },
  win: () => {
    if (!st) return;
    st.cells.fill(-1);
    st.left = 0;
  },
};
