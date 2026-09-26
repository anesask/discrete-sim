# Random Numbers

Seeded, reproducible randomness with the distributions a discrete-event model needs.

Reproducible randomness for validation and experimentation:

```typescript
const rng = new Random(12345);

const u = rng.uniform(0, 10); // Uniform [0, 10)
const e = rng.exponential(5); // Exponential, mean 5
const n = rng.normal(100, 15); // Normal, mean 100, sd 15
const i = rng.randint(1, 6); // Integer [1, 6]
const t = rng.triangular(5, 20, 10); // Triangular (min, max, mode)
const p = rng.poisson(3); // Poisson, mean 3
```

**All distributions (v0.1.14+):**

| Method                                | Typical use                                                 | Mean                         |
| ------------------------------------- | ----------------------------------------------------------- | ---------------------------- |
| `uniform(min, max)`                   | No information beyond a range                               | `(min + max) / 2`            |
| `exponential(mean)`                   | Inter-arrival times, memoryless service                     | `mean`                       |
| `normal(mean, sd)`                    | Symmetric noise, measurement error                          | `mean`                       |
| `lognormal(mu, sigma)`                | Right-skewed service or repair times                        | `exp(mu + sigma^2 / 2)`      |
| `gamma(shape, scale)`                 | Multi-phase service, flexible positive times                | `shape * scale`              |
| `erlang(k, mean)`                     | Sum of k exponential phases, less variable than exponential | `mean`                       |
| `weibull(shape, scale)`               | Time to failure, reliability                                | `scale * Gamma(1 + 1/shape)` |
| `beta(alpha, beta)`                   | Proportions, yields, PERT estimates in (0, 1)               | `alpha / (alpha + beta)`     |
| `triangular(min, max, mode)`          | Expert estimates: min, most likely, max                     | `(min + max + mode) / 3`     |
| `poisson(lambda)`                     | Count of events in an interval                              | `lambda`                     |
| `bernoulli(p)`                        | Yes/no branching (returns boolean)                          | `p`                          |
| `geometric(p)`                        | Trials until first success, retry counts                    | `1 / p`                      |
| `randint(min, max)`                   | Uniform integers, inclusive                                 |                              |
| `choice(items)`                       | Uniform pick from an array                                  |                              |
| `weightedChoice(items, weights)`      | Categorical mix (customer types, routing)                   |                              |
| `discrete([{ value, weight }])`       | Same as weightedChoice, one list                            |                              |
| `empirical(samples, { interpolate })` | Draw from observed data                                     | sample mean                  |

```typescript
// Parameterise a log-normal from the numbers you actually have
const { mu, sigma } = Random.lognormalParams(12, 4); // mean 12, sd 4
const repairTime = rng.lognormal(mu, sigma);

// Customer mix
const type = rng.discrete([
  { value: 'regular', weight: 0.6 },
  { value: 'express', weight: 0.3 },
  { value: 'vip', weight: 0.1 },
]);

// Fit to data you collected on the floor
const serviceTime = rng.empirical(observedTimes, { interpolate: true });
```

## The generator

The core is xoshiro128** seeded through splitmix32: period 2^128 - 1, 32-bit output, fast in JavaScript. Seeds are integers in [0, 2^32 - 1]. `rng.getSeed()` returns the seed the generator was created or last reseeded with; `getState()` / `setState()` save and restore a generator mid-run.

## Streams

Use one stream per source of randomness. Then changing the service-time model does not shift the numbers the arrival process sees, and two scenarios that share a seed see the same arrivals (common random numbers), which makes their difference easier to detect.

```typescript
const sim = new Simulation({ randomSeed: 42 });
const arrivals = sim.random.stream('arrivals');
const service = sim.random.stream('service');
const routing = sim.random.stream('routing');

// Same seed + same name = same stream, whatever else was drawn in between
new Random(42).stream('arrivals').uniform(0, 1) === arrivals.uniform(0, 1); // for fresh streams
```

`rng.spawn()` derives a child generator from the parent's current output instead of a name; deterministic, but dependent on how much the parent has been used.

## sim.random and sim.seed

`new Simulation({ randomSeed })` seeds `sim.random`. Without a seed a random one is chosen; print `sim.seed` with your results so the run can be reproduced with `new Simulation({ randomSeed: seed })`. `sim.reset()` reseeds the generator, so a reset run replays the same sequence.
