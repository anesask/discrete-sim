# Running Experiments

One run is one sample path. Replicate, sweep, and report intervals.

One run is one sample path. `Experiment` (v0.1.16+) replicates a model with derived seeds and sweeps parameters, and reports confidence intervals across runs.

```typescript
import {
  Experiment,
  Simulation,
  Resource,
  Random,
  Statistics,
  timeout,
} from 'discrete-sim';

interface Params {
  servers: number;
  duration: number;
}

// The model factory builds and runs one simulation and returns flat numeric metrics.
const experiment = new Experiment((p: Params, seed: number) => {
  const sim = new Simulation();
  const rng = new Random(seed);
  const stats = new Statistics(sim);
  stats.enableSampleTracking('wait');
  const servers = new Resource(sim, p.servers);
  // ... start arrival and service processes that record into stats ...
  sim.run(p.duration);
  return {
    meanWait: stats.getSampleMean('wait'),
    utilization: servers.utilization,
  };
});

// 30 independent replications of one scenario
const rep = experiment.replicate(
  { servers: 2, duration: 10_000 },
  { replications: 30, seed: 42 }
);
const ci = rep.confidenceInterval('meanWait'); // { mean, lower, upper, halfWidth, n, ... }
rep.summary(); // every metric: mean, stdDev, min, max, ci
rep.toCSV(); // one row per replication

// Full-factorial sweep with common random numbers
const sweep = experiment.sweep(
  { servers: [1, 2, 3], duration: [10_000] },
  {
    replications: 20,
    seed: 42,
    onProgress: (done, total) => console.log(`${done}/${total}`),
  }
);
console.table(sweep.compare('meanWait')); // mean and CI per scenario
sweep.best('meanWait'); // scenario with the lowest mean wait
```

Seeds for replication `i` are derived from the base seed with a hash, so the whole experiment is reproducible and adjacent replications are not correlated. Replication `i` gets the same seed in every scenario of a sweep, which makes scenario comparisons sharper.

See [`examples/experiment-mm1/`](../../examples/experiment-mm1/) for a complete run against queueing theory.
