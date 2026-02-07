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
   * @returns Object containing averages, counts, and timeseries data
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

    return result;
  }

  /**
   * Export all statistics to CSV format.
   * Generates separate sections for averages, counters, and timeseries.
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
    // Keep recordTimeseries settings
  }
}
