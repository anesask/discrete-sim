# Agents

Reusable agent definitions for recurring work in this repository. Claude Code loads every `*.md` file in this folder as a subagent; other tools can read them as task briefs. Each file has YAML frontmatter (`name`, `description`, `tools`) and a body that states inputs, outputs, conventions and how to verify the result.

| Agent | Use it when | Produces |
|---|---|---|
| `test-writer` | A class or feature needs vitest coverage, or a bug needs a reproducing test | Test file(s) under `tests/unit/`, passing |
| `example-author` | A user-visible feature deserves a runnable example | `examples/<name>/index.ts` + `README.md`, listed in `docs/examples.md` |
| `docs-sync` | Code changed and the guide, API reference or CHANGELOG lag behind | Updated `docs/guide/*.md`, `docs/api/index.md`, `CHANGELOG.md` |
| `release-checker` | You are about to cut a release | Gate results, version and CHANGELOG consistency, draft release notes |
| `sim-reviewer` | A PR touches `src/core` or `src/resources` | Review of DES semantics: determinism, cancellation, reentrancy, statistics |

## Conventions every agent follows

- Read `AGENTS.md` first; it is the source of truth for commands, layout and rules.
- Verify with the real gate (`npm run lint`, `typecheck`, `format:check`, `test`, `build`) and report the actual output.
- No emojis, no em or en dashes, no attribution footers.
- Changes go under `## [Unreleased]` in `CHANGELOG.md`; never bump the version.

## Adding an agent

Copy an existing file, keep the frontmatter keys, write the body as: purpose, inputs, steps, conventions, verification. Keep it under a page. Add a row to the table above.
