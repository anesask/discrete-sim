# Working in this repository

Instructions for coding agents (Claude Code, Codex, Cursor and similar) and a useful summary for humans. Claude Code reads this file through `CLAUDE.md`; other tools read `AGENTS.md` directly.

## What this is

`discrete-sim` is a zero-dependency TypeScript discrete-event simulation library in the spirit of SimPy. Processes are generator functions; the `Simulation` owns a virtual clock and a binary-heap event queue; resources (`Resource`, `Buffer`, `Store`, `Batch`), `SimEvent`, `Schedule`, `Statistics`, `Random` and `Experiment` sit on top. Published to npm as `discrete-sim`; docs live in `docs/` and at https://www.discrete-sim.dev.

## Commands

```bash
npm install
npm test               # functional suites (vitest); must pass before any PR
npm run test:perf      # wall-clock timing suites; run locally, never in CI
npm run lint           # eslint over src/ and tests/ (flat config, type-aware)
npm run typecheck      # tsc --noEmit
npm run format         # prettier --write src/ tests/
npm run format:check
npm run build          # tsup -> dist/ (cjs, esm, d.ts)
npx tsx examples/<name>/index.ts
```

Node 20 or newer. Windows works; the repo forces LF line endings through `.gitattributes`.

## Layout

```
src/
  core/        Simulation, EventQueue, Process (+ timeout, waitFor, anyOf, allOf), SimEvent, Schedule
  resources/   Resource, Buffer, Store, Batch
  statistics/  Statistics, distributions (Student t, incomplete beta)
  random/      Random
  experiment/  Experiment, ReplicationResult, SweepResult, deriveSeed
  types/       queue-discipline (shared insertion helper)
  utils/       validation (ValidationError and validators)
  index.ts     the only public entry point; every public type is exported here
tests/
  unit/ integration/ validation/   run by npm test
  performance/ benchmarks/         run by npm run test:perf only
examples/<name>/index.ts + README.md
docs/guide/ docs/api/ docs/examples.md   user documentation (docs/internal is local and ignored)
```

## Rules that matter

1. **Determinism.** Everything runs inside the simulation clock. Never introduce Promises, timers or `Math.random()` into `src/` scheduling paths. `Random` is the only source of randomness and must stay seedable. Events with equal time and priority run in insertion order.
2. **Validation.** Every public method validates its inputs and throws `ValidationError` with the pattern "what is wrong (got X). what to do instead". Add a validation test for every new check.
3. **No emojis or non-ASCII in source, tests, examples or docs.** Plain hyphens, not em or en dashes.
4. **JSDoc on every public API** with `@param`, `@returns`, `@throws`, `@example`.
5. **Yieldables.** Anything a process can `yield` is a request object created by a method (`resource.request()`, `store.get()`, `event.wait()`, `process.done()`). Helpers that must be used with `yield*` are generators (`timeout`, `waitFor`, `anyOf`, `allOf`). New yieldables must be added to `ProcessGenerator`, `Waitable`, `isWaitable`, `awaitOne` and `undoLateCompletion` in `src/core/Process.ts`, and to `validateYieldedValue` in `src/utils/validation.ts`.
6. **Cancellation.** Every wait must be cancellable (queued request removed by callback identity) so that `interrupt()` and `anyOf` leave no leaks. Follow `_cancelAcquire` / `_cancelPut` / `_cancelGet` in the resources.
7. **Reentrancy.** Grants that happen while another generator is running are scheduled with `simulation.schedule(0, ...)`, never called synchronously.
8. **Tests are the spec.** Reproduce a bug in a test before fixing it. Assert on simulation time and order, not wall-clock time. Anything that measures elapsed real time belongs in `tests/performance/`.

## Workflow for a change

1. Branch from `main` (`main` is protected: PR only, CI must pass).
2. Implement in `src/`, export from `src/index.ts`, add tests, update `docs/guide/*.md` and `docs/api/index.md`, add or extend an example if the feature is user-visible.
3. Record the change under `## [Unreleased]` in `CHANGELOG.md` (Added / Changed / Fixed / Deprecated / Documentation). Do not bump the version; releases are separate PRs.
4. Run the gate before pushing, and make failures fatal (`set -o pipefail` if you pipe output):
   `npm run lint && npm run typecheck && npm run format:check && npm test && npm run build` and run every `examples/*/index.ts`.
5. Open a PR with the template. Squash merge. CI-only PRs carry the `no-bump` label.

## Releasing

A release is its own PR: `npm version patch|minor --no-git-tag-version`, rename `## [Unreleased]` to `## [x.y.z] - YYYY-MM-DD`, merge, then push an annotated tag `vX.Y.Z` with message `Release vX.Y.Z: <title>`. The tag push runs `.github/workflows/release.yml`, which publishes to npm and creates the GitHub release from the CHANGELOG section. Release only when asked or when a milestone bundle is complete.

## Commit and PR text

Plain, factual, no attribution footers or co-author trailers, no emojis. Reference issues with `Closes #N` in the PR body.

## Agents

Reusable agent definitions for recurring tasks live in `.claude/agents/`; see its README for when to use each one.
