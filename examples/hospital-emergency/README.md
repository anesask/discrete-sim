# Emergency Department with Preemption

An emergency department where a critical patient does not just skip the queue: they take a bed away from a lower-priority patient who is already being treated. Shows a **preemptive** `Resource` and how the interrupted process recovers.

## What it shows

- `new Resource(sim, beds, { preemptive: true })`. Preemptive resources use a priority queue by default.
- Three triage levels: critical `request(0)`, urgent `request(5)`, standard `request(10)`.
- When a critical patient arrives and every bed holds a lower-priority patient, the lowest-priority treatment is interrupted. That process receives a `PreemptionError` at its `yield`, goes back to the waiting room, and requests a bed again.
- Preemption counts, completions after preemption, abandonments and per-triage-level waits in the report.

## The pattern

```typescript
function* patient(severity: Severity, priority: number) {
  let wasPreempted = false;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      yield beds.request(priority);
      yield* timeout(treatmentTime());     // may be interrupted here
      beds.release();
      stats.increment(`${severity}-completed`);
      return;
    } catch (err) {
      if (!(err instanceof PreemptionError)) throw err;
      wasPreempted = true;                 // bed was taken by a critical patient
      stats.increment(`${severity}-preempted`);
      yield* timeout(0.01);                // back to the waiting room, then retry
    }
  }
  stats.increment(`${severity}-abandoned`);
}
```

The preempted process does not call `release()`: the resource already reassigned the bed to the higher-priority request. In this example treatment restarts from scratch on retry; resuming with the remaining time is a one-line change.

## Running

```bash
npx tsx examples/hospital-emergency/index.ts
```

## Things to try

- Set `preemptive: false` and watch critical waits grow while preemptions drop to zero.
- Track remaining treatment time and resume instead of restarting; compare total treatment time.
- Replicate with `Experiment` to put a confidence interval on the critical-patient wait.

## Related

- `examples/hospital-er`: the same setting without preemption, comparing FIFO and priority queues.
