import { Simulation } from '../core/Simulation.js';
import { Process, PreemptionError } from '../core/Process.js';
import {
  ValidationError,
  validateCapacity,
  validateRelease,
} from '../utils/validation.js';
import {
  QueueDiscipline,
  QueueDisciplineConfig,
  validateQueueDiscipline,
  getDefaultQueueConfig,
} from '../types/queue-discipline.js';

/**
 * Configuration options for a resource
 */
export interface ResourceOptions {
  /** Name for the resource (for debugging/logging) */
  name?: string;
  /** Enable preemption (allows higher priority to interrupt lower priority) */
  preemptive?: boolean;
  /** Queue discipline (fifo, lifo, or priority). Default: 'fifo' for non-preemptive, 'priority' for preemptive */
  queueDiscipline?: QueueDiscipline | QueueDisciplineConfig;
}

/**
 * Statistics collected for a resource
 */
export interface ResourceStatistics {
  /** Total number of request calls */
  totalRequests: number;
  /** Total number of release calls */
  totalReleases: number;
  /** Average time spent waiting in queue */
  averageWaitTime: number;
  /** Average queue length over time */
  averageQueueLength: number;
  /** Resource utilization rate (0-1) */
  utilizationRate: number;
  /** Total number of preemptions (only if preemptive) */
  totalPreemptions: number;
}

/**
 * Token returned by resource.request() to be yielded in process generators
 */
export class ResourceRequest {
  constructor(
    public readonly resource: Resource,
    public readonly priority: number = 0
  ) {
    // Validate priority
    if (!Number.isFinite(priority)) {
      throw new ValidationError(
        `Priority must be a finite number (got ${priority}). Lower numbers have higher priority.`,
        { priority }
      );
    }
    // Note: Negative priorities are allowed (lower number = higher priority)
  }

  private granted = false;
  private released = false;
  private preempted = false;

  /** True once the resource granted this request a unit */
  get isGranted(): boolean {
    return this.granted;
  }

  /** True after release(request) returned the unit */
  get isReleased(): boolean {
    return this.released;
  }

  /** True if a higher-priority request took the unit away (preemptive resources) */
  get isPreempted(): boolean {
    return this.preempted;
  }

  /** True while this request holds a unit of the resource */
  get holdsUnit(): boolean {
    return this.granted && !this.released && !this.preempted;
  }

  /** @internal */
  _markGranted(): void {
    this.granted = true;
  }

  /** @internal */
  _markReleased(): void {
    this.released = true;
  }

  /** @internal */
  _markPreempted(): void {
    this.preempted = true;
  }
}

/**
 * Internal request record for queue management
 */
interface QueuedRequest {
  /** Time when the request was made */
  requestTime: number;
  /** Priority of the request (lower = higher priority) */
  priority: number;
  /** Callback to call when resource is acquired */
  onAcquired: () => void;
  /** Process making the request (for preemption) */
  process?: Process;
  /** The request object, when known (for ownership tracking) */
  request?: ResourceRequest;
}

/**
 * Active user of a resource (for preemption tracking)
 */
interface ActiveUser {
  /** Priority of the user */
  priority: number;
  /** Process using the resource */
  process: Process;
  /** Time when resource was acquired */
  acquiredAt: number;
  /** The request that holds the unit, when known */
  request?: ResourceRequest;
}

/**
 * Resource with limited capacity for discrete-event simulation.
 * Models servers, machines, workers, or any limited resource.
 * Supports FIFO queuing when capacity is exceeded.
 */
export class Resource {
  private readonly simulation: Simulation;
  private capacityValue: number;
  private inUseCount: number;
  private readonly queue: QueuedRequest[];
  private readonly activeUsers: ActiveUser[];
  private readonly options: Required<Omit<ResourceOptions, 'queueDiscipline'>>;
  private readonly queueConfig: QueueDisciplineConfig;

  // Statistics tracking
  private totalRequestsCount: number;
  private totalReleasesCount: number;
  private totalWaitTime: number;
  private totalPreemptionsCount: number;
  private queueLengthSum: number;
  private queueLengthSampleCount: number;
  private utilizationSum: number;
  private utilizationSampleCount: number;
  private lastSampleTime: number;

