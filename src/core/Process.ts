import { Simulation } from './Simulation.js';
import { ResourceRequest } from '../resources/Resource.js';
import { BufferPutRequest, BufferGetRequest } from '../resources/Buffer.js';
import { StorePutRequest, StoreGetRequest } from '../resources/Store.js';
import { BatchPutRequest, BatchTakeRequest } from '../resources/Batch.js';
import { StateWaitRequest } from './State.js';
import { WaitKind } from './waitKind.js';
import { SimEventRequest } from './SimEvent.js';
import {
  ValidationError,
  validateNonNegative,
  validateProcessState,
  validateYieldedValue,
} from '../utils/validation.js';

/**
 * Yielded value representing a timeout delay.
 * Created by timeout() helper function.
 * Do not instantiate directly - use timeout() instead.
 *
 * @example
 * ```typescript
 * function* myProcess() {
 *   yield* timeout(5); // Wait 5 time units
 * }
 * ```
 */
export class Timeout {
  /** @internal discriminant for the scheduler */
  readonly kind: typeof WaitKind.Timeout = WaitKind.Timeout;

  constructor(public readonly delay: number) {
    // First check if finite (rejects NaN, Infinity)
    if (!Number.isFinite(delay)) {
      throw new ValidationError(
        `delay must be a finite number (got ${delay}). Use timeout(0) for immediate continuation or a positive value for delays`,
        { delay }
      );
    }
    validateNonNegative(
      delay,
      'delay',
      'Use timeout(0) for immediate continuation or a positive value for delays'
    );
  }
}

/**
 * Configuration options for waitFor condition polling.
 */
export interface WaitForOptions {
  /** Polling interval in simulation time units (default: 1) */
  interval?: number;
  /** Maximum number of polling iterations before timeout (default: Infinity) */
  maxIterations?: number;
}

/**
 * Yielded value representing a condition to wait for.
 * Created by waitFor() helper function.
 * Do not instantiate directly - use waitFor() instead.
 *
 * @example
 * ```typescript
 * function* myProcess() {
 *   yield* waitFor(() => someValue > 10);
 *
 *   // With custom polling interval
 *   yield* waitFor(() => someValue > 20, { interval: 5 });
 *
 *   // With max iterations to prevent infinite loops
 *   yield* waitFor(() => someValue > 30, { maxIterations: 100 });
 * }
 * ```
 */
export class Condition {
  /** @internal discriminant for the scheduler */
  readonly kind: typeof WaitKind.Condition = WaitKind.Condition;

  public readonly interval: number;
  public readonly maxIterations: number;

  constructor(
    public readonly predicate: () => boolean,
    options: WaitForOptions = {}
  ) {
    this.interval = options.interval ?? 1;
    this.maxIterations = options.maxIterations ?? Infinity;

    // Validate interval
    if (!Number.isFinite(this.interval)) {
      throw new ValidationError(
        `interval must be a finite number (got ${this.interval})`,
        { interval: this.interval }
      );
    }
    validateNonNegative(
      this.interval,
      'interval',
      'Polling interval must be non-negative'
    );

    // Validate maxIterations
    if (
      !Number.isFinite(this.maxIterations) &&
      this.maxIterations !== Infinity
    ) {
      throw new ValidationError(
        `maxIterations must be a finite number or Infinity (got ${this.maxIterations})`,
        { maxIterations: this.maxIterations }
      );
    }
    if (this.maxIterations !== Infinity) {
      validateNonNegative(
        this.maxIterations,
        'maxIterations',
        'Maximum iterations must be non-negative'
      );
    }
  }
}

/**
 * Error thrown when a process is preempted by a higher priority request.
 * This error is thrown into the generator when the process is interrupted
 * due to resource preemption.
 *
 * @example
 * ```typescript
 * function* myProcess() {
 *   try {
 *     yield resource.request();
 *     yield* timeout(10);
 *   } catch (error) {
 *     if (error instanceof PreemptionError) {
 *       console.log('Process was preempted!');
 *     }
 *   }
 * }
 * ```
 */
export class PreemptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PreemptionError';
    Object.setPrototypeOf(this, PreemptionError.prototype);
  }
}

