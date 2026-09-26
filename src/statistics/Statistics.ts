import { Simulation } from '../core/Simulation.js';
import { ValidationError, validateFinite } from '../utils/validation.js';
import { studentTCritical } from './distributions.js';
import { csvCell } from '../utils/csv.js';
import type { Random } from '../random/Random.js';

/**
 * Options for {@link Statistics.enableSampleTracking}.
 */
export interface SampleTrackingOptions {
  /**
   * Keep at most this many samples (reservoir sampling, Algorithm R). Mean,
   * variance, min, max and the count stay exact; percentiles and histograms
   * become estimates from a uniform random subset of the samples. Default:
   * unlimited (every sample is kept).
   */
  maxSamples?: number;
}

/**
 * A confidence interval for the mean of a metric.
 */
export interface ConfidenceInterval {
  /** Point estimate (sample mean) */
  mean: number;
  /** Lower bound of the interval */
  lower: number;
  /** Upper bound of the interval */
  upper: number;
  /** Half-width of the interval (upper - mean) */
  halfWidth: number;
  /** Standard error of the mean used to build the interval */
  stdError: number;
  /** Confidence level in (0, 1), e.g. 0.95 */
  confidence: number;
  /** Number of observations the interval is based on */
  n: number;
}

/**
 * Confidence interval computed with the method of batch means.
 */
export interface BatchMeansResult extends ConfidenceInterval {
  /** Number of batches used */
  batches: number;
  /** Observations per batch */
  batchSize: number;
  /** The batch means themselves */
  batchMeans: number[];
}

/**
 * Options for {@link Statistics.getBatchMeansCI}.
 */
export interface BatchMeansOptions {
  /** Number of contiguous batches (default 20, minimum 2) */
  batches?: number;
  /** Confidence level in (0, 1) (default 0.95) */
  confidence?: number;
}

/**
 * One-call summary of a sample-tracked metric.
 */
export interface SummaryStatistics {
  /** Number of samples */
  n: number;
  /** Sample mean */
  mean: number;
  /** Population standard deviation (same as getStdDev) */
  stdDev: number;
  /** Population variance (same as getVariance) */
  variance: number;
  /** Minimum observed value */
  min: number;
  /** Maximum observed value */
  max: number;
  /** Median */
  p50: number;
  /** 95th percentile */
  p95: number;
  /** 99th percentile */
  p99: number;
  /** Confidence interval for the mean */
  ci: ConfidenceInterval;
}

/**
 * A single data point in a timeseries
 */
export interface TimePoint {
  /** Simulation time when this value was recorded */
  time: number;
  /** Value at this time */
  value: number;
}

/**
 * A bin in a histogram
 */
export interface HistogramBin {
  /** Lower bound of the bin (inclusive) */
  min: number;
  /** Upper bound of the bin (exclusive, except for last bin) */
  max: number;
  /** Number of samples in this bin */
  count: number;
  /** Frequency (count / total samples) */
  frequency: number;
}

/**
 * Statistics collector for discrete-event simulation.
 * Tracks time-weighted averages, counters, and timeseries data.
 *
 * @example
 * ```typescript
 * const stats = new Statistics(sim);
 *
 * // Record time-weighted values
 * stats.recordValue('queue-length', queueLength);
 *
 * // Increment counters
 * stats.increment('customers-served');
 *
 * // Get results
 * const avgQueueLength = stats.getAverage('queue-length');
 * const totalServed = stats.getCount('customers-served');
 *
 * // Export data
 * const json = stats.toJSON();
 * const csv = stats.toCSV();
 * ```
 */
export class Statistics {
  private readonly simulation: Simulation;

  // Time-weighted averages
  private readonly values: Map<string, number> = new Map(); // Current values
  private readonly valueSums: Map<string, number> = new Map(); // Time-weighted sums
  private readonly lastUpdateTimes: Map<string, number> = new Map(); // Last update time

  // Counters
  private readonly counters: Map<string, number> = new Map();

  // Timeseries
  private readonly timeseries: Map<string, TimePoint[]> = new Map();
  private readonly recordTimeseries: Set<string> = new Set(); // Which metrics to record as timeseries

  // Sample tracking (for percentiles, variance, histograms)
  private readonly samples: Map<string, number[]> = new Map(); // Raw sample values (or a reservoir)
  private readonly trackSamples: Set<string> = new Set(); // Which metrics to track samples for
  private readonly reservoirLimits: Map<string, number> = new Map(); // maxSamples per metric
  private reservoirRng?: Random; // Derived lazily from the simulation's generator

