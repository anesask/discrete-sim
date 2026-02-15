/**
 * Queue discipline types for resource management.
 * Determines the order in which waiting requests are served.
 */

/**
 * Queue discipline enumeration
 */
export type QueueDiscipline =
  | 'fifo'     // First In First Out (default)
  | 'lifo'     // Last In First Out
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