/**
 * Error thrown when a waitFor condition exceeds maximum iterations.
 * This error is thrown into the generator when polling a condition
 * reaches the maxIterations limit without the condition becoming true.
 *
 * @example
 * ```typescript
 * function* myProcess() {
 *   try {
 *     yield* waitFor(() => someValue > 10, { maxIterations: 100 });
 *   } catch (error) {
 *     if (error instanceof ConditionTimeoutError) {
 *       console.log('Condition timed out after 100 iterations');
 *     }
 *   }
 * }
 * ```
 */
export class ConditionTimeoutError extends Error {
  constructor(
    message: string,
    public readonly iterations: number
  ) {
    super(message);
    this.name = 'ConditionTimeoutError';
    Object.setPrototypeOf(this, ConditionTimeoutError.prototype);
  }
}

/**
 * How a joined process ended, see {@link Process.done}.
 */
export interface ProcessDoneResult {
  /** 'completed' when the generator ran to its end, 'interrupted' otherwise */
  state: 'completed' | 'interrupted';
  /** The interruption reason when state is 'interrupted' */
  error?: Error;
}

/**
 * Yielded value that waits for another process to finish.
 * Created by process.done(). After the yield, `result` tells how it ended.
 *
 * @example
 * ```typescript
 * function* parent() {
 *   const child = sim.process(loadTruck);
 *   const done = child.done();
 *   yield done;
 *   console.log(done.result?.state); // 'completed'
 * }
 * ```
 */
export class ProcessDoneRequest {
  /** @internal discriminant for the scheduler */
  readonly kind: typeof WaitKind.ProcessDone = WaitKind.ProcessDone;

  /** Set when the awaited process has finished */
  public result?: ProcessDoneResult;

  constructor(public readonly process: Process) {}
}

/**
 * Anything a process can wait on inside anyOf() / allOf().
 * Conditions (waitFor) are polled and cannot be combined.
 */
export type Waitable =
  | Timeout
  | ResourceRequest
  | BufferPutRequest
  | BufferGetRequest
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | StorePutRequest<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | StoreGetRequest<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | BatchPutRequest<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | BatchTakeRequest<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | StateWaitRequest<any>
  | SimEventRequest
  | ProcessDoneRequest;

/**
 * A branch passed to anyOf() / allOf(): either a waitable request object or
 * a helper generator such as `timeout(5)`, which is unwrapped.
 */
export type WaitableInput = Waitable | Generator<Waitable, unknown, unknown>;

function isWaitable(value: unknown): value is Waitable {
  if (value === null || typeof value !== 'object') return false;
  const kind = (value as { kind?: unknown }).kind;
  return (
    typeof kind === 'number' &&
    kind !== WaitKind.Condition &&
    kind !== WaitKind.AnyOf &&
    kind !== WaitKind.AllOf &&
    kind >= WaitKind.Timeout &&
    kind <= WaitKind.ProcessDone
  );
}

function toWaitable(input: unknown, index: number): Waitable {
  let value: unknown = input;

  // Unwrap helper generators like timeout(5): take their first yielded value
  if (
    !isWaitable(value) &&
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Generator).next === 'function'
  ) {
    value = (value as Generator<unknown>).next().value;
  }

  if (value instanceof Condition) {
    throw new ValidationError(
      `Branch ${index}: waitFor() conditions are polled and cannot be combined with anyOf()/allOf(). ` +
        'Use a SimEvent or a timeout instead.',
      { index }
    );
  }
  if (!isWaitable(value)) {
    const typeName = (value as { constructor?: { name?: string } } | null)
      ?.constructor?.name;
    throw new ValidationError(
      `Branch ${index} is not something a process can wait on (got ${typeName ?? typeof value}). ` +
        'Pass resource/buffer/store requests, event.wait(), process.done() or timeout(n).',
      { index, receivedType: typeName ?? typeof value }
    );
  }
  return value;
}

function normalizeBranches(
  branches: readonly WaitableInput[],
  helper: string
): Waitable[] {
  if (!Array.isArray(branches) || branches.length === 0) {
    throw new ValidationError(`${helper}() needs at least one branch`, {
      branches: Array.isArray(branches) ? branches.length : typeof branches,
    });
  }
  return branches.map((b, i) => toWaitable(b, i));
}