  /**
   * Create a new resource.
   * @param simulation - The simulation instance this resource belongs to
   * @param capacity - Maximum number of concurrent users (must be >= 1)
   * @param options - Optional configuration
   */
  constructor(
    simulation: Simulation,
    capacity: number,
    options: ResourceOptions = {}
  ) {
    // Validate capacity with helpful error message
    validateCapacity(capacity, options.name);

    // Validate name if provided
    if (options.name !== undefined && options.name.trim() === '') {
      throw new ValidationError('Resource name cannot be empty', {
        name: options.name,
      });
    }

    this.simulation = simulation;
    this.capacityValue = capacity;
    this.inUseCount = 0;
    this.queue = [];
    this.activeUsers = [];
    this.options = {
      name: options.name ?? 'Resource',
      preemptive: options.preemptive ?? false,
    };

    // Determine queue discipline
    // Default: 'priority' if preemptive, 'fifo' otherwise
    if (options.queueDiscipline) {
      this.queueConfig = validateQueueDiscipline(options.queueDiscipline);
    } else {
      this.queueConfig = this.options.preemptive
        ? { type: 'priority', tieBreaker: 'fifo' }
        : getDefaultQueueConfig();
    }

    // Initialize statistics
    this.totalRequestsCount = 0;
    this.totalReleasesCount = 0;
    this.totalWaitTime = 0;
    this.totalPreemptionsCount = 0;
    this.queueLengthSum = 0;
    this.queueLengthSampleCount = 0;
    this.utilizationSum = 0;
    this.utilizationSampleCount = 0;
    this.lastSampleTime = simulation.now;
    simulation._registerCollector(this);
  }

  /**
   * Start the statistics over from the current time. Units in use, active
   * users and the queue are untouched; counters and time-weighted sums begin
   * again, so averages describe only what happens from now on.
   */
  resetStatistics(): void {
    this.totalRequestsCount = 0;
    this.totalReleasesCount = 0;
    this.totalWaitTime = 0;
    this.totalPreemptionsCount = 0;
    this.queueLengthSum = 0;
    this.queueLengthSampleCount = 0;
    this.utilizationSum = 0;
    this.utilizationSampleCount = 0;
    this.lastSampleTime = this.simulation.now;
  }

  /**
   * Request access to the resource.
   * Returns a token that should be yielded in a process generator.
   * The process will pause until the resource becomes available.
   *
   * @param priority - Request priority (lower = higher priority, default = 0)
   * @returns Token to yield in generator function
   *
   * @example
   * function* myProcess() {
   *   yield resource.request();     // Normal priority (0)
   *   yield resource.request(-1);   // High priority
   *   yield resource.request(10);   // Low priority
   *   // Resource is now acquired
   *   yield* timeout(10);
   *   resource.release();
   * }
   */
  request(priority: number = 0): ResourceRequest {
    return new ResourceRequest(this, priority);
  }

  /**
   * Acquire a unit and get the granted request back, typed. Use with yield*.
   * Equivalent to `const req = resource.request(p); yield req;`.
   *
   * @example
   * ```typescript
   * const grant = yield* server.acquire();
   * yield* timeout(5);
   * server.release(grant);
   * ```
   */
  *acquire(
    priority: number = 0
  ): Generator<ResourceRequest, ResourceRequest, void> {
    const request = this.request(priority);
    yield request;
    return request;
  }

