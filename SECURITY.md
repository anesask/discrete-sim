# Security Policy

## Reporting a vulnerability

Please do not open a public issue for security problems. Use GitHub's private vulnerability reporting on this repository (Security tab, "Report a vulnerability"). You will get an acknowledgement within a few days and a fix or a decision within 30 days for confirmed issues. Credit is given in the release notes unless you prefer otherwise.

## Supported versions

The latest published minor release receives fixes. Older 0.x releases do not.

## What the library does and does not do

- **Zero runtime dependencies.** The published package contains only `dist/`, `README.md` and `LICENSE`; it is built and published from GitHub Actions with npm provenance attestations, so the tarball can be traced to the commit and workflow that produced it.
- **No I/O.** The library never touches the network, the file system, environment variables or process arguments. It runs the generator functions and callbacks you give it, on the data you give it. Model code is trusted code: do not run models from untrusted sources without the same care you would apply to any other JavaScript.
- **Random numbers are not cryptographic.** `Random` (xoshiro128\*\*) is designed for reproducible simulation, not for secrets, tokens or anything security-sensitive.
- **CSV export.** `Statistics.toCSV()`, `Monitor.toCSV()` and the Experiment exports quote fields that contain commas, quotes or newlines, and prefix fields that a spreadsheet would interpret as a formula. Treat any export you build from untrusted metric names with the usual care before opening it in a spreadsheet.
- **Real-time and async runners** use `setTimeout` only; nothing else is scheduled on the host.

## Development dependencies

Development-only dependencies (test runner, bundler, linters) are pinned by `package-lock.json`, installed with `npm ci` in CI, and are not part of the published package. Advisories against them are reviewed for whether the affected code path is exercised (for example a dev server that this project never starts) and upgraded when a fix exists.

## Repository protections

- `main` accepts pull requests only, with a required passing CI run; force pushes and deletions are blocked.
- Secret scanning with push protection, Dependabot vulnerability alerts and CodeQL analysis are enabled.
- Releases are created only by pushing a version tag; the workflow verifies that the tag matches `package.json` and runs the full test suite before publishing.