/**
 * Outcome of an anyOf() wait.
 */
export interface AnyOfResult {
  /** The first branch that completed */
  winner: Waitable;
  /** Index of the winner in the branches array */
  index: number;
  /**
   * Every branch that completed at the same instant, winner first. Resources
   * granted to these branches belong to the process and must be released.
   */
  completed: Waitable[];
}

/**
 * Yielded value that waits until any one of several branches completes.
 * Pending branches are cancelled when the wait settles: queued requests are
 * removed from their queues, timeouts are unscheduled, event waiters removed.
 * Prefer the {@link anyOf} helper, which returns the result from `yield*`.
 */
export class AnyOfRequest {
  /** @internal discriminant for the scheduler */
  readonly kind: typeof WaitKind.AnyOf = WaitKind.AnyOf;

  public readonly branches: readonly Waitable[];
  /** Set when the wait has settled */
  public result?: AnyOfResult;

  constructor(branches: readonly WaitableInput[]) {
    this.branches = normalizeBranches(branches, 'anyOf');
  }

  /** The winning branch, once settled */
  get winner(): Waitable | undefined {
    return this.result?.winner;
  }
}

/**
 * Yielded value that waits until every branch has completed.
 * Prefer the {@link allOf} helper.
 */
export class AllOfRequest {
  /** @internal discriminant for the scheduler */
  readonly kind: typeof WaitKind.AllOf = WaitKind.AllOf;

  public readonly branches: readonly Waitable[];
  /** Branches completed so far, in completion order */
  public readonly completed: Waitable[] = [];

  constructor(branches: readonly WaitableInput[]) {
    this.branches = normalizeBranches(branches, 'allOf');
  }

  /** True once every branch has completed */
  get isDone(): boolean {
    return this.completed.length === this.branches.length;
  }
}

/**
 * Wait for the first of several branches. Use with yield*.
 *
 * Branches can be resource/buffer/store requests, `event.wait()`,
 * `process.done()` or `timeout(n)`. Branches that have not completed when the
 * first one does are cancelled automatically. If more than one branch completes
 * at the same instant they are all listed in `result.completed`; any resource
 * they acquired is yours to release.
 *
 * @example
 * ```typescript
 * function* impatientCustomer() {
 *   const req = teller.request();
 *   const result = yield* anyOf([req, timeout(10)]);
 *   if (result.winner === req) {
 *     yield* timeout(5);      // served
 *     teller.release();
 *   } else {
 *     stats.increment('reneged'); // gave up after 10 time units
 *   }
 * }
 * ```
 */
export function* anyOf(
  branches: readonly WaitableInput[]
): Generator<AnyOfRequest, AnyOfResult, void> {
  const request = new AnyOfRequest(branches);
  yield request;
  return request.result!;
}

/**
 * Wait until all branches have completed. Use with yield*.
 * Resources acquired by the branches are held by the process afterwards.
 *
 * @example
 * ```typescript
 * function* assembly() {
 *   yield* allOf([partA.done(), partB.done(), crane.request()]);
 *   // both parts finished and the crane is ours
 * }
 * ```
 */
export function* allOf(
  branches: readonly WaitableInput[]
): Generator<AllOfRequest, Waitable[], void> {
  const request = new AllOfRequest(branches);
  yield request;
  return [...request.branches];
}

/**
 * Type for process generator functions.
 * Generators can yield Timeout, ResourceRequest, Condition, SimEventRequest,
 * Buffer/Store requests, ProcessDoneRequest, or AnyOf/AllOf composites.
 *
 * @example
 * ```typescript
 * function* customer(id: number): ProcessGenerator {
 *   yield* timeout(5);           // Wait 5 units
 *   yield resource.request();    // Request resource
 *   yield* timeout(10);          // Use for 10 units
 *   resource.release();          // Release resource
 *   yield event.wait();          // Wait for event
 *   yield child.done();          // Wait for another process
 *   yield* anyOf([other.request(), timeout(3)]); // Race
 * }
 * ```
 */
export type ProcessGenerator = Generator<
  | Timeout
  | ResourceRequest
  | Condition
  | BufferPutRequest
  | BufferGetRequest
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | StorePutRequest<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | StoreGetRequest<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | BatchPutRequest<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | BatchTakeRequest<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | StateWaitRequest<any>
  | SimEventRequest
  | ProcessDoneRequest
  | AnyOfRequest
  | AllOfRequest,
  void,
  void