  // Welford's algorithm for online variance calculation
  private readonly sampleCounts: Map<string, number> = new Map(); // Number of samples
  private readonly sampleMeans: Map<string, number> = new Map(); // Running mean
  private readonly sampleM2s: Map<string, number> = new Map(); // Running sum of squared deviations

  // Cached values for expensive statistics calculations
  private readonly sortedSamplesCache: Map<string, number[]> = new Map(); // Cached sorted arrays
  private readonly minCache: Map<string, number> = new Map(); // Cached min values
  private readonly maxCache: Map<string, number> = new Map(); // Cached max values
  private readonly histogramCache: Map<string, Map<number, HistogramBin[]>> =
    new Map(); // Cached histograms by bin count

  // Warm-up period
  private warmupEndTime: number = 0;

  /**
   * Create a new statistics collector.
   *
   * @param simulation - The simulation instance to track time from
   */
  constructor(simulation: Simulation) {
    this.simulation = simulation;
    simulation._registerCollector(this);
  }

  /**
   * Start the statistics over from the current time while keeping the
   * current value of every time-weighted metric (so its average restarts
   * from now with the right starting level). Counters, samples, timeseries
   * and caches are cleared; tracking settings and the warm-up period stay.
   * Unlike reset(), the current values are preserved.
   */
  resetStatistics(): void {
    const now = this.simulation.now;
    // A reset at time t is a warm-up that ends at t: averages divide by time since then
    this.warmupEndTime = Math.max(this.warmupEndTime, now);
    for (const name of this.values.keys()) {
      this.valueSums.set(name, 0);
      this.lastUpdateTimes.set(name, now);
    }
    this.counters.clear();
    for (const name of this.timeseries.keys()) {
      this.timeseries.set(name, []);
    }
    for (const name of this.samples.keys()) {
      this.samples.set(name, []);
    }
    this.sampleCounts.clear();
    this.sampleMeans.clear();
    this.sampleM2s.clear();
    this.sortedSamplesCache.clear();
    this.minCache.clear();
    this.maxCache.clear();
    this.histogramCache.clear();
  }

  /**
   * Set the warm-up period end time.
   * Statistics collected before this time will be excluded from calculations.
   * This is useful for excluding initial transient behavior from steady-state analysis.
   *
   * @param endTime - Simulation time when warm-up period ends
   *
   * @example
   * ```typescript
   * const stats = new Statistics(sim);
   * stats.setWarmupPeriod(1000); // Exclude first 1000 time units
   *
   * // Run simulation
   * sim.run(5000);
   *
   * // Statistics only include time >= 1000
   * const avgQueueLength = stats.getAverage('queue-length');
   * ```
   */
  setWarmupPeriod(endTime: number): void {
    validateFinite(endTime, 'endTime', 'Warmup period must be a valid time');
    if (endTime < 0) {
      throw new ValidationError('warmup period end time must be non-negative', {
        endTime,
      });
    }
    this.warmupEndTime = endTime;
  }

  /**
   * Get the current warm-up period end time.
   *
   * @returns Warm-up period end time
   */
  getWarmupPeriod(): number {
    return this.warmupEndTime;
  }

  /**
   * Check if simulation is currently in warm-up period.
   *
   * @returns True if current time is before warm-up end time
   */
  isInWarmup(): boolean {
    return this.simulation.now < this.warmupEndTime;
  }

  /**
   * Record a time-weighted value.
   * The value is assumed to remain constant until the next recording.
   *
   * @param name - Metric name
   * @param value - Current value
   *
   * @example
   * ```typescript
   * // Record queue length changes
   * stats.recordValue('queue-length', queue.length);
   * ```
   */
  recordValue(name: string, value: number): void {
    // Validate metric name
    if (!name || name.trim() === '') {
      throw new ValidationError('Metric name cannot be empty', { name });
    }
    // Validate value
    validateFinite(value, 'value', 'Metric values must be valid numbers');

    const currentTime = this.simulation.now;

    // If this metric was previously recorded, accumulate the time-weighted sum
    if (this.values.has(name)) {
      const previousValue = this.values.get(name)!;
      const previousTime = this.lastUpdateTimes.get(name)!;

      // Only accumulate time after warm-up period
      const effectiveStartTime = Math.max(previousTime, this.warmupEndTime);
      const effectiveEndTime = currentTime;

      if (effectiveEndTime > effectiveStartTime) {
        const timeDelta = effectiveEndTime - effectiveStartTime;
        const currentSum = this.valueSums.get(name) || 0;
        this.valueSums.set(name, currentSum + previousValue * timeDelta);
      }
    }

    // Update current value and time
    this.values.set(name, value);
    this.lastUpdateTimes.set(name, currentTime);

    // Record timeseries if enabled for this metric (exclude warm-up if configured)
    if (this.recordTimeseries.has(name) && currentTime >= this.warmupEndTime) {
      if (!this.timeseries.has(name)) {
        this.timeseries.set(name, []);
      }
      this.timeseries.get(name)!.push({ time: currentTime, value });
    }
  }

