/**
 * Seedable random number generator for discrete-event simulation.
 * Uses a Linear Congruential Generator (LCG) for reproducible random sequences.
 *
 * @example
 * ```typescript
 * const rng = new Random(12345); // Seeded for reproducibility
 *
 * // Generate random numbers
 * const u = rng.uniform(0, 1);        // Uniform [0, 1)
 * const e = rng.exponential(5);       // Exponential with mean 5
 * const n = rng.normal(100, 15);      // Normal with mean 100, stddev 15
 * const i = rng.randint(1, 6);        // Integer 1-6 (dice roll)
 * ```
 */
export class Random {
  private seed: number;
  private readonly a = 1664525; // LCG multiplier
  private readonly c = 1013904223; // LCG increment
  private readonly m = 2 ** 32; // LCG modulus
  private readonly maxSafeSeed = 2 ** 32 - 1; // Maximum safe seed value

  /**
   * Create a new random number generator.
   *
   * @param seed - Initial seed (default: current timestamp)
   *
   * @example
   * ```typescript
   * const rng1 = new Random(12345); // Seeded
   * const rng2 = new Random();      // Random seed from timestamp
   * ```
   */
  constructor(seed?: number) {
    // Use modulo to ensure timestamp fits within safe range
    const initialSeed = seed ?? (Date.now() % this.maxSafeSeed);
    this.validateSeed(initialSeed);
    this.seed = initialSeed;
  }

  /**
   * Get the current seed value.
   *
   * @returns Current seed
   */
  getSeed(): number {
    return this.seed;
  }

  /**
   * Set a new seed value.
   * Useful for restarting a sequence or changing randomness.
   *
   * @param seed - New seed value
   *
   * @example
   * ```typescript
   * rng.setSeed(12345);
   * const value = rng.uniform(0, 1); // Reproducible
   * ```
   */
  setSeed(seed: number): void {
    this.validateSeed(seed);
    this.seed = seed;
  }

  /**
   * Validate seed value to prevent overflow and invalid values.
   * @param seed - Seed value to validate
   * @private
   */
  private validateSeed(seed: number): void {
    if (!Number.isFinite(seed)) {
      throw new Error(
        `Seed must be a finite number (got ${seed}). Use a valid integer seed for reproducible random sequences.`
      );
    }

    if (!Number.isInteger(seed)) {
      throw new Error(
        `Seed must be an integer (got ${seed}). Non-integer seeds may produce inconsistent results.`
      );
    }

    if (seed < 0) {
      throw new Error(
        `Seed must be non-negative (got ${seed}). Use a positive integer seed.`
      );
    }

    if (seed > this.maxSafeSeed) {
      throw new Error(
        `Seed exceeds maximum safe value of ${this.maxSafeSeed} (got ${seed}). Large seeds may cause overflow in LCG calculations.`
      );
    }
  }

  /**
   * Generate the next random value [0, 1) using LCG.
   * This is the core PRNG that other methods build upon.
   *
   * @returns Random value in [0, 1)
   * @private
   */
  private next(): number {
    this.seed = (this.a * this.seed + this.c) % this.m;
    return this.seed / this.m;
  }

  /**
   * Generate a uniform random number in [min, max).
   *
   * @param min - Minimum value (inclusive)
   * @param max - Maximum value (exclusive)
   * @returns Random number in [min, max)
   *
   * @example
   * ```typescript
   * const randomDelay = rng.uniform(5, 15); // Between 5 and 15
   * ```
   */
  uniform(min: number, max: number): number {
    if (min >= max) {
      throw new Error('min must be less than max');
    }
    return min + this.next() * (max - min);
  }

  /**
   * Generate an exponentially distributed random number.
   * Commonly used for modeling inter-arrival times and service times.
   *
   * @param mean - Mean value (rate = 1/mean)
   * @returns Exponentially distributed random number
   *
   * @example
   * ```typescript
   * // Mean service time of 5 minutes
   * const serviceTime = rng.exponential(5);
   * ```
   */
  exponential(mean: number): number {
    if (mean <= 0) {
      throw new Error('mean must be positive');
    }
    // Inverse transform method: -mean * ln(U) where U ~ Uniform(0,1)
    return -mean * Math.log(this.next());
  }

