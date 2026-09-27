# Migrating from SimPy

discrete-sim started from the same idea as Python's SimPy: processes are generator functions that yield the things they wait for. The overlap ends there. This library is TypeScript-first, runs in the browser, and adds building blocks the classic toolkit does not have: observable `State` (no polling), `Batch` collection, time-varying `Schedule`s, an `Experiment` runner with common random numbers, monitors with history, typed `yield*` helpers, independent random streams and confidence intervals in the statistics.

If you know SimPy, this table gets you productive quickly. If you do not, skip it; the [guide](index.md) does not assume it.

## Concept map

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

## What has no SimPy counterpart

- `State` with `waitUntil`, evaluated on change rather than polled.
- `Batch`: collect N items or wait at most `maxWait`, with back-pressure.
- `Schedule`: piecewise, optionally periodic parameters; `resource.setCapacity()` for shift patterns.
- `Experiment`: replications, parameter sweeps, per-run derived seeds, confidence intervals across runs.
- Monitors (`{ monitor: true }`) recording resource state over time; `holders` and `waiting` views.
- `sim.random.stream(name)` for independent streams; `sim.seed` to reproduce any run.
- `runAsync` / `runRealtime` for browser pages, with pause, resume and speed control.
- Typed `yield*` helpers (`acquire`, `takeItem`, `takeBatch`, `waitValue`, `join`) so results come back typed instead of through request fields.
