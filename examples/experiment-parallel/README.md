# Parallel Replications

The same replication study run serially and on a worker pool. Results are identical because both derive the same seed for replication `i`; only the wall-clock time differs.

## The pattern

Put the model in its own module with no side effects, then tell the experiment where it lives:

```typescript
// model.ts
export function model(params: Params, seed: number) { ...; return metrics; }

// study.ts
const experiment = new Experiment(model, {
  moduleUrl: new URL('./model.ts', import.meta.url),
  exportName: 'model',
});
const rep = await experiment.replicateParallel(params, { replications: 200, seed: 42 });
const sweep = await experiment.sweepParallel({ servers: [1, 2, 3] }, { replications: 50 });
```

Or load the module and get both serial and parallel runners at once:

```typescript
const experiment = await Experiment.fromModule<Params, Metrics>(
  new URL('./model.js', import.meta.url)
);
```

## Notes

- Workers import the module themselves, so it must not start a study at top level. Keep the study in a separate file, or guard it with `isMainThread` from `node:worker_threads`.
- Compiled JavaScript and `.mjs` modules load directly. A TypeScript model file is loaded through tsx's CommonJS hook when `tsx` is installed (as in this repository); otherwise point `moduleUrl` at the compiled output.
- `workers` defaults to the number of logical CPUs and never exceeds the number of replications. Simulations are GC-heavy, so on machines with hyper-threading the number of physical cores is often the better setting. Worker start-up costs a few hundred milliseconds (more for TypeScript models, which each worker compiles), so short studies do not benefit; long ones scale with cores.
- Each worker gets a 64 MB young generation by default (`resourceLimits`), which keeps GC pauses down for allocation-heavy models. Override `resourceLimits` to tune it.
- In a browser, module Web Workers are used; the model module must be reachable by URL.
- An error inside a worker rejects the promise with the replication index and the worker's stack trace.

## Running

```bash
npx tsx examples/experiment-parallel/index.ts
```
