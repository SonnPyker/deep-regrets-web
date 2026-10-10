# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install            # esbuild (dev bundler) and ws (co-op server)
npm run build          # bundle src/ui/main.js -> dist/app.js (minified IIFE + sourcemap)
npm run watch          # same bundle, unminified, rebuilds on change
npm run serve          # static server on http://localhost:5173 (node serve.mjs <port> to change port)
npm run server         # co-op server on http://localhost:8787 (env: PORT, ALLOWED_ORIGINS, SUPABASE_*; see README)
npm run site           # static site into public/ for Vercel (needs DR_API_URL; the build bakes it in)
npm test               # run.mjs 30 && cards.mjs all 2 && game.mjs && survey.mjs && coop.mjs && saves.mjs
```

No linter or typechecker is configured.

There is no per-test filter. Narrow the run through script arguments:

- `node tests/cards.mjs fish 1` - per-Fish cast/reveal/catch tests. First arg is `all|fish|items|scen`, second is the seed count.
- `node tests/cards.mjs items 1` - Dinks, Supply, Reel, Biggest Regret tests.
- `node tests/run.mjs 6 stats` - N seeds x 1-5 players of random games, each replayed to check determinism. `stats` prints per-prompt counts.
- `node tests/smoke.mjs <seed> <players>` - one random game, prints the result.
- `node tests/game.mjs` - controller level: bot-only games, resume, mixed human/bot with undo, replay equality.
- `node tests/survey.mjs` - Ocean Survey (solo campaign): sheet rules, the kit a game starts with, three weeks in a row.
- `node tests/saves.mjs` - save slots: a resumed save ends like the live game, `Game.verify` keeps an in-progress game, `readSave` rejects bad files.
- `node tests/bench.mjs [games=300] [players=3] [mixed|allbot|allrandom]` - bot benchmark on seeded games, one JSON summary on stdout. Not part of `npm test`; the file header lists the options.

To debug one card, edit the targeted tests in `tests/cards.mjs` rather than the random runner.

## Architecture

Two layers with a one-way dependency: `src/engine` (rules, no DOM) is used by `src/ui` (screens). Nothing in the engine imports from the UI.

### The game is a replay

- `S` (engine/state.js) is plain JSON-serialisable game state. It is replaced in place by `setState`, so modules keep a stable binding. `RT` holds runtime-only data (current prompt, driver, log) and is never serialised.
- A game is a pure function of (setup options including seed, list of answers). `Game` (engine/game.js) records every answer in `Game.rec`. Undo, save and resume all work by re-running `Game.launch()` from scratch and fast-forwarding through the recorded answers. Save data in localStorage (`deepregrets.save.v1`) stores only the setup and the answers, never the state.

Save slots (`src/engine/saves.js` for the format and checks, `src/ui/saves.js` for the dialog) hold up to three games per mode in `deepregrets.saves.v1` (`solo` = the Ocean Survey campaign, `coop` = several seats on one device). A solo save also stores the Ocean Survey sheet, because the sheet changes between weeks. `Game.resume` continues a save. `Game.verify` replays an imported record in the background, with `_quiet` silencing the run, before anything is written, then restores the game in progress. `settled()` waits for that restored run to pause. Online co-op rooms do not use slots: the server owns them.

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

### Layout and responsive

- `css/style.css` holds the breakpoints. Desktop is `min-width: 1001px` with `min-height: 621px`: the window never scrolls, and regions scroll inside themselves. `max-width: 1000px` is the phone and tablet layout: one column, panels moved with `order`, and `display: contents` on `.col-main` and `.col-board`. `max-width: 520px` tightens text and cards. `pointer: coarse` gives touch targets a larger hit area.
- A prompt that needs a tap on the table sets `.layout.table-first` (`renderViews` in `src/ui/main.js`, from `viewNeeds`), which moves the table above the decision. A new panel needs an `order` in both the phone block and the `table-first` block.
- Modals: `.modal-back` is a grid, so its column must stay `minmax(0, 1fr)` and `.modal` keeps `min-width: 0`. Without these, the widest content (the 8-column results table) sets the column width and pushes the modal past a 375px screen. Wide tables scroll inside `.tblwrap`.
- Check a layout change in the browser at 375x812 and at 1280x800. `document.documentElement.scrollWidth` should equal the viewport width, so the page has no horizontal scroll. Use a second origin (`127.0.0.1` instead of `localhost`) when the saved game in the first one matters.
- To reach the results screen quickly, set every seat to Máy and run `DR.Game.speed = 0` in the console. A bot-only game then finishes in seconds.

### Test invariants

`check()` in `tests/harness.mjs` runs after prompts and fails with `INVARIANT:` when:

- a Fish appears more than once, or is not in the sea, a graveyard, a hand, a mount, or in flight (`RT.fly`, test-only);
- the tackle dice total is not 9/8/7 (non-solo);
- the Regret total is not 60 (solo) or 10 per player;
- state does not round-trip through JSON.

### Co-op server

- `server/` runs `src/engine` on Node. One room's game lives in memory at a time (serial queue in `rooms.mjs`). Rooms and answers persist in Supabase (`supabase/schema.sql`) when `SUPABASE_URL` is set, otherwise in memory (`store.mjs`).
- The stored answer record is the source of truth. Each client replays it in remote mode (`Game.attach` and `Game.remote` in `engine/game.js`, driven by `src/ui/online.js` and `src/ui/net.js`). The server checks each human answer against its seat and decides bot seats itself.
- `tests/coop.mjs` (part of `npm test`) runs an in-process server with two client processes (`tests/coop-client.mjs`).
- Deploy: `render.yaml` (server); `vercel.json` + `scripts/publish-site.mjs` (site, needs `DR_API_URL`).

## Gotchas

- `dist/app.js` is committed and `index.html` loads it, so rebuild after any `src/` change. Otherwise the page runs stale code. `css/` is served as-is, so CSS changes need no rebuild.
- `assets/` is gitignored because it is copyrighted artwork. The tests don't need it, but the game screens do.
- Game and UI text is Vietnamese. Code comments and identifiers are English.
- An `invalid answer` or `invalid multi answer` error means the driver sent an answer that doesn't match the prompt. Investigate the prompt's `opts`/`items`/`check`, not the driver.
