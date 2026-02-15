import { Simulation } from './Simulation.js';
import { Process } from './Process.js';
import { validateName } from '../utils/validation.js';

/**
 * Yielded value representing a request to wait for an event.
 * Created by SimEvent.wait() method.
 * Do not instantiate directly - use event.wait() instead.
 *
 * @example
 * ```typescript
 * function* myProcess() {
 *   const event = new SimEvent(sim, 'shift-change');
 *   yield event.wait(); // Wait for event to be triggered
 * }
 * ```
 */
export class SimEventRequest {
  constructor(
    public readonly event: SimEvent,
    public value?: unknown
  ) {}
}

/**
 * Event for process coordination in discrete-event simulation.
 * Allows processes to wait for events and trigger them, enabling
 * coordination patterns like barriers, broadcasts, and conditional waiting.
 *
 * Similar to Python's SimPy Event class.
 *
 * @example
 * ```typescript
 * // Traffic light coordination
 * const greenLight = new SimEvent(sim, 'green-light');
 *
 * function* car(id: number) {
 *   console.log(`Car ${id} waiting at red light`);
 *   yield greenLight.wait(); // Wait for green light
 *   console.log(`Car ${id} driving through intersection`);
 * }
 *
 * // Start cars
 * sim.process(() => car(1));
 * sim.process(() => car(2));
 *
 * // Change light after delay
 * sim.process(function* () {
 *   yield* timeout(10);
 *   greenLight.trigger(); // All waiting cars proceed
 * });
 * ```
 */
export class SimEvent {
  private readonly simulation: Simulation;
  private readonly eventName: string;
  private waitingProcesses: Array<{
    process: Process;
    callback: () => void;
    request: SimEventRequest;
  }> = [];
  private triggered: boolean = false;
  private triggerValue?: unknown;

  /**
   * Create a new event.
   *
   * @param simulation - The simulation instance this event belongs to
   * @param name - Optional name for the event (useful for debugging and tracing)
   *
   * @example
   * ```typescript
   * const shiftChange = new SimEvent(sim, 'shift-change');
   * const alarm = new SimEvent(sim, 'fire-alarm');
   * ```
   */
  constructor(simulation: Simulation, name?: string) {
    this.simulation = simulation;
    this.eventName = name ?? `event-${Math.random().toString(36).substr(2, 9)}`;

    if (name !== undefined) {
      validateName(this.eventName, 'name');
    }
  }

  /**
   * Get the name of this event.
   *
   * @returns The event name
   *
   * @example
   * ```typescript
   * const event = new SimEvent(sim, 'shift-change');
   * console.log(event.name); // 'shift-change'
   * ```
   */
  get name(): string {
    return this.eventName;
  }

  /**
   * Check if the event has been triggered.
   *
   * @returns true if event was triggered, false otherwise
   *
   * @example
   * ```typescript
   * if (event.isTriggered) {
   *   console.log('Event already triggered');
   * }
   * ```
   */
  get isTriggered(): boolean {
    return this.triggered;
  }

  /**
   * Get the value passed when the event was triggered.
   * Only available after the event has been triggered.
   *
   * @returns The trigger value, or undefined if not triggered or no value provided
   *
   * @example
   * ```typescript
   * event.trigger({ temperature: 100 });
   * console.log(event.value); // { temperature: 100 }
   * ```
   */
  get value(): unknown {
    return this.triggerValue;
  }

  /**
   * Wait for this event to be triggered.
   * Use with yield in generator functions.
   * If the event is already triggered, returns immediately.
   *
   * @returns SimEventRequest that can be yielded in a process
   *
   * @example
   * ```typescript
   * function* myProcess() {
   *   const event = new SimEvent(sim, 'alarm');
   *   yield event.wait(); // Wait for alarm event
   *   console.log('Alarm triggered!');
   * }
   * ```
   */
  wait(): SimEventRequest {
    return new SimEventRequest(this);
  }

  /**
   * Trigger the event, resuming all waiting processes.
   * If the event is already triggered, this is a no-op.
   * All waiting processes will resume in the same time step (priority order).
   *
   * @param value - Optional value to pass to waiting processes
   *
   * @example
   * ```typescript
   * // Simple trigger
   * greenLight.trigger();
   *
   * // Trigger with data
   * alarm.trigger({ severity: 'high', location: 'building-A' });
   * ```
   */
  trigger(value?: unknown): void {
    if (this.triggered) {
      // Event already triggered, ignore
      return;
    }

    this.triggered = true;
    this.triggerValue = value;

    // Emit event for observability
    this.simulation._emitSimEvent('event:trigger', {
      event: this,
      name: this.eventName,
      value,
      waitingProcessCount: this.waitingProcesses.length,
    });

    // Resume all waiting processes at current time (priority 0)
    // We make a copy of the array because callbacks might modify the original
    const processesToResume = [...this.waitingProcesses];
    this.waitingProcesses = [];

    for (const { callback, request } of processesToResume) {
      // Store the value in the request so the process can access it
      request.value = value;
      // Schedule callback at current time
      this.simulation.schedule(0, callback, 0);
    }
  }

  /**
   * Reset the event to its initial state.
   * Clears the triggered flag and value, but does NOT affect waiting processes.
   * Use this to reuse an event for multiple triggers.
   *
   * @example
   * ```typescript
   * // Recurring event pattern
   * const bell = new SimEvent(sim, 'bell');
   *
   * function* bellRinger() {
   *   while (true) {
   *     yield* timeout(60); // Ring every 60 time units
   *     bell.trigger();
   *     bell.reset(); // Reset for next ring
   *   }
   * }
   * ```
   */
  reset(): void {
    this.triggered = false;
    this.triggerValue = undefined;

    // Emit event for observability
    this.simulation._emitSimEvent('event:reset', {
      event: this,
      name: this.eventName,
    });
  }

  /**
   * Get the number of processes waiting for this event.
   *
   * @returns Number of waiting processes
   *
   * @example
   * ```typescript
   * console.log(`${event.waitingCount} processes waiting for event`);
   * ```
   */
  get waitingCount(): number {
    return this.waitingProcesses.length;
  }

  /**
   * Internal method to register a process waiting for this event.
   * Called by Process when it yields an SimEventRequest.
   * @internal
   */
  _addWaiter(callback: () => void, process: Process, request: SimEventRequest): void {
    if (this.triggered) {
      // Event already triggered, resume immediately
      request.value = this.triggerValue;
      this.simulation.schedule(0, callback, 0);
      return;
    }

    // Add to waiting list
    this.waitingProcesses.push({ process, callback, request });

    // Emit event for observability
    this.simulation._emitSimEvent('event:wait', {
      event: this,
      name: this.eventName,
      process,
      waitingCount: this.waitingProcesses.length,
    });
  }

  /**
   * Internal method to remove a process from waiting list.
   * Called when a waiting process is interrupted.
   * @internal
   */
  _removeWaiter(process: Process): void {
    const initialLength = this.waitingProcesses.length;
    this.waitingProcesses = this.waitingProcesses.filter(
      (w) => w.process !== process
    );

    // Emit event for observability if a waiter was actually removed
    if (this.waitingProcesses.length < initialLength) {
      this.simulation._emitSimEvent('event:waiter-removed', {
        event: this,
        name: this.eventName,
        process,
        waitingCount: this.waitingProcesses.length,
      });
    }
  }
}
