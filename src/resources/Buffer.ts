import { Simulation } from '../core/Simulation.js';
import { Process } from '../core/Process.js';
import {
  ValidationError,
  validatePositive,
  validateNonNegative,
  validateFinite,
} from '../utils/validation.js';
import {
  QueueDiscipline,
  QueueDisciplineConfig,
  validateQueueDiscipline,
  getDefaultQueueConfig,
} from '../types/queue-discipline.js';

/**
 * Configuration options for a buffer
 */
export interface BufferOptions {
  /** Name for the buffer (for debugging/logging) */
  name?: string;
  /** Initial level of tokens in the buffer (default: 0) */
  initialLevel?: number;
  /** Queue discipline for put queue (default: 'fifo') */
  putQueueDiscipline?: QueueDiscipline | QueueDisciplineConfig;
  /** Queue discipline for get queue (default: 'fifo') */
  getQueueDiscipline?: QueueDiscipline | QueueDisciplineConfig;
}

/**
 * Statistics collected for a buffer
 */
export interface BufferStatistics {
  /** Total number of put operations */
  totalPuts: number;
  /** Total number of get operations */
  totalGets: number;
  /** Total amount of tokens put into buffer */
  totalAmountPut: number;
  /** Total amount of tokens retrieved from buffer */
  totalAmountGot: number;
  /** Average time spent waiting to put */
  averagePutWaitTime: number;
  /** Average time spent waiting to get */
  averageGetWaitTime: number;
  /** Average buffer level over time (time-weighted) */
  averageLevel: number;
  /** Average put queue length over time (time-weighted) */
  averagePutQueueLength: number;
  /** Average get queue length over time (time-weighted) */
  averageGetQueueLength: number;
}

/**
 * Token returned by buffer.put() to be yielded in process generators
 */
export class BufferPutRequest {
  constructor(
    public readonly buffer: Buffer,
    public readonly amount: number,
    public readonly priority: number = 0
  ) {
    validatePositive(amount, 'amount', 'Put amount must be positive');
    if (!Number.isFinite(priority)) {
      throw new ValidationError(
        `Priority must be a finite number (got ${priority})`,
        { priority }
      );
    }
  }
}

/**
 * Token returned by buffer.get() to be yielded in process generators
 */
export class BufferGetRequest {
  constructor(
    public readonly buffer: Buffer,
    public readonly amount: number,
    public readonly priority: number = 0
  ) {
    validatePositive(amount, 'amount', 'Get amount must be positive');
    if (!Number.isFinite(priority)) {
      throw new ValidationError(
        `Priority must be a finite number (got ${priority})`,
        { priority }
      );
    }
  }
}

/**
 * Internal put request record for queue management
 */
interface QueuedPutRequest {
  /** Time when the request was made */
  requestTime: number;
  /** Priority of the request (lower = higher priority) */
  priority: number;
  /** Amount to put */
  amount: number;
  /** Callback to call when space is available */
  onAcquired: () => void;
  /** Process making the request */
  process?: Process;
}

/**
 * Internal get request record for queue management
 */
interface QueuedGetRequest {
  /** Time when the request was made */
  requestTime: number;
  /** Priority of the request (lower = higher priority) */
  priority: number;
  /** Amount to get */
  amount: number;
  /** Callback to call when tokens are available */
  onAcquired: () => void;
  /** Process making the request */
  process?: Process;
}

/**
 * Buffer resource that stores homogeneous quantities (tokens).
 *
 * Unlike Store which holds distinct objects, Buffer tracks a numerical
 * quantity of identical tokens. Perfect for modeling fuel tanks, money,
 * raw materials, bandwidth, etc.
 *
 * @example
 * ```typescript
 * const fuelTank = new Buffer(sim, 1000, {
 *   name: 'Fuel Tank',
 *   initialLevel: 500
 * });
 *
 * function* refuelTruck() {
 *   yield fuelTank.get(50);  // Get 50 gallons
 *   yield* timeout(10);       // Refuel for 10 minutes
 * }
 *
 * function* tankerDelivery() {
 *   yield* timeout(120);      // Travel time
 *   yield fuelTank.put(800);  // Deliver 800 gallons
 * }
 * ```
 */
