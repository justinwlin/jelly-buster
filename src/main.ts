import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { launch, launchGroup, newState, revive, stars, step, TUNING, type Level, type State } from './sim/engine';
import { newFeature, type Feature } from './sim/levels';
import { PACKS } from './sim/pictures';
import campaignData from './levels/campaign.json';
import { buzz, setSound, sfx, unlockAudio } from './game/audio';
import { confetti, draw, drawJelly, hitTest, newView, onEvents, relayout, update, type View } from './game/render';
import { load, store, type Save } from './game/save';

registerSW({ immediate: true });

const LEVELS = (campaignData as unknown as { levels: Level[] }).levels;
const REVIVE_COST = 100;
const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const hud = $('hud');
const screen = $('screen');
const tipEl = $('tip');
const toastEl = $('toast');

let save: Save = load();
setSound(save.settings.sound);
let mode: 'title' | 'play' | 'paused' | 'over' = 'title';
let st: State | null = null;
let view: View | null = null;
let levelIndex = 0;
let acc = 0;
let last = performance.now();
let tutorial: 'tap' | 'slot' | null = null;

// ---------------------------------------------------------------- sizing

function viewport() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  return { W, H, dpr };
}

function safeInsets() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:env(safe-area-inset-top);bottom:env(safe-area-inset-bottom);visibility:hidden';
  document.body.append(probe);
  const r = probe.getBoundingClientRect();
  const top = r.top;
  const bottom = window.innerHeight - r.bottom;
  probe.remove();
  return { top, bottom };
}

function resize() {
  const { W, H, dpr } = viewport();
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  if (view) relayout(view, W, H, dpr);
}
window.addEventListener('resize', resize);

// ---------------------------------------------------------------- screens

function show(html: string, handlers: Record<string, () => void> = {}, cls = '') {
  screen.className = `screen ${cls}`;
  screen.innerHTML = html;
  for (const [id, fn] of Object.entries(handlers)) {
    const el = screen.querySelector<HTMLElement>(`[data-act="${id}"]`);
    el?.addEventListener('click', () => {
      unlockAudio();
      fn();
    });
  }
}

function hideScreen() {
  screen.className = 'screen hidden';
  screen.innerHTML = '';
}

function toast(msg: string, ms = 1400) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  clearTimeout((toast as unknown as { t: number }).t);
  (toast as unknown as { t: number }).t = window.setTimeout(() => toastEl.classList.add('hidden'), ms);
}

/** A jelly portrait for menus and tips. */
function jellyCanvas(color: string, n: number | string, size = 64, face = true) {
  const c = document.createElement('canvas');
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  c.width = c.height = size * dpr;
  c.style.width = c.style.height = `${size}px`;
  const x = c.getContext('2d')!;
  x.scale(dpr, dpr);
  drawJelly(x, size / 2, size / 2 + 4, size * 0.95, color, n, { face });
  return c;
}

function packOf(i: number) {
  const id = LEVELS[i].id.split('/')[0];
  return PACKS.find((p) => p.id === id)!;
}

function thumb(lvl: Level, px = 6): string {
  const c = document.createElement('canvas');
  c.width = lvl.w;
  c.height = lvl.h;
  const x = c.getContext('2d')!;
  lvl.cells.forEach((k, i) => {
    if (k < 0) return;
    x.fillStyle = lvl.palette[k];
    x.fillRect(i % lvl.w, Math.floor(i / lvl.w), 1, 1);
  });
  return `<img class="thumb" src="${c.toDataURL()}" width="${lvl.w * px}" height="${lvl.h * px}" alt="${lvl.name}">`;
}

