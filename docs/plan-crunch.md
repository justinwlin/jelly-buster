# Plan: more crunch (locked slots, hard levels, bigger jellies, layered pictures)

Status: **paused, about half built.** The work in progress is on the `justin/crunch` branch (commit `4d610c3`), on top of `main` at `f4eb608`. Nothing from it is on `main` yet. Read [development.md](development.md) first for how the game, the simulation and the level builder fit together.

## What Justin asked for

The game should be harder now that boosters exist, without bullying anyone. He picked four changes:

1. **Locked slots you can unlock with gold.** Some levels start with fewer open slots, so returning jellies have less room ("more of a crunch"). The rest of the 5 sockets are locked, and you can open them with gold during the level, which gives gold something to be spent on.
2. **A hard level every 5 levels.** It should be "not unfair": tougher, but always beatable.
3. **Larger jellies.** Jellies that need more than one lap come back to a slot more often.
4. **Layered pictures.** Some cubes sit on top of another cube, so the picture is deeper.

Standing rules from earlier work, which still apply:

- Rules stay predictable. Don't add mechanics that make a jelly's behavior surprising (Justin rejected a "skip a station" rule for this reason).
- Every level must be proven beatable by the bots before it ships ([development.md](development.md#how-levels-are-made-beatable)).
- The shop only sells something you can use right now.
- Push to `main` when a change is done and checked. Run the unit tests, the build, `npm run e2e` and `npm run layout`, and look at the screenshots first.

Ideas discussed but **not** picked yet: walls on parts of the belt (jellies there can't fire), crate cubes, two-hit stone cubes, key cubes, and a smaller belt limit on some levels.

## Design decisions

### Locked slots

- Every level shows 5 slot sockets (`Level.sockets = 5`). `Level.slots` is how many are open at the start.
- Open slots by level:

  | Levels | Open slots |
  |---|---|
  | 1–6 | 5 |
  | 7 on | 4 |
  | Hard levels | 3 |

- Tapping a locked socket opens a sheet: "Unlock a slot", the price, Unlock or Not now. The game pauses while the sheet is up.
- An unlocked slot lasts for this attempt only. A retry starts locked again, which is what keeps it a gold sink.
- Price: 50 gold for the first unlock in a game, then +30 for each one after (`SLOT_PRICE` in `src/game/economy.ts`).
- Locked sockets are drawn as darker wood with a gold padlock and a price tag.
- Continuing after running out of slots (the existing revive) uses a locked socket if there is one, at the unlock price. With no locked socket left it adds a 6th slot at the old revive price, as today.
- Unlocking doesn't change stars. A revive still caps the level at 1 star.
- The level checker must never *need* an unlock. `need` (the fewest slots the planning bot needs) is measured against the open slots only. The `boosted` check gives the human-like bot one of each booster **and** one unlocked slot.

### Hard levels

- `isHard(index)`: every 5th level from level 10 (levels 10, 15, 20, …; index 9, 14, 19, …).
- A hard level has:
  - 3 open slots instead of 4;
  - a deal hardened like the tough levels: a careful player may lose 1 game in 3;
  - a spam cap one lower than normal (minimum 1);
  - a layer fraction 0.1 higher, but only once layers have started (level 16 on);
  - **double gold**.
- It passes the checker the same way tough levels do: the human-like bot wins at least 1 of 3 without help, and 3 of 3 with the booster kit plus one unlocked slot.
- UI still to build (see below): a red "Hard" badge in the HUD and on the level grid, a "Hard level!" popup when it starts, and "Hard ×2" on the win reward.

### Bigger jellies

- In `recipe()`: levels 13–30 use chunk sizes `[15, 35]`, and level 31 on uses `[15, 45]` (before: `[10, 30]` and `[5, 25]`).
- The builder tries these variants of a deal, gentlest first: base, smaller jellies `[10, 30]`, half the layer fraction, bigger jellies `[20, 50]`.

### Layered pictures

- `Level.under?: number[]`: one entry per cell, giving the color of the cube under that cell's cube (-1 for none). Popping the top cube moves the under cube up into the same cell (`pop()` in `engine.ts`). Line of sight, exposure, deadlock checks and the propeller all keep working because they only look at the top layer.
- `State.left` counts both layers.
- The cover (`coverUp()` in `levels.ts`) wraps the cells peeled last, the middle of the picture, in diagonal stripes of the picture's two most common colors. The real art is underneath.
- Layer fraction: 0 before level 16, then 0.2 rising to about 0.55. Hard levels add 0.1.
- Rendering: the under cube is drawn in the cell and the top cube sits on it, raised by 20% of a cube, so the next color peeks out along the bottom edge. The baked picture canvas has extra room at the top for the raised top row (`picPad`). A cube still in flight toward its shot is drawn over whatever it uncovers (ghosts take precedence).
- `peelOrder()` now takes the under layer and returns `{ i, color }` items, with a layered cell listed twice. Jellies are chunked per color from that order, so hits still add up exactly to cubes.

### New-mechanic tips

`newFeature()` gains `locked` (level 7), `hard` (level 10) and `layers` (level 16), alongside ice (8), rope (14), hidden (18) and farRope (22). Their tip texts are in `FEATURE_TIPS` in `main.ts`. Locked and hard show an emoji; layers shows a small drawing of stacked cubes (`layersCanvas()`).

## Status of the `justin/crunch` branch

Done (type-checks and builds):

- **Engine** (`src/sim/engine.ts`):
  - `Level.under`, `Level.sockets` and `Level.hard`;
  - `State.under` and `State.unlocks`;
  - `pop()`, `lockedSlots()` and `unlockSlot()`;
  - revive counts as an unlock when a locked socket is free.
- **Level builder** (`src/sim/levels.ts`, `GEN_VERSION = 3`):
  - `isHard`, `Recipe.open` and `Recipe.layers`;
  - `coverUp()`, and `peelOrder()` with layers;
  - bigger chunks;
  - `needBand(index, open)`, `tough()`, the hard spam cap, the `helped()` boosted check, the new variants, and a fallback that also strips layers and opens all 5 slots.
- **Economy** (`src/game/economy.ts`): `reward(stars, hard)`, `SLOT_PRICE`, `slotPrice()` and `buySlot()`.
- **Rendering** (`src/game/render.ts`):
  - sockets laid out for open plus locked;
  - locked sockets in darker wood, with a padlock and price tag (`drawLock`, using `View.lockPrice`);
  - `hitLocked()`;
  - layered cubes and `picPad`.
- **Game** (`src/main.ts`):
  - the three feature tips and `layersCanvas()`;
  - tapping a lock opens `slotSheet()`;
  - revive is priced at the unlock price when a socket is locked;
  - hard levels pay double, with "Hard ×2" on the win screen.
- **Levels**: `src/levels/campaign.json` was rebuilt with gen 3, 76 of 100 levels on target. Bot results:

  | Levels | Human-like bot | With kit | Spam bot | Slots needed |
  |---|---|---|---|---|
  | 1–25 | 2.9/3 | 3/3 | 4.7/8 | 1.3 |
  | 26–50 | 2.5/3 | 3/3 | 1.6/8 | 2.1 |
  | 51–75 | 2.7/3 | 3/3 | 1.8/8 | 1.9 |
  | 76–100 | 2.9/3 | 3/3 | 2.5/8 | 2.1 |
  | Hard (19 levels) | 2.9/3 | 3/3 | 2.4/8 | 1.4 |

  - Spam now mostly fails, and a booster kit always wins.
  - 73 levels have a cover layer.
  - Open slots across the campaign: 3 open on 14 levels, 4 on 68, and 5 on 18.

Left to do:

1. **`View.lockPrice` is never set.** In `frame()` (or `setHud()`), set `view.lockPrice = slotPrice(st)`, otherwise the price tag on locked sockets doesn't show.
2. **Hard level UI:**
   - a red "Hard" badge in the HUD (`.lvl` gets a `hard` class; keep the title from wrapping on a 360px phone, which `npm run layout` checks);
   - a `.lv.hard` style with a small 🔥 on the level grid;
   - `popup(view, 'Hard level!', …)` plus `sfx.warn()` when a hard level starts, after any tip panel;
   - CSS for `.x2` (the "Hard ×2" tag on the reward) and `.feat-emoji` (the big emoji in tips and in the unlock sheet).
3. **Five of the 19 hard levels fell back to the stripped deal** (all 5 slots open, no mechanics), because nothing tougher passed. Look at those levels in the `npm run levels` output. Options: let hard levels try 4 open slots before stripping everything, or add a gentler hard variant.
4. **Fix the failing test** in `tests/levels.test.ts`, "every level has exactly enough jelly hits for its cubes, per color". It counts only `cells`; it must also count `under`.
5. **New tests** (follow `tests/boosters.test.ts`):
   - engine: popping a layered cell uncovers the under cube in the same cell; `left` counts both layers;
   - engine: `unlockSlot` / `lockedSlots`, and revive with a locked socket counts as an unlock;
   - economy: `slotPrice` goes up per unlock; `buySlot` needs the coins and a locked socket; hard levels pay double;
   - levels: `isHard` for 10, 15, …; open slots per recipe; shipped hard levels have `hard: true`; `need` never exceeds the open slots.
6. **e2e** (`scripts/e2e.ts`): tap a locked socket on the canvas, buy, check `state().slots.length` went up and coins went down. Also check a hard level shows the badge.
7. **Screens:** run `npm run layout` and `npx tsx scripts/shots-boosters.ts`. Look at locked sockets, layered cubes (the raised top row must not be clipped at the top of the picture), and the unlock sheet on every profile.
8. **Docs:** update README "How to play", the mechanics table and "Levels", and the builder section of `development.md` (open slots, hard levels, layers, `GEN_VERSION 3`).
9. **Bots** (optional): teach `useKit()` in `src/sim/bots.ts` to unlock a slot when tight, instead of the `helped()` shortcut that just opens one slot from the start.

## Gotchas

- `pgrep -f`/`pkill -f` with a pattern that appears in your own command line matches your own shell. A wait loop like `until ! pgrep -f build-levels` never ends. Wait on the log file instead (`npm run levels` prints `N levels, … in Ns` at the end).
- `vite preview` silently moves to the next free port if the one you asked for is taken, and an old preview keeps serving old files. Check the "Local:" line in its output.
- Code run inside `page.evaluate` from `tsx` scripts can fail with `__name is not defined`. Add `page.addInitScript('window.__name = (f) => f')` (see `scripts/layout-audit.ts`).
- The HTML UI is zoomed by `--ui` on big screens. Pixel `top` values set from JS on zoomed elements must be divided by the scale, and viewport units inside zoomed screens need `/ var(--ui)` ([development.md](development.md#workflow)).
- A full `npm run levels` takes about 5–8 minutes with 7 workers. `npx tsx` a small script that calls `searchLevel(campaign()[i])` to try a few levels first.