export class Buffer {
  private readonly simulation: Simulation;
  private readonly capacityValue: number;
  private currentLevel: number;
  private readonly putQueue: QueuedPutRequest[];
  private readonly getQueue: QueuedGetRequest[];
  private readonly options: Required<Omit<BufferOptions, 'putQueueDiscipline' | 'getQueueDiscipline'>>;
  private readonly putQueueConfig: QueueDisciplineConfig;
  private readonly getQueueConfig: QueueDisciplineConfig;

  // Statistics tracking
  private totalPutsCount: number;
  private totalGetsCount: number;
  private totalAmountPutValue: number;
  private totalAmountGotValue: number;
  private totalPutWaitTime: number;
  private totalGetWaitTime: number;
  private levelSum: number;
  private levelSampleCount: number;
  private putQueueLengthSum: number;
  private putQueueSampleCount: number;
  private getQueueLengthSum: number;
  private getQueueSampleCount: number;
  private lastSampleTime: number;

  /**
   * Create a new buffer.
   * @param simulation - The simulation instance this buffer belongs to
   * @param capacity - Maximum capacity of the buffer (must be > 0)
   * @param options - Optional configuration
   */
  constructor(
    simulation: Simulation,
    capacity: number,
    options: BufferOptions = {}
  ) {
    // Validate capacity
    validateFinite(capacity, 'capacity', 'Buffer capacity must be a finite number');
    validatePositive(capacity, 'capacity', 'Buffer capacity must be positive');

    // Validate initial level if provided
    const initialLevel = options.initialLevel ?? 0;
    validateNonNegative(
      initialLevel,
      'initialLevel',
      'Initial level cannot be negative'
    );

    if (initialLevel > capacity) {
      throw new ValidationError(
        `Initial level (${initialLevel}) cannot exceed capacity (${capacity})`,
        { initialLevel, capacity }
      );
    }

    // Validate name if provided
    if (options.name !== undefined && options.name.trim() === '') {
      throw new ValidationError('Buffer name cannot be empty', {
        name: options.name,
      });
    }

    this.simulation = simulation;
    this.capacityValue = capacity;
    this.currentLevel = initialLevel;
    this.putQueue = [];
    this.getQueue = [];
    this.options = {
      name: options.name ?? 'Buffer',
      initialLevel: initialLevel,
    };

    // Configure queue disciplines
    this.putQueueConfig = options.putQueueDiscipline
      ? validateQueueDiscipline(options.putQueueDiscipline)
      : getDefaultQueueConfig();
    this.getQueueConfig = options.getQueueDiscipline
      ? validateQueueDiscipline(options.getQueueDiscipline)
      : getDefaultQueueConfig();

    // Initialize statistics
    this.totalPutsCount = 0;
    this.totalGetsCount = 0;
    this.totalAmountPutValue = 0;
    this.totalAmountGotValue = 0;
    this.totalPutWaitTime = 0;
    this.totalGetWaitTime = 0;
    this.levelSum = 0;
    this.levelSampleCount = 0;
    this.putQueueLengthSum = 0;
    this.putQueueSampleCount = 0;
    this.getQueueLengthSum = 0;
    this.getQueueSampleCount = 0;
    this.lastSampleTime = simulation.now;
  }

  /**
   * Request to put tokens into the buffer.
   * Returns a token that should be yielded in a process generator.
   * The process will pause until there is sufficient space.
   *
   * @param amount - Amount of tokens to put (must be > 0)
   * @returns Token to yield in generator function
   *
   * @example
   * ```typescript
   * function* producer() {
   *   yield buffer.put(100);  // Put 100 tokens
   *   // Buffer now has 100 more tokens
   * }
   * ```
   */
  put(amount: number, priority: number = 0): BufferPutRequest {
    return new BufferPutRequest(this, amount, priority);
  }

  /**
   * Request to get tokens from the buffer.
   * Returns a token that should be yielded in a process generator.
   * The process will pause until there are sufficient tokens.
   *
   * @param amount - Amount of tokens to get (must be > 0)
   * @returns Token to yield in generator function
   *
   * @example
   * ```typescript
   * function* consumer() {
   *   yield buffer.get(50);  // Get 50 tokens
   *   // Buffer now has 50 fewer tokens
   * }
   * ```
   */
  get(amount: number, priority: number = 0): BufferGetRequest {
    return new BufferGetRequest(this, amount, priority);
  }

