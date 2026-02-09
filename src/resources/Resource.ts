import { Simulation } from '../core/Simulation.js';
import { Process, PreemptionError } from '../core/Process.js';
import { validateCapacity, validateRelease } from '../utils/validation.js';

/**
 * Configuration options for a resource
 */
export interface ResourceOptions {
  /** Name for the resource (for debugging/logging) */
  name?: string;
  /** Enable preemption (allows higher priority to interrupt lower priority) */
  preemptive?: boolean;
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
  ) {}
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
}

/**
 * Resource with limited capacity for discrete-event simulation.
 * Models servers, machines, workers, or any limited resource.
 * Supports FIFO queuing when capacity is exceeded.
 */
export class Resource {
  private readonly simulation: Simulation;
  private readonly capacity: number;
  private inUseCount: number;
  private readonly queue: QueuedRequest[];
  private readonly activeUsers: ActiveUser[];
  private readonly options: Required<ResourceOptions>;

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

    this.simulation = simulation;
    this.capacity = capacity;
    this.inUseCount = 0;
    this.queue = [];
    this.activeUsers = [];
    this.options = {
      name: options.name ?? 'Resource',
      preemptive: options.preemptive ?? false,
    };

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
   * Internal method called by Process to actually request the resource.
   * @param priority - Request priority (lower = higher priority)
   * @param onAcquired - Callback to invoke when resource is acquired
   * @param process - Process making the request (for preemption)
   * @internal
   */
  _acquire(priority: number, onAcquired: () => void, process?: Process): void {
    // Update statistics BEFORE changing state
    this.updateStatistics();

    this.totalRequestsCount++;

    if (this.inUseCount < this.capacity) {
      // Resource available, grant immediately
      this.inUseCount++;

      // Track active user if preemptive resource
      if (this.options.preemptive && process) {
        this.activeUsers.push({
          priority,
          process,
          acquiredAt: this.simulation.now,
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
        this.activeUsers.push({
          priority,
          process,
          acquiredAt: this.simulation.now,
        });

        onAcquired();
      } else {
        // Can't preempt, add to queue
        this.insertIntoQueue(priority, onAcquired, process);
      }
    } else {
      // Non-preemptive or no process reference, add to queue
      this.insertIntoQueue(priority, onAcquired, process);
    }
  }

  /**
   * Insert request into priority queue
   * @private
   */
  private insertIntoQueue(
    priority: number,
    onAcquired: () => void,
    process?: Process
  ): void {
    const newRequest: QueuedRequest = {
      requestTime: this.simulation.now,
      priority,
      onAcquired,
      process,
    };

    // Find insertion position to maintain priority order
    // Lower priority number = higher priority (served first)
    // Same priority maintains FIFO order (by requestTime)
    let insertIndex = 0;
    for (let i = 0; i < this.queue.length; i++) {
      const existingRequest = this.queue[i]!;

      // If existing request has lower priority (higher number), insert before it
      if (existingRequest.priority > priority) {
        break;
      }

      // If same priority, maintain FIFO order by request time
      if (
        existingRequest.priority === priority &&
        existingRequest.requestTime > newRequest.requestTime
      ) {
        break;
      }

      insertIndex = i + 1;
    }

    this.queue.splice(insertIndex, 0, newRequest);
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
   * @param process - Process releasing the resource (for preemptive resources)
   */
  release(process?: Process): void {
    // Validate release with helpful error message
    validateRelease(1, this.inUseCount, this.options.name);

    // Remove from active users if preemptive
    if (this.options.preemptive) {
      if (process) {
        // If process provided, remove it specifically
        const userIndex = this.activeUsers.findIndex((u) => u.process === process);
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

    // If there are queued requests, grant to next in line
    if (this.queue.length > 0) {
      const request = this.queue.shift()!;
      this.inUseCount++;

      // Track wait time
      const waitTime = this.simulation.now - request.requestTime;
      this.totalWaitTime += waitTime;

      // Add to active users if preemptive
      if (this.options.preemptive && request.process) {
        this.activeUsers.push({
          priority: request.priority,
          process: request.process,
          acquiredAt: this.simulation.now,
        });
      }

      // Schedule callback for immediate execution to avoid reentrancy
      // This ensures we don't try to resume a generator while it's still running
      this.simulation.schedule(0, () => request.onAcquired());
    }
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
    return this.capacity - this.inUseCount;
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
    return this.inUseCount / this.capacity;
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
