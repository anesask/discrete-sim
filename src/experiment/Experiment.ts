import { ValidationError } from '../utils/validation.js';
import { studentTCritical } from '../statistics/distributions.js';
import type { ConfidenceInterval } from '../statistics/Statistics.js';

/**
 * A model factory: builds a simulation for the given parameters and seed,
 * runs it, and returns the metrics of interest as a flat numeric record.
 *
 * The function must create its own `Simulation`, `Random` and `Statistics`
 * instances on every call so that replications are independent.
 *
 * @template P - Scenario parameters
 * @template M - Metrics returned by one run
 */
export type ModelFn<P, M extends Record<string, number>> = (
  params: P,
  seed: number,
  replication: number
) => M;

/**
 * Options for {@link Experiment.replicate} and {@link Experiment.sweep}.
 */
export interface ReplicationOptions {
  /** Number of independent runs per scenario (>= 1) */
  replications: number;
  /**
   * Base seed. Each replication gets a seed derived from it, so the whole
   * experiment is reproducible. Default: 12345.
   *
   * Replication i uses the same derived seed in every scenario of a sweep
   * (common random numbers), which lowers the variance of scenario comparisons.
   */
  seed?: number;
  /** Called after each completed run with (done, total) */
  onProgress?: (done: number, total: number) => void;
}

/**
 * Per-metric summary across replications.
 */
export interface MetricSummary {
  /** Number of replications */
  n: number;
  mean: number;
  /** Sample standard deviation across replications (n - 1) */
  stdDev: number;
  min: number;
  max: number;
  /** Student-t confidence interval for the mean */
  ci: ConfidenceInterval;
}

/**
 * One row of a scenario comparison, see {@link SweepResult.compare}.
 */
export interface ComparisonRow<P> {
  params: P;
  n: number;
  mean: number;
  stdDev: number;
  lower: number;
  upper: number;
  halfWidth: number;
}

/**
 * Parameter space for a full-factorial sweep: every key of P maps to the list
 * of values to try.
 */
export type ParameterSpace<P> = { [K in keyof P]: readonly P[K][] };

/**
 * Derive a well-mixed 32-bit seed from a base seed and a replication index.
 * Adjacent seeds fed straight into an LCG give correlated streams, so the pair
 * is hashed (murmur3 finaliser) instead of added.
 */
