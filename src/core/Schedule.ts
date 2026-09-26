import { Simulation } from './Simulation.js';
import { Process, Timeout } from './Process.js';
import { ValidationError, validateFinite } from '../utils/validation.js';

/**
 * One piece of a schedule: `value` applies for times in [from, to).
 */
export interface ScheduleSegment<T> {
  /** Start of the segment (inclusive) */
  from: number;
  /** End of the segment (exclusive) */
  to: number;
  /** Value in force during the segment */
  value: T;
}

/**
 * Options for {@link Schedule}.
 */
export interface ScheduleOptions<T> {
  /** Non-overlapping segments; they may be given in any order */
  segments: readonly ScheduleSegment<T>[];
  /**
   * Length of one cycle. When set, the schedule repeats every `period` time
   * units and every segment must lie within [0, period]. When omitted the
   * schedule runs once and holds the last segment's value afterwards.
   */
  period?: number;
  /**
   * Value returned for times not covered by any segment (gaps, or before the
   * first segment of a non-periodic schedule). Without it, such lookups throw.
   */
  defaultValue?: T;
}

/**
 * Options for {@link Schedule.onChange}.
 */
export interface OnChangeOptions {
  /** Also call the handler immediately with the current value (default false) */
  immediate?: boolean;
}

/**
 * Time-varying parameter: a piecewise-constant value over simulation time,
 * optionally periodic (rush hours, shifts, seasons).
 *
 * @template T - Type of the value; use an object to bundle several parameters
 *
 * @example
 * ```typescript
 * const arrivalRate = new Schedule<number>(sim, {
 *   period: 24,
 *   segments: [
 *     { from: 0, to: 8, value: 0.5 },
 *     { from: 8, to: 12, value: 5 },
 *     { from: 12, to: 13, value: 2 },
 *     { from: 13, to: 17, value: 4 },
 *     { from: 17, to: 24, value: 0.5 },
 *   ],
 * });
 *
 * function* arrivals() {
 *   while (true) {
 *     yield* timeout(rng.exponential(1 / arrivalRate.current));
 *     sim.process(customer);
 *   }
 * }
 *
 * // Staffing follows a schedule
 * const staff = new Schedule<number>(sim, { period: 24, segments: [...] });
 * staff.onChange((n) => tellers.setCapacity(n), { immediate: true });
 * ```
 */
export class Schedule<T> {
  private readonly simulation: Simulation;
  private readonly segments: ScheduleSegment<T>[];
  private readonly period?: number;
  private readonly hasDefault: boolean;
  private readonly defaultValue?: T;
  /** Sorted, unique boundary times (segment starts and ends) */
  private readonly boundaries: number[];

  constructor(simulation: Simulation, options: ScheduleOptions<T>) {
    if (!options || !options.segments) {
      throw new ValidationError('Schedule requires a segments array', {
        options,
      });
    }
    if (options.segments.length === 0) {
      throw new ValidationError('Schedule needs at least one segment', {});
    }

    this.simulation = simulation;
    this.hasDefault = options.defaultValue !== undefined;
    this.defaultValue = options.defaultValue;

    if (options.period !== undefined) {
      validateFinite(
        options.period,
        'period',
        'Schedule period must be finite'
      );
      if (options.period <= 0) {
        throw new ValidationError('period must be positive', {
          period: options.period,
        });
      }
      this.period = options.period;
    }

    this.segments = options.segments.map((seg, i) => {
      validateFinite(seg.from, `segments[${i}].from`);
      validateFinite(seg.to, `segments[${i}].to`);
      if (seg.from < 0) {
        throw new ValidationError(`segments[${i}].from must be >= 0`, {
          segment: seg,
        });
      }
      if (seg.from >= seg.to) {
        throw new ValidationError(
          `segments[${i}]: from (${seg.from}) must be less than to (${seg.to})`,
          { segment: seg }
        );
      }
      if (this.period !== undefined && seg.to > this.period) {
        throw new ValidationError(
          `segments[${i}] ends at ${seg.to}, beyond the period ${this.period}`,
          { segment: seg, period: this.period }
        );
      }
      return { from: seg.from, to: seg.to, value: seg.value };
    });
    this.segments.sort((a, b) => a.from - b.from);

    for (let i = 1; i < this.segments.length; i++) {
      const prev = this.segments[i - 1]!;
      const cur = this.segments[i]!;
      if (cur.from < prev.to) {
        throw new ValidationError(
          `Schedule segments overlap: [${prev.from}, ${prev.to}) and [${cur.from}, ${cur.to})`,
          { first: prev, second: cur }
        );
      }
    }

    const set = new Set<number>();
    for (const seg of this.segments) {
      set.add(seg.from);
      set.add(seg.to);
    }
    this.boundaries = [...set].sort((a, b) => a - b);
  }

