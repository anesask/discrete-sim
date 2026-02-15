import { EventQueue } from './EventQueue.js';
import {
  ValidationError,
  validateNonNegative,
  validateTime,
} from '../utils/validation.js';
import { Process, type ProcessGenerator } from './Process.js';

/**
 * Configuration options for the simulation.
 */
export interface SimulationOptions {
  /** Initial simulation time (default: 0) */
  initialTime?: number;
  /** Random seed for reproducibility (default: random) */
  randomSeed?: number;
  /** Enable logging for debugging (default: false) */
  enableLogging?: boolean;
}

/**
 * Result returned when simulation completes.
 * Contains summary information about the simulation run.
 */
export interface SimulationResult {
  /** Final simulation time when run completed */
  endTime: number;
  /** Total number of events processed during this run */
  eventsProcessed: number;
  /** Statistics collected during the simulation */
  statistics: Record<string, unknown>;
}

/**
 * Event handler type for simulation lifecycle events
 */
type EventHandler = (...args: unknown[]) => void;

/**
 * Trace configuration options
 */
export interface TraceOptions {
  /** Enable event execution tracing */
  events?: boolean;
  /** Enable resource operation tracing */
  resources?: boolean;
  /** Enable process lifecycle tracing */
  processes?: boolean;
  /** Enable SimEvent coordination tracing */
  simEvents?: boolean;
}

/**
 * Core discrete-event simulation engine.
 * Manages simulation time, event scheduling, and execution.
 *
 * The simulation maintains a virtual clock that advances from event to event,
 * not in real-time. Events are processed in chronological order with priority
 * tie-breaking.
 *
 * @example
 * ```typescript
 * const sim = new Simulation();
 *
 * // Schedule events
 * sim.schedule(10, () => console.log('Event at time 10'));
 * sim.schedule(5, () => console.log('Event at time 5'));
 *
 * // Run simulation
 * sim.run(); // Outputs in chronological order: 5, then 10
 *
 * console.log(sim.now); // 10
 * ```
 */
/**
 * Event trace entry for detailed logging
 */
export interface EventTrace {
  /** Event ID */
  id: string;
  /** Scheduled time */
  time: number;
  /** Event priority */
  priority: number;
  /** Execution timestamp */
  executedAt: number;
}

export class Simulation {
  private readonly eventQueue: EventQueue;
  private currentTime: number;
  private eventsProcessed: number;
  private readonly eventHandlers: Map<string, Set<EventHandler>>;
  private readonly options: Required<SimulationOptions>;
  private isRunning: boolean;
  private readonly eventTrace: EventTrace[];
  private enableTracing: boolean;
  private readonly activeProcesses: Set<Process>;
  private traceConfig: TraceOptions;

  /**
   * Create a new simulation instance.
   *
   * @param options - Configuration options for the simulation
   *
   * @example
   * ```typescript
   * const sim = new Simulation({
   *   initialTime: 0,
   *   randomSeed: 12345,
   *   enableLogging: false
   * });
   * ```
   */
  constructor(options: SimulationOptions = {}) {
    this.options = {
      initialTime: options.initialTime ?? 0,
      randomSeed: options.randomSeed ?? Math.random(),
      enableLogging: options.enableLogging ?? false,
    };

    this.eventQueue = new EventQueue();
    this.currentTime = this.options.initialTime;
    this.eventsProcessed = 0;
    this.eventHandlers = new Map();
    this.isRunning = false;
    this.eventTrace = [];
    this.enableTracing = false;
    this.activeProcesses = new Set();
    this.traceConfig = {
      events: false,
      resources: false,
      processes: false,
      simEvents: false,
    };

    this.log('Simulation created', { options: this.options });
  }

  /**
   * Get the current simulation time.
   * This is the virtual clock, not real-world time.
   *
   * @returns The current simulation time
   *
   * @example
   * ```typescript
   * console.log(`Current time: ${sim.now}`);
   * ```
   */
  get now(): number {
    return this.currentTime;
  }