  /**
   * Get the time-weighted average of a metric.
   *
   * @param name - Metric name
   * @returns Average value over simulation time, or 0 if never recorded
   *
   * @example
   * ```typescript
   * const avgQueueLength = stats.getAverage('queue-length');
   * ```
   */
  getAverage(name: string): number {
    if (!this.values.has(name)) {
      return 0;
    }

    const currentTime = this.simulation.now;
    const currentValue = this.values.get(name)!;
    const lastUpdateTime = this.lastUpdateTimes.get(name)!;
    const previousSum = this.valueSums.get(name) || 0;

    // Add the contribution from the current value (only after warm-up)
    const effectiveStartTime = Math.max(lastUpdateTime, this.warmupEndTime);
    const effectiveEndTime = currentTime;

    let totalSum = previousSum;
    if (effectiveEndTime > effectiveStartTime) {
      const timeDelta = effectiveEndTime - effectiveStartTime;
      totalSum = previousSum + currentValue * timeDelta;
    }

    // Calculate effective duration (excluding warm-up period)
    const effectiveDuration = Math.max(0, currentTime - this.warmupEndTime);

    // Avoid division by zero
    if (effectiveDuration === 0) {
      return currentValue;
    }

    return totalSum / effectiveDuration;
  }

  /**
   * Increment a counter by a specified amount.
   *
   * @param name - Counter name
   * @param amount - Amount to increment (default: 1)
   *
   * @example
   * ```typescript
   * stats.increment('customers-served');
   * stats.increment('items-processed', 5);
   * ```
   */
  increment(name: string, amount = 1): void {
    // Validate metric name
    if (!name || name.trim() === '') {
      throw new ValidationError('Metric name cannot be empty', { name });
    }
    // Validate amount
    validateFinite(amount, 'amount', 'Increment amount must be a valid number');

    const currentCount = this.counters.get(name) || 0;
    this.counters.set(name, currentCount + amount);
  }

  /**
   * Get the current value of a counter.
   *
   * @param name - Counter name
   * @returns Current count, or 0 if never incremented
   *
   * @example
   * ```typescript
   * const totalServed = stats.getCount('customers-served');
   * ```
   */
  getCount(name: string): number {
    return this.counters.get(name) || 0;
  }

  /**
   * Enable timeseries recording for a metric.
   * When enabled, every recordValue() call will store a TimePoint.
   *
   * @param name - Metric name
   *
   * @example
   * ```typescript
   * stats.enableTimeseries('queue-length');
   * stats.recordValue('queue-length', 5); // Stored as TimePoint
   * ```
   */
  enableTimeseries(name: string): void {
    this.recordTimeseries.add(name);
  }

  /**
   * Disable timeseries recording for a metric.
   *
   * @param name - Metric name
   */
  disableTimeseries(name: string): void {
    this.recordTimeseries.delete(name);
  }

  /**
   * Get the timeseries data for a metric.
   *
   * @param name - Metric name
   * @returns Array of time points, or empty array if no data
   *
   * @example
   * ```typescript
   * const queueHistory = stats.getTimeseries('queue-length');
   * for (const point of queueHistory) {
   *   console.log(`Time ${point.time}: ${point.value}`);
   * }
   * ```
   */
  getTimeseries(name: string): TimePoint[] {
    return this.timeseries.get(name) || [];
  }

