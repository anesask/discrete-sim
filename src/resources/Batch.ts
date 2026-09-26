import { Simulation } from '../core/Simulation.js';
import { Process } from '../core/Process.js';
import {
  ValidationError,
  validateFinite,
  validatePositive,
} from '../utils/validation.js';

/**
 * Configuration options for a batch
 */
export interface BatchOptions {
  /** Name for the batch (for debugging/logging) */
  name?: string;
  /**
   * Release a partial batch this long after its first item arrived, even if
   * it is not full yet ("leave when full or every 15 minutes"). Default: never.
   */
  maxWait?: number;
  /**
   * By default put() blocks while a formed batch is still waiting to be taken
   * (back-pressure). Set true to let items keep accumulating without limit.
   */
  unbounded?: boolean;
}

/**
 * Statistics collected for a batch
 */
export interface BatchStatistics {
  /** Items put so far (including items still accumulating) */
  totalPuts: number;
  /** Batches formed (full or partial) */
  totalBatches: number;
  /** Batches released by maxWait before they were full */
  partialBatches: number;
  /** Batches handed to takers so far */
  totalTakes: number;
  /** Average number of items per formed batch */
  averageBatchSize: number;
  /** Average time an item waited between put and its batch forming */
  averageItemWaitTime: number;
  /** Average time a put waited for back-pressure to clear */
  averagePutWaitTime: number;
  /** Average time a taker waited for a batch */
  averageTakeWaitTime: number;
}

/**
 * Token returned by batch.put() to be yielded in process generators
 */
export class BatchPutRequest<T> {
  constructor(
    public readonly batch: Batch<T>,
    public readonly item: T
  ) {
    if (item === null || item === undefined) {
      throw new ValidationError(
        'Cannot put null or undefined item into batch',
        {
          item,
        }
      );
    }
  }
}

/**
 * Token returned by batch.take() to be yielded in process generators.
 * After the yield, `items` holds the batch and `isPartial` tells whether it
 * was released early by maxWait.
 */
export class BatchTakeRequest<T> {
  /** The items of the batch (set after the take completes) */
  public items?: T[];
  /** True when the batch was released by maxWait before it was full */
  public isPartial?: boolean;

  constructor(public readonly batch: Batch<T>) {}
}

interface QueuedPut<T> {
  requestTime: number;
  item: T;
  onAccepted: () => void;
  process?: Process;
}

interface QueuedTake<T> {
  requestTime: number;
  onTaken: (items: T[], isPartial: boolean) => void;
  process?: Process;
}

interface FormedBatch<T> {
  items: T[];
  isPartial: boolean;
}