>;

/**
 * Options for creating a process.
 */
export interface ProcessOptions {
  /** Name used in errors and trace events (default: generator function name or process-<id>) */
  name?: string;
}

/**
 * Process state
 */
type ProcessState = 'pending' | 'running' | 'completed' | 'interrupted';

/** Marks errors that already carry process information */
const ANNOTATED = Symbol('discrete-sim.process-annotated');

/**
 * Process for discrete-event simulation.
 * Allows defining simulation behavior using generator functions.
 * Processes execute synchronously until they yield, then resume when the yielded
 * condition is met (timeout completes, resource acquired, condition true).
 *
 * @example
 * ```typescript
 * function* customerProcess() {
 *   console.log(`Customer arrives at ${sim.now}`);
 *   yield* timeout(5);  // Wait 5 time units
 *   console.log(`Customer served at ${sim.now}`);
 * }
 *
 * // Create and start process
 * const process = new Process(sim, customerProcess);
 * process.start();
 *
 * // Or use the convenience method
 * sim.process(customerProcess);
 * ```
 */
export class Process {
  /** Monotonic id within the simulation, starting at 1 */
  readonly id: number;
  /** Name used in errors and trace events */
  readonly name: string;

  private readonly simulation: Simulation;
  private readonly generator: ProcessGenerator;
  private state: ProcessState;
  private interruptError?: Error;

  /** Cancels whatever the process is currently waiting on */
  private waitCancel?: () => void;
  /** Incremented whenever the process starts or abandons a wait; stale callbacks compare against it */
  private waitSeq = 0;
  /** Callbacks to run when the process finishes (see done()) */
  private doneCallbacks: Array<() => void> = [];

  /**
   * Create a new process.
   * The process is not started automatically - call start() or use sim.process().
   *
   * @param simulation - The simulation instance this process belongs to
   * @param generatorFn - Function that returns a generator for the process logic
   *
   * @example
   * ```typescript
   * const proc = new Process(sim, function* () {
   *   yield* timeout(10);
   *   console.log('Done!');
   * });
   * proc.start();
   * ```
   */
  constructor(
    simulation: Simulation,
    generatorFn: () => ProcessGenerator,
    options: ProcessOptions = {}
  ) {
    this.simulation = simulation;
    this.id = simulation._nextProcessId();
    if (options.name !== undefined && options.name.trim() === '') {
      throw new ValidationError('Process name cannot be empty', {
        name: options.name,
      });
    }
    this.name =
      options.name ??
      (generatorFn.name && generatorFn.name !== 'anonymous'
        ? generatorFn.name
        : `process-${this.id}`);
    this.generator = generatorFn();
    this.state = 'pending';
  }

  /** Identity fields for trace payloads and errors */
  private traceInfo(): { processId: number; processName: string } {
    return { processId: this.id, processName: this.name };
  }

  /**
   * Start the process execution.
   * Executes synchronously until the first yield.
   * Can only be called on pending processes.
   *
   * @throws {ValidationError} If process is not in pending state
   *
   * @example
   * ```typescript
   * const proc = new Process(sim, myGenerator);
   * proc.start(); // Executes until first yield
   * ```
   */
  start(): void {
    validateProcessState(this.state, ['pending'], 'start');

    this.state = 'running';
    this.simulation._registerProcess(this);
    if (this.simulation.isTraceEnabled('processes')) {
      this.simulation._emitProcess('process:start', this.traceInfo());
    }
    // Execute immediately (synchronously) until first yield
    this.step();
  }

