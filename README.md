# discrete-sim

[![npm version](https://badge.fury.io/js/discrete-sim.svg)](https://www.npmjs.com/package/discrete-sim)
[![npm downloads](https://img.shields.io/npm/dm/discrete-sim.svg)](https://www.npmjs.com/package/discrete-sim)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A modern TypeScript discrete-event simulation library inspired by Python's SimPy.
Build and analyze complex systems with intuitive, generator-based process modeling.

## Features

- **Process-Based Modeling**: Use generator functions to describe processes naturally
- **Resource Management**: Built-in support for shared resources with FIFO queuing
- **Comprehensive Statistics**: Time-weighted averages, counters, and timeseries tracking
- **Reproducible Results**: Seedable random number generator for consistent experiments
- **TypeScript Native**: Full type safety and excellent IDE support
- **Zero Dependencies**: Lightweight and fast

## Installation

```bash
npm install discrete-sim
```

## Quick Start

```typescript
import { Simulation, Resource, timeout } from 'discrete-sim';

// Define a simple customer process
function* customer(id: number, server: Resource) {
  console.log(`Customer ${id} arrives at ${sim.now}`);

  // Request the server
  yield server.request();
  console.log(`Customer ${id} starts service at ${sim.now}`);

  // Service time
  yield* timeout(5);

  // Release the server
  server.release();
  console.log(`Customer ${id} leaves at ${sim.now}`);
}

// Create simulation
const sim = new Simulation();
const server = new Resource(sim, 1, { name: 'Server' });

// Start 3 customer processes
for (let i = 0; i < 3; i++) {
  sim.process(() => customer(i, server));
}

// Run simulation
sim.run();
```

## Core Concepts

### Simulation Time

The simulation maintains a virtual clock that advances from event to event (not real-time).

```typescript
const sim = new Simulation();
console.log(sim.now); // 0

sim.schedule(10, () => console.log(`Time: ${sim.now}`));
sim.run(); // Outputs: "Time: 10"
```

**Event Cancellation:**

You can cancel scheduled events before they execute:

```typescript
const eventId = sim.schedule(100, () => console.log('This will be cancelled'));
sim.cancel(eventId);  // Returns true if cancelled, false if not found

// Useful for timeout patterns
const timeoutId = sim.schedule(30, () => console.log('Timeout!'));
// ... do some work ...
sim.cancel(timeoutId);  // Cancel if work completes early
```

### Processes

Processes are described using generator functions. Use `yield` to wait for events.

```typescript
function* myProcess() {
  yield* timeout(5);           // Wait 5 time units
  yield resource.request();    // Wait for resource
  yield* timeout(10);          // Use resource for 10 units
  resource.release();          // Release resource
}

// Create and start a process
sim.process(myProcess);

// Or keep a reference for later control
const proc = sim.process(myProcess);
proc.interrupt();  // Can interrupt if needed
```

### Resources

Resources represent shared, limited-capacity entities (servers, machines, staff).

```typescript
const server = new Resource(sim, capacity: 2, { name: 'Server' });

function* worker() {
  yield server.request();  // Acquire resource
  yield* timeout(10);      // Do work
  server.release();        // Release resource
}
```

Resources automatically track:
- Utilization rate
- Average wait time
- Average queue length

### Statistics

Collect and analyze simulation data with comprehensive metrics:

```typescript
const stats = new Statistics(sim);

// Time-weighted averages
stats.recordValue('temperature', 25.5);

// Counters
stats.increment('customers-served');

// Advanced statistics (v0.1.2+)
stats.enableSampleTracking('wait-time');
stats.recordSample('wait-time', 5.2);
stats.recordSample('wait-time', 3.1);

// Get statistics
const avgTemp = stats.getAverage('temperature');
const count = stats.getCount('customers-served');

// Percentiles for SLA tracking
const p50 = stats.getPercentile('wait-time', 50);  // Median
const p95 = stats.getPercentile('wait-time', 95);
const p99 = stats.getPercentile('wait-time', 99);

// Variance and standard deviation
const variance = stats.getVariance('wait-time');
const stdDev = stats.getStdDev('wait-time');

// Histograms
const histogram = stats.getHistogram('wait-time', 10);
```

### Random Number Generation

Reproducible randomness for validation and experimentation:

```typescript
const rng = new Random(seed: 12345);

const u = rng.uniform(0, 10);          // Uniform [0, 10)
const e = rng.exponential(mean: 5);    // Exponential (lambda=1/5)
const n = rng.normal(mean: 100, stdDev: 15);  // Normal
const i = rng.randint(1, 6);           // Integer [1, 6]
```

### Error Handling & Validation

The library provides comprehensive input validation with helpful error messages to catch common mistakes early:

```typescript
import { ValidationError } from 'discrete-sim';

// Example: Negative capacity
try {
  const resource = new Resource(sim, -1);
} catch (error) {
  console.error(error.message);
  // "capacity must be at least 1 (got -1). Resource must have at least 1 unit of capacity"
}

// Example: Invalid timeout
try {
  yield* timeout(-5);
} catch (error) {
  console.error(error.message);
  // "delay must be non-negative (got -5). Use timeout(0) for immediate continuation..."
}

// Example: Releasing unrequested resource
try {
  resource.release();
} catch (error) {
  console.error(error.message);
  // "Cannot release resource 'Server': no units currently in use. Did you forget to request it first?"
}
```

**ValidationError** includes context information for debugging:

```typescript
try {
  sim.schedule(-10, () => {});
} catch (error) {
  if (error instanceof ValidationError) {
    console.log(error.context); // { delay: -10 }
  }
}
```

**Common Validations:**
- Delays must be non-negative and finite (no NaN/Infinity)
- Resource capacity must be a positive integer
- Cannot release resources that aren't in use
- Process state transitions must be valid (can't start a running process)
- Generator functions must yield proper types (Timeout, ResourceRequest, Condition)

## Examples

### M/M/1 Queue (Validation)

Classic single-server queue with theoretical validation. Demonstrates exponential distributions and statistics collection.

```bash
npx tsx examples/mm1-queue/index.ts
```

**Key Features:**
- Validates simulation against queuing theory
- Shows 99%+ accuracy for queue metrics
- Demonstrates reproducible results with seeded RNG

[Full documentation](examples/mm1-queue/README.md)

### Warehouse Simulation

Multi-stage process with multiple resource types (docks, forklifts, inspectors).

```bash
npx tsx examples/warehouse/index.ts
```

**Key Features:**
- Multiple resource types with different capacities
- Bottleneck identification and analysis
- Multi-stage workflow modeling

[Full documentation](examples/warehouse/README.md)

### Restaurant Simulation

Customer service with variable group sizes and satisfaction metrics.

```bash
npx tsx examples/restaurant/index.ts
```

**Key Features:**
- Variable-size customer groups (1-6 people)
- Service phases (order, eat, pay)
- Customer satisfaction assessment

[Full documentation](examples/restaurant/README.md)

### Bank Tellers

SLA tracking and staffing optimization with different transaction types.

```bash
npx tsx examples/bank-tellers/index.ts
```

**Key Features:**
- Service Level Agreement (SLA) tracking
- Quick vs. complex transaction differentiation
- Automated staffing recommendations

[Full documentation](examples/bank-tellers/README.md)

## API Reference

### Simulation

```typescript
class Simulation {
  constructor(options?: SimulationOptions);

  // Core methods
  run(until?: number): SimulationResult;
  step(): boolean;
  reset(): void;

  // Time
  get now(): number;

  // Scheduling
  schedule(delay: number, callback: Function, priority?: number): string;
  cancel(eventId: string): boolean;

  // Process creation (convenience method)
  process(generatorFn: () => Generator): Process;

  // Events
  on(event: 'step' | 'complete' | 'error', handler: Function): void;
  off(event: string, handler: Function): void;
}
```

### Process

```typescript
class Process {
  constructor(simulation: Simulation, generatorFn: () => Generator);

  start(): void;
  interrupt(reason?: Error): void;

  get isRunning(): boolean;
  get isCompleted(): boolean;
  get isInterrupted(): boolean;
}

// Helper functions
function* timeout(delay: number): Generator<Timeout, void, void>;
function* waitFor(predicate: () => boolean): Generator<Condition, void, void>;
```

### Resource

```typescript
class Resource {
  constructor(simulation: Simulation, capacity: number, options?: ResourceOptions);

  request(): ResourceRequest;
  release(): void;

  get inUse(): number;
  get available(): number;
  get queueLength(): number;
  get utilization(): number;
  get stats(): ResourceStatistics;
}
```

### Statistics

```typescript
class Statistics {
  constructor(simulation: Simulation);

  // Time-weighted averages
  recordValue(name: string, value: number): void;
  getAverage(name: string): number;

  // Counters
  increment(name: string, amount?: number): void;
  getCount(name: string): number;

  // Timeseries
  enableTimeseries(name: string): void;
  getTimeseries(name: string): TimePoint[];

  // Advanced statistics (v0.1.2+)
  enableSampleTracking(name: string): void;
  recordSample(name: string, value: number): void;
  getPercentile(name: string, percentile: number): number;
  getVariance(name: string): number;
  getStdDev(name: string): number;
  getMin(name: string): number;
  getMax(name: string): number;
  getSampleMean(name: string): number;
  getSampleCount(name: string): number;
  getHistogram(name: string, bins?: number): HistogramBin[];

  // Export
  toJSON(): Record<string, unknown>;
  toCSV(): string;
}
```

### Random

```typescript
class Random {
  constructor(seed?: number);

  uniform(min: number, max: number): number;
  exponential(mean: number): number;
  normal(mean: number, stdDev: number): number;
  randint(min: number, max: number): number;

  choice<T>(array: T[]): T;
  shuffle<T>(array: T[]): T[];

  getSeed(): number;
  setSeed(seed: number): void;
}
```

### ValidationError

```typescript
class ValidationError extends Error {
  constructor(message: string, context?: Record<string, unknown>);

  name: 'ValidationError';
  context?: Record<string, unknown>;
}
```

Thrown when invalid parameters are provided to simulation methods. Includes helpful error messages with suggestions and context information for debugging.

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Build
npm run build

# Lint
npm run lint

# Format
npm run format
```

## Testing

The library has comprehensive test coverage:

- **223 tests** across unit and integration suites
- **100% pass rate**
- Coverage: 80%+ overall, 95%+ for core modules

```bash
npm test
```

## Architecture

### Event Queue

Binary min-heap priority queue with O(log n) operations. Events ordered by:
1. Time (ascending)
2. Priority (ascending)
3. ID (deterministic tie-breaking)

### Process Execution

Generator-based with synchronous execution until first yield. Supports:
- `timeout(delay)`: Wait for time to pass
- `resource.request()`: Acquire resource (returns token to yield)
- `waitFor(predicate)`: Wait for condition

### Resource Management

Token-based API with synchronous callbacks to maintain discrete-event semantics. Avoids Promise microtask queue for deterministic execution.

### Statistics Collection

Time-weighted averaging for continuous metrics:
```
average = sum(value_i * duration_i) / total_time
```

This correctly handles metrics like queue length and utilization.

## Design Decisions

### Why Generators Instead of Async/Await?

Generators provide synchronous execution within the simulation timeline, while Promises execute in the microtask queue outside our control. This maintains discrete-event semantics and deterministic execution order.

### Why Token-Based Resources?

The `resource.request()` returns a token to yield, not a Promise. This allows synchronous callback execution when resources become available, keeping everything in the simulation timeline.

### Why LCG for Random Numbers?

Linear Congruential Generator is simple, fast, and sufficient for simulation. It's deterministic (critical for reproducibility) and has acceptable statistical properties for most applications.

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass (`npm test`)
5. Submit a pull request

## License

MIT

## Credits

Inspired by [SimPy](https://simpy.readthedocs.io/), the excellent Python discrete-event simulation library.

## Documentation

Full documentation is available at [https://www.discrete-sim.dev](https://www.discrete-sim.dev)

## Support

- **Issues**: [GitHub Issues](https://github.com/anesask/discrete-sim/issues)
- **Discussions**: [GitHub Discussions](https://github.com/anesask/discrete-sim/discussions)

## Citation

If you use discrete-sim in academic work, please cite:

```bibtex
@software{discrete-sim,
  title = {discrete-sim: A TypeScript Discrete-Event Simulation Library},
  author = {Anes Mulalic},
  year = {2026},
  url = {https://github.com/anesask/discrete-sim}
}
```

## Developer

Created and maintained by [Anes Mulalic](https://github.com/anesask)