/**
 * Accumulates items and releases them in groups: full batches of `batchSize`,
 * or partial batches after `maxWait` since the first item arrived. Models
 * ovens, shipping containers, database commits and any "collect then process
 * together" step.
 *
 * @template T The type of items batched
 *
 * @example
 * ```typescript
 * const oven = new Batch<Part>(sim, 10, { maxWait: 15 });
 *
 * function* producer() {
 *   for (let i = 0; i < 100; i++) {
 *     yield* timeout(rng.exponential(1));
 *     yield oven.put({ id: i });           // blocks while a full load waits to be taken
 *   }
 * }
 *
 * function* baker() {
 *   while (true) {
 *     const load = oven.take();
 *     yield load;                          // resumes when a batch is ready
 *     yield* timeout(30);                  // bake load.items
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class Batch<T = any> {
  private readonly simulation: Simulation;
  private readonly batchSizeValue: number;
  private readonly options: {
    name: string;
    maxWait?: number;
    unbounded: boolean;
  };

  /** Items accumulating towards the next batch, with their arrival times */
  private current: Array<{ item: T; time: number }> = [];
  /** Formed batches not yet taken, oldest first */
  private readonly ready: FormedBatch<T>[] = [];
  private readonly putQueue: QueuedPut<T>[] = [];
  private readonly takeQueue: QueuedTake<T>[] = [];
  /** Identifies the accumulation round a maxWait timer belongs to */
  private round = 0;
  private timerId?: string;

  // Statistics
  private totalPutsCount = 0;
  private totalBatchesCount = 0;
  private partialBatchesCount = 0;
  private totalTakesCount = 0;
  private totalBatchedItems = 0;
  private totalItemWait = 0;
  private totalPutWait = 0;
  private totalTakeWait = 0;

  /**
   * Create a batch.
   * @param simulation - The simulation instance
   * @param batchSize - Items per full batch (positive integer)
   * @param options - maxWait, unbounded, name
   */
  constructor(
    simulation: Simulation,
    batchSize: number,
    options: BatchOptions = {}
  ) {
    validateFinite(batchSize, 'batchSize', 'Batch size must be finite');
    validatePositive(batchSize, 'batchSize', 'Batch size must be positive');
    if (!Number.isInteger(batchSize)) {
      throw new ValidationError(
        `batchSize must be an integer (got ${batchSize})`,
        { batchSize }
      );
    }
    if (options.maxWait !== undefined) {
      validateFinite(options.maxWait, 'maxWait', 'maxWait must be finite');
      if (options.maxWait <= 0) {
        throw new ValidationError('maxWait must be positive', {
          maxWait: options.maxWait,
        });
      }
    }
    if (options.name !== undefined && options.name.trim() === '') {
      throw new ValidationError('Batch name cannot be empty', {
        name: options.name,
      });
    }

    this.simulation = simulation;
    this.batchSizeValue = batchSize;
    this.options = {
      name: options.name ?? 'Batch',
      maxWait: options.maxWait,
      unbounded: options.unbounded ?? false,
    };
  }

  /**
   * Request to add an item. Yield the token in a process; it resumes once the
   * item has been accepted (immediately, unless back-pressure applies).
   */
  put(item: T): BatchPutRequest<T> {
    return new BatchPutRequest(this, item);
  }

  /**
   * Request the next batch. Yield the token; afterwards read `token.items`.
   */
  take(): BatchTakeRequest<T> {
    return new BatchTakeRequest(this);
  }

  /**
   * Take the next batch and get its items back, typed. Use with yield*.
   *
   * @example
   * ```typescript
   * const { items, isPartial } = yield* oven.takeBatch();
   * ```
   */
  *takeBatch(): Generator<
    BatchTakeRequest<T>,
    { items: T[]; isPartial: boolean },
    void
  > {
    const request = this.take();
    yield request;
    return {
      items: request.items ?? [],
      isPartial: request.isPartial ?? false,
    };
  }

  /**
   * Put an item, resuming once it is accepted. Use with yield*.
   */
  *putItem(item: T): Generator<BatchPutRequest<T>, void, void> {
    yield this.put(item);
  }

  /** Items per full batch */
  get batchSize(): number {
    return this.batchSizeValue;
  }

  /** Items accumulated towards the next batch */
  get size(): number {
    return this.current.length;
  }

  /** True when the accumulating batch has reached batchSize (transient) */
  get isFull(): boolean {
    return this.current.length >= this.batchSizeValue;
  }

  /** Formed batches waiting to be taken */
  get readyCount(): number {
    return this.ready.length;
  }

  /** Puts waiting for back-pressure to clear */
  get putQueueLength(): number {
    return this.putQueue.length;
  }

  /** Takers waiting for a batch */
  get takeQueueLength(): number {
    return this.takeQueue.length;
  }

  /** Batch name */
  get name(): string {
    return this.options.name;
  }

  /** Statistics for this batch */
  get stats(): BatchStatistics {
    return {
      totalPuts: this.totalPutsCount,
      totalBatches: this.totalBatchesCount,
      partialBatches: this.partialBatchesCount,
      totalTakes: this.totalTakesCount,
      averageBatchSize:
        this.totalBatchesCount > 0
          ? this.totalBatchedItems / this.totalBatchesCount
          : 0,
      averageItemWaitTime:
        this.totalBatchedItems > 0
          ? this.totalItemWait / this.totalBatchedItems
          : 0,
      averagePutWaitTime:
        this.totalPutsCount > 0 ? this.totalPutWait / this.totalPutsCount : 0,
      averageTakeWaitTime:
        this.totalTakesCount > 0
          ? this.totalTakeWait / this.totalTakesCount
          : 0,
    };
  }

  /**
   * @internal
   */
  _put(item: T, onAccepted: () => void, process?: Process): void {
    this.totalPutsCount++;
    if (this.options.unbounded || this.ready.length === 0) {
      this.accept(item);
      onAccepted();
    } else {
      this.putQueue.push({
        requestTime: this.simulation.now,
        item,
        onAccepted,
        process,
      });
    }
  }

  /**
   * @internal
   */
  _take(
    onTaken: (items: T[], isPartial: boolean) => void,
    process?: Process
  ): void {
    const formed = this.ready.shift();
    if (formed) {
      this.totalTakesCount++;
      onTaken(formed.items, formed.isPartial);
      this.admitQueuedPuts();
    } else {
      this.takeQueue.push({
        requestTime: this.simulation.now,
        onTaken,
        process,
      });
    }
  }

  /**
   * Remove a waiting put, identified by its callback.
   * @internal
   */
  _cancelPut(onAccepted: () => void): boolean {
    const i = this.putQueue.findIndex((q) => q.onAccepted === onAccepted);
    if (i === -1) return false;
    this.putQueue.splice(i, 1);
    return true;
  }

  /**
   * Remove a waiting take, identified by its callback.
   * @internal
   */
  _cancelTake(onTaken: (items: T[], isPartial: boolean) => void): boolean {
    const i = this.takeQueue.findIndex((q) => q.onTaken === onTaken);
    if (i === -1) return false;
    this.takeQueue.splice(i, 1);
    return true;
  }

  /**
   * Return a batch that was handed to a taker who no longer wants it.
   * @internal
   */
  _restore(items: T[], isPartial: boolean): void {
    this.ready.unshift({ items, isPartial });
    this.totalTakesCount--;
    this.serveTakers();
  }

  /**
   * Withdraw an item that was accepted but whose put completed late.
   * @internal
   */
  _withdraw(item: T): void {
    const i = this.current.findIndex((e) => e.item === item);
    if (i !== -1) {
      this.current.splice(i, 1);
      this.totalPutsCount--;
      if (this.current.length === 0) this.cancelTimer();
    }
  }

  private accept(item: T): void {
    const now = this.simulation.now;
    if (this.current.length === 0) {
      this.startTimer();
    }
    this.current.push({ item, time: now });
    if (this.current.length >= this.batchSizeValue) {
      this.formBatch(false);
    }
  }

  private formBatch(isPartial: boolean): void {
    this.cancelTimer();
    const now = this.simulation.now;
    const items = this.current.map((e) => e.item);
    for (const e of this.current) this.totalItemWait += now - e.time;
    this.totalBatchedItems += items.length;
    this.totalBatchesCount++;
    if (isPartial) this.partialBatchesCount++;
    this.current = [];
    this.round++;
    this.ready.push({ items, isPartial });
    this.serveTakers();
  }

  private serveTakers(): void {
    while (this.takeQueue.length > 0 && this.ready.length > 0) {
      const taker = this.takeQueue.shift()!;
      const formed = this.ready.shift()!;
      this.totalTakesCount++;
      this.totalTakeWait += this.simulation.now - taker.requestTime;
      // Scheduled to avoid resuming a generator while another is running
      this.simulation.schedule(0, () =>
        taker.onTaken(formed.items, formed.isPartial)
      );
    }
    this.admitQueuedPuts();
  }

  private admitQueuedPuts(): void {
    while (
      this.putQueue.length > 0 &&
      (this.options.unbounded || this.ready.length === 0)
    ) {
      const queued = this.putQueue.shift()!;
      this.totalPutWait += this.simulation.now - queued.requestTime;
      this.accept(queued.item);
      this.simulation.schedule(0, () => queued.onAccepted());
    }
  }

  private startTimer(): void {
    if (this.options.maxWait === undefined) return;
    const round = this.round;
    this.timerId = this.simulation.schedule(this.options.maxWait, () => {
      this.timerId = undefined;
      if (round === this.round && this.current.length > 0) {
        this.formBatch(true);
      }
    });
  }

  private cancelTimer(): void {
    if (this.timerId !== undefined) {
      this.simulation.cancel(this.timerId);
      this.timerId = undefined;
    }
  }
}
