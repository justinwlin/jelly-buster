# Jelly Buster

**▶ Play it: https://justinwlin.github.io/jelly-buster/**

A puzzle game about sending jellies around a conveyor belt so they munch every cube of a pixel-art picture. It's a PWA: plays in the browser on phone and desktop, installs to the home screen, and works offline.

## How to play

- The picture sits in the middle with a belt looping around it. Tap a jelly at the front of a column to send it onto the belt. Levels deal the queue into 2 to 5 columns.
- As it rides around, it shoots the first cube in each row or column it passes, **if that cube is its color**. Each shot uses one of its hits (the number on it).
- A jelly that runs out of hits spins away. One that gets back to the launcher with hits left waits in an open slot, and you can send it again later. There are five sockets; later levels start with some locked.
- Waiting jellies hop toward the left whenever a slot opens up, so they stay together at the start of the tray.
- Once the queue is empty there's nothing left to decide: jellies with hits left keep going round, and waiting ones go back out on their own.
- **If a jelly comes back and every slot is full, you lose.** You can spend coins for one more slot and keep going.
- Up to 5 jellies can be on the belt at once (the `5/5` counter by the launcher).
- Clear every cube to finish the picture. Using fewer slots earns more stars.
- On a phone, turn Haptics on in settings for tap feedback. Android uses vibration patterns; iPhone gives a tick when you tap the board.
- Choose Classic or Junimo from **Looks** on the title or pause screen. Your choice is saved and applies to every jelly color.

## Mechanics as you go

| From level | Mechanic |
|---|---|
| 7 | **Locked slots**: tap a padlocked socket to open it for this attempt. The first costs 50 gold; each later unlock costs 30 more. |
| 8 | **Ice**: the jelly is frozen until you've sent out the number of jellies shown on it. |
| 10, then every fifth | **Hard level**: fewer open slots and a tougher deal, with double gold for a win. |
| 14 | **Links**: 2 or 3 linked jellies (side by side, or one behind the other) go out together once every one of them is free. |
| 16 | **Surprise pictures**: clear the first picture to reveal a different one. White cubes cover only the hidden picture's extra outline. |
| 18 | **Mystery**: the jelly's color stays hidden until it reaches the front. |
| 22 | **Long ropes**: a linked partner starts below the visible rows, so you dig down to free it. |

## Boosters and lives

From level 4 there's a booster bar under the queue. You get one of each for free, and after that they cost gold. The shop only sells a booster when you can use it right then, so a bought booster is never wasted.

| Booster | Price | What it does |
|---|---|---|
| **Propeller** | 120 | A slot jelly or a queue front flies up over the middle of the picture and fires at every cube of its color, even buried ones, until it's done. One at a time. |
| **Crane** | 100 | Opens the whole queue in a scroll view. Pick any jelly, even a frozen, tied or buried one, and it's dropped on the belt. Its ice cracks and its rope is cut. Needs room on the belt. |
| **Merge** | 60 | Waiting jellies of the same color squish into one, freeing their slots. |

The belt stops while you pick a target.

**Lives.** You have 3. Losing a level costs one, and so does quitting a level you've started. Lives come back one every 10 minutes. With none left you can wait, or buy one for 150 gold. Continuing after running out of slots keeps your life and opens a locked socket when one is available. The first three levels are free.

## Levels

The pictures are hand-drawn pixel art in themed packs:

| Pack | Pictures |
|---|---|
| Starter | 12 |
| Critters | 12 |
| Snacks | 12 |
| Adventure | 14 |

After those 50, an encore round replays every picture mirrored, with harder deals. Nine more remix chapters bring the campaign to **1,000 levels**. Remixes flip pictures, sometimes reverse queue columns, and shift their colors. They reuse the hand-drawn art, and every new deal is checked by the bots before it ships. The level picker shows one 100-level chapter at a time.

Every level is checked before it ships. `npm run levels` turns each picture into jellies, and bots play each candidate deal. A deal ships only if it passes all of these:

- It's winnable with the slots already open: a lookahead bot never needs to buy an unlock.
- A human-like bot (slower, sometimes picks wrong) wins at least 2 of 3 tries. From level 21 the deals are tougher: the bot without boosters has to win at least once, and with one of each booster it has to win every time.
- The builder prefers deals where blind queue spamming does not win reliably. If no such deal passes the fairness checks, it ships the beatable deal instead.

See [docs/development.md](docs/development.md) for how it works.

## Development

```bash
npm install
npm run dev        # Vite dev server on 0.0.0.0:5173
npm test           # rules, determinism, and every shipped level's checks
npm run levels     # rebuild src/levels/campaign.json from the pictures
npm run sim -- 5   # replay every level with every bot
npm run e2e        # browser checks on 5 screen sizes (needs a dev server)
npm run build      # type-check and build into dist/
```

Pushing to `main` deploys to GitHub Pages.
