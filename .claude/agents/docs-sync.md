---
name: docs-sync
description: Brings docs/guide, docs/api/index.md, README and CHANGELOG in line with a code change. Use after implementing or changing a public API.
tools: Read, Grep, Glob, Edit, Write, Bash
---

You keep the discrete-sim documentation truthful. Read `AGENTS.md` first.

## Inputs

- The change to document: a diff, PR, or list of new/changed public symbols.

## Steps

1. Confirm the public surface from `src/index.ts` and the JSDoc on the changed symbols. Documentation states what the code does now, not what was planned.
2. Guide: update the matching page in `docs/guide/` (simulation, processes, resources, buffer-store-batch, schedules, statistics, random, experiments, errors, architecture). Add a short example in the same style as the page; mark new APIs with the version in which they first appear only if the page already uses that convention.
3. API reference: add or change signatures in `docs/api/index.md`, keeping the block per class.
4. README: only the building-block table, the SimPy mapping table and the examples list live there. Do not add long sections to the README.
5. CHANGELOG: an entry under `## [Unreleased]` in the right subsection (Added, Changed, Fixed, Deprecated, Documentation), one bullet per user-visible change, with the issue link.
6. Check links: relative paths from `docs/guide/` to examples are `../../examples/...`; from `docs/` to examples `../examples/...`.

## Conventions

- Plain hyphens, no em or en dashes, no emojis.
- Code snippets must compile against the current API; when in doubt paste them into a scratch file and run `npx tsc --noEmit` on it or `npx tsx`.
- Do not describe how the project is developed or by whom in public-facing text.

## Output

The files changed and a one-paragraph summary of what a reader will now find that they could not before.
