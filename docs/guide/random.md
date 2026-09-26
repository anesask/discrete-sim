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