function toTitle() {
  mode = 'title';
  st = null;
  view = null;
  hud.classList.add('hidden');
  hideTip();
  const next = Math.min(save.unlocked, LEVELS.length - 1);
  show(
    `<div class="title-wrap">
      <div class="mascots" id="mascots"></div>
      <div class="logo">Jelly<span>Buster</span></div>
      <div class="panel">
        <p>Send jellies around the belt to munch every cube of the picture.</p>
        <button class="btn" data-act="play">Play · Level ${next + 1}</button>
        <button class="btn blue" data-act="levels">Levels</button>
        <div class="toggles">
          <button class="toggle ${save.settings.sound ? 'on' : ''}" data-act="sound">🔊 Sound</button>
          <button class="toggle ${save.settings.haptics ? 'on' : ''}" data-act="haptics">📳 Haptics</button>
        </div>
      </div>
    </div>`,
    {
      play: () => startLevel(next),
      levels: levelsScreen,
      sound: () => {
        save.settings.sound = !save.settings.sound;
        setSound(save.settings.sound);
        store(save);
        toTitle();
      },
      haptics: () => {
        save.settings.haptics = !save.settings.haptics;
        store(save);
        toTitle();
      },
    },
    'title',
  );
  const m = $('mascots');
  [['#9b3df0', 50], ['#ff3d4f', ''], ['#ffd21f', 40]].forEach(([c, n], i) => m.append(jellyCanvas(c as string, n as string, i === 1 ? 96 : 70)));
}

function levelsScreen() {
  const packs: string[] = [];
  let i = 0;
  const groups: { name: string; from: number; to: number }[] = [];
  while (i < LEVELS.length) {
    const encore = LEVELS[i].id.endsWith('/encore');
    const p = packOf(i);
    const from = i;
    while (i < LEVELS.length && packOf(i) === p && LEVELS[i].id.endsWith('/encore') === encore) i++;
    groups.push({ name: `${p.name}${encore ? ' · Encore' : ''}`, from, to: i });
  }
  for (const g of groups) {
    let cells = '';
    for (let k = g.from; k < g.to; k++) {
      const locked = k > save.unlocked;
      const s = save.stars[LEVELS[k].id] ?? 0;
      cells += `<button class="lv ${locked ? 'locked' : ''} ${k === save.unlocked ? 'current' : ''}" data-act="lv${k}" ${locked ? 'disabled' : ''}>${locked ? '🔒' : k + 1}<small>${'★'.repeat(s)}</small></button>`;
    }
    packs.push(`<div class="pack"><h3>${g.name}</h3><div class="grid">${cells}</div></div>`);
  }
  const handlers: Record<string, () => void> = { back: toTitle };
  for (let k = 0; k <= Math.min(save.unlocked, LEVELS.length - 1); k++) handlers[`lv${k}`] = () => startLevel(k);
  show(`<div class="panel"><h1>Levels</h1><div class="packs">${packs.join('')}</div><button class="btn ghost" data-act="back">Back</button></div>`, handlers);
}

// ---------------------------------------------------------------- tips

const FEATURE_TIPS: Record<Feature, string> = {
  ice: 'Frozen jellies thaw after you send out the number of jellies on their ice.',
  rope: 'Roped jellies go out together. Both must be at the front of their columns.',
  hidden: 'Mystery jellies show their color when they reach the front.',
  farRope: 'Some ropes lead off screen. Dig down until both ends are at the front!',
};

