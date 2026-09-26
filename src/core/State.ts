import { Simulation } from './Simulation.js';
import { Process } from './Process.js';
import { ValidationError, validateName } from '../utils/validation.js';

/**
 * Token returned by state.waitUntil() to be yielded in process generators.
 * Resolves as soon as the predicate holds, re-evaluated on every set().
 */
export class StateWaitRequest<T> {
  /** The value that satisfied the predicate (set when the wait completes) */
  public value?: T;

  constructor(
    public readonly state: State<T>,
    public readonly predicate: (value: T) => boolean
  ) {
    if (typeof predicate !== 'function') {
      throw new ValidationError('waitUntil() needs a predicate function', {
        predicate: typeof predicate,
      });
    }
  }
}

interface Waiter<T> {
  predicate: (value: T) => boolean;
  callback: (value: T) => void;
  process?: Process;
}

/**
 * Options for {@link State}.
 */
export interface StateOptions {
  /** Name for tracing and errors */
  name?: string;
  /**
   * Keep time-weighted statistics of the value: for numbers, `averageValue`;
   * for any value, `timeIn(value)`. Default false.
   */
  trackTime?: boolean;
}

/**
 * A value that processes can wait on. Unlike `waitFor()`, which polls,
 * `waitUntil()` is evaluated only when the value changes, so waiters resume
 * exactly at the `set()` that satisfies them and no polling events are created.
 *
 * @template T - Type of the value
 *
 * @example
 * ```typescript
 * const doorOpen = new State(sim, false);
 * const stock = new State(sim, 0, { trackTime: true });
 *
 * function* forklift() {
 *   yield* doorOpen.until((open) => open);          // resumes on set(true)
 *   const level = yield* stock.until((n) => n >= 10); // resumes when stock reaches 10
 * }
 *
 * function* controller() {
 *   yield* timeout(5);
 *   doorOpen.set(true);
 *   stock.set(stock.value + 12);
 * }
 * ```
 */
export class State<T> {
  private readonly simulation: Simulation;
  private current: T;
  private waiters: Waiter<T>[] = [];
  private readonly options: { name: string; trackTime: boolean };

  // Time-weighted statistics
  private lastChangeTime: number;
  private numericSum = 0;
  private trackedTime = 0;
  private readonly timeInValue = new Map<T, number>();
  private changeCount = 0;

  /**
   * @param simulation - The simulation this state belongs to
   * @param initial - Initial value
   * @param options - Name and statistics options
   */
  constructor(simulation: Simulation, initial: T, options: StateOptions = {}) {
    if (options.name !== undefined) {
      validateName(options.name, 'name');
    }
    this.simulation = simulation;
    this.current = initial;
    this.options = {
      name: options.name ?? 'State',
      trackTime: options.trackTime ?? false,
    };
    this.lastChangeTime = simulation.now;
  }

  /** Current value */
  get value(): T {
    return this.current;
  }

  /** Name */
  get name(): string {
    return this.options.name;
  }

  /** Number of processes currently waiting on this state */
  get waitingCount(): number {
    return this.waiters.length;
  }

  /** How many times set() changed the value */
  get changes(): number {
    return this.changeCount;
  }

  /**
   * Set a new value. Every waiter whose predicate now holds is resumed (in
   * FIFO order) at the current simulation time. Setting the same value again
   * still re-evaluates waiters but does not count as a change.
   */
  set(value: T): void {
    this.accumulateTime();
    if (value !== this.current) {
      this.changeCount++;
    }
    this.current = value;

    if (this.waiters.length === 0) return;
    const remaining: Waiter<T>[] = [];
    const satisfied: Waiter<T>[] = [];
    for (const waiter of this.waiters) {
      if (waiter.predicate(value)) {
        satisfied.push(waiter);
      } else {
        remaining.push(waiter);
      }
    }
    this.waiters = remaining;
    for (const waiter of satisfied) {
      // Scheduled so a generator is never resumed while another is running
      this.simulation.schedule(0, () => waiter.callback(value));
    }
  }

  /**
   * Apply a function to the current value and set the result.
   *
   * @example
   * ```typescript
   * stock.update((n) => n - 1);
   * ```
   */
  update(fn: (current: T) => T): void {
    if (typeof fn !== 'function') {
      throw new ValidationError('update() needs a function', { fn: typeof fn });
    }
    this.set(fn(this.current));
  }

  /**
   * Request to wait until the predicate holds. Yield the returned token; it
   * resolves immediately if the predicate already holds. Works inside anyOf()
   * and allOf(); cancelled cleanly on interrupt.
   */
  waitUntil(predicate: (value: T) => boolean): StateWaitRequest<T> {
    return new StateWaitRequest(this, predicate);
  }

  /**
   * Wait until the predicate holds and return the value that satisfied it.
   * Use with yield*.
   */
  *until(
    predicate: (value: T) => boolean
  ): Generator<StateWaitRequest<T>, T, void> {
    const request = this.waitUntil(predicate);
    yield request;
    return request.value as T;
  }

  /**
   * Time-weighted average of a numeric state (requires `trackTime: true`).
   */
  get averageValue(): number {
    this.requireTracking('averageValue');
    if (typeof this.current !== 'number') {
      throw new ValidationError(
        `averageValue needs a numeric state (current value is ${typeof this.current})`,
        { name: this.options.name }
      );
    }
    const elapsed = this.simulation.now - this.lastChangeTime;
    const total = this.trackedTime + elapsed;
    if (total === 0) return this.current;
    return (this.numericSum + this.current * elapsed) / total;
  }

  /**
   * Total simulation time the state has spent equal to `value`
   * (requires `trackTime: true`).
   */
  timeIn(value: T): number {
    this.requireTracking('timeIn');
    const recorded = this.timeInValue.get(value) ?? 0;
    return value === this.current
      ? recorded + (this.simulation.now - this.lastChangeTime)
      : recorded;
  }

  /**
   * @internal
   */
  _addWaiter(
    predicate: (value: T) => boolean,
    callback: (value: T) => void,
    process?: Process
  ): void {
    if (predicate(this.current)) {
      // Already satisfied: resume at the current time, but not synchronously
      this.simulation.schedule(0, () => callback(this.current));
      return;
    }
    this.waiters.push({ predicate, callback, process });
  }

  /**
   * @internal
   */
  _removeWaiter(callback: (value: T) => void): boolean {
    const index = this.waiters.findIndex((w) => w.callback === callback);
    if (index === -1) return false;
    this.waiters.splice(index, 1);
    return true;
  }

  private accumulateTime(): void {
    if (!this.options.trackTime) return;
    const now = this.simulation.now;
    const elapsed = now - this.lastChangeTime;
    if (elapsed > 0) {
      this.trackedTime += elapsed;
      if (typeof this.current === 'number') {
        this.numericSum += this.current * elapsed;
      }
      this.timeInValue.set(
        this.current,
        (this.timeInValue.get(this.current) ?? 0) + elapsed
      );
    }
    this.lastChangeTime = now;
  }

  private requireTracking(what: string): void {
    if (!this.options.trackTime) {
      throw new ValidationError(
        `${what} requires the state to be created with { trackTime: true }`,
        { name: this.options.name }
      );
    }
  }
}
