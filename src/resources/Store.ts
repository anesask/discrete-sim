import { Simulation } from '../core/Simulation.js';
import { Process } from '../core/Process.js';
import {
  ValidationError,
  validatePositive,
  validateFinite,
} from '../utils/validation.js';

/**
 * Configuration options for a store
 */
export interface StoreOptions {
  /** Name for the store (for debugging/logging) */
  name?: string;
}

/**
 * Statistics collected for a store
 */
export interface StoreStatistics {
  /** Total number of put operations */
  totalPuts: number;
  /** Total number of get operations */
  totalGets: number;
  /** Average time spent waiting to put */
  averagePutWaitTime: number;
  /** Average time spent waiting to get */
  averageGetWaitTime: number;
  /** Average store size over time (time-weighted) */
  averageSize: number;
  /** Average put queue length over time (time-weighted) */
  averagePutQueueLength: number;
  /** Average get queue length over time (time-weighted) */
  averageGetQueueLength: number;
}

/**
 * Token returned by store.put() to be yielded in process generators
 */
export class StorePutRequest<T> {
  constructor(
    public readonly store: Store<T>,
    public readonly item: T
  ) {
    // Validate item is not null or undefined
    if (item === null || item === undefined) {
      throw new ValidationError(
        'Cannot put null or undefined item into store',
        { item }
      );
    }
  }
}

/**
 * Token returned by store.get() to be yielded in process generators
 */
export class StoreGetRequest<T> {
  /** The retrieved item (set after successful get) */
  public retrievedItem?: T;

  constructor(
    public readonly store: Store<T>,
    public readonly filter?: (item: T) => boolean
  ) {
    // Validate filter is a function if provided
    if (filter !== undefined && typeof filter !== 'function') {
      throw new ValidationError(
        'Filter must be a function or undefined',
        { filter: typeof filter }
      );
    }
  }
}

/**
 * Internal put request record for queue management
 */
interface QueuedPutRequest<T> {
  /** Time when the request was made */
  requestTime: number;
  /** Item to put */
  item: T;
  /** Callback to call when space is available */
  onAcquired: () => void;
  /** Process making the request */
  process?: Process;
}

/**
 * Internal get request record for queue management
 */
interface QueuedGetRequest<T> {
  /** Time when the request was made */
  requestTime: number;
  /** Filter function for item selection */
  filter?: (item: T) => boolean;
  /** Callback to call when item is available */
  onAcquired: (item: T) => void;
  /** Process making the request */
  process?: Process;
}

