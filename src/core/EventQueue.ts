/**
 * Event interface for discrete-event simulation.
 * Represents a scheduled callback to execute at a specific simulation time.
 */
export interface Event {
  /** Simulation time when the event should occur */
  time: number;
  /** Priority for breaking ties (lower = higher priority) */
  priority: number;
  /** Callback function to execute when the event occurs */
  callback: () => void;
  /** Unique identifier for the event */
  id: string;
}

/**
 * Binary heap-based priority queue for efficient event scheduling.
 * Events are ordered by time, with ties broken by priority, then by insertion order.
 * Provides O(log n) insertion and removal operations.
 *
 * @example
 * ```typescript
 * const queue = new EventQueue();
 * const id = queue.push({ time: 10, priority: 0, callback: () => console.log('Hello') });
 * const next = queue.peek(); // View next event without removing
 * const event = queue.pop(); // Remove and return next event
 * queue.remove(id); // Cancel a specific event
 * ```
 */
export class EventQueue {
  private heap: Event[] = [];
  private eventIdCounter = 0;

  /**
   * Add an event to the queue.
   * The event is inserted into the heap maintaining the ordering:
   * 1. Earlier times first
   * 2. Lower priority values first (when times are equal)
   * 3. Insertion order (when time and priority are equal)
   *
   * @param event - The event to add (time, priority, callback)
   * @returns The unique ID assigned to the event (use for cancellation)
   *
   * @example
   * ```typescript
   * const id = queue.push({
   *   time: 10,
   *   priority: 0,
   *   callback: () => console.log('Event at time 10')
   * });
   * ```
   */
  push(event: Omit<Event, 'id'>): string {
    const id = `event-${this.eventIdCounter++}`;
    const fullEvent: Event = { ...event, id };

    this.heap.push(fullEvent);
    this.bubbleUp(this.heap.length - 1);

    return id;
  }

  /**
   * Remove and return the next event (earliest time, highest priority).
   * This operation is O(log n) where n is the number of events.
   *
   * @returns The next event, or undefined if the queue is empty
   *
   * @example
   * ```typescript
   * const event = queue.pop();
   * if (event) {
   *   event.callback(); // Execute the event
   * }
   * ```
   */
  pop(): Event | undefined {
    if (this.heap.length === 0) {
      return undefined;
    }

    if (this.heap.length === 1) {
      return this.heap.pop();
    }

    const root = this.heap[0];
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.heap[0] = this.heap.pop()!;
    this.bubbleDown(0);

    return root;
  }

  /**
   * View the next event without removing it.
   * This operation is O(1).
   *
   * @returns The next event, or undefined if the queue is empty
   *
   * @example
   * ```typescript
   * const next = queue.peek();
   * if (next && next.time <= currentTime) {
   *   queue.pop(); // Process it
   * }
   * ```
   */
  peek(): Event | undefined {
    return this.heap[0];
  }

  /**
   * Remove a specific event from the queue by ID.
   * This operation is O(n) for search + O(log n) for re-heapification.
   * Useful for cancelling scheduled events.
   *
   * @param eventId - The ID of the event to remove (returned from push())
   * @returns true if the event was found and removed, false otherwise
   *
   * @example
   * ```typescript
   * const id = queue.push({ time: 100, priority: 0, callback: () => {} });
   * // ...later, cancel it:
   * if (queue.remove(id)) {
   *   console.log('Event cancelled');
   * }
   * ```
   */
  remove(eventId: string): boolean {
    // Find the event in the heap
    const index = this.heap.findIndex((event) => event.id === eventId);

    if (index === -1) {
      return false; // Event not found
    }

    // If it's the last element, just remove it
    if (index === this.heap.length - 1) {
      this.heap.pop();
      return true;
    }

    // Swap with the last element and remove
    const lastElement = this.heap.pop()!;
    this.heap[index] = lastElement;

    // Re-heapify from this position
    // We need to try both bubble up and bubble down since we don't know
    // the relationship between the removed element and the swapped element
    const parentIndex = Math.floor((index - 1) / 2);

    const currentElement = this.heap[index];
    const parentElement = this.heap[parentIndex];

    if (
      index > 0 &&
      currentElement !== undefined &&
      parentElement !== undefined &&
      this.compare(currentElement, parentElement) < 0
    ) {
      // Element is smaller than parent, bubble up
      this.bubbleUp(index);
    } else {
      // Element is larger than or equal to parent, bubble down
      this.bubbleDown(index);
    }

    return true;
  }

  /**
   * Remove all events from the queue.
   * Resets the queue to its initial empty state.
   *
   * @example
   * ```typescript
   * queue.clear();
   * console.log(queue.isEmpty); // true
   * ```
   */
  clear(): void {
    this.heap = [];
  }

  /**
   * Get the number of events in the queue.
   *
   * @returns The number of scheduled events
   *
   * @example
   * ```typescript
   * console.log(`Queue has ${queue.length} events`);
   * ```
   */
  get length(): number {
    return this.heap.length;
  }

  /**
   * Check if the queue is empty.
   *
   * @returns true if the queue has no events, false otherwise
   *
   * @example
   * ```typescript
   * while (!queue.isEmpty) {
   *   const event = queue.pop();
   *   event?.callback();
   * }
   * ```
   */
  get isEmpty(): boolean {
    return this.heap.length === 0;
  }

  /**
   * Move an element up the heap to maintain heap property.
   * @param index - Index of the element to bubble up
   */
  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);

      if (this.compare(this.heap[index]!, this.heap[parentIndex]!) >= 0) {
        break;
      }

      // Swap with parent
      [this.heap[index], this.heap[parentIndex]] = [
        this.heap[parentIndex]!,
        this.heap[index]!,
      ];
      index = parentIndex;
    }
  }

  /**
   * Move an element down the heap to maintain heap property.
   * @param index - Index of the element to bubble down
   */
  private bubbleDown(index: number): void {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      let smallest = index;

      if (
        leftChild < this.heap.length &&
        this.compare(this.heap[leftChild]!, this.heap[smallest]!) < 0
      ) {
        smallest = leftChild;
      }

      if (
        rightChild < this.heap.length &&
        this.compare(this.heap[rightChild]!, this.heap[smallest]!) < 0
      ) {
        smallest = rightChild;
      }

      if (smallest === index) {
        break;
      }

      // Swap with smallest child
      [this.heap[index], this.heap[smallest]] = [
        this.heap[smallest]!,
        this.heap[index]!,
      ];
      index = smallest;
    }
  }

  /**
   * Compare two events for ordering.
   * Events are ordered by:
   * 1. Time (earlier times first)
   * 2. Priority (lower priority values first)
   * 3. ID (for deterministic ordering when time and priority are equal)
   *
   * @returns Negative if a < b, positive if a > b, zero if equal
   */
  private compare(a: Event, b: Event): number {
    // Compare by time first
    if (a.time !== b.time) {
      return a.time - b.time;
    }

    // Then by priority (lower priority value = higher priority)
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }

    // Finally by ID for deterministic ordering
    return a.id.localeCompare(b.id);
  }
}