  /**
   * Interrupt the process with an optional reason.
   * The error is thrown into the generator, allowing it to catch and handle
   * the interruption if desired. Whatever the process was waiting on (queued
   * resource requests, timeouts, event waits, composite waits) is cancelled.
   *
   * @param reason - Error describing why the process was interrupted
   *
   * @throws {ValidationError} If process is not running
   *
   * @example
   * ```typescript
   * function* myProcess() {
   *   try {
   *     yield* timeout(100);
   *   } catch (error) {
   *     console.log('Process was interrupted!');
   *   }
   * }
   *
   * const proc = sim.process(myProcess);
   * proc.interrupt(new Error('Cancelled'));
   * ```
   */
  interrupt(reason?: Error): void {
    validateProcessState(this.state, ['running'], 'interrupt');

    this.state = 'interrupted';
    this.interruptError = reason ?? new Error('Process interrupted');
    if (this.simulation.isTraceEnabled('processes')) {
      this.simulation._emitProcess('process:interrupt', {
        ...this.traceInfo(),
        error: this.interruptError,
      });
    }

    // Leave every queue / unschedule every event this process was waiting on
    this.cancelCurrentWait();

    // Immediately trigger step() to throw the error into the generator
    // This allows the process to catch and handle the interruption
    this.step();
  }

  /**
   * Request to wait until this process finishes. Yield the returned token in
   * another process; afterwards `token.result` says how this process ended.
   *
   * @example
   * ```typescript
   * const truck = sim.process(loadTruck);
   * yield truck.done();
   * ```
   */
  done(): ProcessDoneRequest {
    return new ProcessDoneRequest(this);
  }

  /**
   * Wait for this process to finish and get the outcome back, typed.
   * Use with yield* from another process.
   *
   * @example
   * ```typescript
   * const outcome = yield* truck.join();
   * if (outcome.state === 'interrupted') { ... }
   * ```
   */
  *join(): Generator<ProcessDoneRequest, ProcessDoneResult, void> {
    const request = this.done();
    yield request;
    return request.result!;
  }

  /**
   * Register a callback for when this process finishes. Fires at the current
   * simulation time (0-delay event) if the process has already finished.
   *
   * @returns A function that unregisters the callback
   * @internal
   */
  _onDone(callback: () => void): () => void {
    if (this.hasFinished()) {
      const id = this.simulation.schedule(0, callback);
      return () => {
        this.simulation.cancel(id);
      };
    }
    this.doneCallbacks.push(callback);
    return () => {
      const i = this.doneCallbacks.indexOf(callback);
      if (i >= 0) this.doneCallbacks.splice(i, 1);
    };
  }

  /**
   * Check if the process is currently running.
   *
   * @returns true if process is running, false otherwise
   *
   * @example
   * ```typescript
   * if (proc.isRunning) {
   *   proc.interrupt();
   * }
   * ```
   */
  get isRunning(): boolean {
    return this.state === 'running';
  }

  /**
   * Check if the process has completed.
   *
   * @returns true if process finished normally, false otherwise
   *
   * @example
   * ```typescript
   * sim.run();
   * if (proc.isCompleted) {
   *   console.log('Process finished successfully');
   * }
   * ```
   */
  get isCompleted(): boolean {
    return this.state === 'completed';
  }

  /**
   * Check if the process was interrupted.
   *
   * @returns true if process was interrupted and didn't handle the error, false otherwise
   *
   * @example
   * ```typescript
   * if (proc.isInterrupted) {
   *   console.log('Process was interrupted');
   * }
   * ```
   */
  get isInterrupted(): boolean {
    return this.state === 'interrupted';
  }

  /**
   * The error the process was last interrupted with, if any.
   */
  get interruptReason(): Error | undefined {
    return this.interruptError;
  }

  /**
   * True once the generator has ended, normally or by an unhandled interrupt.
   * Distinguishes a finished process from one that is mid-way through handling
   * an interrupt (state is transiently 'interrupted' then too).
   * @private
   */
  private hasFinished(): boolean {
    return (
      this.state === 'completed' ||
      (this.state === 'interrupted' && this.doneCallbacks === FINISHED)
    );
  }

  /**
   * Execute one step of the process.
   * @private
   */
  private step(): void {
    // Check if interrupted
    if (this.state === 'interrupted') {
      try {
        // Throw the error into the generator
        const result = this.generator.throw(this.interruptError!);

        // If generator caught the error and continued, resume running
        if (!result.done) {
          this.state = 'running';
          this.dispatch(result.value);
        } else {
          // Generator completed after handling interrupt
          this.finish('completed');
        }
      } catch {
        // Process didn't handle the interrupt, so it terminates
        this.finish('interrupted');
      }
      return;
    }

    if (this.state !== 'running') {
      return;
    }

    try {
      const result = this.generator.next();

      if (result.done) {
        this.finish('completed');
        return;
      }

      this.dispatch(result.value);
    } catch (error) {
      // Unhandled error in process: say which process, then rethrow
      this.annotate(error);
      if (this.simulation.isTraceEnabled('processes')) {
        this.simulation._emitProcess('process:error', {
          ...this.traceInfo(),
          error: error instanceof Error ? error : undefined,
        });
      }
      this.finish('interrupted');
      throw error;
    }
  }