/**
 * Store resource that holds distinct JavaScript objects.
 *
 * Unlike Buffer which tracks homogeneous quantities, Store manages
 * a collection of distinct items. Supports FIFO retrieval or
 * filter-based selection.
 *
 * @template T The type of items stored
 *
 * @example
 * ```typescript
 * interface Pallet {
 *   id: string;
 *   destination: string;
 *   weight: number;
 * }
 *
 * const warehouse = new Store<Pallet>(sim, 100, { name: 'Warehouse' });
 *
 * // Store a pallet
 * function* receivePallet(pallet: Pallet) {
 *   yield warehouse.put(pallet);
 *   console.log(`Stored pallet ${pallet.id}`);
 * }
 *
 * // Retrieve by filter
 * function* shipToNYC() {
 *   const request = warehouse.get(p => p.destination === 'NYC');
 *   yield request;
 *   const pallet = request.retrievedItem!;
 *   console.log(`Shipping ${pallet.id} to NYC`);
 * }
 *
 * // FIFO retrieval (no filter)
 * function* shipNext() {
 *   const request = warehouse.get();
 *   yield request;
 *   const pallet = request.retrievedItem!;
 *   console.log(`Shipping ${pallet.id}`);
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class Store<T = any> {
  private readonly simulation: Simulation;
  private readonly capacityValue: number;
  private readonly itemsArray: T[];
  private readonly putQueue: QueuedPutRequest<T>[];
  private readonly getQueue: QueuedGetRequest<T>[];
  private readonly options: Required<StoreOptions>;

  // Statistics tracking
  private totalPutsCount: number;
  private totalGetsCount: number;
  private totalPutWaitTime: number;
  private totalGetWaitTime: number;
  private sizeSum: number;
  private sizeSampleCount: number;
  private putQueueLengthSum: number;
  private putQueueSampleCount: number;
  private getQueueLengthSum: number;
  private getQueueSampleCount: number;
  private lastSampleTime: number;

  /**
   * Create a new store.
   * @param simulation - The simulation instance this store belongs to
   * @param capacity - Maximum number of items the store can hold (must be > 0)
   * @param options - Optional configuration
   */
  constructor(
    simulation: Simulation,
    capacity: number,
    options: StoreOptions = {}
  ) {
    // Validate capacity
    validateFinite(capacity, 'capacity', 'Store capacity must be a finite number');
    validatePositive(capacity, 'capacity', 'Store capacity must be positive');

    // Validate name if provided
    if (options.name !== undefined && options.name.trim() === '') {
      throw new ValidationError('Store name cannot be empty', {
        name: options.name,
      });
    }

    this.simulation = simulation;
    this.capacityValue = capacity;
    this.itemsArray = [];
    this.putQueue = [];
    this.getQueue = [];
    this.options = {
      name: options.name ?? 'Store',
    };

    // Initialize statistics
    this.totalPutsCount = 0;
    this.totalGetsCount = 0;
    this.totalPutWaitTime = 0;
    this.totalGetWaitTime = 0;
    this.sizeSum = 0;
    this.sizeSampleCount = 0;
    this.putQueueLengthSum = 0;
    this.putQueueSampleCount = 0;
    this.getQueueLengthSum = 0;
    this.getQueueSampleCount = 0;
    this.lastSampleTime = simulation.now;
  }

  /**
   * Request to put an item into the store.
   * Returns a token that should be yielded in a process generator.
   * The process will pause until there is space available.
   *
   * @param item - Item to store (cannot be null or undefined)
   * @returns Token to yield in generator function
   *
   * @example
   * ```typescript
   * function* storeItem(item: MyItem) {
   *   yield store.put(item);
   *   // Item is now stored
   * }
   * ```
   */
  put(item: T): StorePutRequest<T> {
    return new StorePutRequest(this, item);
  }

  /**
   * Request to get an item from the store.
   * Returns a token that should be yielded in a process generator.
   * The process will pause until a matching item is available.
   *
   * @param filter - Optional filter function to select specific items.
   *                 If omitted, returns first item (FIFO).
   * @returns Token to yield in generator function. After yielding,
   *          access the item via request.retrievedItem
   *
   * @example
   * ```typescript
   * // FIFO retrieval
   * function* getNext() {
   *   const request = store.get();
   *   yield request;
   *   const item = request.retrievedItem!;
   *   console.log('Got item:', item);
   * }
   *
   * // Filtered retrieval
   * function* getSpecific(id: string) {
   *   const request = store.get(item => item.id === id);
   *   yield request;
   *   const item = request.retrievedItem!;
   *   console.log('Got specific item:', item);
   * }
   * ```
   */
  get(filter?: (item: T) => boolean): StoreGetRequest<T> {
    return new StoreGetRequest(this, filter);
  }

  /**
   * Internal method called by Process to actually put an item.
   * @param item - Item to put
   * @param onAcquired - Callback to invoke when space is available
   * @param process - Process making the request
   * @internal
   */
  _put(item: T, onAcquired: () => void, process?: Process): void {
    // Update statistics BEFORE changing state
    this.updateStatistics();

    this.totalPutsCount++;

    if (this.itemsArray.length < this.capacityValue) {
      // Space available, put immediately
      this.itemsArray.push(item);

      // Execute callback immediately (synchronously)
      onAcquired();

      // Try to fulfill waiting get requests
      this.tryFulfillGets();
    } else {
      // No space, add to queue
      this.putQueue.push({
        requestTime: this.simulation.now,
        item,
        onAcquired,
        process,
      });
    }
  }

  /**
   * Internal method called by Process to actually get an item.
   * @param filter - Optional filter function
   * @param onAcquired - Callback to invoke when item is available
   * @param process - Process making the request
   * @internal
   */
  _get(
    filter: ((item: T) => boolean) | undefined,
    onAcquired: (item: T) => void,
    process?: Process
  ): void {
    // Update statistics BEFORE changing state
    this.updateStatistics();

    this.totalGetsCount++;

    // Try to find matching item
    const itemIndex = filter
      ? this.itemsArray.findIndex(filter)
      : 0; // FIFO if no filter

    if (itemIndex >= 0 && this.itemsArray.length > 0) {
      // Matching item found, get immediately
      const item = this.itemsArray.splice(itemIndex, 1)[0]!;

      // Execute callback immediately with the item
      onAcquired(item);

      // Try to fulfill waiting put requests
      this.tryFulfillPuts();
    } else {
      // No matching item, add to queue
      this.getQueue.push({
        requestTime: this.simulation.now,
        filter,
        onAcquired,
        process,
      });
    }
  }

  /**
   * Try to fulfill waiting get requests after a put.
   * @private
   */
  private tryFulfillGets(): void {
    let i = 0;
    while (i < this.getQueue.length) {
      const request = this.getQueue[i]!;

      // Try to find matching item
      const itemIndex = request.filter
        ? this.itemsArray.findIndex(request.filter)
        : 0; // FIFO if no filter

      if (itemIndex >= 0 && this.itemsArray.length > 0) {
        // Found matching item - fulfill this request
        this.getQueue.splice(i, 1); // Remove from queue
        const item = this.itemsArray.splice(itemIndex, 1)[0]!;

        // Track wait time
        const waitTime = this.simulation.now - request.requestTime;
        this.totalGetWaitTime += waitTime;

        // Schedule callback for immediate execution to avoid reentrancy
        this.simulation.schedule(0, () => request.onAcquired(item));

        // Don't increment i - we removed an element
      } else {
        // Can't fulfill this request, move to next
        i++;
      }
    }
  }

  /**
   * Try to fulfill waiting put requests after a get.
   * @private
   */
  private tryFulfillPuts(): void {
    while (this.putQueue.length > 0 && this.itemsArray.length < this.capacityValue) {
      const request = this.putQueue.shift()!;

      // Add item to store
      this.itemsArray.push(request.item);

      // Track wait time
      const waitTime = this.simulation.now - request.requestTime;
      this.totalPutWaitTime += waitTime;

      // Schedule callback for immediate execution to avoid reentrancy
      this.simulation.schedule(0, () => request.onAcquired());

      // Try to fulfill any waiting gets (new item might match their filters)
      this.tryFulfillGets();
    }
  }

  /**
   * Get the maximum capacity of the store.
   */
  get capacity(): number {
    return this.capacityValue;
  }

  /**
   * Get the current number of items in the store.
   */
  get size(): number {
    return this.itemsArray.length;
  }

  /**
   * Get the available space in the store.
   */
  get available(): number {
    return this.capacityValue - this.itemsArray.length;
  }

  /**
   * Get a read-only view of items currently in the store.
   * Note: This is a shallow copy - modifying items will affect the store.
   */
  get items(): ReadonlyArray<T> {
    return [...this.itemsArray];
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
   * Get store name.
   */
  get name(): string {
    return this.options.name;
  }

  /**
   * Get comprehensive statistics for this store.
   */
  get stats(): StoreStatistics {
    this.updateStatistics();

    return {
      totalPuts: this.totalPutsCount,
      totalGets: this.totalGetsCount,
      averagePutWaitTime:
        this.totalPutsCount > 0
          ? this.totalPutWaitTime / this.totalPutsCount
          : 0,
      averageGetWaitTime:
        this.totalGetsCount > 0
          ? this.totalGetWaitTime / this.totalGetsCount
          : 0,
      averageSize:
        this.sizeSampleCount > 0 ? this.sizeSum / this.sizeSampleCount : 0,
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
   * Should be called whenever the store state changes.
   * @private
   */
  private updateStatistics(): void {
    const currentTime = this.simulation.now;

    // Only update if time has advanced
    if (currentTime > this.lastSampleTime) {
      const timeDelta = currentTime - this.lastSampleTime;

      // Update time-weighted averages
      this.sizeSum += this.itemsArray.length * timeDelta;
      this.sizeSampleCount += timeDelta;

      this.putQueueLengthSum += this.putQueue.length * timeDelta;
      this.putQueueSampleCount += timeDelta;

      this.getQueueLengthSum += this.getQueue.length * timeDelta;
      this.getQueueSampleCount += timeDelta;

      this.lastSampleTime = currentTime;
    }
  }
}