  /**
   * Export all statistics to a JSON object.
   *
   * @returns Object containing averages, counts, timeseries data, and sample statistics
   *
   * @example
   * ```typescript
   * const data = stats.toJSON();
   * console.log(JSON.stringify(data, null, 2));
   * ```
   */
  toJSON(): object {
    const result: Record<string, unknown> = {
      simulationTime: this.simulation.now,
      averages: {},
      counters: {},
      timeseries: {},
      samples: {},
    };

    // Collect all averages
    for (const name of this.values.keys()) {
      (result.averages as Record<string, number>)[name] = this.getAverage(name);
    }

    // Collect all counters
    for (const [name, count] of this.counters.entries()) {
      (result.counters as Record<string, number>)[name] = count;
    }

    // Collect all timeseries
    for (const [name, points] of this.timeseries.entries()) {
      (result.timeseries as Record<string, TimePoint[]>)[name] = points;
    }

    // Collect sample statistics
    for (const name of this.samples.keys()) {
      (result.samples as Record<string, unknown>)[name] = {
        count: this.getSampleCount(name),
        mean: this.getSampleMean(name),
        min: this.getMin(name),
        max: this.getMax(name),
        variance: this.getVariance(name),
        stdDev: this.getStdDev(name),
        p50: this.getPercentile(name, 50),
        p95: this.getPercentile(name, 95),
        p99: this.getPercentile(name, 99),
      };
    }

    return result;
  }