  /**
   * Start waiting on whatever the generator yielded.
   * @private
   */
  private dispatch(yieldedValue: unknown): void {
    const kind =
      yieldedValue !== null && typeof yieldedValue === 'object'
        ? (yieldedValue as { kind?: unknown }).kind
        : undefined;
    if (kind === WaitKind.Condition) {
      this.waitForCondition(yieldedValue as Condition);
      return;
    }
    if (kind === WaitKind.AnyOf) {
      this.waitAny(yieldedValue as AnyOfRequest);
      return;
    }
    if (kind === WaitKind.AllOf) {
      this.waitAll(yieldedValue as AllOfRequest);
      return;
    }
    if (!isWaitable(yieldedValue)) {
      validateYieldedValue(yieldedValue); // throws with a helpful message
      return;
    }

    const mySeq = ++this.waitSeq;
    let settled = false;
    const cancel = this.awaitOne(yieldedValue, () => {
      if (this.waitSeq !== mySeq) {
        // The process moved on (interrupted at the same instant); give back
        // anything this completion handed us.
        this.undoLateCompletion(yieldedValue);
        return;
      }
      settled = true;
      this.waitCancel = undefined;
      this.step();
    });
    // A synchronous completion has already stepped the process; do not clobber
    // the wait it registered next.
    if (!settled && this.waitSeq === mySeq) {
      this.waitCancel = cancel;
    }
  }

  /**
   * Register a single waitable with the primitive it belongs to.
   * @returns A function that cancels the wait while it is still pending
   * @private
   */
  private awaitOne(waitable: Waitable, onComplete: () => void): () => void {
    switch (waitable.kind) {
      case WaitKind.Timeout: {
        const id = this.simulation.schedule(waitable.delay, onComplete);
        return () => {
          this.simulation.cancel(id);
        };
      }
      case WaitKind.Resource: {
        waitable.resource._acquire(
          waitable.priority,
          onComplete,
          this,
          waitable
        );
        return () => {
          waitable.resource._cancelAcquire(onComplete);
        };
      }
      case WaitKind.BufferPut: {
        waitable.buffer._put(
          waitable.amount,
          waitable.priority,
          onComplete,
          this
        );
        return () => {
          waitable.buffer._cancelPut(onComplete);
        };
      }
      case WaitKind.BufferGet: {
        waitable.buffer._get(
          waitable.amount,
          waitable.priority,
          onComplete,
          this
        );
        return () => {
          waitable.buffer._cancelGet(onComplete);
        };
      }
      case WaitKind.StorePut: {
        waitable.store._put(waitable.item, waitable.priority, onComplete, this);
        return () => {
          waitable.store._cancelPut(onComplete);
        };
      }
      case WaitKind.StoreGet: {
        const onItem = (item: unknown) => {
          waitable.retrievedItem = item;
          onComplete();
        };
        waitable.store._get(waitable.filter, waitable.priority, onItem, this);
        return () => {
          waitable.store._cancelGet(onItem);
        };
      }
      case WaitKind.BatchPut: {
        waitable.batch._put(waitable.item, onComplete, this);
        return () => {
          waitable.batch._cancelPut(onComplete);
        };
      }
      case WaitKind.BatchTake: {
        const onTaken = (items: unknown[], isPartial: boolean) => {
          waitable.items = items;
          waitable.isPartial = isPartial;
          onComplete();
        };
        waitable.batch._take(onTaken, this);
        return () => {
          waitable.batch._cancelTake(onTaken);
        };
      }
      case WaitKind.State: {
        const onSatisfied = (value: unknown) => {
          waitable.value = value;
          onComplete();
        };
        waitable.state._addWaiter(waitable.predicate, onSatisfied, this);
        return () => {
          waitable.state._removeWaiter(onSatisfied);
        };
      }
      case WaitKind.SimEvent: {
        waitable.event._addWaiter(onComplete, this, waitable);
        return () => {
          waitable.event._removeWaiter(this);
        };
      }
      case WaitKind.ProcessDone: {
        return waitable.process._onDone(() => {
          const target = waitable.process;
          waitable.result = target.isCompleted
            ? { state: 'completed' }
            : { state: 'interrupted', error: target.interruptReason };
          onComplete();
        });
      }
    }
  }