  /**
   * Internal method called by Process to actually request the resource.
   * @param priority - Request priority (lower = higher priority)
   * @param onAcquired - Callback to invoke when resource is acquired
   * @param process - Process making the request (for preemption)
   * @internal
   */
  _acquire(
    priority: number,
    onAcquired: () => void,
    process?: Process,
    request?: ResourceRequest
  ): void {
    // Update statistics BEFORE changing state
    this.updateStatistics();

    this.totalRequestsCount++;
    this.trace('resource:request', process, { priority });

    if (this.inUseCount < this.capacityValue) {
      // Resource available, grant immediately
      this.inUseCount++;
      request?._markGranted();
      this.trace('resource:grant', process, { priority, waited: 0 });

      // Track active user if preemptive resource
      if (this.options.preemptive && process) {
        this.activeUsers.push({
          priority,
          process,
          acquiredAt: this.simulation.now,
          request,
        });
      }

      // Execute callback immediately (synchronously)
      onAcquired();
    } else if (this.options.preemptive && process) {
      // Check if we can preempt a lower priority user
      const lowestPriorityUser = this.findLowestPriorityUser();

      if (lowestPriorityUser && priority < lowestPriorityUser.priority) {
        // Preempt the lowest priority user
        this.preempt(lowestPriorityUser);

        // Grant resource to new request
        this.inUseCount++;
        request?._markGranted();
        this.trace('resource:grant', process, { priority, waited: 0 });
        this.activeUsers.push({
          priority,
          process,
          acquiredAt: this.simulation.now,
          request,
        });

        onAcquired();
      } else {
        // Can't preempt, add to queue
        this.insertIntoQueue(priority, onAcquired, process, request);
      }
    } else {
      // Non-preemptive or no process reference, add to queue
      this.insertIntoQueue(priority, onAcquired, process, request);
    }
  }

  /**
   * Remove a waiting request from the queue, identified by its callback.
   * Used when a process is interrupted or when a composite wait (anyOf) is
   * settled by another branch. No-op if the request is not queued (for
   * example because it was already granted).
   *
   * @returns true if a queued request was removed
   * @internal
   */
  _cancelAcquire(onAcquired: () => void): boolean {
    const index = this.queue.findIndex((q) => q.onAcquired === onAcquired);
    if (index === -1) {
      return false;
    }
    this.updateStatistics();
    const [removed] = this.queue.splice(index, 1);
    this.trace('resource:cancel', removed?.process, {});
    return true;
  }

  /**
   * Emit a trace event for this resource (no-op unless resource tracing is on).
   * @private
   */
  private trace(
    operation: string,
    process: Process | undefined,
    extra: Record<string, unknown>
  ): void {
    this.simulation._emitResource(operation, {
      resource: this,
      name: this.options.name,
      processId: process?.id,
      processName: process?.name,
      inUse: this.inUseCount,
      queueLength: this.queue.length,
      ...extra,
    });
  }

  /**
   * Insert request into queue according to the configured queue discipline.
   * @private
   */
  private insertIntoQueue(
    priority: number,
    onAcquired: () => void,
    process?: Process,
    request?: ResourceRequest
  ): void {
    const newRequest: QueuedRequest = {
      requestTime: this.simulation.now,
      priority,
      onAcquired,
      process,
      request,
    };

    switch (this.queueConfig.type) {
      case 'fifo':
        // First In First Out - append to end
        this.queue.push(newRequest);
        break;

      case 'lifo':
        // Last In First Out - prepend to front
        this.queue.unshift(newRequest);
        break;

      case 'priority':
        // Priority-based with configurable tie-breaker
        this.insertByPriority(newRequest);
        break;
    }
  }

  /**
   * Insert request into priority queue using binary search.
   * O(log n) search + O(n) splice, but faster for large queues.
   * @private
   */
  private insertByPriority(newRequest: QueuedRequest): void {
    // Binary search to find insertion position
    // Lower priority number = higher priority (served first)
    // Tie-breaker determines order for same-priority requests
    let left = 0;
    let right = this.queue.length;

    const useFifoTieBreaker = this.queueConfig.tieBreaker === 'fifo';

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      const existingRequest = this.queue[mid]!;

      // Compare priorities first
      if (existingRequest.priority < newRequest.priority) {
        // Existing request has higher priority, search right half
        left = mid + 1;
      } else if (existingRequest.priority > newRequest.priority) {
        // Existing request has lower priority, search left half
        right = mid;
      } else {
        // Same priority - use tie-breaker
        if (useFifoTieBreaker) {
          // FIFO: compare request times
          if (existingRequest.requestTime <= newRequest.requestTime) {
            left = mid + 1;
          } else {
            right = mid;
          }
        } else {
          // LIFO: insert before existing request
          right = mid;
        }
      }
    }

