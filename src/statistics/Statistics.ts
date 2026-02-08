import { Simulation } from '../core/Simulation.js';

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
  private simulation: Simulation;

  // Time-weighted averages
  private values: Map<string, number> = new Map(); // Current values
  private valueSums: Map<string, number> = new Map(); // Time-weighted sums
  private lastUpdateTimes: Map<string, number> = new Map(); // Last update time

  // Counters
  private counters: Map<string, number> = new Map();

  // Timeseries
  private timeseries: Map<string, TimePoint[]> = new Map();
  private recordTimeseries: Set<string> = new Set(); // Which metrics to record as timeseries

  // Sample tracking (for percentiles, variance, histograms)
  private samples: Map<string, number[]> = new Map(); // Raw sample values
  private trackSamples: Set<string> = new Set(); // Which metrics to track samples for

  /**
   * Create a new statistics collector.
   *
   * @param simulation - The simulation instance to track time from
   */
  constructor(simulation: Simulation) {
    this.simulation = simulation;
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
    const currentTime = this.simulation.now;

    // If this metric was previously recorded, accumulate the time-weighted sum
    if (this.values.has(name)) {
      const previousValue = this.values.get(name)!;
      const previousTime = this.lastUpdateTimes.get(name)!;
      const timeDelta = currentTime - previousTime;

      const currentSum = this.valueSums.get(name) || 0;
      this.valueSums.set(name, currentSum + previousValue * timeDelta);
    }

    // Update current value and time
    this.values.set(name, value);
    this.lastUpdateTimes.set(name, currentTime);

    // Record timeseries if enabled for this metric
    if (this.recordTimeseries.has(name)) {
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

    // Add the contribution from the current value
    const timeDelta = currentTime - lastUpdateTime;
    const totalSum = previousSum + currentValue * timeDelta;

    // Avoid division by zero
    if (currentTime === 0) {
      return currentValue;
    }

    return totalSum / currentTime;
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
      averages: {} as Record<string, number>,
      counters: {} as Record<string, number>,
      timeseries: {} as Record<string, TimePoint[]>,
      samples: {} as Record<string, unknown>,
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
        lines.push(`${name},${this.getAverage(name)}`);
      }
      lines.push('');
    }

    // Counters section
    if (this.counters.size > 0) {
      lines.push('# Counters');
      lines.push('Metric,Count');
      for (const [name, count] of this.counters.entries()) {
        lines.push(`${name},${count}`);
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
          `${name},${count},${mean},${min},${max},${variance},${stdDev},${p50},${p95},${p99}`
        );
      }
      lines.push('');
    }

    // Timeseries section
    if (this.timeseries.size > 0) {
      for (const [name, points] of this.timeseries.entries()) {
        lines.push(`# Timeseries: ${name}`);
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
    // Keep recordTimeseries and trackSamples settings
  }

  /**
   * Enable sample tracking for a metric.
   * When enabled, raw sample values are stored for percentile, variance, and histogram calculations.
   * Note: This can use significant memory for metrics with many samples.
   *
   * @param name - Metric name
   *
   * @example
   * ```typescript
   * stats.enableSampleTracking('wait-time');
   * stats.recordSample('wait-time', 5.2);
   * stats.recordSample('wait-time', 3.1);
   * const p95 = stats.getPercentile('wait-time', 95);
   * ```
   */
  enableSampleTracking(name: string): void {
    this.trackSamples.add(name);
    if (!this.samples.has(name)) {
      this.samples.set(name, []);
    }
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
    if (!this.trackSamples.has(name)) {
      return; // Silently ignore if not tracking samples for this metric
    }

    if (!this.samples.has(name)) {
      this.samples.set(name, []);
    }

    this.samples.get(name)!.push(value);
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
    const sampleData = this.samples.get(name);
    if (!sampleData || sampleData.length === 0) {
      return 0;
    }

    // Sort samples (copy to avoid mutating original)
    const sorted = [...sampleData].sort((a, b) => a - b);

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
   * Get the variance of a metric.
   * Sample tracking must be enabled for this metric.
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
    const sampleData = this.samples.get(name);
    if (!sampleData || sampleData.length === 0) {
      return 0;
    }

    // Calculate mean
    const mean = sampleData.reduce((sum, val) => sum + val, 0) / sampleData.length;

    // Calculate variance
    const squaredDiffs = sampleData.map((val) => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / sampleData.length;

    return variance;
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
   *
   * @param name - Metric name
   * @returns Minimum value, or 0 if no samples
   */
  getMin(name: string): number {
    const sampleData = this.samples.get(name);
    if (!sampleData || sampleData.length === 0) {
      return 0;
    }
    return Math.min(...sampleData);
  }

  /**
   * Get the maximum value of a metric.
   * Sample tracking must be enabled for this metric.
   *
   * @param name - Metric name
   * @returns Maximum value, or 0 if no samples
   */
  getMax(name: string): number {
    const sampleData = this.samples.get(name);
    if (!sampleData || sampleData.length === 0) {
      return 0;
    }
    return Math.max(...sampleData);
  }

  /**
   * Get the sample mean (arithmetic average) of a metric.
   * Sample tracking must be enabled for this metric.
   *
   * @param name - Metric name
   * @returns Mean value, or 0 if no samples
   */
  getSampleMean(name: string): number {
    const sampleData = this.samples.get(name);
    if (!sampleData || sampleData.length === 0) {
      return 0;
    }
    return sampleData.reduce((sum, val) => sum + val, 0) / sampleData.length;
  }

  /**
   * Get the number of samples recorded for a metric.
   * Sample tracking must be enabled for this metric.
   *
   * @param name - Metric name
   * @returns Number of samples
   */
  getSampleCount(name: string): number {
    const sampleData = this.samples.get(name);
    return sampleData ? sampleData.length : 0;
  }

  /**
   * Generate a histogram for a metric.
   * Sample tracking must be enabled for this metric.
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
    const sampleData = this.samples.get(name);
    if (!sampleData || sampleData.length === 0) {
      return [];
    }

    const min = Math.min(...sampleData);
    const max = Math.max(...sampleData);
    const range = max - min;

    // Handle case where all values are the same (range = 0)
    if (range === 0) {
      return [
        {
          min,
          max,
          count: sampleData.length,
          frequency: 1.0,
        },
      ];
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

    return histogram;
  }
}
