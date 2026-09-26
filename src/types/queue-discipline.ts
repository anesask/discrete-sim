/**
 * Queue discipline types for resource management.
 * Determines the order in which waiting requests are served.
 */

/**
 * Queue discipline enumeration
 */
export type QueueDiscipline =
  | 'fifo' // First In First Out (default)
  | 'lifo' // Last In First Out
  | 'priority'; // Priority-based (lower number = higher priority)

/**
 * Configuration for queue discipline behavior
 */
export interface QueueDisciplineConfig {
  /** The discipline type */
  type: QueueDiscipline;
  /** For priority discipline: whether to use FIFO or LIFO for same-priority requests */
  tieBreaker?: 'fifo' | 'lifo';
}

/**
 * Get default queue discipline configuration
 */
export function getDefaultQueueConfig(): QueueDisciplineConfig {
  return {
    type: 'fifo',
    tieBreaker: 'fifo',
  };
}

/**
 * Validate queue discipline configuration
 */
export function validateQueueDiscipline(
  discipline: QueueDiscipline | QueueDisciplineConfig
): QueueDisciplineConfig {
  const validTypes: QueueDiscipline[] = ['fifo', 'lifo', 'priority'];

  // If string, validate and convert to config
  if (typeof discipline === 'string') {
    if (!validTypes.includes(discipline)) {
      throw new Error(
        `Invalid queue discipline: ${discipline}. Must be one of: ${validTypes.join(', ')}`
      );
    }
    return {
      type: discipline,
      tieBreaker: 'fifo',
    };
  }

  // Validate config object
  if (!validTypes.includes(discipline.type)) {
    throw new Error(
      `Invalid queue discipline: ${discipline.type}. Must be one of: ${validTypes.join(', ')}`
    );
  }

  return {
    type: discipline.type,
    tieBreaker: discipline.tieBreaker ?? 'fifo',
  };
}

/**
 * Minimal shape a queued request must have for discipline-based insertion.
 * @internal
 */
export interface DisciplinedRequest {
  /** Priority of the request (lower = higher priority) */
  priority: number;
  /** Simulation time when the request was made */
  requestTime: number;
}

/**
 * Insert a request into a waiting queue according to the queue discipline.
 * Shared by Resource-like classes (Buffer, Store) so the ordering rules stay identical.
 *
 * - fifo: append
 * - lifo: prepend
 * - priority: binary-search insertion by ascending priority; equal priorities
 *   fall back to the configured tie-breaker (fifo = after existing, lifo = before)
 *
 * @internal
 */
export function insertByDiscipline<T extends DisciplinedRequest>(
  queue: T[],
  newRequest: T,
  config: QueueDisciplineConfig
): void {
  switch (config.type) {
    case 'fifo':
      queue.push(newRequest);
      return;
    case 'lifo':
      queue.unshift(newRequest);
      return;
    case 'priority':
      break;
  }

  const useFifoTieBreaker = config.tieBreaker !== 'lifo';
  let left = 0;
  let right = queue.length;

  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    const existing = queue[mid]!;

    if (existing.priority < newRequest.priority) {
      left = mid + 1;
    } else if (existing.priority > newRequest.priority) {
      right = mid;
    } else if (useFifoTieBreaker) {
      // Same priority: FIFO places the newcomer after everything already queued
      // at this priority (requestTime is non-decreasing in insertion order).
      if (existing.requestTime <= newRequest.requestTime) {
        left = mid + 1;
      } else {
        right = mid;
      }
    } else {
      // LIFO tie-breaker: newcomer goes before existing same-priority requests
      right = mid;
    }
  }

  queue.splice(left, 0, newRequest);
}