  /**
   * A branch completed after the process stopped waiting for it (it settled or
   * was interrupted in the same instant). Return what the completion granted.
   * @private
   */
  private undoLateCompletion(waitable: Waitable): void {
    switch (waitable.kind) {
      case WaitKind.Resource:
        waitable.resource.release(waitable);
        break;
      case WaitKind.BufferGet:
        waitable.buffer._put(waitable.amount, 0, () => {});
        break;
      case WaitKind.BufferPut:
        waitable.buffer._get(waitable.amount, 0, () => {});
        break;
      case WaitKind.StoreGet:
        if (waitable.retrievedItem !== undefined) {
          waitable.store._put(waitable.retrievedItem, 0, () => {});
        }
        break;
      case WaitKind.StorePut:
        waitable.store._get(
          (item: unknown) => item === waitable.item,
          0,
          () => {}
        );
        break;
      case WaitKind.BatchTake:
        if (waitable.items) {
          waitable.batch._restore(waitable.items, waitable.isPartial ?? false);
          waitable.items = undefined;
        }
        break;
      case WaitKind.BatchPut:
        waitable.batch._withdraw(waitable.item);
        break;
      default:
        // Timeout, State, SimEvent, ProcessDone: nothing was granted
        break;
    }
  }

  /**
   * Wait for the first of several branches.
   * @private
   */
  private waitAny(request: AnyOfRequest): void {
    const mySeq = ++this.waitSeq;
    const branches = request.branches;
    const cancels: Array<(() => void) | undefined> = new Array<
      (() => void) | undefined
    >(branches.length);
    const completed: Waitable[] = [];
    let registering = true;

    const cancelPending = () => {
      branches.forEach((b, i) => {
        if (!completed.includes(b)) cancels[i]?.();
      });
    };

    const settle = () => {
      // Anything still arriving for this wait is late and gets undone
      this.waitSeq++;
      cancelPending();
      const winner = completed[0]!;
      request.result = {
        winner,
        index: branches.indexOf(winner),
        completed: [...completed],
      };
      this.waitCancel = undefined;
      this.step();
    };

    branches.forEach((branch, i) => {
      cancels[i] = this.awaitOne(branch, () => {
        if (this.waitSeq !== mySeq) {
          this.undoLateCompletion(branch);
          return;
        }
        completed.push(branch);
        if (!registering) settle();
      });
    });
    registering = false;

    if (completed.length > 0) {
      // One or more branches completed synchronously while registering
      settle();
      return;
    }

    this.waitCancel = cancelPending;
  }

  /**
   * Wait for all branches.
   * @private
   */
  private waitAll(request: AllOfRequest): void {
    const mySeq = ++this.waitSeq;
    const branches = request.branches;
    const cancels: Array<(() => void) | undefined> = new Array<
      (() => void) | undefined
    >(branches.length);
    let registering = true;

    const finishAll = () => {
      this.waitCancel = undefined;
      this.step();
    };

    branches.forEach((branch, i) => {
      cancels[i] = this.awaitOne(branch, () => {
        if (this.waitSeq !== mySeq) {
          this.undoLateCompletion(branch);
          return;
        }
        request.completed.push(branch);
        if (request.isDone && !registering) finishAll();
      });
    });
    registering = false;

    if (request.isDone) {
      finishAll();
      return;
    }

    this.waitCancel = () => {
      branches.forEach((b, i) => {
        if (!request.completed.includes(b)) cancels[i]?.();
      });
    };
  }

  /**
   * Abandon the current wait: cancel pending registrations and invalidate
   * callbacks that may still arrive for it.
   * @private
   */
  private cancelCurrentWait(): void {
    this.waitSeq++;
    const cancel = this.waitCancel;
    this.waitCancel = undefined;
    cancel?.();
  }