  /**
   * Schedule an event to occur after a delay.
   * @param delay - Time delay from now (must be >= 0)
   * @param callback - Function to execute when event occurs
   * @param priority - Priority for breaking ties (default: 0, lower = higher priority)
   * @returns The unique ID of the scheduled event
   */
  schedule(delay: number, callback: () => void, priority: number = 0): string {
    validateNonNegative(
      delay,
      'delay',
      'Use delay=0 to schedule at current time or positive values for future events'
    );

    const eventTime = this.currentTime + delay;
    const eventId = this.eventQueue.push({
      time: eventTime,
      priority,
      callback,
    });

    this.log('Event scheduled', { eventId, time: eventTime, delay, priority });
    return eventId;
  }

  /**
   * Create and start a process in one step (convenience method).
   * This is equivalent to: new Process(sim, generatorFn).start()
   *
   * @param generatorFn - Function that returns a generator for the process logic
   * @returns The created Process instance
   *
   * @example
   * ```typescript
   * sim.process(function* () {
   *   yield* timeout(10);
   *   console.log('Process completed');
   * });
   * ```
   */
  process(generatorFn: () => ProcessGenerator): Process {
    const proc = new Process(this, generatorFn);
    this.activeProcesses.add(proc);
    proc.start();
    return proc;
  }

  /**
   * Cancel a scheduled event before it executes.
   * @param eventId - The ID of the event to cancel (returned by schedule())
   * @returns true if the event was successfully cancelled, false if not found or already executed
   *
   * @example
   * ```typescript
   * const eventId = sim.schedule(100, () => console.log('This will be cancelled'));
   * sim.cancel(eventId);  // Returns true, event won't execute
   * ```
   */
  cancel(eventId: string): boolean {
    const removed = this.eventQueue.remove(eventId);
    if (removed) {
      this.log('Event cancelled', { eventId });
    }
    return removed;
  }

  /**
   * Execute a single event (step forward to next event).
   * Advances time to the next event and executes it.
   * Useful for debugging or step-by-step simulation.
   *
   * @returns true if an event was executed, false if queue is empty
   *
   * @example
   * ```typescript
   * sim.schedule(10, () => console.log('Step 1'));
   * sim.schedule(20, () => console.log('Step 2'));
   *
   * sim.step(); // Executes first event, outputs: "Step 1"
   * console.log(sim.now); // 10
   *
   * sim.step(); // Executes second event, outputs: "Step 2"
   * console.log(sim.now); // 20
   * ```
   */
  step(): boolean {
    const event = this.eventQueue.pop();

    if (!event) {
      this.log('Step called but no events in queue');
      return false;
    }

    // Advance time to event time
    this.currentTime = event.time;
    this.eventsProcessed++;

    this.log('Executing event', {
      id: event.id,
      time: event.time,
      priority: event.priority,
    });

    // Record event trace if enabled
    if (this.enableTracing) {
      this.eventTrace.push({
        id: event.id,
        time: event.time,
        priority: event.priority,
        executedAt: this.eventsProcessed,
      });
    }

    // Emit step event
    this.emit('step', event);

    // Execute the event callback
    try {
      event.callback();
    } catch (error) {
      this.emit('error', error);
      throw error;
    }

    return true;
  }