    this.queue.splice(left, 0, newRequest);
  }

  /**
   * Find the active user with the lowest priority (highest priority number)
   * @private
   */
  private findLowestPriorityUser(): ActiveUser | null {
    if (this.activeUsers.length === 0) return null;

    return this.activeUsers.reduce((lowest, user) =>
      user.priority > lowest.priority ? user : lowest
    );
  }

  /**
   * Preempt an active user
   * @private
   */
  private preempt(user: ActiveUser): void {
    // Check if process is still running before preempting
    if (!user.process.isRunning) {
      // Process already completed, just remove from active users
      const index = this.activeUsers.indexOf(user);
      if (index >= 0) {
        this.activeUsers.splice(index, 1);
      }
      return; // Don't count this as a preemption
    }

    // Remove from active users
    const index = this.activeUsers.indexOf(user);
    if (index >= 0) {
      this.activeUsers.splice(index, 1);
    }

    this.inUseCount--;
    this.totalPreemptionsCount++;
    user.request?._markPreempted();
    this.trace('resource:preempt', user.process, { priority: user.priority });

    // Interrupt the process
    user.process.interrupt(
      new PreemptionError(
        `Preempted by higher priority request at time ${this.simulation.now}`
      )
    );
  }

  /**
   * Release the resource, making it available for the next queued request.
   * Throws an error if attempting to release more than currently in use.
   * Pass the request that was granted to get ownership checks: releasing a
   * request that never held a unit, was already released, or was preempted
   * throws a ValidationError instead of silently corrupting the count.
   *
   * @param target - The granted ResourceRequest (checked), or for the legacy
   *                 unchecked form nothing / the releasing Process
   */
  release(target?: ResourceRequest | Process): void {
    let process: Process | undefined;
    let request: ResourceRequest | undefined;
    if (target instanceof ResourceRequest) {
      request = target;
      if (request.resource !== this) {
        throw new ValidationError(
          `Cannot release resource '${this.options.name}' with a request made on '${request.resource.name}'`,
          {
            resource: this.options.name,
            requestResource: request.resource.name,
          }
        );
      }
      if (!request.isGranted) {
        throw new ValidationError(
          `Cannot release resource '${this.options.name}': this request was never granted (yield it first)`,
          { resource: this.options.name }
        );
      }
      if (request.isPreempted) {
        throw new ValidationError(
          `Cannot release resource '${this.options.name}': this request was preempted and its unit already reassigned`,
          { resource: this.options.name }
        );
      }
      if (request.isReleased) {
        throw new ValidationError(
          `Cannot release resource '${this.options.name}': this request was already released`,
          { resource: this.options.name }
        );
      }
    } else {
      process = target;
    }

    // Validate release with helpful error message
    validateRelease(1, this.inUseCount, this.options.name);
    request?._markReleased();

    // Remove from active users if preemptive
    if (this.options.preemptive) {
      if (request) {
        const userIndex = this.activeUsers.findIndex(
          (u) => u.request === request
        );
        if (userIndex >= 0) {
          this.activeUsers.splice(userIndex, 1);
        }
      } else if (process) {
        // If process provided, remove it specifically
        const userIndex = this.activeUsers.findIndex(
          (u) => u.process === process
        );
        if (userIndex >= 0) {
          this.activeUsers.splice(userIndex, 1);
        }
      } else {
        // No process provided - clean up any completed processes in activeUsers
        // This handles cases where processes complete without passing themselves to release()
        const completedIndices: number[] = [];
        for (let i = 0; i < this.activeUsers.length; i++) {
          if (!this.activeUsers[i]!.process.isRunning) {
            completedIndices.push(i);
          }
        }
        // Remove completed processes in reverse order to maintain indices
        for (let i = completedIndices.length - 1; i >= 0; i--) {
          this.activeUsers.splice(completedIndices[i]!, 1);
        }
      }
    }

    // Update statistics BEFORE changing state
    this.updateStatistics();

    this.totalReleasesCount++;
    this.inUseCount--;
    this.trace('resource:release', process, {});

    // Grant to the next in line while capacity allows (after setCapacity()
    // shrank the pool, units are shed here until inUse is back under capacity)
    this.grantQueued();
  }

  /**
   * Grant queued requests while units are available.
   * @private
   */
  private grantQueued(): void {
    while (this.queue.length > 0 && this.inUseCount < this.capacityValue) {
      const request = this.queue.shift()!;
      this.inUseCount++;

      // Track wait time
      const waitTime = this.simulation.now - request.requestTime;
      this.totalWaitTime += waitTime;

      request.request?._markGranted();
      this.trace('resource:grant', request.process, {
        priority: request.priority,
        waited: waitTime,
      });

      // Add to active users if preemptive
      if (this.options.preemptive && request.process) {
        this.activeUsers.push({
          priority: request.priority,
          process: request.process,
          acquiredAt: this.simulation.now,
          request: request.request,
        });
      }

      // Schedule callback for immediate execution to avoid reentrancy
      // This ensures we don't try to resume a generator while it's still running
      this.simulation.schedule(0, () => request.onAcquired());
    }
  }

  /**
   * Current capacity (number of units that can be in use at once).
   */
  get capacity(): number {
    return this.capacityValue;
  }

  /**
   * Change the capacity while the simulation runs, for shift patterns and
   * time-varying staffing (see Schedule).
   *
   * Increasing capacity immediately grants waiting requests. Decreasing it
   * below the number of units in use does not interrupt anyone: the surplus
   * units are shed as they are released, and no queued request is granted
   * until usage is back under the new capacity.
   *
   * @param capacity - New capacity (positive integer)
   *
   * @example
   * ```typescript
   * const shifts = new Schedule<number>(sim, { period: 24, segments: [
   *   { from: 0, to: 8, value: 1 }, { from: 8, to: 17, value: 4 }, { from: 17, to: 24, value: 2 },
   * ]});
   * shifts.onChange((staff) => tellers.setCapacity(staff), { immediate: true });
   * ```
   */
  setCapacity(capacity: number): void {
    validateCapacity(capacity, this.options.name);
    if (capacity === this.capacityValue) return;
    this.updateStatistics();
    this.capacityValue = capacity;
    this.grantQueued();
  }

  /**
   * Get the number of resource units currently in use.
   */
  get inUse(): number {
    return this.inUseCount;
  }

  /**
   * Get the number of available resource units.
   */
  get available(): number {
    return Math.max(0, this.capacityValue - this.inUseCount);
  }

  /**
   * Get the current queue length.
   */
  get queueLength(): number {
    return this.queue.length;
  }

  /**
   * Get the current utilization rate (0-1).
   */
  get utilization(): number {
    return Math.min(1, this.inUseCount / this.capacityValue);
  }

  /**
   * Get resource name.
   */
  get name(): string {
    return this.options.name;
  }

  /**
   * Get comprehensive statistics for this resource.
   */
  get stats(): ResourceStatistics {
    this.updateStatistics();

    return {
      totalRequests: this.totalRequestsCount,
      totalReleases: this.totalReleasesCount,
      averageWaitTime:
        this.totalRequestsCount > 0
          ? this.totalWaitTime / this.totalRequestsCount
          : 0,
      averageQueueLength:
        this.queueLengthSampleCount > 0
          ? this.queueLengthSum / this.queueLengthSampleCount
          : 0,
      utilizationRate:
        this.utilizationSampleCount > 0
          ? this.utilizationSum / this.utilizationSampleCount
          : 0,
      totalPreemptions: this.totalPreemptionsCount,
    };
  }

  /**
   * Update statistics based on current state.
   * Should be called whenever the resource state changes.
   */
  private updateStatistics(): void {
    const currentTime = this.simulation.now;

    // Only update if time has advanced
    if (currentTime > this.lastSampleTime) {
      const timeDelta = currentTime - this.lastSampleTime;

      // Update time-weighted averages
      this.queueLengthSum += this.queue.length * timeDelta;
      this.queueLengthSampleCount += timeDelta;

      this.utilizationSum += this.utilization * timeDelta;
      this.utilizationSampleCount += timeDelta;

      this.lastSampleTime = currentTime;
    }
  }
}