export function deriveSeed(base: number, index: number): number {
  let h = (base ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

function sampleStdDev(values: readonly number[], mean: number): number {
  if (values.length < 2) return 0;
  let sumSq = 0;
  for (const v of values) sumSq += (v - mean) ** 2;
  return Math.sqrt(sumSq / (values.length - 1));
}

function tInterval(
  values: readonly number[],
  confidence: number
): ConfidenceInterval {
  const n = values.length;
  const mean = n > 0 ? values.reduce((a, b) => a + b, 0) / n : 0;
  if (n < 2) {
    return {
      mean,
      lower: -Infinity,
      upper: Infinity,
      halfWidth: Infinity,
      stdError: Infinity,
      confidence,
      n,
    };
  }
  const stdError = sampleStdDev(values, mean) / Math.sqrt(n);
  const halfWidth = studentTCritical(confidence, n - 1) * stdError;
  return {
    mean,
    lower: mean - halfWidth,
    upper: mean + halfWidth,
    halfWidth,
    stdError,
    confidence,
    n,
  };
}

function validateConfidence(confidence: number): void {
  if (!(confidence > 0 && confidence < 1)) {
    throw new ValidationError(
      'confidence must be strictly between 0 and 1, e.g. 0.95 (got ' +
        confidence +
        ')',
      { confidence }
    );
  }
}

function csvEscape(value: unknown): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Results of running one scenario several times with different seeds.
 *
 * @template P - Scenario parameters
 * @template M - Metrics returned by one run
 */
export class ReplicationResult<P, M extends Record<string, number>> {
  constructor(
    /** Parameters this scenario was run with */
    public readonly params: P,
    /** One metrics record per replication, in replication order */
    public readonly runs: readonly M[],
    /** Seed used by each replication */
    public readonly seeds: readonly number[]
  ) {}

  /** Number of replications */
  get n(): number {
    return this.runs.length;
  }

  /** Names of the metrics the model returned */
  get metrics(): (keyof M & string)[] {
    const first = this.runs[0];
    return first ? (Object.keys(first) as (keyof M & string)[]) : [];
  }

  /** All values of one metric, one per replication */
  values(metric: keyof M & string): number[] {
    return this.runs.map((r) => this.metricValue(r, metric));
  }

  /** Mean of a metric across replications */
  mean(metric: keyof M & string): number {
    const v = this.values(metric);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  }

  /** Sample standard deviation of a metric across replications */
  stdDev(metric: keyof M & string): number {
    const v = this.values(metric);
    return sampleStdDev(v, this.mean(metric));
  }

  min(metric: keyof M & string): number {
    const v = this.values(metric);
    return v.length ? Math.min(...v) : 0;
  }

  max(metric: keyof M & string): number {
    const v = this.values(metric);
    return v.length ? Math.max(...v) : 0;
  }

  /**
   * Student-t confidence interval for the mean of a metric. Replications are
   * independent by construction, so this interval is valid without batching.
   */
  confidenceInterval(
    metric: keyof M & string,
    confidence: number = 0.95
  ): ConfidenceInterval {
    validateConfidence(confidence);
    return tInterval(this.values(metric), confidence);
  }

  /** Summary of every metric */
  summary(confidence: number = 0.95): Record<keyof M & string, MetricSummary> {
    validateConfidence(confidence);
    const out = {} as Record<keyof M & string, MetricSummary>;
    for (const metric of this.metrics) {
      const v = this.values(metric);
      const mean = v.reduce((a, b) => a + b, 0) / v.length;
      out[metric] = {
        n: v.length,
        mean,
        stdDev: sampleStdDev(v, mean),
        min: Math.min(...v),
        max: Math.max(...v),
        ci: tInterval(v, confidence),
      };
    }
    return out;
  }

  /** One row per replication: replication index, seed and every metric */
  table(): Array<{ replication: number; seed: number } & M> {
    return this.runs.map((run, i) => ({
      replication: i,
      seed: this.seeds[i]!,
      ...run,
    }));
  }

  /** CSV with a header row, one line per replication */
  toCSV(): string {
    const metrics = this.metrics;
    const header = ['replication', 'seed', ...metrics].join(',');
    const lines = this.runs.map((run, i) =>
      [i, this.seeds[i]!, ...metrics.map((m) => this.metricValue(run, m))]
        .map(csvEscape)
        .join(',')
    );
    return [header, ...lines].join('\n');
  }

  private metricValue(run: M, metric: keyof M & string): number {
    const v = run[metric];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new ValidationError(
        `Metric "${metric}" must be a finite number in every run (got ${String(v)})`,
        { metric, value: v }
      );
    }
    return v;
  }
}

/**
 * Results of a parameter sweep: one {@link ReplicationResult} per scenario.
 */
export class SweepResult<P, M extends Record<string, number>> {
  constructor(public readonly scenarios: readonly ReplicationResult<P, M>[]) {}

  /**
   * Compare scenarios on one metric: mean and confidence interval per scenario,
   * in the order the scenarios were run.
   */
  compare(
    metric: keyof M & string,
    confidence: number = 0.95
  ): ComparisonRow<P>[] {
    validateConfidence(confidence);
    return this.scenarios.map((s) => {
      const ci = s.confidenceInterval(metric, confidence);
      return {
        params: s.params,
        n: ci.n,
        mean: ci.mean,
        stdDev: s.stdDev(metric),
        lower: ci.lower,
        upper: ci.upper,
        halfWidth: ci.halfWidth,
      };
    });
  }

  /**
   * The scenario with the lowest (default) or highest mean of a metric.
   */
  best(
    metric: keyof M & string,
    direction: 'min' | 'max' = 'min'
  ): ReplicationResult<P, M> {
    if (this.scenarios.length === 0) {
      throw new ValidationError('Sweep has no scenarios', {});
    }
    let best = this.scenarios[0]!;
    let bestValue = best.mean(metric);
    for (const s of this.scenarios.slice(1)) {
      const v = s.mean(metric);
      if (direction === 'min' ? v < bestValue : v > bestValue) {
        best = s;
        bestValue = v;
      }
    }
    return best;
  }

  /**
   * CSV with one line per scenario and replication: parameter columns first,
   * then replication, seed and every metric.
   */
  toCSV(): string {
    const first = this.scenarios[0];
    if (!first) return '';
    const paramKeys = Object.keys(first.params as object);
    const metrics = first.metrics;
    const header = [...paramKeys, 'replication', 'seed', ...metrics].join(',');
    const lines: string[] = [];
    for (const s of this.scenarios) {
      const paramValues = paramKeys.map(
        (k) => (s.params as Record<string, unknown>)[k]
      );
      s.table().forEach((row) => {
        lines.push(
          [
            ...paramValues,
            row.replication,
            row.seed,
            ...metrics.map((m) => row[m]),
          ]
            .map(csvEscape)
            .join(',')
        );
      });
    }
    return [header, ...lines].join('\n');
  }
}

/**
 * Runs a model many times: replications of one scenario, or a full-factorial
 * sweep over a parameter space, with reproducible seeds and confidence
 * intervals over the results.
 *
 * @example
 * ```typescript
 * interface Params { servers: number; duration: number }
 *
 * const exp = new Experiment((p: Params, seed) => {
 *   const sim = new Simulation();
 *   const rng = new Random(seed);
 *   const stats = new Statistics(sim);
 *   const server = new Resource(sim, p.servers);
 *   // ... build the model, record into stats ...
 *   sim.run(p.duration);
 *   return { meanWait: stats.getSampleMean('wait'), utilization: server.utilization };
 * });
 *
 * const rep = exp.replicate({ servers: 2, duration: 10_000 }, { replications: 30 });
 * const ci = rep.confidenceInterval('meanWait');
 *
 * const sweep = exp.sweep({ servers: [1, 2, 3], duration: [10_000] }, { replications: 20 });
 * console.table(sweep.compare('meanWait'));
 * ```
 */
export class Experiment<P, M extends Record<string, number>> {
  constructor(private readonly model: ModelFn<P, M>) {
    if (typeof model !== 'function') {
      throw new ValidationError('model must be a function', {
        model: typeof model,
      });
    }
  }

  /**
   * Run the model once with an explicit seed.
   */
  run(params: P, seed: number, replication: number = 0): M {
    return this.model(params, seed, replication);
  }

  /**
   * Run one scenario `replications` times with derived seeds.
   */
  replicate(params: P, options: ReplicationOptions): ReplicationResult<P, M> {
    const { replications, seed, onProgress } = this.validateOptions(options);
    return this.runScenario(
      params,
      replications,
      seed,
      onProgress,
      0,
      replications
    );
  }

  /**
   * Full-factorial sweep: every combination of the listed parameter values,
   * each replicated `replications` times. Replication i uses the same seed in
   * every scenario (common random numbers).
   */
  sweep(
    space: ParameterSpace<P>,
    options: ReplicationOptions
  ): SweepResult<P, M> {
    const { replications, seed, onProgress } = this.validateOptions(options);
    const combinations = Experiment.combinations(space);
    if (combinations.length === 0) {
      throw new ValidationError(
        'Parameter space must have at least one value for every parameter',
        { space }
      );
    }
    const total = combinations.length * replications;
    const scenarios: ReplicationResult<P, M>[] = [];
    combinations.forEach((params, i) => {
      scenarios.push(
        this.runScenario(
          params,
          replications,
          seed,
          onProgress,
          i * replications,
          total
        )
      );
    });
    return new SweepResult(scenarios);
  }

  /**
   * Cartesian product of a parameter space, in row-major order (the last
   * parameter varies fastest).
   */
  static combinations<P>(space: ParameterSpace<P>): P[] {
    const keys = Object.keys(space) as (keyof P)[];
    if (keys.length === 0) return [];
    let combos: Partial<P>[] = [{}];
    for (const key of keys) {
      const values = space[key];
      if (!Array.isArray(values) || values.length === 0) return [];
      const next: Partial<P>[] = [];
      for (const combo of combos) {
        for (const v of values) {
          next.push({ ...combo, [key]: v } as Partial<P>);
        }
      }
      combos = next;
    }
    return combos as P[];
  }

  private runScenario(
    params: P,
    replications: number,
    baseSeed: number,
    onProgress: ((done: number, total: number) => void) | undefined,
    doneOffset: number,
    total: number
  ): ReplicationResult<P, M> {
    const runs: M[] = [];
    const seeds: number[] = [];
    for (let i = 0; i < replications; i++) {
      const seed = deriveSeed(baseSeed, i);
      seeds.push(seed);
      runs.push(this.model(params, seed, i));
      onProgress?.(doneOffset + i + 1, total);
    }
    return new ReplicationResult(params, runs, seeds);
  }

  private validateOptions(options: ReplicationOptions): {
    replications: number;
    seed: number;
    onProgress?: (done: number, total: number) => void;
  } {
    const replications = options?.replications;
    if (!Number.isInteger(replications) || replications < 1) {
      throw new ValidationError(
        'replications must be a positive integer (got ' +
          String(replications) +
          ')',
        { replications }
      );
    }
    const seed = options.seed ?? 12345;
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
      throw new ValidationError(
        'seed must be an integer between 0 and 2^32 - 1 (got ' +
          String(seed) +
          ')',
        { seed }
      );
    }
    return { replications, seed, onProgress: options.onProgress };
  }
}
