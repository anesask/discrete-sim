# discrete-sim

[![npm version](https://img.shields.io/npm/v/discrete-sim.svg?style=flat-square)](https://www.npmjs.com/package/discrete-sim)
[![npm downloads](https://img.shields.io/npm/dm/discrete-sim.svg?style=flat-square)](https://www.npmjs.com/package/discrete-sim)
[![CI](https://github.com/anesask/discrete-sim/actions/workflows/ci.yml/badge.svg)](https://github.com/anesask/discrete-sim/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)

Discrete-event simulation for TypeScript and JavaScript, in the spirit of Python's SimPy. Describe processes as generator functions, share limited resources, collect statistics, and run experiments with reproducible seeds.

- **Zero dependencies**, ships CommonJS and ESM with types
- **Runs in Node and the browser**, with non-blocking and real-time drivers for UIs
- **Reproducible**: seeded random numbers, deterministic event order
- **Honest statistics**: confidence intervals, batch means, replications and parameter sweeps built in

New to discrete-event simulation? Start with the [Beginner's Guide](docs/guide/beginners-guide.md).

## Installation

```bash
npm install discrete-sim
```

Node 20 or newer.

## Quick Start

```typescript
import { Simulation, Resource, Statistics, timeout } from 'discrete-sim';

const sim = new Simulation({ randomSeed: 42 });
const rng = sim.random;
const stats = new Statistics(sim);
stats.enableSampleTracking('wait');

const teller = new Resource(sim, 1, { name: 'Teller' });

function* customer(id: number) {
  const arrived = sim.now;
  yield teller.request(); // wait for the teller
  stats.recordSample('wait', sim.now - arrived);
  yield* timeout(rng.exponential(4)); // service time
  teller.release();
}

function* arrivals() {
  for (let i = 0; i < 100; i++) {
    sim.process(() => customer(i));
    yield* timeout(rng.exponential(5)); // inter-arrival time
  }
}

sim.process(arrivals);
sim.run();

const ci = stats.getConfidenceInterval('wait');
console.log(
  `mean wait ${ci.mean.toFixed(2)} (95% CI +/- ${ci.halfWidth.toFixed(2)})`
);
console.log(
  `teller utilization ${(teller.stats.utilizationRate * 100).toFixed(0)}%`
);
```

## What is in the box

| Building block                  | What it does                                                                                                                                  | Guide                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `Simulation`                    | Virtual clock and event queue; `run()`, `runAsync()`, `runRealtime()`, tracing                                                                | [Simulation](docs/guide/simulation.md)                      |
| Processes, `timeout`, `waitFor` | Generator-based behaviour; `anyOf` / `allOf` races and joins, `process.done()`                                                                | [Processes](docs/guide/processes.md)                        |
| `Resource`                      | Limited capacity with FIFO / LIFO / priority queues, preemption, `setCapacity()`                                                              | [Resources](docs/guide/resources.md)                        |
| `Buffer`, `Store`, `Batch`      | Quantities, distinct items, and collect-then-release batches                                                                                  | [Buffer, Store and Batch](docs/guide/buffer-store-batch.md) |
| `Schedule`, `SimEvent`          | Time-varying parameters (shifts, rush hours) and signalling between processes                                                                 | [Schedules and Events](docs/guide/schedules.md)             |
| `Statistics`                    | Time-weighted averages, counters, percentiles, histograms, confidence intervals, batch means                                                  | [Statistics](docs/guide/statistics.md)                      |
| `Random`                        | Seeded generator with uniform, exponential, normal, lognormal, gamma, Erlang, Weibull, beta, Poisson, geometric, empirical and weighted draws | [Random Numbers](docs/guide/random.md)                      |
| `Experiment`                    | Replications and parameter sweeps with seeds derived per run and intervals across runs                                                        | [Experiments](docs/guide/experiments.md)                    |
| `ValidationError`               | Every input checked, every error says what to do instead                                                                                      | [Errors](docs/guide/errors.md)                              |

Full signatures: [API reference](docs/api/index.md). How it works and what it does not do: [Architecture and performance](docs/guide/architecture.md).

## Coming from SimPy

| SimPy                             | discrete-sim                                            | Notes                                            |
| --------------------------------- | ------------------------------------------------------- | ------------------------------------------------ |
| `Environment()`                   | `new Simulation()`                                      | `sim.now`, `sim.run(until)`                      |
| `env.process(gen())`              | `sim.process(gen)`                                      | Pass the generator function; returns a `Process` |
| `yield env.timeout(5)`            | `yield* timeout(5)`                                     | Note the `yield*`                                |
| `Resource(env, capacity)`         | `new Resource(sim, capacity)`                           | `yield res.request()` then `res.release()`       |
| `PriorityResource`                | `new Resource(sim, n, { queueDiscipline: 'priority' })` | `request(priority)`, lower = first               |
| `PreemptiveResource`              | `new Resource(sim, n, { preemptive: true })`            | Preempted process receives `PreemptionError`     |
| `Container`                       | `Buffer`                                                | `put(amount)` / `get(amount)`                    |
| `Store`, `FilterStore`            | `Store`                                                 | `get(filterFn)` for filtering                    |
| `Event`, `succeed()`              | `SimEvent`, `trigger(value)`                            | `wait()`, `reset()` for reuse                    |
| `yield proc`                      | `yield proc.done()`                                     | Result tells how the child ended                 |
| `yield req \| env.timeout(5)`     | `yield* anyOf([req, timeout(5)])`                       | Losing branches are cancelled                    |
| `yield a & b`                     | `yield* allOf([a, b])`                                  |                                                  |
| `RealtimeEnvironment`             | `sim.runRealtime({ factor })`                           | Pause, resume, change speed                      |
| `random` module                   | `Random`                                                | Seeded, more distributions                       |
| batching, schedules, replications | `Batch`, `Schedule`, `Experiment`                       | No SimPy equivalent                              |

Not available: `Interrupt` as a distinct event class (use `process.interrupt(error)`), `Condition` events with custom evaluators, `Process.target`.

## Examples

Each example is a runnable script; see [docs/examples.md](docs/examples.md) for what every one demonstrates.

```bash
npx tsx examples/mm1-queue/index.ts          # validated against queueing theory
npx tsx examples/experiment-mm1/index.ts     # replications, confidence intervals, server sweep
npx tsx examples/bank-renege/index.ts        # customers who give up: anyOf
npx tsx examples/bank-tellers/index.ts       # SLA tracking with a staffing schedule
npx tsx examples/hospital-er/index.ts        # priority queues, FIFO vs priority
npx tsx examples/batch-oven/index.ts         # batching with maxWait and back-pressure
npx tsx examples/fuel-station/index.ts       # Buffer
npx tsx examples/warehouse-store/index.ts    # Store with filters and priority puts
npx tsx examples/traffic-light/index.ts      # SimEvent coordination
```

## Documentation

- [Guide](docs/guide/index.md) and [API reference](docs/api/index.md) in this repository
- [Website](https://www.discrete-sim.dev)
- [CHANGELOG](CHANGELOG.md)

## Development

```bash
npm install
npm test              # functional suites
npm run test:perf     # timing suites (run locally, not in CI)
npm run lint
npm run typecheck
npm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues and feature requests: [GitHub Issues](https://github.com/anesask/discrete-sim/issues).

## Citation

```bibtex
@software{discrete-sim,
  title = {discrete-sim: A TypeScript Discrete-Event Simulation Library},
  author = {Anes Mulalic},
  year = {2026},
  url = {https://github.com/anesask/discrete-sim}
}
```

## License

MIT. Inspired by [SimPy](https://simpy.readthedocs.io/). Created and maintained by [Anes Mulalic](https://github.com/anesask).
