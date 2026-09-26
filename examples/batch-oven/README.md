# Batch Oven

Parts arrive one by one; an oven cures them in loads of up to ten. Modelling "collect, then process together" with a `Store` needs a counting process and a timer; `Batch` does it in two calls.

## The pattern

```typescript
const oven = new Batch<Part>(sim, 10, { maxWait: 15 });

function* producer() {
  yield oven.put(part);        // resumes when the part is accepted
}

function* baker() {
  while (true) {
    const load = oven.take();
    yield load;                // resumes when a load is ready
    load.items;                // the parts
    load.isPartial;            // true when maxWait released it early
    yield* timeout(30);
  }
}
```

- A load is released when it reaches `batchSize`, or `maxWait` after its first part arrived (whichever is first).
- While a released load has not been taken yet, `put()` blocks. That back-pressure is what makes the arrival queue visible in the statistics. Pass `unbounded: true` to accumulate without limit instead.
- `oven.stats` reports loads formed, partial loads, average load size, average wait for a load to form, back-pressure wait and taker wait.
- Both requests work inside `anyOf` and are cleaned up when the process is interrupted.

## Running

```bash
npx tsx examples/batch-oven/index.ts
```

## Things to try

- Lower `MAX_WAIT_MIN` to 5 and watch the average load size drop and cycle time improve.
- Add a second `baker` process: two ovens sharing one load queue.
- Sweep `LOAD_SIZE` with `Experiment` and plot cycle time p95 against oven utilisation.
