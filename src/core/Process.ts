import { Simulation } from './Simulation.js';
import { ResourceRequest } from '../resources/Resource.js';
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
 * Yielded value representing a condition to wait for.
 * Created by waitFor() helper function.
 * Do not instantiate directly - use waitFor() instead.
 *
 * @example
 * ```typescript
 * function* myProcess() {
 *   yield* waitFor(() => someValue > 10);
 * }
 * ```
 */
export class Condition {
  constructor(public readonly predicate: () => boolean) {}
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
 * Type for process generator functions.
 * Generators can yield Timeout, ResourceRequest, or Condition objects.
 *
 * @example
 * ```typescript
 * function* customer(id: number): ProcessGenerator {
 *   yield* timeout(5);           // Wait 5 units
 *   yield resource.request();    // Request resource
 *   yield* timeout(10);          // Use for 10 units
 *   resource.release();          // Release resource
 * }
 * ```
 */
export type ProcessGenerator = Generator<
  Timeout | ResourceRequest | Condition,
  void,
  void
>;

/**
 * Process state
 */
type ProcessState = 'pending' | 'running' | 'completed' | 'interrupted';

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
  private simulation: Simulation;
  private generator: ProcessGenerator;
  private state: ProcessState;
  private interruptReason?: Error;

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
  constructor(simulation: Simulation, generatorFn: () => ProcessGenerator) {
    this.simulation = simulation;
    this.generator = generatorFn();
    this.state = 'pending';
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
    validateProcessState(
      this.state,
      ['pending'],
      'start'
    );

    this.state = 'running';
    // Execute immediately (synchronously) until first yield
    this.step();
  }

  /**
   * Interrupt the process with an optional reason.
   * The error is thrown into the generator, allowing it to catch and handle
   * the interruption if desired.
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
    validateProcessState(
      this.state,
      ['running'],
      'interrupt'
    );

    this.state = 'interrupted';
    this.interruptReason = reason ?? new Error('Process interrupted');

    // Immediately trigger step() to throw the error into the generator
    // This allows the process to catch and handle the interruption
    this.step();
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
   * Execute one step of the process.
   * @private
   */
  private step(): void {
    // Check if interrupted
    if (this.state === 'interrupted') {
      try {
        // Throw the error into the generator
        const result = this.generator.throw(this.interruptReason!);

        // If generator caught the error and continued, resume running
        if (!result.done) {
          this.state = 'running';
          // Process the yielded value from the catch block
          const yieldedValue = result.value;

          if (yieldedValue instanceof Timeout) {
            this.simulation.schedule(yieldedValue.delay, () => this.step());
          } else if (yieldedValue instanceof ResourceRequest) {
            yieldedValue.resource._acquire(
              yieldedValue.priority,
              () => this.step(),
              this
            );
          } else if (yieldedValue instanceof Condition) {
            this.waitForCondition(yieldedValue);
          }
          return;
        } else {
          // Generator completed after handling interrupt
          this.state = 'completed';
          return;
        }
      } catch (error) {
        // Process didn't handle the interrupt, so it terminates
        this.state = 'interrupted';
        return;
      }
    }

    if (this.state !== 'running') {
      return;
    }

    try {
      const result = this.generator.next();

      if (result.done) {
        this.state = 'completed';
        return;
      }

      const yieldedValue = result.value;

      if (yieldedValue instanceof Timeout) {
        // Schedule next step after timeout
        this.simulation.schedule(yieldedValue.delay, () => this.step());
      } else if (yieldedValue instanceof ResourceRequest) {
        // Request resource and continue when acquired
        yieldedValue.resource._acquire(
          yieldedValue.priority,
          () => this.step(),
          this
        );
      } else if (yieldedValue instanceof Condition) {
        // Poll condition periodically
        this.waitForCondition(yieldedValue);
      } else {
        validateYieldedValue(yieldedValue);
      }
    } catch (error) {
      // Unhandled error in process
      this.state = 'interrupted';
      throw error;
    }
  }

  /**
   * Wait for a condition to become true.
   * @private
   */
  private waitForCondition(condition: Condition): void {
    const checkCondition = () => {
      if (this.state !== 'running') {
        return;
      }

      if (condition.predicate()) {
        // Condition met, continue process
        this.step();
      } else {
        // Check again next time unit
        this.simulation.schedule(1, checkCondition);
      }
    };

    // Check immediately
    checkCondition();
  }
}

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
 * @returns Generator that yields a Condition
 *
 * @example
 * function* myProcess() {
 *   yield* waitFor(() => someValue > 10);
 * }
 */
export function* waitFor(
  predicate: () => boolean
): Generator<Condition, void, void> {
  yield new Condition(predicate);
}