  /** True when the schedule repeats */
  get isPeriodic(): boolean {
    return this.period !== undefined;
  }

  /** Value in force at the current simulation time */
  get current(): T {
    return this.at(this.simulation.now);
  }

  /**
   * Value in force at an arbitrary time.
   *
   * @throws ValidationError for a time in a gap when no defaultValue is set
   */
  at(time: number): T {
    validateFinite(time, 'time');
    const local = this.localTime(time);

    for (const seg of this.segments) {
      if (local >= seg.from && local < seg.to) {
        return seg.value;
      }
      if (seg.from > local) break;
    }

    // Non-periodic schedules hold their last value after the final segment
    if (this.period === undefined) {
      const last = this.segments[this.segments.length - 1]!;
      if (local >= last.to) return last.value;
    }

    if (this.hasDefault) {
      return this.defaultValue as T;
    }
    throw new ValidationError(
      `No schedule segment covers time ${time}` +
        (this.period !== undefined ? ` (cycle time ${local})` : '') +
        '. Add a segment or set defaultValue.',
      { time, localTime: local }
    );
  }

  /**
   * Simulation time of the next segment boundary strictly after `time`.
   * Infinity when a non-periodic schedule has no boundary left.
   */
  nextChangeAfter(time: number): number {
    validateFinite(time, 'time');
    if (this.period === undefined) {
      for (const b of this.boundaries) {
        if (b > time) return b;
      }
      return Infinity;
    }

    const cycle = Math.floor(time / this.period);
    const local = time - cycle * this.period;
    for (const b of this.boundaries) {
      if (b > local) return cycle * this.period + b;
    }
    // Wrap to the first boundary of the next cycle (or the cycle start itself)
    const first = this.boundaries[0]!;
    return (cycle + 1) * this.period + (first === this.period ? 0 : first);
  }

  /** Simulation time of the next boundary after now (Infinity if none) */
  get nextChange(): number {
    return this.nextChangeAfter(this.simulation.now);
  }

  /** True while another boundary lies ahead */
  get hasMoreChanges(): boolean {
    return Number.isFinite(this.nextChange);
  }

  /**
   * Wait until the next segment boundary. Use with yield*; returns the value
   * then in force.
   *
   * @throws ValidationError if the schedule has no further boundary
   *
   * @example
   * ```typescript
   * while (staffing.hasMoreChanges) {
   *   const n = yield* staffing.waitForChange();
   *   tellers.setCapacity(n);
   * }
   * ```
   */
  *waitForChange(): Generator<Timeout, T, void> {
    const next = this.nextChange;
    if (!Number.isFinite(next)) {
      throw new ValidationError(
        'Schedule has no further changes to wait for (non-periodic schedule past its last segment)',
        { now: this.simulation.now }
      );
    }
    yield new Timeout(next - this.simulation.now);
    return this.current;
  }

  /**
   * Run a process that calls `handler` at every segment boundary with the
   * value then in force. Stops by itself when a non-periodic schedule runs
   * out of boundaries; interrupt the returned process to stop earlier.
   *
   * @param handler - Called with (value, time) at each boundary
   * @param options - `immediate: true` also calls it right away
   * @returns The driving process
   */
  onChange(
    handler: (value: T, time: number) => void,
    options: OnChangeOptions = {}
  ): Process {
    if (typeof handler !== 'function') {
      throw new ValidationError('handler must be a function', {
        handler: typeof handler,
      });
    }
    const current = (): T => this.current;
    const hasMore = (): boolean => this.hasMoreChanges;
    const wait = (): Generator<Timeout, T, void> => this.waitForChange();
    const sim = this.simulation;
    return sim.process(function* () {
      if (options.immediate) {
        handler(current(), sim.now);
      }
      while (hasMore()) {
        const value = yield* wait();
        handler(value, sim.now);
      }
    });
  }

  /** Map an absolute time into the cycle for periodic schedules */
  private localTime(time: number): number {
    if (this.period === undefined) return time;
    const local = time % this.period;
    return local < 0 ? local + this.period : local;
  }
}