  /**
   * Run the simulation until a specified time or until no events remain.
   * Processes all events in chronological order.
   *
   * @param until - Target simulation time (if undefined, runs until queue is empty)
   * @returns Summary of the simulation run including end time and events processed
   *
   * @example
   * ```typescript
   * // Run until all events are processed
   * sim.run();
   *
   * // Run until specific time
   * sim.run(100); // Stops at time 100
   *
   * // Get result summary
   * const result = sim.run();
   * console.log(`Ended at ${result.endTime}, processed ${result.eventsProcessed} events`);
   * ```
   */
  run(until?: number): SimulationResult {
    if (this.isRunning) {
      throw new Error('Simulation is already running');
    }

    // Validate until parameter if provided
    if (until !== undefined) {
      // Type guard: ensure it's actually a number
      if (typeof until !== 'number') {
        throw new ValidationError(
          `until must be a number (got ${typeof until})`,
          { until, type: typeof until }
        );
      }
      validateTime(until, 'until', true);
    }

    this.isRunning = true;
    const startEvents = this.eventsProcessed;

    this.log('Simulation run started', { until, startTime: this.currentTime });

    try {
      while (!this.eventQueue.isEmpty) {
        const nextEvent = this.eventQueue.peek();

        // Check if we've reached the target time
        if (until !== undefined && nextEvent && nextEvent.time > until) {
          this.currentTime = until;
          break;
        }

        // Execute next event
        if (!this.step()) {
          break;
        }
      }

      // If we ran out of events but haven't reached target time, advance to it
      if (until !== undefined && this.currentTime < until) {
        this.currentTime = until;
      }

      const result: SimulationResult = {
        endTime: this.currentTime,
        eventsProcessed: this.eventsProcessed - startEvents,
        statistics: this.statistics,
      };

      this.log('Simulation run completed', result);
      this.emit('complete', result);

      return result;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Reset the simulation to its initial state.
   * Clears all scheduled events and resets the clock to initial time.
   * Interrupts all active processes with a reset error.
   * Event handlers are preserved across resets.
   *
   * @throws {Error} If called while simulation is running
   *
   * @example
   * ```typescript
   * sim.run();
   * console.log(sim.now); // Some time value
   *
   * sim.reset();
   * console.log(sim.now); // 0 (or initialTime if set)
   * ```
   */
  reset(): void {
    if (this.isRunning) {
      throw new Error('Cannot reset while simulation is running');
    }

    this.log('Resetting simulation');

    // Interrupt all active processes
    for (const process of this.activeProcesses) {
      if (process.isRunning) {
        try {
          process.interrupt(new Error('Simulation reset'));
        } catch (error) {
          // Ignore errors during reset interruption
          this.log('Process interruption during reset failed', { error });
        }
      }
    }
    this.activeProcesses.clear();

    this.eventQueue.clear();
    this.currentTime = this.options.initialTime;
    this.eventsProcessed = 0;
    // Note: Event handlers are preserved across resets
  }

  /**
   * Register an event handler for simulation lifecycle events.
   *
   * @param event - Event name: 'step' (after each event), 'complete' (after run()), or 'error' (on error)
   * @param handler - Handler function to call when event occurs
   *
   * @example
   * ```typescript
   * sim.on('step', (event) => {
   *   console.log(`Executed event at time ${event.time}`);
   * });
   *
   * sim.on('complete', (result) => {
   *   console.log(`Simulation completed at time ${result.endTime}`);
   * });
   *
   * sim.on('error', (error) => {
   *   console.error('Simulation error:', error);
   * });
   * ```
   */
  on(event: 'step' | 'complete' | 'error', handler: EventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)?.add(handler);
  }

  /**
   * Unregister an event handler.
   *
   * @param event - Event name
   * @param handler - Handler function to remove (must be same reference as registered)
   *
   * @example
   * ```typescript
   * const handler = (event) => console.log(event);
   * sim.on('step', handler);
   * // ...later:
   * sim.off('step', handler);
   * ```
   */
  off(event: string, handler: EventHandler): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  /**
   * Get statistics collected during the simulation.
   *
   * @returns Statistics object containing current time, events processed, and queue status
   *
   * @example
   * ```typescript
   * const stats = sim.statistics;
   * console.log(`Time: ${stats.currentTime}, Events: ${stats.eventsProcessed}`);
   * ```
   */
  get statistics(): Record<string, unknown> {
    return {
      currentTime: this.currentTime,
      eventsProcessed: this.eventsProcessed,
      eventsInQueue: this.eventQueue.length,
    };
  }

  /**
   * Emit an event to all registered handlers.
   * @param event - Event name
   * @param args - Arguments to pass to handlers
   */
  private emit(event: string, ...args: unknown[]): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(...args);
      }
    }
  }

  /**
   * Enable event tracing.
   * When enabled, detailed information about each executed event is recorded.
   * Use getEventTrace() to retrieve the trace.
   *
   * @example
   * ```typescript
   * sim.enableEventTrace();
   * sim.schedule(10, () => console.log('Event 1'));
   * sim.schedule(20, () => console.log('Event 2'));
   * sim.run();
   *
   * const trace = sim.getEventTrace();
   * console.log(`Executed ${trace.length} events`);
   * ```
   */
  enableEventTrace(): void {
    this.enableTracing = true;
  }

  /**
   * Disable event tracing.
   */
  disableEventTrace(): void {
    this.enableTracing = false;
  }

  /**
   * Get the event trace.
   * Returns an array of all executed events with their timing information.
   *
   * @returns Array of event trace entries
   *
   * @example
   * ```typescript
   * sim.enableEventTrace();
   * // ... run simulation ...
   * const trace = sim.getEventTrace();
   *
   * // Analyze execution
   * trace.forEach(entry => {
   *   console.log(`Event ${entry.id} at time ${entry.time}, priority ${entry.priority}`);
   * });
   * ```
   */
  getEventTrace(): readonly EventTrace[] {
    return this.eventTrace;
  }

  /**
   * Clear the event trace.
   * Useful for resetting trace between simulation runs.
   */
  clearEventTrace(): void {
    this.eventTrace.length = 0;
  }

  /**
   * Log a message if logging is enabled.
   * @param message - Log message
   * @param data - Additional data to log
   */
  private log(message: string, data?: unknown): void {
    if (this.options.enableLogging) {
      console.log(`[Simulation @ ${this.currentTime}] ${message}`, data ?? '');
    }
  }

  /**
   * Internal method to remove a process from active tracking.
   * Called by Process when it completes or is interrupted.
   * @internal
   */
  _removeProcess(process: Process): void {
    this.activeProcesses.delete(process);
  }

  /**
   * Enable comprehensive trace mode with optional filtering.
   * When enabled, simulation events, resource operations, process lifecycle,
   * and SimEvent coordination are logged via event handlers.
   *
   * @param options - Configuration for which types of events to trace
   *
   * @example
   * ```typescript
   * // Enable all tracing
   * sim.enableTrace({
   *   events: true,
   *   resources: true,
   *   processes: true,
   *   simEvents: true
   * });
   *
   * // Listen to trace events
   * sim.on('trace:resource', (data) => {
   *   console.log(`Resource ${data.resource} operation: ${data.operation}`);
   * });
   *
   * // Enable only resource tracing
   * sim.enableTrace({ resources: true });
   * ```
   */
  enableTrace(options: TraceOptions = {}): void {
    this.traceConfig = {
      events: options.events ?? true,
      resources: options.resources ?? true,
      processes: options.processes ?? true,
      simEvents: options.simEvents ?? true,
    };
  }

  /**
   * Disable trace mode.
   * Stops emitting trace events.
   *
   * @example
   * ```typescript
   * sim.enableTrace({ resources: true });
   * // ... run simulation ...
   * sim.disableTrace(); // Stop tracing
   * ```
   */
  disableTrace(): void {
    this.traceConfig = {
      events: false,
      resources: false,
      processes: false,
      simEvents: false,
    };
  }

  /**
   * Check if a specific trace type is enabled.
   *
   * @param type - The trace type to check
   * @returns true if the trace type is enabled
   */
  isTraceEnabled(type: keyof TraceOptions): boolean {
    return this.traceConfig[type] ?? false;
  }

  /**
   * Internal method to emit resource-related events for observability.
   * Called by Resource, Buffer, and Store classes.
   * @internal
   */
  _emitResource(operation: string, data: Record<string, unknown>): void {
    if (this.traceConfig.resources) {
      this.emit('trace:resource', { operation, time: this.currentTime, ...data });
    }
  }

  /**
   * Internal method to emit process-related events for observability.
   * Called by Process class.
   * @internal
   */
  _emitProcess(operation: string, data: Record<string, unknown>): void {
    if (this.traceConfig.processes) {
      this.emit('trace:process', { operation, time: this.currentTime, ...data });
    }
  }

  /**
   * Internal method to emit SimEvent-related events for observability.
   * Called by SimEvent class.
   * @internal
   */
  _emitSimEvent(operation: string, data: Record<string, unknown>): void {
    if (this.traceConfig.simEvents) {
      this.emit('trace:simevent', { operation, time: this.currentTime, ...data });
    }
  }
}