  /**
   * Internal method called by Process to actually put tokens.
   * @param amount - Amount to put
   * @param onAcquired - Callback to invoke when space is available
   * @param process - Process making the request
   * @internal
   */
  _put(
    amount: number,
    priority: number,
    onAcquired: () => void,
    process?: Process
  ): void {
    // Validate amount doesn't exceed capacity
    if (amount > this.capacityValue) {
      throw new ValidationError(
        `Put amount (${amount}) exceeds buffer capacity (${this.capacityValue})`,
        { amount, capacity: this.capacityValue }
      );
    }

    // Update statistics BEFORE changing state
    this.updateStatistics();

    this.totalPutsCount++;
    this.totalAmountPutValue += amount;

    if (this.currentLevel + amount <= this.capacityValue) {
      // Space available, put immediately
      this.currentLevel += amount;

      // Execute callback immediately (synchronously)
      onAcquired();

      // Try to fulfill waiting get requests
      this.tryFulfillGets();
    } else {
      // Not enough space, add to queue using discipline
      this.insertIntoPutQueue(priority, amount, onAcquired, process);
    }
  }

  /**
   * Internal method called by Process to actually get tokens.
   * @param amount - Amount to get
   * @param onAcquired - Callback to invoke when tokens are available
   * @param process - Process making the request
   * @internal
   */
  _get(
    amount: number,
    priority: number,
    onAcquired: () => void,
    process?: Process
  ): void {
    // Update statistics BEFORE changing state
    this.updateStatistics();

    this.totalGetsCount++;
    this.totalAmountGotValue += amount;

    if (this.currentLevel >= amount) {
      // Tokens available, get immediately
      this.currentLevel -= amount;

      // Execute callback immediately (synchronously)
      onAcquired();

      // Try to fulfill waiting put requests
      this.tryFulfillPuts();
    } else {
      // Not enough tokens, add to queue using discipline
      this.insertIntoGetQueue(priority, amount, onAcquired, process);
    }
  }

  /**
   * Try to fulfill waiting get requests after a put.
   * @private
   */
  private tryFulfillGets(): void {
    while (this.getQueue.length > 0) {
      const request = this.getQueue[0]!;

      if (this.currentLevel >= request.amount) {
        // Can fulfill this request
        this.getQueue.shift();
        this.currentLevel -= request.amount;

        // Track wait time
        const waitTime = this.simulation.now - request.requestTime;
        this.totalGetWaitTime += waitTime;

        // Schedule callback for immediate execution to avoid reentrancy
        this.simulation.schedule(0, () => request.onAcquired());
      } else {
        // Can't fulfill, stop trying
        break;
      }
    }
  }

  /**
   * Try to fulfill waiting put requests after a get.
   * @private
   */
  private tryFulfillPuts(): void {
    while (this.putQueue.length > 0) {
      const request = this.putQueue[0]!;

      if (this.currentLevel + request.amount <= this.capacityValue) {
        // Can fulfill this request
        this.putQueue.shift();
        this.currentLevel += request.amount;

        // Track wait time
        const waitTime = this.simulation.now - request.requestTime;
        this.totalPutWaitTime += waitTime;

        // Schedule callback for immediate execution to avoid reentrancy
        this.simulation.schedule(0, () => request.onAcquired());

        // Try to fulfill any waiting gets
        this.tryFulfillGets();
      } else {
        // Can't fulfill, stop trying
        break;
      }
    }
  }

  /**
   * Get the maximum capacity of the buffer.
   */
  get capacity(): number {
    return this.capacityValue;
  }

  /**
   * Get the current level of tokens in the buffer.
   */
  get level(): number {
    return this.currentLevel;
  }

  /**
   * Get the available space in the buffer.
   */
  get available(): number {
    return this.capacityValue - this.currentLevel;
  }

  /**
   * Get the current put queue length.
   */
  get putQueueLength(): number {
    return this.putQueue.length;
  }

  /**
   * Get the current get queue length.
   */
  get getQueueLength(): number {
    return this.getQueue.length;
  }