  /**
   * Generate a normally (Gaussian) distributed random number.
   * Uses the Box-Muller transform.
   *
   * @param mean - Mean value
   * @param stdDev - Standard deviation
   * @returns Normally distributed random number
   *
   * @example
   * ```typescript
   * // Human height: mean 170cm, stddev 10cm
   * const height = rng.normal(170, 10);
   * ```
   */
  normal(mean: number, stdDev: number): number {
    if (stdDev < 0) {
      throw new Error('stdDev must be non-negative');
    }
    if (stdDev === 0) {
      return mean;
    }

    // Box-Muller transform
    const u1 = this.next();
    const u2 = this.next();

    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * stdDev;
  }

  /**
   * Generate a random integer in [min, max] (both inclusive).
   *
   * @param min - Minimum value (inclusive)
   * @param max - Maximum value (inclusive)
   * @returns Random integer in [min, max]
   *
   * @example
   * ```typescript
   * const diceRoll = rng.randint(1, 6);        // 1-6
   * const randomIndex = rng.randint(0, arr.length - 1);
   * ```
   */
  randint(min: number, max: number): number {
    if (min > max) {
      throw new Error('min must be less than or equal to max');
    }
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(this.uniform(min, max + 1));
  }

  /**
   * Generate a triangularly distributed random number.
   * Useful for modeling when you know min, max, and most likely value.
   *
   * @param min - Minimum value
   * @param max - Maximum value
   * @param mode - Most likely value (default: midpoint)
   * @returns Triangularly distributed random number
   *
   * @example
   * ```typescript
   * // Task duration: min 5, most likely 10, max 20 minutes
   * const duration = rng.triangular(5, 20, 10);
   * ```
   */
  triangular(min: number, max: number, mode?: number): number {
    if (min >= max) {
      throw new Error('min must be less than max');
    }
    const m = mode ?? (min + max) / 2;
    if (m < min || m > max) {
      throw new Error('mode must be between min and max');
    }

    const u = this.next();
    const fc = (m - min) / (max - min);

    if (u < fc) {
      return min + Math.sqrt(u * (max - min) * (m - min));
    } else {
      return max - Math.sqrt((1 - u) * (max - min) * (max - m));
    }
  }

  /**
   * Generate a Poisson distributed random integer.
   * Commonly used for modeling the number of events in a fixed interval.
   *
   * @param lambda - Average rate (mean number of events)
   * @returns Poisson distributed random integer
   *
   * @example
   * ```typescript
   * // Average 3 customers per hour
   * const customers = rng.poisson(3);
   * ```
   */
  poisson(lambda: number): number {
    if (lambda <= 0) {
      throw new Error('lambda must be positive');
    }

    // Knuth's algorithm for Poisson distribution
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;

    do {
      k++;
      p *= this.next();
    } while (p > L);

    return k - 1;
  }

  /**
   * Generate a random choice from an array.
   *
   * @param array - Array to choose from
   * @returns Random element from the array
   *
   * @example
   * ```typescript
   * const colors = ['red', 'green', 'blue'];
   * const randomColor = rng.choice(colors);
   * ```
   */
  choice<T>(array: T[]): T {
    if (array.length === 0) {
      throw new Error('Cannot choose from empty array');
    }
    const index = this.randint(0, array.length - 1);
    return array[index]!; // Non-null assertion: we know array is not empty
  }

  /**
   * Shuffle an array in place using Fisher-Yates algorithm.
   *
   * @param array - Array to shuffle
   * @returns The same array, shuffled
   *
   * @example
   * ```typescript
   * const deck = [1, 2, 3, 4, 5];
   * rng.shuffle(deck); // deck is now shuffled
   * ```
   */
  shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.randint(0, i);
      // Non-null assertions: indices are guaranteed to be valid
      [array[i], array[j]] = [array[j]!, array[i]!];
    }
    return array;
  }
}
