// Boosters: one registry entry per power-up. The game, the bots and the tests all go through
// BOOSTERS, so a new booster is one entry here plus an engine action (and an icon).
//
// A booster is usable exactly when targets() is non-empty, and the shop only sells one that
// is usable right now, so a bought booster can always be spent.

import { crane, craneTargets, lift, liftTargets, merge, mergeTargets, type State } from './engine';

export type BoosterId = 'propeller' | 'crane' | 'merge';

export interface BoosterDef {
  id: BoosterId;
  name: string;
  /** Shown in the shop sheet and while choosing a target. */
  desc: string;
  /** What to tap once it's armed. */
  hint: string;
  /** Why it can't be used, for when a player taps it anyway. */
  unusable: string;
  /** Coins for one. */
  price: number;
  /** How the player picks a target: tap a jelly on the board, or browse the whole queue. */
  pick: 'board' | 'queue';
  /** Jelly ids it can be used on right now; empty means it can't be used. */
  targets(st: State): number[];
  apply(st: State, id: number): boolean;
  /** When every target would do the same thing, the one to use without asking. */
  autoPick?(st: State): number | null;
}

export const BOOSTERS: Record<BoosterId, BoosterDef> = {
  propeller: {
    id: 'propeller',
    name: 'Propeller',
    desc: 'Lift a jelly over the picture. It fires at every cube of its color until it is done.',
    hint: 'Tap a jelly to give it a propeller',
    unusable: 'One propeller at a time',
    price: 120,
    pick: 'board',
    targets: liftTargets,
    apply: lift,
  },
  crane: {
    id: 'crane',
    name: 'Crane',
    desc: 'Pick any jelly from the whole queue, even frozen or tied up, and drop it on the belt.',
    hint: 'Pick a jelly to drop on the belt',
    unusable: 'The crane needs room on the belt',
    price: 100,
    pick: 'queue',
    targets: craneTargets,
    apply: crane,
  },
  merge: {
    id: 'merge',
    name: 'Merge',
    desc: 'Squish waiting jellies of the same color into one and free up their slots.',
    hint: 'Tap a glowing jelly to merge its color',
    unusable: 'Needs two waiting jellies of the same color',
    price: 60,
    pick: 'board',
    targets: mergeTargets,
    apply: merge,
    autoPick(st) {
      const ids = mergeTargets(st);
      const colors = new Set(st.slots.filter((j) => j && ids.includes(j.id)).map((j) => j!.color));
      return colors.size === 1 ? ids[0] : null;
    },
  },
};

export const BOOSTER_IDS = Object.keys(BOOSTERS) as BoosterId[];

/** Boosters are on sale from this level index on (level 4), all of them at once. */
export const BOOSTERS_FROM = 3;

export type Kit = Partial<Record<BoosterId, number>>;

export const canUse = (st: State, id: BoosterId) => BOOSTERS[id].targets(st).length > 0;

/** Spend a booster on a jelly. Returns false (and changes nothing) if it isn't allowed. */
export function useBooster(st: State, id: BoosterId, target: number): boolean {
  const def = BOOSTERS[id];
  if (!def.targets(st).includes(target) || !def.apply(st, target)) return false;
  st.boosts++;
  return true;
}
