# Bank with Impatient Customers (Reneging)

Customers who wait too long leave. Modelling that needs a race between "a teller becomes free" and "my patience runs out", which is what `anyOf()` expresses.

## The pattern

```typescript
function* customer() {
  const request = tellers.request();
  const result = yield* anyOf([request, timeout(patience)]);

  if (result.winner === request) {
    // got a teller: serve and release
    yield* timeout(serviceTime);
    tellers.release();
  } else {
    // patience ran out; the request was removed from the queue automatically
    stats.increment('reneged');
  }
}
```

Points worth knowing:

- Branches that have not completed when the first one does are cancelled: the request leaves the teller queue, the timeout is unscheduled. The example prints the queue length at the end to show nothing is left behind.
- If several branches complete at the same instant, `result.completed` lists all of them. Resources they acquired belong to you, so release them.
- `timeout(n)` can be passed directly as a branch; so can `event.wait()`, `otherProcess.done()`, and Buffer or Store requests.
- `waitFor()` conditions cannot be combined, because they are polled. Use a `SimEvent` for that kind of signal.

## Running

```bash
npx tsx examples/bank-renege/index.ts
```

## Things to try

- Add a third teller and watch the reneging rate collapse.
- Replace the uniform patience with `rng.lognormal(...)` to get a few very patient customers.
- Use `Experiment` to sweep `TELLERS` over 1..4 with replications and pick the cheapest staffing that keeps reneging under 5%.

## Related

- `examples/bank-tellers`: same setting without reneging, with SLA tracking.
- `Process.done()`, `allOf()` for joining processes (see README "Process Composition").