  /**
   * Mark the process finished, remove it from the simulation and notify
   * everyone waiting on done().
   * @private
   */
  private finish(state: 'completed' | 'interrupted'): void {
    this.state = state;
    if (this.simulation.isTraceEnabled('processes')) {
      this.simulation._emitProcess(
        state === 'completed' ? 'process:complete' : 'process:interrupted',
        this.traceInfo()
      );
    }
    this.waitSeq++;
    this.waitCancel = undefined;
    this.simulation._removeProcess(this);

    const callbacks = this.doneCallbacks;
    this.doneCallbacks = FINISHED;
    for (const callback of callbacks) {
      this.simulation.schedule(0, callback);
    }
  }

  /**
   * Attach process id, name and time to an unhandled error so the message
   * and a non-enumerable `process` property say where it came from.
   * @private
   */
  private annotate(error: unknown): void {
    if (!(error instanceof Error)) return;
    const tagged = error as Error & { [ANNOTATED]?: true };
    if (tagged[ANNOTATED]) return;
    const info = { id: this.id, name: this.name, time: this.simulation.now };
    Object.defineProperty(tagged, ANNOTATED, {
      value: true,
      enumerable: false,
    });
    Object.defineProperty(tagged, 'process', {
      value: info,
      enumerable: false,
    });
    tagged.message = `${tagged.message} [process "${this.name}" #${this.id} at t=${info.time}]`;
  }

  /**
   * Wait for a condition to become true.
   * Polls the condition at the specified interval.
   * Throws ConditionTimeoutError if maxIterations is exceeded.
   * @private
   */
  private waitForCondition(condition: Condition): void {
    const mySeq = ++this.waitSeq;
    let iterations = 0;

    const checkCondition = () => {
      if (this.state !== 'running' || this.waitSeq !== mySeq) {
        return;
      }

      if (condition.predicate()) {
        // Condition met, continue process
        this.step();
      } else {
        // Check if we've exceeded max iterations
        iterations++;
        if (iterations > condition.maxIterations) {
          // Throw timeout error into the process
          const error = new ConditionTimeoutError(
            `Condition timeout: exceeded ${condition.maxIterations} iterations`,
            iterations - 1
          );
          this.state = 'interrupted';
          this.interruptError = error;
          this.cancelCurrentWait();
          this.step();
          return;
        }

        // Schedule next check after interval
        this.simulation.schedule(condition.interval, checkCondition);
      }
    };

    // Check immediately (iteration 0)
    checkCondition();
  }
}

/**
 * Sentinel assigned to doneCallbacks once a process has finished, so that
 * hasFinished() can tell a finished process from one handling an interrupt.
 */
const FINISHED: Array<() => void> = [];

/**
 * Helper function to create a timeout.
 * Use with yield* in generator functions.
 *
 * @param delay - Time to wait
 * @returns Generator that yields a Timeout
 *
 * @example
 * function* myProcess() {
 *   yield* timeout(10);  // Wait 10 time units
 * }
 */
export function* timeout(delay: number): Generator<Timeout, void, void> {
  yield new Timeout(delay);
}

/**
 * Helper function to wait for a condition.
 * Use with yield* in generator functions.
 *
 * @param predicate - Function that returns true when condition is met
 * @param options - Configuration options for polling behavior
 * @returns Generator that yields a Condition
 *
 * @example
 * ```typescript
 * function* myProcess() {
 *   // Default: poll every 1 time unit indefinitely
 *   yield* waitFor(() => someValue > 10);
 *
 *   // Custom interval: poll every 5 time units
 *   yield* waitFor(() => someValue > 20, { interval: 5 });
 *
 *   // With timeout: max 100 iterations (throws ConditionTimeoutError if exceeded)
 *   yield* waitFor(() => someValue > 30, { maxIterations: 100 });
 *
 *   // Combined: poll every 10 time units, max 50 iterations
 *   yield* waitFor(() => someValue > 40, { interval: 10, maxIterations: 50 });
 * }
 * ```
 */
export function* waitFor(
  predicate: () => boolean,
  options?: WaitForOptions
): Generator<Condition, void, void> {
  yield new Condition(predicate, options);
}
