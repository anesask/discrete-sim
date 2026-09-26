# discrete-sim Guide

Long-form documentation for the library. The [README](../../README.md) has the install and quick start; these pages explain each building block with examples.

## Start here

- [Beginner's Guide](beginners-guide.md): what discrete-event simulation is, your first model, common mistakes
- [Simulation Engine](simulation.md): the clock, scheduling, non-blocking and real-time runs, tracing
- [Processes](processes.md): generator functions, `timeout`, `waitFor`, joining and racing with `done()`, `anyOf`, `allOf`

## Modelling the system

- [Resources](resources.md): capacity, queue disciplines, preemption, `setCapacity()`
- [Buffer, Store and Batch](buffer-store-batch.md): quantities, distinct items, batching with back-pressure
- [Schedules and Events](schedules.md): time-varying parameters, shift patterns, signalling between processes

## Measuring and deciding

- [Statistics](statistics.md): averages, percentiles, histograms, confidence intervals, batch means
- [Random Numbers](random.md): seeded generator and every distribution
- [Running Experiments](experiments.md): replications, parameter sweeps, common random numbers

## Reference

- [API Reference](../api/index.md)
- [Examples](../examples.md)
- [Errors and Validation](errors.md)
- [Architecture, Performance and Design](architecture.md)
- [CHANGELOG](../../CHANGELOG.md)