function showTip(html: string, where: 'top' | 'middle' = 'middle') {
  tipEl.querySelector('p')!.innerHTML = html;
  tipEl.classList.remove('hidden');
  const l = view?.l;
  tipEl.style.top = where === 'top' || !l ? 'calc(80px + env(safe-area-inset-top))' : `${Math.max(80, l.frame.y + l.frame.h * 0.45)}px`;
  const face = tipEl.querySelector('canvas')!;
  const x = face.getContext('2d')!;
  x.clearRect(0, 0, 120, 120);
  drawJelly(x, 60, 66, 110, '#ff3d4f', '', { face: true });
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

function startLevel(i: number) {
  levelIndex = i;
  const lvl = LEVELS[i];
  st = newState(lvl);
  const { W, H, dpr } = viewport();
  const safe = safeInsets();
  view = newView(st, W, H, dpr, safe.top, safe.bottom);
  resize();
  mode = 'play';
  acc = 0;
  hideScreen();
  hideTip();
  hud.classList.remove('hidden');
  $('hud-level').textContent = `Level ${i + 1}`;
  $('hud-coins').textContent = String(save.coins);
  tutorial = null;
  if (i === 0 && !save.seen.includes('tutorial')) {
    tutorial = 'tap';
    showTip('<span class="hl">Tap a jelly</span> to send it around the belt!');
    view.point = st.cols[0][0]?.id ?? null;
  } else {
    const f = newFeature(i);
    if (f && !seen(`feature:${f}`)) {
      mode = 'paused';
      show(
        `<div class="panel"><h2>New!</h2><div id="feat-j" class="mascots"></div><p>${FEATURE_TIPS[f]}</p><button class="btn" data-act="ok">Got it</button></div>`,
        { ok: () => resume() },
      );
      const box = $('feat-j');
      const c = f === 'hidden' ? jellyCanvas('#8d8a96', '?', 80, false) : jellyCanvas('#2f8cff', 20, 80, false);
      box.append(c);
    } else if (i === 1 && !seen('slots')) {
      showTip('If a jelly comes back and <span class="hl">every slot is full</span>, you lose!', 'top');
      setTimeout(hideTip, 3500);
    }
  }
}

function resume() {
  hideScreen();
  mode = 'play';
  last = performance.now();
}

function tryLaunch(id: number) {
  if (!st || !view || mode !== 'play') return;
  const res = launchGroup(st, id);
  if (!res.group) {
    sfx.deny();
    buzz(save.settings.haptics, 20);
    if (res.why === 'belt') {
      view.beltFlash = 0.6;
      toast('Belt full: wait for one to come back');
    } else if (res.why === 'ice') {
      view.shake = { id, t: 0.35 };
      toast('Frozen! Send out more jellies');
    } else if (res.why === 'rope') {
      const j = [...st.cols.flat()].find((x) => x.id === id);
      if (j) view.ropeHint = { a: id, b: j.rope, t: 1.2 };
      view.shake = { id, t: 0.35 };
      toast('Roped: both must be at the front');
    } else if (res.why === 'buried') {
      view.shake = { id, t: 0.35 };
    }
    return;
  }
  launch(st, id);
  sfx.launch();
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
  const id = hitTest(view, e.clientX, e.clientY);
  if (id !== null) tryLaunch(id);
});

function handleEvents() {
  if (!st || !view) return;
  const evs = st.events;
  if (!evs.length) return;
  st.events = [];
  onEvents(view, evs);
  for (const e of evs) {
    if (e.k === 'shot') sfx.pop(e.color);
    else if (e.k === 'done') sfx.done();
    else if (e.k === 'thaw') sfx.thaw();
    else if (e.k === 'park') {
      sfx.park();
      if (tutorial === 'slot') {
        showTip('It came back with hits left. <span class="hl">Tap it</span> to send it again!');
        view.point = e.id;
      }
    } else if (e.k === 'win') setTimeout(won, 900);
    else if (e.k === 'lose') setTimeout(() => lost(e.reason), 500);
  }
}

function won() {
  if (!st || !view) return;
  mode = 'over';
  hideTip();
  sfx.win();
  buzz(save.settings.haptics, [20, 40, 20]);
  confetti(view);
  const s = stars(st);
  const lvl = st.lvl;
  const reward = 20 + s * 10;
  save.coins += reward;
  save.stars[lvl.id] = Math.max(save.stars[lvl.id] ?? 0, s);
  if (levelIndex + 1 > save.unlocked) save.unlocked = Math.min(LEVELS.length, levelIndex + 1);
  if (levelIndex === 0) seen('tutorial');
  store(save);
  $('hud-coins').textContent = String(save.coins);
  const hasNext = levelIndex + 1 < LEVELS.length;
  const packDone = hasNext && packOf(levelIndex + 1) !== packOf(levelIndex);
  const starHtml = [1, 2, 3].map((k) => `<span class="${k <= s ? '' : 'off'}">⭐</span>`).join('');
  const hint = s < 3 ? `<p class="feature">${st.revives ? 'Finish without a revive for more stars.' : 'Use fewer slots for more stars.'}</p>` : '';
  show(
    `<div class="panel">
      <h1>${packDone ? `${packOf(levelIndex).name} complete!` : 'Picture complete!'}</h1>
      ${thumb(lvl, 5)}
      <h2>${lvl.name}</h2>
      <div class="stars">${starHtml}</div>${hint}
      <div class="reward"><span class="coin"></span>+${reward}</div>
      ${hasNext ? '<button class="btn" data-act="next">Next level ▶</button>' : '<p>You cleared every picture! More packs coming soon.</p>'}
      <button class="btn ghost" data-act="menu">Menu</button>
    </div>`,
    { next: () => startLevel(levelIndex + 1), menu: toTitle },
  );
}

