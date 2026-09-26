# Benchmarks

```bash
npm run bench            # table on stdout, results in benchmarks/latest.json
npm run bench -- --json  # JSON only
```

`run.ts` times seven workloads that cover the hot paths: event queue push and pop, plain scheduled events, an M/M/1 queue with wait statistics, many concurrent processes, a large priority queue, sample statistics with percentiles, and mixed random draws. Each workload runs once to warm up the JIT and once for the measurement.

`baseline.json` is the committed reference run (see the `meta` block for machine and Node version). `latest.json` is your last local run and is ignored by git.

## Comparing

Numbers depend on the machine, Node version and what else is running. Compare only runs from the same machine, and treat differences under about 15 percent as noise. To compare two versions of the library, run the suite on each and diff the `ms` fields:

```bash
git stash            # or check out the other version
npm run bench -- --json > /tmp/before.json
git stash pop
npm run bench -- --json > /tmp/after.json
```

These suites assert nothing and never run in CI on purpose: shared runners are too noisy for wall-clock thresholds. The functional guarantees (ordering, O(log n) queue behaviour) are covered by the unit tests instead.
