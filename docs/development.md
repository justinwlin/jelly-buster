# Development guide

## Setup

```bash
npm install
npx playwright install chromium   # only needed for e2e, screenshots and icons
npm run dev                        # http://localhost:5173 (binds 0.0.0.0)
```

On the Runpod pod, 5173 is often taken by another project. Pick a free exposed port instead:

```bash
npx vite --host 0.0.0.0 --port 3002
```

The public URL is then `https://$RUNPOD_POD_ID-3002.proxy.runpod.net`.

## Layout

| Path | What it is |
|---|---|
| `src/sim/engine.ts` | The rules. Deterministic and integer-only: the belt, firing, slots, ice, ropes, win and lose. |
| `src/sim/track.ts` | The belt as a list of stations around the picture, and line-of-sight. |
| `src/sim/bots.ts` | Headless players (`spam`, `random`, `greedy`, `human`, `smart`) used for tuning and level checks. |
| `src/sim/levels.ts` | Turns a picture into a level: cubes, then jellies dealt into columns, then mechanics. It also searches for a deal that passes the bot checks. |
| `src/sim/pictures/` | The picture packs: hand-drawn pixel art in palette letters. |
| `src/levels/campaign.json` | The built levels the game ships. Generated; don't edit it by hand. |
| `src/game/` | Browser side: layout, canvas rendering, audio and saves. |
| `src/main.ts` | The app: screens, input, game loop and test hooks (`window.__jb`). |
| `scripts/` | Level builder, sim report, e2e, screenshots, icons and art previews. |
| `tests/` | Vitest: rule tests, plus checks that every shipped level is valid and beatable. |

## Commands

| Command | What it does |
|---|---|
| `npm test` | Unit tests: rules, determinism, picture rules, and campaign.json validity. |
| `npm run build` | Type-checks everything (scripts too), then does the Vite + PWA build into `dist/`. |
| `npm run levels` | Rebuilds `src/levels/campaign.json` from the picture packs and checks every level with the bots. Takes a few minutes. Add `-- --only=critters` to preview one pack without writing the file. |
| `npm run sim -- 5` | Replays the shipped levels with every bot (5 seeds each) and prints win rates. |
| `npm run e2e -- http://localhost:3002/` | Browser checks on phone, small phone, landscape, tablet and desktop. Start a dev server first. |
| `npm run shots -- http://localhost:3002/` | Screenshots of the main screens into `e2e-out/`. |
| `npx tsx scripts/art-preview.ts critters` | Contact sheet of a picture pack, saved to `e2e-out/art-critters.png`. |
| `npx tsx scripts/montage.ts out.png 4 300 a.png b.png …` | Combines screenshots into one image for quick review. |
| `npm run icons` | Re-renders the app icons with the game's own jelly renderer (`scripts/icons.ts`). |

## Adding pictures

1. Draw the picture in a pack file under `src/sim/pictures/`. Use the palette letters from `src/sim/art.ts`, with `.` for empty cells.
2. Follow the rules in `tests/levels.test.ts`: 16–24 cells wide, at most 24 tall, at least 4 cubes of every color used, and 2–6 colors.
3. Preview it with `npx tsx scripts/art-preview.ts <pack>`.
4. Run `npm run levels` and commit the new `campaign.json`. Levels come out in pack order, and each pack runs from fewest colors to most.

To add a new pack, create the file and list it in `src/sim/pictures/index.ts`.

## How levels are made beatable

`npm run levels` does the work offline, so the game never ships an unchecked level.

1. **Picture to cubes.** Each letter becomes a cube color.
2. **Jellies.** Each color's cubes are split into jellies (multiples of 5). They're ordered by when their cubes get uncovered, peeling the picture from the outside in.
3. **Deal.** The jellies are dealt into 2–5 columns (it varies per level), then made harder:
   - a little scrambling;
   - *blockers*: jellies of an inner color, dealt early, so you have to park them while you dig;
   - ice;
   - links: groups of 2–3 neighbors that leave together;
   - hidden colors.
4. **Harden against spam** (from level 7). `harden()` keeps swapping jellies in the queue, one near the front and one anywhere. It keeps a swap when the `spam` bot (it hammers the queue fronts as fast as it can) does no better, *and* a careful player who only sends colors that are showing still wins every time. It stops once spam is at the level's target.
5. **Check.** The bots play the deal:
   - `need`: the fewest slots the lookahead bot needs to win.
   - `human`: wins out of 3 for a bot that reacts slower and sometimes picks a worse jelly.
   - `spam`: wins out of 8 for the queue-spamming bot.
6. **Accept or retry.** The builder tries, gentlest first: the base deal, then more and smaller jellies, then bigger jellies (they need more than one lap, so they come back to a slot more often). It ships the first deal that is both of these:
   - **Beatable with margin:** `need` ≤ 3 of 5 slots for the first 12 levels, ≤ 4 after that, and the human-like bot wins at least 2 of 3.
   - **Interesting:** spam wins no more often than the level's target. The target is 8/8 (no requirement) for the first 6 levels, then 6, 5, 4, and 3 in the encore (`spamCap` in `src/sim/levels.ts`).

   If no deal is interesting, it ships the beatable deal spam does worst on. It never ships one that fails the margin.

### What the simulation taught us

- **Lots of colors open within a lap or two.** A belt jelly fires from all four sides, and a 20×20 picture is only about 10 cubes deep. So difficulty comes from the deal, not from the picture alone.
- **Big flat two-color pictures are always easy.** Every jelly is useful almost all the time, so they work as breathers and early levels.
- **Inner details make a picture punishing.** Eyes, seeds, windows and other inner colors, split into small jellies and dealt early, punish careless taps. They fill slots while a careful player sends the jelly whose color is showing.
- **Crossed ropes deadlock.** If A is tied to a jelly below B's front and B to one below A's, nobody can win. The builder rejects any rope layout the queue can't untangle (`untangles()`).
- **Spamming only loses when jellies come back.** The spam bot's slots rarely got past 2 of 5, because most jellies found enough cubes in one lap and popped. What makes spamming fail is jellies that return: queue fronts whose colors aren't ready yet, jellies too big to finish in one lap, and enough jellies that 5 belt places plus 5 slots can't hold them all.
- **Small, open pictures stay easy.** Pictures with few jellies (around 11–13) and colors showing everywhere (Bee, Gem) can't be made spam-proof without bullying. They stay as breathers.
- **Ice can deadlock too.** Ice is capped at the number of jellies dealt ahead of it. Re-sending slot jellies also melts ice, so a frozen front with jellies in slots isn't treated as stuck.

`tests/levels.test.ts` re-checks the margin rules on every `npm test`, and spot-replays a few levels.

## Workflow

- Work on a `justin/<name>` branch. Run `npm test`, `npm run build`, and `npm run e2e` against a dev server, then look at `npm run shots` output.
- Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.
- When you change the rules or the generator in a way that changes levels, bump `GEN_VERSION` in `src/sim/levels.ts` and run `npm run levels`.

### Rules stay fixed

Difficulty only comes from the level: the picture, the queue order, jelly sizes, ice and links. A jelly always fires at every row and column it passes whose first cube is its color. An experiment that made jellies skip a firing position after each shot (a "reload") was removed, because it made jellies harder to predict.