function lost(reason: 'full' | 'stuck') {
  if (!st) return;
  mode = 'over';
  hideTip();
  sfx.lose();
  buzz(save.settings.haptics, [40, 60, 40]);
  const cost = REVIVE_COST * (st.revives + 1);
  const can = reason === 'full' && save.coins >= cost;
  show(
    `<div class="panel">
      <h1>${reason === 'full' ? 'Out of room!' : 'No moves left'}</h1>
      <p>${reason === 'full' ? 'A jelly came back with hits left and every slot was full.' : 'Nothing left can reach a cube of its color.'}</p>
      ${reason === 'full' ? `<button class="btn orange" data-act="revive" ${can ? '' : 'disabled'}>+1 slot and keep going · <span class="coin" style="width:20px;height:20px;vertical-align:-3px"></span> ${cost}</button>` : ''}
      <button class="btn" data-act="retry">Try again</button>
      <button class="btn ghost" data-act="menu">Menu</button>
    </div>`,
    {
      revive: () => {
        if (!st || !view || save.coins < cost) return;
        save.coins -= cost;
        store(save);
        revive(st);
        $('hud-coins').textContent = String(save.coins);
        const { W, H, dpr } = viewport();
        relayout(view, W, H, dpr);
        resume();
      },
      retry: () => startLevel(levelIndex),
      menu: toTitle,
    },
  );
}

function pauseMenu() {
  if (mode !== 'play') return;
  mode = 'paused';
  show(
    `<div class="panel"><h1>Paused</h1>
      <button class="btn" data-act="resume">Resume</button>
      <button class="btn blue" data-act="restart">Restart level</button>
      <div class="toggles">
        <button class="toggle ${save.settings.sound ? 'on' : ''}" data-act="sound">🔊 Sound</button>
        <button class="toggle ${save.settings.haptics ? 'on' : ''}" data-act="haptics">📳 Haptics</button>
      </div>
      <button class="btn ghost" data-act="menu">Menu</button></div>`,
    {
      resume,
      restart: () => startLevel(levelIndex),
      menu: toTitle,
      sound: () => {
        save.settings.sound = !save.settings.sound;
        setSound(save.settings.sound);
        store(save);
        mode = 'play';
        pauseMenu();
      },
      haptics: () => {
        save.settings.haptics = !save.settings.haptics;
        store(save);
        mode = 'play';
        pauseMenu();
      },
    },
  );
}
$('btn-pause').addEventListener('click', pauseMenu);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseMenu();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'p') {
    if (mode === 'play') pauseMenu();
    else if (mode === 'paused') resume();
  }
});

// ---------------------------------------------------------------- loop

function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (st && view) {
    if (mode === 'play') {
      acc += dt;
      const h = 1 / TUNING.hz;
      while (acc >= h) {
        step(st);
        handleEvents();
        acc -= h;
      }
    }
    update(view, mode === 'paused' ? 0 : dt);
    draw(ctx, view);
  } else {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#6e6763';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  requestAnimationFrame(frame);
}

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
  tap: (id: number) => tryLaunch(id),
  win: () => {
    if (!st) return;
    st.cells.fill(-1);
    st.left = 0;
  },
};
