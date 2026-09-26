import { Simulation } from '../core/Simulation.js';
import { ValidationError, validateFinite } from '../utils/validation.js';
import type { TimePoint } from './Statistics.js';

/**
 * Options for the built-in monitors of Resource, Buffer, Store and Batch.
 */
export interface MonitorOptions {
  /**
   * Record at most one point per series per `every` time units. Without it,
   * every change is recorded. Use it to bound memory on long runs.
   */
  every?: number;
}

/**
 * History of a few numeric series over simulation time, recorded whenever the
 * owning object changes. Each point holds the value in force from `time` until
 * the next point (step function). The current value is appended when the
 * history is read, so the last point is always up to date.
 *
 * Obtain one through `new Resource(sim, n, { monitor: true }).history`.
 *
 * @example
 * ```typescript
 * const server = new Resource(sim, 2, { monitor: true });
 * sim.run(1000);
 * const queue = server.history!.series('queueLength'); // TimePoint[]
 * console.log(server.history!.toCSV());
 * ```
 */
export class Monitor {
  private readonly simulation: Simulation;
  private readonly getters: Record<string, () => number>;
  private readonly every?: number;
  private readonly data: Record<string, TimePoint[]> = {};
  private pendingTime?: number;

  /**
   * @internal Constructed by resources; not part of the public API surface.
   */
  constructor(
    simulation: Simulation,
    getters: Record<string, () => number>,
    options: MonitorOptions = {}
  ) {
    if (options.every !== undefined) {
      validateFinite(options.every, 'every', 'Monitor interval must be finite');
      if (options.every <= 0) {
        throw new ValidationError('every must be positive', {
          every: options.every,
        });
      }
    }
    this.simulation = simulation;
    this.getters = getters;
    this.every = options.every;
    for (const name of Object.keys(getters)) {
      this.data[name] = [];
    }
    // Initial values at construction time
    this.pendingTime = simulation.now;
  }

  /** Names of the recorded series */
  get names(): string[] {
    return Object.keys(this.getters);
  }

  /**
   * Points of one series, oldest first, including the current value.
   */
  series(name: string): TimePoint[] {
    const points = this.data[name];
    if (!points) {
      throw new ValidationError(
        `Unknown series '${name}'. Available: ${this.names.join(', ')}`,
        { name, available: this.names }
      );
    }
    this.flush();
    return [...points];
  }

  /**
   * All series as a plain object.
   */
  toJSON(): Record<string, TimePoint[]> {
    this.flush();
    const out: Record<string, TimePoint[]> = {};
    for (const name of this.names) out[name] = [...this.data[name]!];
    return out;
  }

  /**
   * CSV with one row per recorded time and one column per series. A series
   * without a point at a given time repeats its previous value.
   */
  toCSV(): string {
    this.flush();
    const times = new Set<number>();
    for (const name of this.names) {
      for (const p of this.data[name]!) times.add(p.time);
    }
    const sorted = [...times].sort((a, b) => a - b);
    const header = ['time', ...this.names].join(',');
    const cursors: Record<string, number> = {};
    const lastValue: Record<string, number | ''> = {};
    for (const name of this.names) {
      cursors[name] = 0;
      lastValue[name] = '';
    }
    const rows = sorted.map((t) => {
      const cells: (number | string)[] = [t];
      for (const name of this.names) {
        const points = this.data[name]!;
        while (
          cursors[name]! < points.length &&
          points[cursors[name]!]!.time <= t
        ) {
          lastValue[name] = points[cursors[name]!]!.value;
          cursors[name]!++;
        }
        cells.push(lastValue[name]!);
      }
      return cells.join(',');
    });
    return [header, ...rows].join('\n');
  }

  /**
   * Called by the owner at the start of every state change. The values after
   * the previous change are recorded now (nothing else could have changed
   * them in between), and a new pending change starts at the current time.
   * @internal
   */
  beforeChange(): void {
    this.flush();
    this.pendingTime = this.simulation.now;
  }

  /**
   * Record the values in force since the pending change time.
   * @private
   */
  private flush(): void {
    if (this.pendingTime === undefined) return;
    const time = this.pendingTime;
    this.pendingTime = undefined;
    for (const name of this.names) {
      const value = this.getters[name]!();
      const points = this.data[name]!;
      const last = points[points.length - 1];
      if (last && last.time === time) {
        // Several changes at the same instant: keep the final value
        last.value = value;
        continue;
      }
      if (last && last.value === value) continue;
      if (this.every !== undefined && last && time - last.time < this.every) {
        continue;
      }
      points.push({ time, value });
    }
  }
}

/**
 * Build a monitor from the `monitor` option shared by the resource classes.
 * @internal
 */
export function createMonitor(
  simulation: Simulation,
  option: boolean | MonitorOptions | undefined,
  getters: Record<string, () => number>
): Monitor | undefined {
  if (!option) return undefined;
  return new Monitor(simulation, getters, option === true ? {} : option);
}
