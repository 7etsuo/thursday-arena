# CLAUDE.md

**Read [`AGENTS.md`](AGENTS.md) first — it is the canonical handbook for this repo** (architecture,
hard rules, commands, invariants, how to verify a change, where the evidence lives). This file only
adds what is specific to Claude Code.

## The five things that bite hardest

1. **Never point a browser at `~/.config/google-chrome`.** `lib/cdp.js` refuses it. Playwright's
   `--use-mock-keychain` made Chrome wipe the user's cookies on 2026-09-19 — unrecoverable, and it
   logged them out of everything. Use the dedicated profile (`ARENA_PROFILE`).
2. **`npm test`, `npm run eval`, `tools/eval_matches.js`, `tools/merge_book.js`, and
   `npm run book:build` use local data.** `play:dry` reads the live account without sending an arena
   action; `rank` is live and read-only. Play and climb spend rating; MCP's `arena_act` can mutate.
3. **Never reintroduce heuristics** (archetypes, name lists, recipes, threat formulas). They were
   measured worse than the simulator and deleted. `lib/sim.js` is the decision model; its Season 3/4
   validation is narrower than the Season 1/2 corpus.
4. **Don't edit code while rated games are running.** Stop the loop, change, test, restart.
5. **Read §11 of AGENTS.md before changing a known limit** — its assumptions need evidence, and
   current Season 4 limits are described in `docs/SEASON4.md`.

## Working style the owner expects

- Answer the question asked. Don't start editing code off the back of a question.
- Measure, don't assert: `npm test`, then `npm run eval`, then compare `tools/eval_matches.js`
  with `tools/eval_matches.js --old` on the same seeds. `--old` selects the previous planning
  objective within the current code; it does not load an earlier code revision. The current mock
  keys its exogenous draws across policies. Report per-match score differences and uncertainty on
  every supported season before claiming a gain; see §8 of `AGENTS.md`.
- State what is proven versus inferred, and say plainly when something was not verified.
- Git history begins with the reviewed Season 4 import on 2026-09-23. Back up before large changes; a full pre-rewrite backup is at
  `../thursday-arena-pre-rewrite-20260919.tgz`.

## Quick orientation

```
observe ─► shop_model.normalize ─► target.build ─► planner.planStep ─► act ─► (repeat)
                                                 └► seatingActions ─► endShop
battle  ─► book.inferGhost ─► buffer for S3/S4
result  ─► exact public replay when available ─► book.record
```

`lib/planner.js` is the only module that decides anything; `driver/play_loop.js` only turns its
output into server actions safely. `test/mock_arena.js` runs the whole loop offline against the real
shop reducer, the real battle engine and recorded ghosts.

Detail, evidence and numbers: [`AGENTS.md`](AGENTS.md), [`docs/SEASON4.md`](docs/SEASON4.md), [`docs/SEASON3.md`](docs/SEASON3.md), [`docs/HISTORY.md`](docs/HISTORY.md),
[`docs/STRATEGY.md`](docs/STRATEGY.md), [`docs/ENGINE_BATTLE.md`](docs/ENGINE_BATTLE.md),
[`docs/ENGINE_SHOP.md`](docs/ENGINE_SHOP.md).
