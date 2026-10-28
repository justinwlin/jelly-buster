# Plan: more crunch (locked slots, hard levels, bigger jellies, layered pictures)

> Historical plan: the layered-picture design below describes generator version 4. Version 5 uses two different pictures, with white cubes only where the hidden picture extends beyond the first. The second picture appears after the first is fully cleared. See [development.md](development.md) for the current rules.

Status: **implemented and verified.** The four mechanics are in the game, with campaign data rebuilt at `GEN_VERSION = 4`. Read [development.md](development.md) for the current builder and workflow.

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
  | Hard levels | 3, or 4 if only a gentler deal passes the bot checks |

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
  - usually 3 open slots instead of 4, with a four-slot fallback for fairness;
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

## Completion notes

- Locked slots, hard levels, larger jellies and layered pictures are implemented in the engine, builder, renderer and game screens.
- All 100 shipped levels were rebuilt with generator version 4. Every level has enough jelly hits for both picture layers, and the bot checks verify it can be won with the slots already open.
- Hard levels are marked in the grid and HUD, announced at the start, and pay double gold. All 19 hard levels now start with three or four open slots. Four use a gentler four-slot fallback because a tougher deal did not pass the bot checks.
- Unlocking a slot costs 50 gold, then 80 gold for the next; it lasts for the attempt. Continuing after running out of room uses a locked socket when available.
- Unit, browser and layout checks cover the new rules and screens. The optional bot improvement below is deferred because the builder's booster check already grants one unlock and verifies the result.

### Optional follow-up

Teach `useKit()` in `src/sim/bots.ts` to decide when to buy a slot during play, instead of granting one at the start of the boosted check. This would improve the realism of the bot model without changing game rules.

## Gotchas

- `pgrep -f`/`pkill -f` with a pattern that appears in your own command line matches your own shell. A wait loop like `until ! pgrep -f build-levels` never ends. Wait on the log file instead (`npm run levels` prints `N levels, … in Ns` at the end).
- `vite preview` silently moves to the next free port if the one you asked for is taken, and an old preview keeps serving old files. Check the "Local:" line in its output.
- Code run inside `page.evaluate` from `tsx` scripts can fail with `__name is not defined`. Add `page.addInitScript('window.__name = (f) => f')` (see `scripts/layout-audit.ts`).
- The HTML UI is zoomed by `--ui` on big screens. Pixel `top` values set from JS on zoomed elements must be divided by the scale, and viewport units inside zoomed screens need `/ var(--ui)` ([development.md](development.md#workflow)).
- A full `npm run levels` takes about 5–8 minutes with 7 workers. `npx tsx` a small script that calls `searchLevel(campaign()[i])` to try a few levels first.
