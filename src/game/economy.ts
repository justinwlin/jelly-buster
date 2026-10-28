// Coins, lives and the booster shop, as pure functions on the save (no DOM), so they can be
// unit tested and every screen applies the same rules.

import { BOOSTERS, BOOSTERS_FROM, canUse, type BoosterId } from '../sim/boosters';
import { unlockSlot, type State } from '../sim/engine';
import type { Save } from './save';

export const LIVES = {
  max: 3,
  /** One life comes back every 10 minutes until you're full again. */
  regenMs: 10 * 60 * 1000,
  /** Coins for one life, only on sale when you're out. */
  price: 150,
  /** The first levels are a free tutorial: losing them costs nothing. */
  from: 3,
};

/** Continuing after running out of slots: +1 slot, price grows with each revive. */
export const REVIVE_COST = 100;

/** Gold for clearing a level with `stars` stars; hard levels pay double. */
export const reward = (stars: number, hard = false) => (20 + stars * 10) * (hard ? 2 : 1);

/** Opening a locked slot for this game: each one costs more than the last. */
export const SLOT_PRICE = { first: 50, step: 30 };
export const slotPrice = (st: State) => SLOT_PRICE.first + SLOT_PRICE.step * st.unlocks;

/** Unlock a locked slot for the rest of this game. Only on sale while one is locked. */
export function buySlot(s: Save, st: State): boolean {
  const price = slotPrice(st);
  if (s.coins < price || !unlockSlot(st)) return false;
  s.coins -= price;
  return true;
}

/** Bring lives up to date with the clock. Call before reading save.lives. */
export function syncLives(s: Save, now: number) {
  if (s.lives >= LIVES.max) {
    s.lifeAt = null;
    return;
  }
  if (s.lifeAt === null || s.lifeAt > now) s.lifeAt = now;
  const gained = Math.floor((now - s.lifeAt) / LIVES.regenMs);
  if (!gained) return;
  s.lives = Math.min(LIVES.max, s.lives + gained);
  s.lifeAt = s.lives >= LIVES.max ? null : s.lifeAt + gained * LIVES.regenMs;
}

/** Milliseconds until the next life, or null when lives are full. */
export function nextLifeIn(s: Save, now: number): number | null {
  syncLives(s, now);
  return s.lifeAt === null ? null : Math.max(0, s.lifeAt + LIVES.regenMs - now);
}

export const livesApply = (levelIndex: number) => levelIndex >= LIVES.from;

/** Can this level be started right now? */
export function canPlay(s: Save, levelIndex: number, now: number) {
  syncLives(s, now);
  return !livesApply(levelIndex) || s.lives > 0;
}

/** A lost level costs a life; the recharge clock starts when you drop below full. */
export function loseLife(s: Save, levelIndex: number, now: number) {
  if (!livesApply(levelIndex)) return;
  syncLives(s, now);
  if (s.lives <= 0) return;
  if (s.lives >= LIVES.max) s.lifeAt = now;
  s.lives--;
}

/** Give a life back (continuing a lost level keeps the life it cost). */
export function refundLife(s: Save, levelIndex: number) {
  if (!livesApply(levelIndex)) return;
  s.lives = Math.min(LIVES.max, s.lives + 1);
  if (s.lives >= LIVES.max) s.lifeAt = null;
}

/** Lives are only sold when you have none: that's the only time one helps. */
export const canBuyLife = (s: Save) => s.lives <= 0 && s.coins >= LIVES.price;

export function buyLife(s: Save, now: number): boolean {
  syncLives(s, now);
  if (!canBuyLife(s)) return false;
  s.coins -= LIVES.price;
  s.lives++;
  if (s.lives >= LIVES.max) s.lifeAt = null;
  return true;
}

export const boostersOpen = (s: Save) => s.unlocked >= BOOSTERS_FROM;
export const owned = (s: Save, id: BoosterId) => s.boosters[id] ?? 0;

/** What tapping a booster does right now. */
export function boosterStatus(s: Save, st: State, id: BoosterId): 'use' | 'buy' | 'poor' | 'idle' {
  if (!canUse(st, id)) return 'idle';
  if (owned(s, id) > 0) return 'use';
  return s.coins >= BOOSTERS[id].price ? 'buy' : 'poor';
}

/** Buy one booster, only when it can be used on the spot. */
export function buyBooster(s: Save, st: State, id: BoosterId): boolean {
  if (boosterStatus(s, st, id) !== 'buy') return false;
  s.coins -= BOOSTERS[id].price;
  s.boosters[id] = owned(s, id) + 1;
  return true;
}

/** Take one booster out of the bag after it was used. */
export function spendBooster(s: Save, id: BoosterId) {
  s.boosters[id] = Math.max(0, owned(s, id) - 1);
}

/** The first time the shop opens, one of each booster is on the house. */
export function giftBoosters(s: Save): boolean {
  if (!boostersOpen(s) || s.seen.includes('boosters')) return false;
  s.seen.push('boosters');
  for (const id of Object.keys(BOOSTERS) as BoosterId[]) s.boosters[id] = owned(s, id) + 1;
  return true;
}

/** "9:41" */
export function clock(ms: number) {
  const t = Math.ceil(ms / 1000);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}
