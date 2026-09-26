# Replicated M/M/c Experiment

One simulation run is a single sample path. Two runs with different seeds give two different answers, and neither is "the" answer. This example uses the `Experiment` runner to turn runs into evidence.

## What it shows

1. **Replications.** An M/M/1 queue (utilisation 0.7, 5000 customers) is run 30 times with different seeds. The mean wait across replications gets a 95% confidence interval, printed next to the theoretical value `rho / (mu - lambda) = 2.333`.
2. **Parameter sweep.** The number of servers is swept over 1, 2 and 3 at a fixed total arrival rate. Each scenario is replicated 20 times with the same seeds (common random numbers), so the comparison is not muddied by luck.

## Running

```bash
npx tsx examples/experiment-mm1/index.ts
```

## Key code

```typescript
const experiment = new Experiment((params, seed) => {
  const sim = new Simulation();
  const rng = new Random(seed);
  // ... build the model ...
  sim.run();
  return { meanWait, p95Wait, utilization };   // any flat numeric record
});

// Replications with a confidence interval
const rep = experiment.replicate(params, { replications: 30, seed: 2026 });
const ci = rep.confidenceInterval('meanWait');

// Full-factorial sweep and comparison
const sweep = experiment.sweep({ servers: [1, 2, 3], arrivalRate: [1.8], ... }, { replications: 20 });
console.table(sweep.compare('meanWait'));
sweep.best('meanWait');   // scenario with the lowest mean
sweep.toCSV();            // one row per scenario and replication
```

## Things to notice

- The model factory creates its own `Simulation`, `Random` and `Statistics`. That is what makes replications independent.
- Seeds are derived from the base seed with a hash, not by adding 1, because adjacent seeds fed to a linear congruential generator produce correlated streams.
- Replication `i` gets the same seed in every scenario of the sweep. With common random numbers the difference between scenarios is mostly the scenario, not the dice.
- The interval across replications is valid without batch means, because replications are independent by construction. Within a single run, consecutive waits are correlated; see `Statistics.getBatchMeansCI` for that case.

## Experiment ideas

- Increase `customers` and watch the interval shrink roughly with the square root of the run length.
- Add a warm-up period (`stats.setWarmupPeriod`) and see how the bias in short runs disappears.
- Sweep `arrivalRate` as well as `servers` to map the staffing frontier.
