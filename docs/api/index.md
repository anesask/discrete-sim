# API Reference

Hand-maintained signatures of the public API. For behaviour and examples see the [guide](../guide/index.md).

## Simulation

```typescript
class Simulation {
  constructor(options?: SimulationOptions);

  // Core methods
  run(until?: number): SimulationResult;
  runAsync(options?: {
    until?: number;
    batchSize?: number;
    signal?: AbortSignal;
  }): Promise<SimulationResult>;
  runRealtime(options?: { factor?: number; until?: number }): RealtimeHandle;
  step(): boolean;
  reset(): void;

  // Time and seed
  get now(): number;
  get seed(): number;                 // effective randomSeed
  readonly random: Random;            // generator seeded from randomSeed

  // Scheduling
  schedule(delay: number, callback: Function, priority?: number): string;
  cancel(eventId: string): boolean;

  // Process creation (convenience method)
  process(generatorFn: () => Generator): Process;

  // Events
  on(
    event: 'step' | 'complete' | 'error' | 'progress',
    handler: Function
  ): void;
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

## Process

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

## Resource

```typescript
class Resource {
  constructor(
    simulation: Simulation,
    capacity: number,
    options?: ResourceOptions
  );

  request(priority?: number): ResourceRequest;
  release(): void;
  setCapacity(capacity: number): void; // v0.1.19+

  get capacity(): number;
  get inUse(): number;
  get available(): number;
  get queueLength(): number;
  get utilization(): number;
  get stats(): ResourceStatistics;
}
```

## Batch

```typescript
class Batch<T> {
  constructor(
    simulation: Simulation,
    batchSize: number,
    options?: { name?: string; maxWait?: number; unbounded?: boolean }
  );

  put(item: T): BatchPutRequest<T>; // yield; resumes when accepted
  take(): BatchTakeRequest<T>; // yield; then request.items, request.isPartial

  get batchSize(): number;
  get size(): number; // items accumulating
  get readyCount(): number; // formed batches not yet taken
  get putQueueLength(): number;
  get takeQueueLength(): number;
  get stats(): BatchStatistics;
}
```

## Schedule

```typescript
class Schedule<T> {
  constructor(
    simulation: Simulation,
    options: {
      segments: { from: number; to: number; value: T }[];
      period?: number; // repeat every period; omit for a one-off schedule
      defaultValue?: T; // value in gaps (otherwise gaps throw)
    }
  );

  get current(): T;
  at(time: number): T;
  get isPeriodic(): boolean;
  get nextChange(): number; // Infinity when none is left
  nextChangeAfter(time: number): number;
  get hasMoreChanges(): boolean;
  waitForChange(): Generator<Timeout, T, void>; // use with yield*
  onChange(
    handler: (value: T, time: number) => void,
    options?: { immediate?: boolean }
  ): Process;
}
```

## Statistics

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

## Random

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

  // Seed, state and streams
  getSeed(): number;                  // seed used to create/reseed
  setSeed(seed: number): void;
  getState(): number[];
  setState(state: readonly number[]): void;
  stream(name: string): Random;       // independent, reproducible per name
  spawn(): Random;                    // child seeded from current output
  static randomSeed(): number;
}
```

## Experiment

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

## ValidationError

```typescript
class ValidationError extends Error {
  constructor(message: string, context?: Record<string, unknown>);

  name: 'ValidationError';
  context?: Record<string, unknown>;
}
```

Thrown when invalid parameters are provided to simulation methods. Includes helpful error messages with suggestions and context information for debugging.
