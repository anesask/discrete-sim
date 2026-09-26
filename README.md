# discrete-sim

[![npm version](https://img.shields.io/npm/v/discrete-sim.svg?style=flat-square)](https://www.npmjs.com/package/discrete-sim)
[![npm downloads](https://img.shields.io/npm/dm/discrete-sim.svg?style=flat-square)](https://www.npmjs.com/package/discrete-sim)
[![CI](https://github.com/anesask/discrete-sim/actions/workflows/ci.yml/badge.svg)](https://github.com/anesask/discrete-sim/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![GitHub issues](https://img.shields.io/github/issues/anesask/discrete-sim?style=flat-square&logo=github)](https://github.com/anesask/discrete-sim/issues)

A modern TypeScript discrete-event simulation library inspired by Python's SimPy.
Build and analyze complex systems with intuitive, generator-based process modeling.

**New to discrete-event simulation?** Check out the [Beginner's Guide](GUIDE.md) for tutorials and FAQs.

## Features

- **Process-Based Modeling**: Use generator functions to describe processes naturally
- **Resource Management**: Built-in support for shared resources with flexible queue disciplines (FIFO, LIFO, Priority)
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
sim.cancel(eventId); // Returns true if cancelled, false if not found

// Useful for timeout patterns
const timeoutId = sim.schedule(30, () => console.log('Timeout!'));
// ... do some work ...
sim.cancel(timeoutId); // Cancel if work completes early
```

### Processes

Processes are described using generator functions. Use `yield` to wait for events.

```typescript
function* myProcess() {
  yield* timeout(5); // Wait 5 time units
  yield resource.request(); // Wait for resource
  yield* timeout(10); // Use resource for 10 units
  resource.release(); // Release resource

  // Wait for condition with custom polling
  yield* waitFor(() => someValue > 10, {
    interval: 5, // Check every 5 time units
    maxIterations: 100, // Timeout after 100 checks
  });
}

// Create and start a process
sim.process(myProcess);

// Or keep a reference for later control
const proc = sim.process(myProcess);
proc.interrupt(); // Can interrupt if needed
```

### Process Composition (v0.1.17+)

Wait for another process, race several waits, or wait for all of them.

```typescript
import { anyOf, allOf, timeout } from 'discrete-sim';

// Join: wait for a child process to finish
function* dispatcher() {
  const truck = sim.process(loadTruck);
  const done = truck.done();
  yield done; // resumes when loadTruck ends
  console.log(done.result?.state); // 'completed' | 'interrupted'
}

// Race: request with a patience limit (reneging)
function* impatientCustomer() {
  const request = teller.request();
  const result = yield* anyOf([request, timeout(10)]);
  if (result.winner === request) {
    yield* timeout(5); // served
    teller.release();
  } else {
    stats.increment('reneged'); // gave up; the request left the queue automatically
  }
}

// Barrier: wait for everything
function* assembly() {
  yield* allOf([partA.done(), partB.done(), crane.request()]);
  // both parts are finished and the crane is ours
}
```

Branches can be resource, buffer and store requests, `event.wait()`, `process.done()` and `timeout(n)`. When an `anyOf` settles, every branch that has not completed is cancelled: queued requests leave their queues, timeouts are unscheduled, event waiters are removed. If several branches complete at the same instant they are all listed in `result.completed`, and any resource they acquired is yours to release. `waitFor()` conditions are polled and cannot be combined; use a `SimEvent` instead.

Interrupting a process cancels whatever it is waiting on, including all pending branches of a composite wait.

See [`examples/bank-renege/`](examples/bank-renege/) for a complete reneging model.

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

**Queue Disciplines (v0.1.8+):**

Resources support three queue disciplines to control how waiting requests are served:

```typescript
// FIFO (First In First Out) - default
const fifoServer = new Resource(sim, 1, {
  queueDiscipline: 'fifo', // Serve in arrival order
});

// LIFO (Last In First Out) - stack behavior
const lifoServer = new Resource(sim, 1, {
  queueDiscipline: 'lifo', // Serve most recent arrival first
});

// Priority Queue - serve by priority value (lower = higher priority)
const priorityServer = new Resource(sim, 1, {
  queueDiscipline: 'priority', // Serve by priority
});

function* customer(priority: number) {
  yield priorityServer.request(priority); // 1 = highest, 10 = lowest
  yield* timeout(5);
  priorityServer.release();
}

// Critical patient (priority 1) served before routine (priority 10)
sim.process(() => customer(10)); // Routine - low priority
sim.process(() => customer(1)); // Critical - high priority, goes first
```

**Priority Tie-Breakers:**

For priority queues, configure how requests with the same priority are ordered:

```typescript
const server = new Resource(sim, 1, {
  queueDiscipline: {
    type: 'priority',
    tieBreaker: 'fifo', // Same priority? Use FIFO (default)
  },
});

// Or use LIFO for same-priority requests
const server = new Resource(sim, 1, {
  queueDiscipline: {
    type: 'priority',
    tieBreaker: 'lifo', // Same priority? Use LIFO
  },
});
```

**Real-World Example:**

See the [Hospital ER example](examples/hospital-er/) for a complete demonstration of priority queuing in healthcare triage scenarios.

**Preemptive Resources:**

Preemptive resources allow higher-priority processes to interrupt lower-priority ones:

```typescript
import { Resource, PreemptionError } from 'discrete-sim';

const server = new Resource(sim, 1, {
  name: 'Server',
  preemptive: true, // Enable preemption
});

function* lowPriorityJob() {
  try {
    yield server.request(10); // Low priority
    yield* timeout(100); // Long job
    server.release();
  } catch (err) {
    if (err instanceof PreemptionError) {
      console.log('Job was preempted by higher priority request');
      // Handle preemption - cleanup, retry, etc.
    }
  }
}

function* highPriorityJob() {
  yield server.request(0); // High priority - will preempt low priority
  yield* timeout(5);
  server.release();
}

// Low priority starts first but gets interrupted
const p1 = new Process(sim, lowPriorityJob);
const p2 = new Process(sim, highPriorityJob);
p1.start();
sim.schedule(10, () => p2.start()); // High priority arrives later

sim.run();
```

When preemption occurs:

- The preempted process throws a `PreemptionError`
- The process can catch this error to handle cleanup
- Statistics track the total number of preemptions

### Buffer (v0.1.6+)

Model resources that store **homogeneous quantities** (tokens) rather than discrete capacity units. Perfect for fuel tanks, money, raw materials, bandwidth, or any inventory of identical items.

```typescript
import { Buffer } from 'discrete-sim';

// Create a fuel tank with 10,000 gallon capacity
const fuelTank = new Buffer(sim, 10000, {
  name: 'Fuel Tank',
  initialLevel: 5000, // Start half full
});

// Truck refueling (consumer)
function* truck() {
  yield fuelTank.get(50); // Get 50 gallons (blocks if insufficient)
  yield* timeout(0.1); // Refuel for 6 minutes
}

// Tanker delivery (producer)
function* tanker() {
  yield* timeout(6); // Travel time
  yield fuelTank.put(5000); // Deliver 5000 gallons (blocks if insufficient space)
}

// Check status
console.log(fuelTank.level); // Current amount: 5000
console.log(fuelTank.available); // Space available: 5000
console.log(fuelTank.capacity); // Maximum: 10000
```

**Buffer Queue Disciplines (v0.1.8+):**

Buffers support independent queue disciplines for put and get operations:

```typescript
const buffer = new Buffer(sim, 1000, {
  name: 'Inventory',
  putQueueDiscipline: 'priority', // Priority for deliveries
  getQueueDiscipline: 'fifo', // FIFO for withdrawals
});

// High priority delivery (rush order)
function* urgentDelivery() {
  yield buffer.put(100, 1); // priority = 1 (high)
  // Delivered before lower priority puts
}

// Normal delivery
function* normalDelivery() {
  yield buffer.put(50, 10); // priority = 10 (low)
}
```

**Key Differences from Resource:**

| Feature        | Resource                                    | Buffer                                 |
| -------------- | ------------------------------------------- | -------------------------------------- |
| **Models**     | Discrete capacity units (servers, machines) | Continuous quantities (fuel, money)    |
| **Operations** | `request()` / `release()`                   | `put()` / `get()`                      |
| **Capacity**   | Integer units (1, 2, 3...)                  | Any number (50.5 gallons, 1250 tokens) |
| **Use Case**   | Limited workers, processors                 | Inventory, storage, bandwidth          |

**Buffer Statistics:**

```typescript
const stats = fuelTank.stats;

console.log(stats.totalPuts); // Number of deliveries
console.log(stats.totalGets); // Number of withdrawals
console.log(stats.totalAmountPut); // Total fuel delivered
console.log(stats.totalAmountGot); // Total fuel consumed
console.log(stats.averageLevel); // Time-weighted average inventory level
console.log(stats.averagePutWaitTime); // Average wait time for deliveries
console.log(stats.averageGetWaitTime); // Average wait time for withdrawals
console.log(stats.averagePutQueueLength); // Average delivery queue length
console.log(stats.averageGetQueueLength); // Average withdrawal queue length
```

**Complete Example:** See [`examples/fuel-station/`](examples/fuel-station/) for a full simulation of a gas station with trucks and tanker deliveries.

### Store (v0.1.6+)

Model resources that store **distinct JavaScript objects** rather than homogeneous quantities. Perfect for warehouses, parking lots, patient queues, or any inventory with unique items.

```typescript
import { Store } from 'discrete-sim';

interface Pallet {
  id: string;
  destination: string;
  weight: number;
}

// Create warehouse with capacity for 100 pallets
const warehouse = new Store<Pallet>(sim, 100, { name: 'Warehouse' });

// Store a pallet
function* receivePallet(pallet: Pallet) {
  yield warehouse.put(pallet);
  console.log(`Stored pallet ${pallet.id}`);
}

// Retrieve FIFO (no filter)
function* shipNext() {
  const request = warehouse.get();
  yield request;
  const pallet = request.retrievedItem!;
  console.log(`Shipping ${pallet.id}`);
}

// Retrieve by filter (destination)
function* shipToNYC() {
  const request = warehouse.get((p) => p.destination === 'NYC');
  yield request;
  const pallet = request.retrievedItem!;
  console.log(`Shipping ${pallet.id} to NYC`);
}

// Inspect current items
console.log(warehouse.size); // Number of items stored
console.log(warehouse.available); // Space available
console.log(warehouse.items); // Read-only array of items
```

**Key Differences: Buffer vs Store**

| Feature       | Buffer              | Store                           |
| ------------- | ------------------- | ------------------------------- |
| **Stores**    | Numeric quantities  | Distinct objects                |
| **Put/Get**   | Amount (number)     | Item (object)                   |
| **Retrieval** | Always FIFO         | FIFO or filter-based            |
| **Use Case**  | Fuel, money, tokens | Pallets, patients, vehicles     |
| **Example**   | `buffer.get(50)`    | `store.get(p => p.id === 'P1')` |

**Filter-Based Retrieval:**

```typescript
// Get by property value
const req = store.get((item) => item.priority === 1);

// Get by complex condition
const req = store.get(
  (item) => item.destination === 'NYC' && item.weight > 500
);

// Get by ID
const req = store.get((item) => item.id === 'P0042');

// No filter = FIFO (first in, first out)
const req = store.get();
```

**Store Queue Disciplines (v0.1.13+):**

Like Resource and Buffer, a Store can order its _waiting_ put and get requests with FIFO (default), LIFO or priority disciplines. The discipline decides which waiting process is served first; it does not change which stored item an unfiltered `get()` returns (always the oldest matching item).

```typescript
const warehouse = new Store<Pallet>(sim, 100, {
  putQueueDiscipline: 'priority', // rush deliveries jump the queue when full
  getQueueDiscipline: { type: 'priority', tieBreaker: 'fifo' },
});

// Lower number = higher priority. When the store is full, rush deliveries are
// admitted before routine ones, regardless of arrival order.
function* rushDelivery(pallet: Pallet) {
  yield warehouse.put(pallet, 1);
}
function* routineDelivery(pallet: Pallet) {
  yield warehouse.put(pallet, 10);
}

// Express shipping waits ahead of standard shipping for the next matching pallet
function* expressPickup() {
  const req = warehouse.get((p) => p.destination === 'NYC', 1);
  yield req;
  ship(req.retrievedItem!);
}
```

**Store Statistics:**

```typescript
const stats = warehouse.stats;

console.log(stats.totalPuts); // Number of items stored
console.log(stats.totalGets); // Number of items retrieved
console.log(stats.averageSize); // Time-weighted average inventory
console.log(stats.averagePutWaitTime); // Average wait to store
console.log(stats.averageGetWaitTime); // Average wait to retrieve
console.log(stats.averagePutQueueLength); // Average store queue length
console.log(stats.averageGetQueueLength); // Average retrieve queue length
```

**Important Behaviors:**

- **Get blocks** until matching item is available
- **Put blocks** when store is at capacity
- **Multiple filters** can wait simultaneously
- **First match** is returned when multiple items match filter
- **FIFO within matches** - items are searched in order stored

**Complete Example:** See [`examples/warehouse-store/`](examples/warehouse-store/) for a full simulation of a distribution warehouse with filtered retrieval.

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
const p50 = stats.getPercentile('wait-time', 50); // Median
const p95 = stats.getPercentile('wait-time', 95);
const p99 = stats.getPercentile('wait-time', 99);

// Variance and standard deviation (optimized with Welford's algorithm)
const variance = stats.getVariance('wait-time'); // O(1) - instant!
const stdDev = stats.getStdDev('wait-time'); // O(1) - instant!

// Histograms
const histogram = stats.getHistogram('wait-time', 10);

// Warm-up period (v0.1.3+)
stats.setWarmupPeriod(1000); // Exclude first 1000 time units
// Statistics now only include steady-state behavior after warm-up

// Confidence intervals and summaries (v0.1.15+)
const ci = stats.getConfidenceInterval('wait-time', 0.95);
console.log(
  `mean ${ci.mean.toFixed(2)} +/- ${ci.halfWidth.toFixed(2)} (n=${ci.n})`
);

// Queue waits within one run are autocorrelated; batch means gives an honest interval
const bm = stats.getBatchMeansCI('wait-time', { batches: 20 });

// Several percentiles from one sort, or everything at once
const { 50: median, 95: p95b } = stats.getPercentiles('wait-time', [50, 95]);
const summary = stats.getSummary('wait-time'); // n, mean, stdDev, min, max, p50, p95, p99, ci
```

**One run is not an answer.** A single simulation run is one sample path. Report a confidence interval, and for decisions between scenarios run several replications with different seeds and compare the intervals.

**Performance Note:** Mean, variance, and standard deviation calculations use Welford's online algorithm for O(1) computation, making them instantaneous even with millions of samples.

### Random Number Generation

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
  yield * timeout(-5);
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
- Random seeds must be finite integers within safe range (0 to 2^32-1)

### Debugging & Event Tracing

Enable detailed event tracing for debugging and analysis:

```typescript
import { Simulation } from 'discrete-sim';

const sim = new Simulation();

// Enable event tracing
sim.enableEventTrace();

sim.schedule(10, () => console.log('Event 1'), 5);
sim.schedule(20, () => console.log('Event 2'), 3);
sim.schedule(10, () => console.log('Event 3'), 0);

sim.run();

// Get execution trace
const trace = sim.getEventTrace();

trace.forEach((entry) => {
  console.log(`Event ${entry.id}:`);
  console.log(`  Time: ${entry.time}`);
  console.log(`  Priority: ${entry.priority}`);
  console.log(`  Executed at: ${entry.executedAt}`);
});

// Clear trace for next run
sim.clearEventTrace();

// Disable tracing when done
sim.disableEventTrace();
```

Event tracing is useful for:

- Understanding event execution order
- Debugging priority scheduling issues
- Performance analysis
- Verifying simulation correctness

## Running Experiments

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

See [`examples/experiment-mm1/`](examples/experiment-mm1/) for a complete run against queueing theory.

## Examples

### Replicated M/M/c Experiment

Thirty replications of an M/M/1 queue with a confidence interval next to the theoretical mean wait, then a sweep over the number of servers with common random numbers.

```bash
npx tsx examples/experiment-mm1/index.ts
```

[Full documentation](examples/experiment-mm1/README.md)

### Bank with Impatient Customers (Reneging)

Customers race a teller request against their patience with `anyOf`; those who give up leave the queue cleanly.

```bash
npx tsx examples/bank-renege/index.ts
```

[Full documentation](examples/bank-renege/README.md)

### Hospital Emergency Room (Priority Queues)

Demonstrates priority queue disciplines in a realistic healthcare triage scenario. Compares FIFO vs Priority queuing to show how critical patients benefit from priority-based treatment.

```bash
npx tsx examples/hospital-er/index.ts
```

**Key Features:**

- Three triage levels (Critical, Urgent, Routine)
- Comparison of FIFO vs Priority queue disciplines
- Statistical analysis showing 70-85% reduction in critical patient wait times
- Real-world demonstration of queue discipline trade-offs

[Full documentation](examples/hospital-er/README.md)

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

interface SimulationResult {
  endTime: number; // Final simulation time
  eventsProcessed: number; // Number of events processed
  statistics: {
    // Simulation statistics
    currentTime: number;
    eventsProcessed: number;
    eventsInQueue: number;
  };
}
```

### Process

```typescript
class Process {
  constructor(simulation: Simulation, generatorFn: () => Generator);

  start(): void;
  interrupt(reason?: Error): void;

  done(): ProcessDoneRequest;          // yield to wait for this process
  get isRunning(): boolean;
  get isCompleted(): boolean;
  get isInterrupted(): boolean;
  get interruptReason(): Error | undefined;
}

// Composition (v0.1.17+)
function* anyOf(branches: WaitableInput[]): Generator<AnyOfRequest, AnyOfResult, void>;
function* allOf(branches: WaitableInput[]): Generator<AllOfRequest, Waitable[], void>;

interface AnyOfResult {
  winner: Waitable;        // first branch to complete
  index: number;           // its position in the branches array
  completed: Waitable[];   // every branch that completed at that instant
}

type Waitable =
  | Timeout | ResourceRequest | BufferPutRequest | BufferGetRequest
  | StorePutRequest<any> | StoreGetRequest<any> | SimEventRequest | ProcessDoneRequest;

// Helper functions
function* timeout(delay: number): Generator<Timeout, void, void>;
function* waitFor(
  predicate: () => boolean,
  options?: WaitForOptions
): Generator<Condition, void, void>;

interface WaitForOptions {
  interval?: number;        // Polling interval (default: 1)
  maxIterations?: number;   // Max iterations before timeout (default: Infinity)
}

// Error types
class ConditionTimeoutError extends Error {
  iterations: number;
}
```

### Resource

```typescript
class Resource {
  constructor(
    simulation: Simulation,
    capacity: number,
    options?: ResourceOptions
  );

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

  // Inference (v0.1.15+)
  getPercentiles(name: string, percentiles: number[]): Record<number, number>;
  getConfidenceInterval(name: string, confidence?: number): ConfidenceInterval;
  getBatchMeansCI(
    name: string,
    options?: { batches?: number; confidence?: number }
  ): BatchMeansResult;
  getSummary(name: string, confidence?: number): SummaryStatistics;

  // Export
  toJSON(): Record<string, unknown>;
  toCSV(): string;
}
```

### Random

```typescript
class Random {
  constructor(seed?: number);

  // Continuous distributions
  uniform(min: number, max: number): number;
  exponential(mean: number): number;
  normal(mean: number, stdDev: number): number;
  triangular(min: number, max: number, mode?: number): number;

  lognormal(mu: number, sigma: number): number;
  gamma(shape: number, scale?: number): number;
  erlang(k: number, mean: number): number;
  weibull(shape: number, scale?: number): number;
  beta(alpha: number, beta: number): number;
  static lognormalParams(
    mean: number,
    stdDev: number
  ): { mu: number; sigma: number };

  // Discrete distributions
  randint(min: number, max: number): number;
  poisson(lambda: number): number;
  bernoulli(p: number): boolean;
  geometric(p: number): number;

  // Array and empirical operations
  choice<T>(array: readonly T[]): T;
  weightedChoice<T>(items: readonly T[], weights: readonly number[]): T;
  discrete<T>(entries: readonly WeightedValue<T>[]): T;
  empirical(
    samples: readonly number[],
    options?: { interpolate?: boolean }
  ): number;
  shuffle<T>(array: T[]): T[];

  // Seed management
  getSeed(): number;
  setSeed(seed: number): void;
}
```

### Experiment

```typescript
class Experiment<P, M extends Record<string, number>> {
  constructor(model: (params: P, seed: number, replication: number) => M);

  run(params: P, seed: number, replication?: number): M;
  replicate(params: P, options: ReplicationOptions): ReplicationResult<P, M>;
  sweep(
    space: { [K in keyof P]: P[K][] },
    options: ReplicationOptions
  ): SweepResult<P, M>;
  static combinations<P>(space: { [K in keyof P]: P[K][] }): P[];
}

interface ReplicationOptions {
  replications: number;
  seed?: number; // default 12345
  onProgress?: (done: number, total: number) => void;
}

class ReplicationResult<P, M> {
  readonly params: P;
  readonly runs: readonly M[];
  readonly seeds: readonly number[];
  get n(): number;
  get metrics(): (keyof M & string)[];
  values(metric): number[];
  mean(metric): number;
  stdDev(metric): number;
  min(metric): number;
  max(metric): number;
  confidenceInterval(metric, confidence?): ConfidenceInterval;
  summary(confidence?): Record<keyof M, MetricSummary>;
  table(): Array<{ replication: number; seed: number } & M>;
  toCSV(): string;
}

class SweepResult<P, M> {
  readonly scenarios: readonly ReplicationResult<P, M>[];
  compare(metric, confidence?): ComparisonRow<P>[];
  best(metric, direction?: 'min' | 'max'): ReplicationResult<P, M>;
  toCSV(): string;
}

function deriveSeed(base: number, index: number): number;
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
- `waitFor(predicate, options)`: Wait for condition with configurable polling
  - `interval`: Polling interval in simulation time (default: 1)
  - `maxIterations`: Maximum polling attempts before timeout (default: Infinity)
  - Throws `ConditionTimeoutError` when max iterations exceeded

### Resource Management

Token-based API with synchronous callbacks to maintain discrete-event semantics. Avoids Promise microtask queue for deterministic execution.

### Statistics Collection

Time-weighted averaging for continuous metrics:

```
average = sum(value_i * duration_i) / total_time
```

Sample statistics (mean, variance, standard deviation) use Welford's online algorithm for O(1) incremental updates with excellent numerical stability.

## Limitations & Performance

### Scale Considerations

discrete-sim is designed for **small to medium-scale simulations** (up to ~100,000 events). Performance characteristics:

- **10,000 events**: ~100ms (excellent for prototyping and education)
- **100,000 events**: ~1-2s (good for most practical applications)
- **1,000,000+ events**: May become slow (8-15 minutes) due to JavaScript's performance characteristics

These benchmarks are for single simulation runs.
For Monte Carlo analysis with multiple independent runs, consider using Node.js worker threads for parallelization.

### Memory Considerations

- **Event queue**: Each event uses ~100-150 bytes of memory
- **Statistics with sample tracking**: Stores all samples in memory - can grow large for long simulations
- **Timeseries recording**: Unbounded growth - use selectively for critical metrics
- **Practical limit**: ~1-2 million concurrent events before memory pressure on typical systems

### When to Consider Alternatives

Consider **SimPy** (Python) or other tools if you need:

- **Very large-scale simulations** (millions of events with heavy statistics)
- **High-performance computing** requirements
- **Integration with scientific Python** (NumPy, SciPy, Pandas) for complex analysis
- **Parallel simulation** across dozens of CPU cores
- **Academic research** where Python is the established standard

### When discrete-sim is the Right Choice

Use discrete-sim when you need:

- **Web applications** or browser-based simulation dashboards
- **Integration with Node.js/TypeScript** codebases
- **Type safety and excellent IDE support** for development
- **Zero dependencies** and lightweight deployment
- **Serverless environments** (AWS Lambda, Cloudflare Workers)
- **Interactive teaching tools** with immediate feedback
- **Rapid prototyping** with modern JavaScript tooling

### Performance Tips

1. **Disable sample tracking** when not needed - use time-weighted averages instead
2. **Limit timeseries recording** to critical metrics only
3. **Use warm-up periods** to exclude initial transient behavior
4. **Batch independent simulations** using worker threads for Monte Carlo analysis
5. **Profile before optimizing** - use event tracing to identify bottlenecks
6. **Statistics are optimized** - Mean, variance, and standard deviation use Welford's online algorithm (O(1) queries)

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