  /**
   * Get buffer name.
   */
  get name(): string {
    return this.options.name;
  }

  /**
   * Get comprehensive statistics for this buffer.
   */
  get stats(): BufferStatistics {
    this.updateStatistics();

    return {
      totalPuts: this.totalPutsCount,
      totalGets: this.totalGetsCount,
      totalAmountPut: this.totalAmountPutValue,
      totalAmountGot: this.totalAmountGotValue,
      averagePutWaitTime:
        this.totalPutsCount > 0
          ? this.totalPutWaitTime / this.totalPutsCount
          : 0,
      averageGetWaitTime:
        this.totalGetsCount > 0
          ? this.totalGetWaitTime / this.totalGetsCount
          : 0,
      averageLevel:
        this.levelSampleCount > 0 ? this.levelSum / this.levelSampleCount : 0,
      averagePutQueueLength:
        this.putQueueSampleCount > 0
          ? this.putQueueLengthSum / this.putQueueSampleCount
          : 0,
      averageGetQueueLength:
        this.getQueueSampleCount > 0
          ? this.getQueueLengthSum / this.getQueueSampleCount
          : 0,
    };
  }

  /**
   * Update statistics based on current state.
   * Should be called whenever the buffer state changes.
   * @private
   */
  private updateStatistics(): void {
    const currentTime = this.simulation.now;

    // Only update if time has advanced
    if (currentTime > this.lastSampleTime) {
      const timeDelta = currentTime - this.lastSampleTime;

      // Update time-weighted averages
      this.levelSum += this.currentLevel * timeDelta;
      this.levelSampleCount += timeDelta;

      this.putQueueLengthSum += this.putQueue.length * timeDelta;
      this.putQueueSampleCount += timeDelta;

      this.getQueueLengthSum += this.getQueue.length * timeDelta;
      this.getQueueSampleCount += timeDelta;

      this.lastSampleTime = currentTime;
    }
  }

  /**
   * Insert request into put queue according to the configured queue discipline.
   * @private
   */
  private insertIntoPutQueue(
    priority: number,
    amount: number,
    onAcquired: () => void,
    process?: Process
  ): void {
    const newRequest: QueuedPutRequest = {
      requestTime: this.simulation.now,
      priority,
      amount,
      onAcquired,
      process,
    };

    this.insertIntoQueue(this.putQueue, newRequest, this.putQueueConfig);
  }

  /**
   * Insert request into get queue according to the configured queue discipline.
   * @private
   */
  private insertIntoGetQueue(
    priority: number,
    amount: number,
    onAcquired: () => void,
    process?: Process
  ): void {
    const newRequest: QueuedGetRequest = {
      requestTime: this.simulation.now,
      priority,
      amount,
      onAcquired,
      process,
    };

    this.insertIntoQueue(this.getQueue, newRequest, this.getQueueConfig);
  }

  /**
   * Generic queue insertion based on discipline.
   * @private
   */
  private insertIntoQueue<T extends { priority: number; requestTime: number }>(
    queue: T[],
    newRequest: T,
    config: QueueDisciplineConfig
  ): void {
    switch (config.type) {
      case 'fifo':
        queue.push(newRequest);
        break;

      case 'lifo':
        queue.unshift(newRequest);
        break;

      case 'priority':
        this.insertByPriority(queue, newRequest, config.tieBreaker === 'fifo');
        break;
    }
  }

  /**
   * Insert into queue by priority.
   * @private
   */
  private insertByPriority<T extends { priority: number; requestTime: number }>(
    queue: T[],
    newRequest: T,
    useFifoTieBreaker: boolean
  ): void {
    let left = 0;
    let right = queue.length;

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      const existingRequest = queue[mid]!;

      if (existingRequest.priority < newRequest.priority) {
        left = mid + 1;
      } else if (existingRequest.priority > newRequest.priority) {
        right = mid;
      } else {
        // Same priority - use tie-breaker
        if (useFifoTieBreaker) {
          if (existingRequest.requestTime <= newRequest.requestTime) {
            left = mid + 1;
          } else {
            right = mid;
          }
        } else {
          right = mid;
        }
      }
    }

    queue.splice(left, 0, newRequest);
  }
}
