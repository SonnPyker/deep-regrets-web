# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install            # only esbuild is a dependency
npm run build          # bundle src/ui/main.js -> dist/app.js (minified IIFE + sourcemap)
npm run watch          # same bundle, unminified, rebuilds on change
npm run serve          # static server on http://localhost:5173 (node serve.mjs <port> to change port)
npm test               # run.mjs 30 && cards.mjs all 2 && game.mjs
```

No linter or typechecker is configured.

There is no per-test filter. Narrow the run through script arguments:

- `node tests/cards.mjs fish 1` - per-Fish cast/reveal/catch tests. First arg is `all|fish|items|scen`, second is the seed count.
- `node tests/cards.mjs items 1` - Dinks, Supply, Reel, Biggest Regret tests.
- `node tests/run.mjs 6 stats` - N seeds x 1-5 players of random games, each replayed to check determinism. `stats` prints per-prompt counts.
- `node tests/smoke.mjs <seed> <players>` - one random game, prints the result.
- `node tests/game.mjs` - controller level: bot-only games, resume, mixed human/bot with undo, replay equality.

To debug one card, edit the targeted tests in `tests/cards.mjs` rather than the random runner.

## Architecture

Two layers with a one-way dependency: `src/engine` (rules, no DOM) is used by `src/ui` (screens). Nothing in the engine imports from the UI.

### The game is a replay

- `S` (engine/state.js) is plain JSON-serialisable game state. It is replaced in place by `setState`, so modules keep a stable binding. `RT` holds runtime-only data (current prompt, driver, log) and is never serialised.
- A game is a pure function of (setup options including seed, list of answers). `Game` (engine/game.js) records every answer in `Game.rec`. Undo, save and resume all work by re-running `Game.launch()` from scratch and fast-forwarding through the recorded answers. Save data in localStorage (`deepregrets.save.v1`) stores only the setup and the answers, never the state.

Rules this imposes on engine code:

- All randomness goes through `rnd()` in engine/util.js (seeded `S.rng`). `Math.random` appears only in setup.js and game.js, to pick a seed when none is given.
- Bots (engine/bot.js) must never consume the RNG, or a recorded game stops replaying identically.
- Anything that affects the outcome must depend only on `S` and the answers. `RT.log` is rebuilt on every replay.

### Prompt protocol

Engine code is async and never talks to the UI. To ask a player, it calls `Ask.pick`, `Ask.multi`, `Ask.ok` or `Ask.yn` (engine/core.js). Each one sets `RT.prompt` and awaits `RT.driver.ask(prompt)`.

- A pick option with `dis: true` is shown disabled. A pick called with `auto: true` that has exactly one enabled option returns it without asking, so the driver never sees it.
- Three drivers exist: `Game` (replays a recorded answer, asks a bot, or waits for a human click), the random chooser in `tests/harness.mjs`, and replay.
- Each prompt has a `tag` such as `turn`, `declare`, `ack` or `yn`. The harness uses tags to decide when to run exact invariant checks. The UI uses them to decide when to show a confirmation.

### Turn structure

`Fl.main()` (engine/flow.js) runs the days. `S.ph` moves through `start -> refresh -> declare -> action` and then `day++`, until `S.dayLast` (6, or 5 in solo). The `short` option starts at day 2.

- `startPhase` is skipped on the first day. `declarePhase` is skipped on the first day and in solo; the first day and solo equip rods and reels instead.
- In the action phase, `Fl.turn(me)` offers each player's options. They come from free.js (free actions), fish.js (cast, reveal, pay, catch) and port.js (selling, shopping, mounting).
- Fish, dice and Regret cards are moved by the shared effect primitives in fx.js. Card abilities are built from those same primitives.

### Card data

- `D` (engine/data.js) holds card definitions keyed by id. An ability is a list of parts `{ d: description, f: async (c) => ... }`, where `c` is the effect context. Card texts are in Vietnamese.
- Id schemes:
  - Fish: `depth*100 + index`, with depth 1-3. The index is also the image filename.
  - Regret: `(value+1)*100 + k`, so `regretValue(id) = floor(id/100) - 1` (core.js).
  - Dinks, supplies, rods and reels: small integer indices into their own piles.
- `IMG` in data.js maps ids to `assets/...` paths.
- Solo mode removes fixed fish (`SOLO_REMOVED` in setup.js) and dinks flagged `nosolo`.

### Rules helpers

- `Rl` (core.js): Madness tiers from the number of Regret cards (`Rl.mad(p)`, fixed in solo), Fair/Foul modifiers, and scoring.
- `Dc` (core.js): dice faces, Fresh/Spent, and the tackle-dice bag (b=9, g=8, o=7). Non-solo games return spent tackle dice to the bag.

### UI

- `src/ui/main.js` is the only entry point. It wires `Game` to the screens and runs the render loop. `Game.on(schedule)` triggers a frame-throttled `renderGame()`.
- Components (board, portboard, players, decision, log, modals, menu) each export a `create*` factory and render from `S`, `RT` and `Game`.
- `fxdir.js` diffs state between renders to stage animations and sounds. It must only read `S` and `RT`.
- `store.js` holds UI-only state and preferences. Changing it cannot change a game's outcome.
- Icons: use `ic(key)` from `icons.js`. Two icon sets exist (`briny`, default; `emoji`).
- In the browser console, `window.DR` exposes `Game`, `S`, `UI` and `humans` for debugging.

### Test invariants

`check()` in `tests/harness.mjs` runs after prompts and fails with `INVARIANT:` when:

- a Fish appears more than once, or is not in the sea, a graveyard, a hand, a mount, or in flight (`RT.fly`, test-only);
- the tackle dice total is not 9/8/7 (non-solo);
- the Regret total is not 60 (solo) or 10 per player;
- state does not round-trip through JSON.

## Gotchas

- `dist/app.js` is committed and `index.html` loads it, so rebuild after any `src/` change. Otherwise the page runs stale code.
- `assets/` is gitignored because it is copyrighted artwork. The tests don't need it, but the game screens do.
- Game and UI text is Vietnamese. Code comments and identifiers are English.
- An `invalid answer` or `invalid multi answer` error means the driver sent an answer that doesn't match the prompt. Investigate the prompt's `opts`/`items`/`check`, not the driver.