  /**
   * Export all statistics to CSV format.
   * Generates separate sections for averages, counters, timeseries, and sample statistics.
   *
   * @returns CSV-formatted string
   *
   * @example
   * ```typescript
   * const csv = stats.toCSV();
   * fs.writeFileSync('results.csv', csv);
   * ```
   */
  toCSV(): string {
    const lines: string[] = [];

    // Simulation info
    lines.push('# Simulation Statistics');
    lines.push(`Simulation Time,${this.simulation.now}`);
    lines.push('');

    // Averages section
    if (this.values.size > 0) {
      lines.push('# Time-Weighted Averages');
      lines.push('Metric,Average');
      for (const name of this.values.keys()) {
        lines.push(`${csvCell(name)},${this.getAverage(name)}`);
      }
      lines.push('');
    }

    // Counters section
    if (this.counters.size > 0) {
      lines.push('# Counters');
      lines.push('Metric,Count');
      for (const [name, count] of this.counters.entries()) {
        lines.push(`${csvCell(name)},${count}`);
      }
      lines.push('');
    }

    // Sample statistics section
    if (this.samples.size > 0) {
      lines.push('# Sample Statistics');
      lines.push('Metric,Count,Mean,Min,Max,Variance,StdDev,P50,P95,P99');
      for (const name of this.samples.keys()) {
        const count = this.getSampleCount(name);
        const mean = this.getSampleMean(name);
        const min = this.getMin(name);
        const max = this.getMax(name);
        const variance = this.getVariance(name);
        const stdDev = this.getStdDev(name);
        const p50 = this.getPercentile(name, 50);
        const p95 = this.getPercentile(name, 95);
        const p99 = this.getPercentile(name, 99);
        lines.push(
          `${csvCell(name)},${count},${mean},${min},${max},${variance},${stdDev},${p50},${p95},${p99}`
        );
      }
      lines.push('');
    }

    // Timeseries section
    if (this.timeseries.size > 0) {
      for (const [name, points] of this.timeseries.entries()) {
        lines.push(`# Timeseries: ${csvCell(name)}`);
        lines.push('Time,Value');
        for (const point of points) {
          lines.push(`${point.time},${point.value}`);
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Reset all statistics.
   * Clears all recorded data but preserves timeseries settings.
   */
  reset(): void {
    this.values.clear();
    this.valueSums.clear();
    this.lastUpdateTimes.clear();
    this.counters.clear();
    this.timeseries.clear();
    this.samples.clear();
    // Clear Welford's algorithm state
    this.sampleCounts.clear();
    this.sampleMeans.clear();
    this.sampleM2s.clear();
    // Clear caches
    this.sortedSamplesCache.clear();
    this.minCache.clear();
    this.maxCache.clear();
    this.histogramCache.clear();
    // Keep recordTimeseries and trackSamples settings
  }

  /**
   * Enable sample tracking for a metric.
   * When enabled, raw sample values are stored for percentile, variance, and histogram calculations.
   * Note: This can use significant memory for metrics with many samples.
   *
   * @param name - Metric name
   * @param options - `maxSamples` bounds memory with reservoir sampling
   *
   * @example
   * ```typescript
   * stats.enableSampleTracking('wait-time');
   * stats.recordSample('wait-time', 5.2);
   * stats.recordSample('wait-time', 3.1);
   * const p95 = stats.getPercentile('wait-time', 95);
   *
   * // Long run: keep a 10k-sample reservoir, percentiles become estimates
   * stats.enableSampleTracking('queue-wait', { maxSamples: 10_000 });
   * ```
   */
  enableSampleTracking(
    name: string,
    options: SampleTrackingOptions = {}
  ): void {
    if (options.maxSamples !== undefined) {
      if (!Number.isInteger(options.maxSamples) || options.maxSamples < 2) {
        throw new ValidationError(
          `maxSamples must be an integer of at least 2 (got ${String(options.maxSamples)})`,
          { maxSamples: options.maxSamples }
        );
      }
      this.reservoirLimits.set(name, options.maxSamples);
    } else {
      this.reservoirLimits.delete(name);
    }
    this.trackSamples.add(name);
    if (!this.samples.has(name)) {
      this.samples.set(name, []);
    }
  }

  /**
   * True when percentiles and histograms for this metric come from a
   * reservoir rather than from every sample.
   */
  isSampleReservoir(name: string): boolean {
    const limit = this.reservoirLimits.get(name);
    return limit !== undefined && (this.sampleCounts.get(name) ?? 0) > limit;
  }

  /**
   * Disable sample tracking for a metric.
   *
   * @param name - Metric name
   */
  disableSampleTracking(name: string): void {
    this.trackSamples.delete(name);
  }

  /**
   * Record a sample value for percentile and variance calculations.
   * Sample tracking must be enabled for this metric first.
   *
   * @param name - Metric name
   * @param value - Sample value
   *
   * @example
   * ```typescript
   * stats.enableSampleTracking('response-time');
   * stats.recordSample('response-time', 1.5);
   * stats.recordSample('response-time', 2.3);
   * const p99 = stats.getPercentile('response-time', 99);
   * ```
   */
  recordSample(name: string, value: number): void {
    // Validate metric name
    if (!name || name.trim() === '') {
      throw new ValidationError('Metric name cannot be empty', { name });
    }
    // Validate value
    validateFinite(value, 'value', 'Sample values must be valid numbers');

    if (!this.trackSamples.has(name)) {
      return; // Silently ignore if not tracking samples for this metric
    }

    // Store raw sample (for percentiles and histograms), or a reservoir of them
    if (!this.samples.has(name)) {
      this.samples.set(name, []);
    }
    const stored = this.samples.get(name)!;
    const limit = this.reservoirLimits.get(name);
    if (limit === undefined || stored.length < limit) {
      stored.push(value);
    } else {
      // Algorithm R: the k-th sample (0-based count seen so far) replaces a
      // random slot with probability limit / (k + 1)
      const seen = this.sampleCounts.get(name) ?? 0;
      const slot = this.reservoir().randint(0, seen);
      if (slot < limit) {
        stored[slot] = value;
      }
    }

    // Update Welford's algorithm statistics (for mean and variance)
    const count = (this.sampleCounts.get(name) || 0) + 1;
    const oldMean = this.sampleMeans.get(name) || 0;
    const oldM2 = this.sampleM2s.get(name) || 0;

    // Welford's online algorithm:
    // delta = value - oldMean
    // mean = oldMean + delta / count
    // M2 = M2 + delta * (value - mean)
    const delta = value - oldMean;
    const newMean = oldMean + delta / count;
    const delta2 = value - newMean;
    const newM2 = oldM2 + delta * delta2;

    this.sampleCounts.set(name, count);
    this.sampleMeans.set(name, newMean);
    this.sampleM2s.set(name, newM2);

    // Update cached min/max values incrementally (O(1) instead of O(n))
    const currentMin = this.minCache.get(name);
    if (currentMin === undefined || value < currentMin) {
      this.minCache.set(name, value);
    }

    const currentMax = this.maxCache.get(name);
    if (currentMax === undefined || value > currentMax) {
      this.maxCache.set(name, value);
    }

    // Invalidate caches that depend on sorted order
    this.sortedSamplesCache.delete(name);
    this.histogramCache.delete(name);
  }

  /**
   * Generator for reservoir sampling, derived from the simulation's own
   * generator so runs stay reproducible.
   * @private
   */
  private reservoir(): Random {
    if (!this.reservoirRng) {
      this.reservoirRng = this.simulation.random.stream('statistics-reservoir');
    }
    return this.reservoirRng;
  }

  /**
   * Get the specified percentile of a metric.
   * Sample tracking must be enabled for this metric.
   *
   * @param name - Metric name
   * @param percentile - Percentile to calculate (0-100)
   * @returns Percentile value, or 0 if no samples
   *
   * @example
   * ```typescript
   * const p50 = stats.getPercentile('wait-time', 50);  // Median
   * const p95 = stats.getPercentile('wait-time', 95);
   * const p99 = stats.getPercentile('wait-time', 99);
   * ```
   */
  getPercentile(name: string, percentile: number): number {
    // Validate percentile range
    validateFinite(
      percentile,
      'percentile',
      'Percentile must be a valid number'
    );
    if (percentile < 0 || percentile > 100) {
      throw new ValidationError(
        'Percentile must be between 0 and 100 (got ' + percentile + ')',
        { percentile }
      );
    }

    const sampleData = this.samples.get(name);
    if (!sampleData || sampleData.length === 0) {
      return 0;
    }

    // Use cached sorted array if available
    let sorted = this.sortedSamplesCache.get(name);
    if (!sorted) {
      // Sort samples (copy to avoid mutating original)
      sorted = [...sampleData].sort((a, b) => a - b);
      this.sortedSamplesCache.set(name, sorted);
    }

    // Calculate percentile index
    const index = (percentile / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);

    // Interpolate if between two values
    if (lower === upper) {
      return sorted[lower]!;
    }

    const lowerValue = sorted[lower]!;
    const upperValue = sorted[upper]!;
    const fraction = index - lower;

    return lowerValue + (upperValue - lowerValue) * fraction;
  }

  /**
   * Get the variance of a metric using Welford's online algorithm.
   * Sample tracking must be enabled for this metric.
   * Uses O(1) computation based on incrementally updated statistics.
   *
   * @param name - Metric name
   * @returns Variance, or 0 if no samples
   *
   * @example
   * ```typescript
   * const variance = stats.getVariance('wait-time');
   * ```
   */
  getVariance(name: string): number {
    const count = this.sampleCounts.get(name);
    const m2 = this.sampleM2s.get(name);

    if (!count || count === 0 || m2 === undefined) {
      return 0;
    }

    // Population variance: M2 / n
    return m2 / count;
  }

  /**
   * Get the standard deviation of a metric.
   * Sample tracking must be enabled for this metric.
   *
   * @param name - Metric name
   * @returns Standard deviation, or 0 if no samples
   *
   * @example
   * ```typescript
   * const stdDev = stats.getStdDev('wait-time');
   * ```
   */
  getStdDev(name: string): number {
    return Math.sqrt(this.getVariance(name));
  }

  /**
   * Get the minimum value of a metric.
   * Sample tracking must be enabled for this metric.
   * Uses O(1) cached value updated incrementally.
   *
   * @param name - Metric name
   * @returns Minimum value, or 0 if no samples
   */
  getMin(name: string): number {
    const sampleData = this.samples.get(name);
    if (!sampleData || sampleData.length === 0) {
      return 0;
    }

    // Use cached min value (updated incrementally in recordSample)
    const cachedMin = this.minCache.get(name);
    if (cachedMin !== undefined) {
      return cachedMin;
    }

    // If cache miss (shouldn't happen normally), compute and cache
    const min = Math.min(...sampleData);
    this.minCache.set(name, min);
    return min;
  }

  /**
   * Get the maximum value of a metric.
   * Sample tracking must be enabled for this metric.
   * Uses O(1) cached value updated incrementally.
   *
   * @param name - Metric name
   * @returns Maximum value, or 0 if no samples
   */
  getMax(name: string): number {
    const sampleData = this.samples.get(name);
    if (!sampleData || sampleData.length === 0) {
      return 0;
    }

    // Use cached max value (updated incrementally in recordSample)
    const cachedMax = this.maxCache.get(name);
    if (cachedMax !== undefined) {
      return cachedMax;
    }

    // If cache miss (shouldn't happen normally), compute and cache
    const max = Math.max(...sampleData);
    this.maxCache.set(name, max);
    return max;
  }

  /**
   * Get the sample mean (arithmetic average) of a metric.
   * Sample tracking must be enabled for this metric.
   * Uses O(1) computation based on Welford's incrementally updated mean.
   *
   * @param name - Metric name
   * @returns Mean value, or 0 if no samples
   */
  getSampleMean(name: string): number {
    const mean = this.sampleMeans.get(name);
    return mean !== undefined ? mean : 0;
  }

  /**
   * Get the number of samples recorded for a metric.
   * Sample tracking must be enabled for this metric.
   * Uses O(1) computation based on incrementally updated count.
   *
   * @param name - Metric name
   * @returns Number of samples
   */
  getSampleCount(name: string): number {
    return this.sampleCounts.get(name) || 0;
  }

  /**
   * Get several percentiles of a metric in one call. The samples are sorted
   * once (and cached), so this is cheaper than repeated getPercentile() calls.
   *
   * @param name - Metric name
   * @param percentiles - Percentiles to compute (each 0-100)
   * @returns Map from percentile to value, e.g. `{ 50: 3.1, 95: 10.2 }`
   *
   * @example
   * ```typescript
   * const { 50: median, 95: p95, 99: p99 } = stats.getPercentiles('wait-time', [50, 95, 99]);
   * ```
   */
  getPercentiles(
    name: string,
    percentiles: readonly number[]
  ): Record<number, number> {
    const result: Record<number, number> = {};
    for (const p of percentiles) {
      result[p] = this.getPercentile(name, p);
    }
    return result;
  }

  /**
   * Confidence interval for the mean of a sample-tracked metric, using the
   * Student's t distribution with n - 1 degrees of freedom and the sample
   * standard deviation (n - 1 denominator).
   *
   * The interval assumes independent observations. Within a single run, waits
   * of consecutive customers are usually correlated, which makes this interval
   * too narrow; use {@link Statistics.getBatchMeansCI} for such time series, or
   * compute the interval across independent replications.
   *
   * With fewer than two samples the interval is unbounded
   * (`halfWidth = Infinity`).
   *
   * @param name - Metric name
   * @param confidence - Confidence level in (0, 1), default 0.95
   *
   * @example
   * ```typescript
   * const ci = stats.getConfidenceInterval('wait-time', 0.95);
   * console.log(`${ci.mean.toFixed(2)} +/- ${ci.halfWidth.toFixed(2)}`);
   * ```
   */
  getConfidenceInterval(
    name: string,
    confidence: number = 0.95
  ): ConfidenceInterval {
    this.validateConfidence(confidence);

    const n = this.getSampleCount(name);
    const mean = this.getSampleMean(name);

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

    const m2 = this.sampleM2s.get(name) ?? 0;
    const sampleVariance = m2 / (n - 1);
    const stdError = Math.sqrt(sampleVariance / n);
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

  /**
   * Confidence interval for the mean using the method of batch means.
   *
   * The recorded samples are split, in recording order, into `batches`
   * contiguous batches of equal size (any remainder at the end is dropped).
   * Batch means of a stationary process are approximately independent and
   * normal, so a t interval over them is valid even when individual samples
   * are autocorrelated (queue waits, inventory levels, ...).
   *
   * @param name - Metric name
   * @param options - Number of batches (default 20) and confidence (default 0.95)
   * @throws ValidationError if there are fewer samples than batches
   *
   * @example
   * ```typescript
   * const ci = stats.getBatchMeansCI('queue-wait', { batches: 20 });
   * ```
   */
  getBatchMeansCI(
    name: string,
    options: BatchMeansOptions = {}
  ): BatchMeansResult {
    const batches = options.batches ?? 20;
    const confidence = options.confidence ?? 0.95;
    this.validateConfidence(confidence);
    if (!Number.isInteger(batches) || batches < 2) {
      throw new ValidationError(
        'batches must be an integer of at least 2 (got ' + batches + ')',
        { batches }
      );
    }

    if (this.isSampleReservoir(name)) {
      throw new ValidationError(
        `Batch means need every sample in recording order, but '${name}' keeps a reservoir (maxSamples). Track it without maxSamples for batch means.`,
        { metric: name }
      );
    }
    const sampleData = this.samples.get(name) ?? [];
    if (sampleData.length < batches) {
      throw new ValidationError(
        `Not enough samples for ${batches} batches (got ${sampleData.length}). ` +
          'Record more samples or use fewer batches.',
        { samples: sampleData.length, batches }
      );
    }

    const batchSize = Math.floor(sampleData.length / batches);
    const batchMeans: number[] = [];
    for (let b = 0; b < batches; b++) {
      let sum = 0;
      const start = b * batchSize;
      for (let i = start; i < start + batchSize; i++) {
        sum += sampleData[i]!;
      }
      batchMeans.push(sum / batchSize);
    }

    const mean = batchMeans.reduce((a, b) => a + b, 0) / batches;
    const sumSq = batchMeans.reduce((acc, m) => acc + (m - mean) ** 2, 0);
    const stdError = Math.sqrt(sumSq / (batches - 1) / batches);
    const halfWidth = studentTCritical(confidence, batches - 1) * stdError;

    return {
      mean,
      lower: mean - halfWidth,
      upper: mean + halfWidth,
      halfWidth,
      stdError,
      confidence,
      n: batches * batchSize,
      batches,
      batchSize,
      batchMeans,
    };
  }

  /**
   * One-call summary of a sample-tracked metric: count, mean, spread, extremes,
   * common percentiles and a confidence interval for the mean.
   *
   * @param name - Metric name
   * @param confidence - Confidence level for the interval (default 0.95)
   *
   * @example
   * ```typescript
   * const s = stats.getSummary('wait-time');
   * console.log(`n=${s.n} mean=${s.mean.toFixed(2)} p95=${s.p95.toFixed(2)} ` +
   *             `95% CI [${s.ci.lower.toFixed(2)}, ${s.ci.upper.toFixed(2)}]`);
   * ```
   */
  getSummary(name: string, confidence: number = 0.95): SummaryStatistics {
    const {
      50: p50,
      95: p95,
      99: p99,
    } = this.getPercentiles(name, [50, 95, 99]);
    return {
      n: this.getSampleCount(name),
      mean: this.getSampleMean(name),
      stdDev: this.getStdDev(name),
      variance: this.getVariance(name),
      min: this.getMin(name),
      max: this.getMax(name),
      p50: p50!,
      p95: p95!,
      p99: p99!,
      ci: this.getConfidenceInterval(name, confidence),
    };
  }

  /**
   * @private
   */
  private validateConfidence(confidence: number): void {
    if (!(confidence > 0 && confidence < 1)) {
      throw new ValidationError(
        'confidence must be strictly between 0 and 1, e.g. 0.95 (got ' +
          confidence +
          ')',
        { confidence }
      );
    }
  }

  /**
   * Generate a histogram for a metric.
   * Sample tracking must be enabled for this metric.
   * Results are cached per bin count for performance.
   *
   * @param name - Metric name
   * @param bins - Number of bins (default: 10)
   * @returns Array of histogram bins
   *
   * @example
   * ```typescript
   * const histogram = stats.getHistogram('wait-time', 10);
   * for (const bin of histogram) {
   *   console.log(`${bin.min}-${bin.max}: ${bin.count} (${(bin.frequency * 100).toFixed(1)}%)`);
   * }
   * ```
   */
  getHistogram(name: string, bins = 10): HistogramBin[] {
    // Validate bins
    validateFinite(bins, 'bins', 'Number of bins must be a valid number');
    if (bins < 1) {
      throw new ValidationError(
        'Number of bins must be at least 1 (got ' + bins + ')',
        {
          bins,
        }
      );
    }
    if (!Number.isInteger(bins)) {
      throw new ValidationError(
        'Number of bins must be an integer (got ' + bins + ')',
        {
          bins,
        }
      );
    }

    const sampleData = this.samples.get(name);
    if (!sampleData || sampleData.length === 0) {
      return [];
    }

    // Check cache for this metric and bin count
    if (!this.histogramCache.has(name)) {
      this.histogramCache.set(name, new Map());
    }
    const metricCache = this.histogramCache.get(name)!;
    const cachedHistogram = metricCache.get(bins);
    if (cachedHistogram) {
      return cachedHistogram;
    }

    // Use cached min/max values (O(1) instead of O(n))
    const min = this.getMin(name);
    const max = this.getMax(name);
    const range = max - min;

    // Handle case where all values are the same (range = 0)
    if (range === 0) {
      const histogram = [
        {
          min,
          max,
          count: sampleData.length,
          frequency: 1.0,
        },
      ];
      metricCache.set(bins, histogram);
      return histogram;
    }

    const binWidth = range / bins;

    // Initialize bins
    const histogram: HistogramBin[] = [];
    for (let i = 0; i < bins; i++) {
      const binMin = min + i * binWidth;
      const binMax = i === bins - 1 ? max : binMin + binWidth;
      histogram.push({
        min: binMin,
        max: binMax,
        count: 0,
        frequency: 0,
      });
    }

    // Count samples in each bin
    for (const value of sampleData) {
      let binIndex = Math.floor((value - min) / binWidth);
      // Handle edge case where value === max
      if (binIndex >= bins) {
        binIndex = bins - 1;
      }
      histogram[binIndex]!.count++;
    }

    // Calculate frequencies
    const totalSamples = sampleData.length;
    for (const bin of histogram) {
      bin.frequency = bin.count / totalSamples;
    }

    // Cache the result
    metricCache.set(bins, histogram);
    return histogram;
  }
}
