# Jelly Buster

A puzzle game about sending jellies around a conveyor belt so they munch every cube of a pixel-art picture. It's a PWA: plays in the browser on phone and desktop, installs to the home screen, and works offline.

## How to play

- The picture sits in the middle with a belt looping around it. Tap a jelly at the front of a column to send it onto the belt. Levels deal the queue into 2 to 5 columns.
- As it rides around, it shoots the first cube in each row or column it passes, **if that cube is its color**. Each shot uses one of its hits (the number on it).
- A jelly that runs out of hits pops. One that gets back to the launcher with hits left waits in one of your **5 slots**, and you can send it again later.
- Once the queue is empty there's nothing left to decide: jellies with hits left keep going round, and waiting ones go back out on their own.
- **If a jelly comes back and every slot is full, you lose.** You can spend coins for one more slot and keep going.
- Up to 5 jellies can be on the belt at once (the `5/5` counter by the launcher).
- Clear every cube to finish the picture. Using fewer slots earns more stars.

## Mechanics as you go

| From level | Mechanic |
|---|---|
| 8 | **Ice**: the jelly is frozen until you've sent out the number of jellies shown on it. |
| 14 | **Links**: 2 or 3 linked jellies (side by side, or one behind the other) go out together once every one of them is free. |
| 18 | **Mystery**: the jelly's color stays hidden until it reaches the front. |
| 22 | **Long ropes**: a linked partner starts below the visible rows, so you dig down to free it. |

## Levels

The pictures are hand-drawn pixel art in themed packs:

| Pack | Pictures |
|---|---|
| Starter | 12 |
| Critters | 12 |
| Snacks | 12 |
| Adventure | 14 |

After those 50, an encore round replays every picture mirrored, with harder deals.

Every level is checked before it ships. `npm run levels` turns each picture into jellies, and bots play each candidate deal. A deal ships only if it passes all of these:

- It's winnable with spare slots: a lookahead bot needs at most 3 of 5 slots early on, and at most 4 later.
- A human-like bot (slower, sometimes picks wrong) wins at least 2 of 3 tries.
- It isn't beaten by random tapping more often than the level's target allows.

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
