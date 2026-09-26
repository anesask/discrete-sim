import { ValidationError } from '../utils/validation.js';

/**
 * A value with a relative weight, used by {@link Random.discrete}.
 */
export interface WeightedValue<T> {
  value: T;
  /** Relative weight (must be >= 0; at least one weight must be > 0) */
  weight: number;
}

/**
 * Options for {@link Random.empirical}.
 */
export interface EmpiricalOptions {
  /**
   * When true, draw from the continuous empirical distribution by linearly
   * interpolating between adjacent sorted samples. When false (default), return
   * one of the observed samples with equal probability.
   */
  interpolate?: boolean;
}

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
 * const s = rng.lognormal(1.5, 0.4);  // Right-skewed service time
 * const f = rng.weibull(1.5, 1000);   // Time to failure
 * ```
 */
export class Random {
  private seed: number;
  private readonly a = 1664525; // LCG multiplier
  private readonly c = 1013904223; // LCG increment
  private readonly m = 2 ** 32; // LCG modulus
  private readonly maxSafeSeed = 2 ** 32 - 1; // Maximum safe seed value

  /** Sorted copies of arrays passed to empirical(), keyed by array identity. */
  private readonly sortedCache = new WeakMap<readonly number[], number[]>();

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
    const initialSeed = seed ?? Date.now() % this.maxSafeSeed;
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
      throw new ValidationError(
        `Seed must be a finite number (got ${seed}). Use a valid integer seed for reproducible random sequences.`,
        { seed }
      );
    }

    if (!Number.isInteger(seed)) {
      throw new ValidationError(
        `Seed must be an integer (got ${seed}). Non-integer seeds may produce inconsistent results.`,
        { seed }
      );
    }

    if (seed < 0) {
      throw new ValidationError(
        `Seed must be non-negative (got ${seed}). Use a positive integer seed.`,
        { seed }
      );
    }

    if (seed > this.maxSafeSeed) {
      throw new ValidationError(
        `Seed exceeds maximum safe value of ${this.maxSafeSeed} (got ${seed}). Large seeds may cause overflow in LCG calculations.`,
        { seed, maxSafeSeed: this.maxSafeSeed }
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
   * Generate the next random value in the open interval (0, 1).
   * Used by transforms that take a logarithm, where an exact 0 would produce
   * Infinity or NaN. The LCG yields 0 exactly once per period, so this almost
   * never loops.
   *
   * @private
   */
  private nextOpen(): number {
    let u = this.next();
    while (u === 0) {
      u = this.next();
    }
    return u;
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
      throw new ValidationError('min must be less than max', { min, max });
    }
    return min + this.next() * (max - min);
  }

  /**
   * Generate an exponentially distributed random number.
   * Commonly used for modeling inter-arrival times and service times.
   *
   * Mean = mean, variance = mean^2.
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
      throw new ValidationError('mean must be positive', { mean });
    }
    // Inverse transform method: -mean * ln(U) where U ~ Uniform(0,1)
    return -mean * Math.log(this.nextOpen());
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
      throw new ValidationError('stdDev must be non-negative', { stdDev });
    }
    if (stdDev === 0) {
      return mean;
    }

    // Box-Muller transform
    const u1 = this.nextOpen();
    const u2 = this.next();

    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * stdDev;
  }

  /**
   * Generate a log-normally distributed random number: exp(N(mu, sigma)).
   * Right-skewed and strictly positive; a common fit for service, repair and
   * processing times.
   *
   * Mean = exp(mu + sigma^2 / 2), variance = (exp(sigma^2) - 1) * exp(2 mu + sigma^2).
   * Use {@link Random.lognormalParams} to derive mu and sigma from a desired
   * mean and standard deviation.
   *
   * @param mu - Mean of the underlying normal distribution
   * @param sigma - Standard deviation of the underlying normal (must be >= 0)
   * @returns Log-normally distributed random number (> 0)
   *
   * @example
   * ```typescript
   * const { mu, sigma } = Random.lognormalParams(12, 4); // mean 12, sd 4
   * const repairTime = rng.lognormal(mu, sigma);
   * ```
   */
  lognormal(mu: number, sigma: number): number {
    if (!Number.isFinite(mu)) {
      throw new ValidationError('mu must be a finite number', { mu });
    }
    if (!Number.isFinite(sigma) || sigma < 0) {
      throw new ValidationError('sigma must be a non-negative finite number', {
        sigma,
      });
    }
    return Math.exp(this.normal(mu, sigma));
  }

  /**
   * Convert a desired mean and standard deviation of a log-normal distribution
   * into the mu and sigma parameters expected by {@link Random.lognormal}.
   *
   * @param mean - Desired mean of the log-normal variable (> 0)
   * @param stdDev - Desired standard deviation (>= 0)
   * @returns Parameters of the underlying normal distribution
   */
  static lognormalParams(
    mean: number,
    stdDev: number
  ): { mu: number; sigma: number } {
    if (!(mean > 0) || !Number.isFinite(mean)) {
      throw new ValidationError('mean must be a positive finite number', {
        mean,
      });
    }
    if (!Number.isFinite(stdDev) || stdDev < 0) {
      throw new ValidationError('stdDev must be a non-negative finite number', {
        stdDev,
      });
    }
    const variance = stdDev * stdDev;
    const sigma2 = Math.log(1 + variance / (mean * mean));
    return { mu: Math.log(mean) - sigma2 / 2, sigma: Math.sqrt(sigma2) };
  }

  /**
   * Generate a gamma distributed random number (shape k, scale theta).
   * Uses the Marsaglia-Tsang method; shape < 1 is handled with the standard
   * boost U^(1/shape).
   *
   * Mean = shape * scale, variance = shape * scale^2.
   * gamma(1, scale) is exponential(scale); gamma(k, scale) with integer k is Erlang.
   *
   * @param shape - Shape parameter k (> 0)
   * @param scale - Scale parameter theta (> 0). Default 1.
   * @returns Gamma distributed random number (> 0)
   *
   * @example
   * ```typescript
   * // Three-phase service with total mean 6
   * const serviceTime = rng.gamma(3, 2);
   * ```
   */
  gamma(shape: number, scale: number = 1): number {
    if (!(shape > 0) || !Number.isFinite(shape)) {
      throw new ValidationError('shape must be a positive finite number', {
        shape,
      });
    }
    if (!(scale > 0) || !Number.isFinite(scale)) {
      throw new ValidationError('scale must be a positive finite number', {
        scale,
      });
    }

    if (shape < 1) {
      // Boost: Gamma(shape) = Gamma(shape + 1) * U^(1/shape)
      const u = this.nextOpen();
      return this.gamma(shape + 1, scale) * Math.pow(u, 1 / shape);
    }

    // Marsaglia-Tsang (2000)
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x: number;
      let v: number;
      do {
        x = this.normal(0, 1);
        v = 1 + c * x;
      } while (v <= 0);
      v = v * v * v;
      const u = this.nextOpen();
      const x2 = x * x;
      if (u < 1 - 0.0331 * x2 * x2) {
        return d * v * scale;
      }
      if (Math.log(u) < 0.5 * x2 + d * (1 - v + Math.log(v))) {
        return d * v * scale;
      }
    }
  }

  /**
   * Generate an Erlang distributed random number: the sum of k independent
   * exponential phases with total mean `mean`. Equivalent to gamma(k, mean / k).
   *
   * Mean = mean, variance = mean^2 / k. Larger k means less variable service times.
   *
   * @param k - Number of phases (positive integer)
   * @param mean - Mean of the total (> 0)
   * @returns Erlang distributed random number (> 0)
   *
   * @example
   * ```typescript
   * // Four-stage inspection, 20 minutes on average
   * const inspection = rng.erlang(4, 20);
   * ```
   */
  erlang(k: number, mean: number): number {
    if (!Number.isInteger(k) || k < 1) {
      throw new ValidationError('k must be a positive integer', { k });
    }
    if (!(mean > 0) || !Number.isFinite(mean)) {
      throw new ValidationError('mean must be a positive finite number', {
        mean,
      });
    }
    return this.gamma(k, mean / k);
  }

  /**
   * Generate a Weibull distributed random number. The standard model for
   * time-to-failure: shape < 1 gives decreasing failure rate (infant mortality),
   * shape = 1 is exponential, shape > 1 gives wear-out.
   *
   * Mean = scale * Gamma(1 + 1/shape).
   *
   * @param shape - Shape parameter k (> 0)
   * @param scale - Scale parameter lambda (> 0). Default 1.
   * @returns Weibull distributed random number (>= 0)
   *
   * @example
   * ```typescript
   * // Bearing life: wear-out with characteristic life 5000 hours
   * const lifetime = rng.weibull(2.5, 5000);
   * ```
   */
  weibull(shape: number, scale: number = 1): number {
    if (!(shape > 0) || !Number.isFinite(shape)) {
      throw new ValidationError('shape must be a positive finite number', {
        shape,
      });
    }
    if (!(scale > 0) || !Number.isFinite(scale)) {
      throw new ValidationError('scale must be a positive finite number', {
        scale,
      });
    }
    // Inverse transform: scale * (-ln U)^(1/shape)
    return scale * Math.pow(-Math.log(this.nextOpen()), 1 / shape);
  }

  /**
   * Generate a beta distributed random number in (0, 1).
   * Useful for proportions, yields and PERT-style task estimates.
   *
   * Mean = alpha / (alpha + beta).
   *
   * @param alpha - First shape parameter (> 0)
   * @param beta - Second shape parameter (> 0)
   * @returns Beta distributed random number in (0, 1)
   *
   * @example
   * ```typescript
   * // Fraction of defective parts, centred around 5%
   * const defectRate = rng.beta(2, 38);
   * ```
   */
  beta(alpha: number, beta: number): number {
    if (!(alpha > 0) || !Number.isFinite(alpha)) {
      throw new ValidationError('alpha must be a positive finite number', {
        alpha,
      });
    }
    if (!(beta > 0) || !Number.isFinite(beta)) {
      throw new ValidationError('beta must be a positive finite number', {
        beta,
      });
    }
    const x = this.gamma(alpha, 1);
    const y = this.gamma(beta, 1);
    return x / (x + y);
  }

  /**
   * Bernoulli trial: returns true with probability p.
   *
   * @param p - Probability of true, in [0, 1]
   * @returns true with probability p, false otherwise
   *
   * @example
   * ```typescript
   * if (rng.bernoulli(0.1)) { rejectPart(); }   // 10% defect rate
   * ```
   */
  bernoulli(p: number): boolean {
    if (!(p >= 0 && p <= 1)) {
      throw new ValidationError('p must be a probability in [0, 1]', { p });
    }
    return this.next() < p;
  }

  /**
   * Generate a geometrically distributed random integer: the number of
   * Bernoulli trials (with success probability p) needed to get the first
   * success. Values are 1, 2, 3, ...
   *
   * Mean = 1 / p, variance = (1 - p) / p^2.
   *
   * @param p - Success probability, in (0, 1]
   * @returns Number of trials until first success (>= 1)
   *
   * @example
   * ```typescript
   * // Retries until a request succeeds, 80% success per attempt
   * const attempts = rng.geometric(0.8);
   * ```
   */
  geometric(p: number): number {
    if (!(p > 0 && p <= 1)) {
      throw new ValidationError('p must be a probability in (0, 1]', { p });
    }
    if (p === 1) {
      return 1;
    }
    // Inverse transform on the continuous CDF
    return Math.floor(Math.log(this.nextOpen()) / Math.log(1 - p)) + 1;
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
    // Validate bounds are finite
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      throw new ValidationError('min and max must be finite numbers', {
        min,
        max,
      });
    }

    if (min > max) {
      throw new ValidationError('min must be less than or equal to max', {
        min,
        max,
      });
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
      throw new ValidationError('min must be less than max', { min, max });
    }
    const m = mode ?? (min + max) / 2;
    if (m < min || m > max) {
      throw new ValidationError('mode must be between min and max', {
        min,
        max,
        mode: m,
      });
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
      throw new ValidationError('lambda must be positive', { lambda });
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
  choice<T>(array: readonly T[]): T {
    if (array.length === 0) {
      throw new ValidationError('Cannot choose from empty array', {
        arrayLength: 0,
      });
    }
    const index = this.randint(0, array.length - 1);
    return array[index]!; // Non-null assertion: we know array is not empty
  }

  /**
   * Choose an element with probability proportional to its weight.
   *
   * @param items - Items to choose from
   * @param weights - Relative weights, same length as items (>= 0, not all 0)
   * @returns The chosen item
   *
   * @example
   * ```typescript
   * // 60% regular, 30% express, 10% VIP customers
   * const type = rng.weightedChoice(['regular', 'express', 'vip'], [6, 3, 1]);
   * ```
   */
  weightedChoice<T>(items: readonly T[], weights: readonly number[]): T {
    if (items.length === 0) {
      throw new ValidationError('Cannot choose from empty array', {
        arrayLength: 0,
      });
    }
    if (weights.length !== items.length) {
      throw new ValidationError('weights must have the same length as items', {
        items: items.length,
        weights: weights.length,
      });
    }
    let total = 0;
    for (const w of weights) {
      if (!Number.isFinite(w) || w < 0) {
        throw new ValidationError(
          'weights must be non-negative finite numbers',
          {
            weight: w,
          }
        );
      }
      total += w;
    }
    if (total <= 0) {
      throw new ValidationError('at least one weight must be positive', {
        weights: [...weights],
      });
    }

    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i]!;
      if (r < 0) {
        return items[i]!;
      }
    }
    // Floating-point edge: return the last item with positive weight
    for (let i = items.length - 1; i >= 0; i--) {
      if (weights[i]! > 0) return items[i]!;
    }
    return items[items.length - 1]!;
  }

  /**
   * Draw from a discrete distribution given as weighted values.
   * Convenience wrapper over {@link Random.weightedChoice}.
   *
   * @param entries - Values with relative weights
   * @returns The chosen value
   *
   * @example
   * ```typescript
   * const triage = rng.discrete([
   *   { value: 'critical', weight: 0.1 },
   *   { value: 'urgent',   weight: 0.3 },
   *   { value: 'routine',  weight: 0.6 },
   * ]);
   * ```
   */
  discrete<T>(entries: readonly WeightedValue<T>[]): T {
    return this.weightedChoice(
      entries.map((e) => e.value),
      entries.map((e) => e.weight)
    );
  }

  /**
   * Sample from observed data.
   *
   * Without interpolation, returns one of the samples with equal probability
   * (bootstrap draw). With `interpolate: true`, draws from the continuous
   * empirical distribution by picking a uniform position along the sorted
   * samples and interpolating linearly between neighbours, so values between
   * observations can occur. Sorted copies are cached per array, so passing the
   * same array repeatedly is cheap; do not mutate it between calls.
   *
   * @param samples - Observed values (non-empty, finite)
   * @param options - Sampling options
   * @returns A value drawn from the empirical distribution
   *
   * @example
   * ```typescript
   * const observedServiceTimes = [4.2, 5.1, 3.8, 6.4, 5.5, 4.9];
   * const t = rng.empirical(observedServiceTimes, { interpolate: true });
   * ```
   */
  empirical(
    samples: readonly number[],
    options: EmpiricalOptions = {}
  ): number {
    if (samples.length === 0) {
      throw new ValidationError('samples must not be empty', {
        arrayLength: 0,
      });
    }

    if (!options.interpolate) {
      const value = this.choice(samples);
      if (!Number.isFinite(value)) {
        throw new ValidationError('samples must be finite numbers', { value });
      }
      return value;
    }

    let sorted = this.sortedCache.get(samples);
    if (!sorted) {
      for (const v of samples) {
        if (!Number.isFinite(v)) {
          throw new ValidationError('samples must be finite numbers', {
            value: v,
          });
        }
      }
      sorted = [...samples].sort((x, y) => x - y);
      this.sortedCache.set(samples, sorted);
    }

    if (sorted.length === 1) {
      return sorted[0]!;
    }

    const position = this.next() * (sorted.length - 1);
    const lower = Math.floor(position);
    const upper = Math.min(lower + 1, sorted.length - 1);
    const fraction = position - lower;
    return sorted[lower]! + fraction * (sorted[upper]! - sorted[lower]!);
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
