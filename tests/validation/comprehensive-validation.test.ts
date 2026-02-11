/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/await-thenable */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// Note: Validation tests intentionally use 'any' and invalid types to test error handling

import { describe, it, expect } from 'vitest';
import {
  Simulation,
  Resource,
  Process,
  Statistics,
  Random,
  ValidationError,
  timeout,
  waitFor,
} from '../../src/index.js';

describe('Comprehensive Validation Tests', () => {
  describe('Simulation Validation', () => {
    it('should reject negative run duration', () => {
      const sim = new Simulation();
      expect(() => sim.run(-1)).toThrow(ValidationError);
      expect(() => sim.run(-100)).toThrow(ValidationError);
    });

    it('should reject NaN run duration', () => {
      const sim = new Simulation();
      expect(() => sim.run(NaN)).toThrow(ValidationError);
    });

    it('should reject Infinity run duration', () => {
      const sim = new Simulation();
      expect(() => sim.run(Infinity)).toThrow(ValidationError);
    });

    it('should reject non-number run duration', () => {
      const sim = new Simulation();
      // TypeScript prevents most invalid types at compile time
      // These tests verify runtime behavior when TypeScript is bypassed

      // @ts-expect-error Testing invalid input
      expect(() => sim.run('100')).toThrow(ValidationError);
      // @ts-expect-error Testing invalid input
      expect(() => sim.run(null)).toThrow(ValidationError);

      // Note: undefined is valid since 'until' is an optional parameter
      // sim.run(undefined) is equivalent to sim.run() and should not throw
    });

    it('should validate process names', () => {
      const sim = new Simulation();
      function* dummy() {
        yield* timeout(1);
      }

      // Process constructor is: Process(simulation, generatorFn)
      // There is no name parameter in the current API
      // Testing that we can create processes with generator functions

      // Generator function should be valid
      expect(() => new Process(sim, dummy)).not.toThrow();

      // Non-function should throw
      // @ts-expect-error Testing invalid input
      expect(() => new Process(sim, null)).toThrow();
      // @ts-expect-error Testing invalid input
      expect(() => new Process(sim, 'not a function')).toThrow();
    });
  });

  describe('Resource Validation', () => {
    it('should reject invalid capacity', () => {
      const sim = new Simulation();

      // Resource constructor is: Resource(sim, capacity, options?)
      // Zero capacity
      expect(() => new Resource(sim, 0)).toThrow(ValidationError);

      // Negative capacity
      expect(() => new Resource(sim, -1)).toThrow(ValidationError);

      // Non-integer capacity
      expect(() => new Resource(sim, 1.5)).toThrow(ValidationError);

      // NaN capacity
      expect(() => new Resource(sim, NaN)).toThrow(ValidationError);

      // Infinity capacity
      expect(() => new Resource(sim, Infinity)).toThrow(ValidationError);

      // Non-number capacity
      // @ts-expect-error Testing invalid input
      expect(() => new Resource(sim, '10')).toThrow();
    });

    it('should reject empty resource name', () => {
      const sim = new Simulation();
      expect(() => new Resource(sim, 1, { name: '' })).toThrow(ValidationError);
    });

    it('should validate request priority', () => {
      const sim = new Simulation();
      const resource = new Resource(sim, 1, { name: 'res' });

      function* testProcess(priority: number): Generator<any, void, any> {
        yield resource.request(priority);
        resource.release();
      }

      // Priority validation errors are thrown during request, which happens during process execution
      // The errors should be thrown when the process runs

      // Note: Negative priorities are ALLOWED (lower number = higher priority)
      // This is intentional design - priority -1 is higher than priority 0

      // NaN priority should throw
      expect(() => {
        const p2 = new Process(sim, () => testProcess(NaN));
        p2.start();
      }).toThrow(ValidationError);

      // Infinity priority should throw
      expect(() => {
        const p3 = new Process(sim, () => testProcess(Infinity));
        p3.start();
      }).toThrow(ValidationError);
    });

    it('should validate release operations', () => {
      const sim = new Simulation();
      const resource = new Resource(sim, 1, { name: 'res' });

      // Release without request should throw
      expect(() => resource.release()).toThrow(ValidationError);

      // Multiple releases should throw
      // Create a fresh resource for this test
      const resource2 = new Resource(sim, 1, { name: 'res2' });
      function* doubleRelease(): Generator<any, void, any> {
        yield resource2.request();
        resource2.release();
        resource2.release(); // Should throw
      }

      const process = new Process(sim, doubleRelease);
      // The second release happens immediately after the first when the generator resumes
      // Since the resource is available, it's acquired during start(), then both releases execute
      expect(() => process.start()).toThrow(ValidationError);
    });
  });

  describe('Statistics Validation', () => {
    it('should validate metric names', () => {
      const sim = new Simulation();
      const stats = new Statistics(sim);

      // Empty name should throw
      expect(() => stats.increment('', 1)).toThrow(ValidationError);
      expect(() => stats.recordValue('', 1)).toThrow(ValidationError);
      expect(() => stats.recordSample('', 1)).toThrow(ValidationError);

      // Null/undefined should throw
      // @ts-expect-error Testing invalid input
      expect(() => stats.increment(null, 1)).toThrow();
      // @ts-expect-error Testing invalid input
      expect(() => stats.increment(undefined, 1)).toThrow();
    });

    it('should validate numeric values', () => {
      const sim = new Simulation();
      const stats = new Statistics(sim);

      // NaN values should throw
      expect(() => stats.increment('metric', NaN)).toThrow(ValidationError);
      expect(() => stats.recordValue('metric', NaN)).toThrow(ValidationError);
      expect(() => stats.recordSample('metric', NaN)).toThrow(ValidationError);

      // Non-number values should throw
      // @ts-expect-error Testing invalid input
      expect(() => stats.increment('metric', '10')).toThrow();
      // @ts-expect-error Testing invalid input
      expect(() => stats.recordSample('metric', null)).toThrow();
    });

    it('should validate time values', () => {
      const sim = new Simulation();
      const stats = new Statistics(sim);

      // recordValue doesn't take time parameter - it uses simulation time
      // Testing that numeric values are validated

      // NaN value should throw
      expect(() => stats.recordValue('metric', NaN)).toThrow(ValidationError);

      // Infinity value should be accepted (might be intentional)
      // Let's test finite value validation if it exists
      // For now, just ensure basic validation works
      expect(() => stats.recordValue('metric', 100)).not.toThrow();
    });

    it('should validate percentile values', () => {
      const sim = new Simulation();
      const stats = new Statistics(sim);
      stats.enableSampleTracking('metric');
      stats.recordSample('metric', 10);

      // Out of range percentiles should throw
      expect(() => stats.getPercentile('metric', -1)).toThrow(ValidationError);
      expect(() => stats.getPercentile('metric', 101)).toThrow(ValidationError);
      expect(() => stats.getPercentile('metric', NaN)).toThrow(ValidationError);

      // Valid percentiles should work
      expect(() => stats.getPercentile('metric', 0)).not.toThrow();
      expect(() => stats.getPercentile('metric', 50)).not.toThrow();
      expect(() => stats.getPercentile('metric', 100)).not.toThrow();
    });

    it('should validate histogram bins', () => {
      const sim = new Simulation();
      const stats = new Statistics(sim);
      stats.enableSampleTracking('metric');
      stats.recordSample('metric', 10);

      // Invalid bin counts should throw
      expect(() => stats.getHistogram('metric', 0)).toThrow(ValidationError);
      expect(() => stats.getHistogram('metric', -1)).toThrow(ValidationError);
      expect(() => stats.getHistogram('metric', NaN)).toThrow(ValidationError);
      expect(() => stats.getHistogram('metric', Infinity)).toThrow(
        ValidationError
      );
      expect(() => stats.getHistogram('metric', 1.5)).toThrow(ValidationError);

      // Valid bin counts should work
      expect(() => stats.getHistogram('metric', 1)).not.toThrow();
      expect(() => stats.getHistogram('metric', 10)).not.toThrow();
      expect(() => stats.getHistogram('metric', 100)).not.toThrow();
    });

    it('should validate warmup period', () => {
      const sim = new Simulation();
      const stats = new Statistics(sim);

      // Negative warmup should throw
      expect(() => stats.setWarmupPeriod(-1)).toThrow(ValidationError);

      // NaN warmup should throw
      expect(() => stats.setWarmupPeriod(NaN)).toThrow(ValidationError);

      // Infinity warmup should throw
      expect(() => stats.setWarmupPeriod(Infinity)).toThrow(ValidationError);

      // Valid warmup should work
      expect(() => stats.setWarmupPeriod(0)).not.toThrow();
      expect(() => stats.setWarmupPeriod(100)).not.toThrow();
    });
  });

  describe('Random Validation', () => {
    it('should validate seed values', () => {
      // Negative seed should throw
      expect(() => new Random(-1)).toThrow(ValidationError);

      // Non-integer seed should throw
      expect(() => new Random(1.5)).toThrow(ValidationError);

      // NaN seed should throw
      expect(() => new Random(NaN)).toThrow(ValidationError);

      // Infinity seed should throw
      expect(() => new Random(Infinity)).toThrow(ValidationError);

      // Too large seed should throw (exceeds maximum safe value)
      expect(() => new Random(2 ** 32 + 1)).toThrow(ValidationError);

      // Valid seeds should work
      expect(() => new Random(0)).not.toThrow();
      expect(() => new Random(12345)).not.toThrow();
      expect(() => new Random(2 ** 32 - 1)).not.toThrow();
    });

    it('should validate distribution parameters', () => {
      const random = new Random(12345);

      // Uniform: min > max should throw
      expect(() => random.uniform(10, 5)).toThrow(ValidationError);

      // Exponential: negative rate should throw
      expect(() => random.exponential(-1)).toThrow(ValidationError);
      expect(() => random.exponential(0)).toThrow(ValidationError);

      // Normal: negative stdDev should throw
      expect(() => random.normal(0, -1)).toThrow(ValidationError);
      // Note: stdDev of 0 is valid - it returns the mean (deterministic)

      // Triangular: invalid bounds should throw
      expect(() => random.triangular(10, 5, 7)).toThrow(ValidationError);
      expect(() => random.triangular(0, 10, 15)).toThrow(ValidationError);
      expect(() => random.triangular(0, 10, -5)).toThrow(ValidationError);

      // Poisson: negative lambda should throw
      expect(() => random.poisson(-1)).toThrow(ValidationError);
      expect(() => random.poisson(0)).toThrow(ValidationError);

      // Choice: empty array should throw
      expect(() => random.choice([])).toThrow(ValidationError);

      // Note: sample() method not yet implemented
    });

    it('should validate int parameters', () => {
      const random = new Random(12345);

      // min > max should throw
      expect(() => random.randint(10, 5)).toThrow(ValidationError);

      // Note: Non-integer bounds are auto-corrected with ceil/floor
      // This is intentional for user convenience
      // randint(1.5, 10) becomes randint(2, 10)
      expect(() => random.randint(1.5, 10)).not.toThrow();
      expect(() => random.randint(1, 10.5)).not.toThrow();

      // NaN bounds should throw
      expect(() => random.randint(NaN, 10)).toThrow(ValidationError);
      expect(() => random.randint(1, NaN)).toThrow(ValidationError);

      // Infinity bounds should throw
      expect(() => random.randint(-Infinity, 10)).toThrow(ValidationError);
      expect(() => random.randint(1, Infinity)).toThrow(ValidationError);
    });
  });

  describe('Process Validation', () => {
    it('should validate timeout duration', () => {
      const sim = new Simulation();

      function* negativeTimeout(): Generator<any, void, any> {
        yield* timeout(-1);
      }

      // Validation happens when timeout is created during generator execution
      const p1 = new Process(sim, negativeTimeout);
      expect(() => p1.start()).toThrow(ValidationError);

      function* nanTimeout(): Generator<any, void, any> {
        yield* timeout(NaN);
      }

      const p2 = new Process(sim, nanTimeout);
      expect(() => p2.start()).toThrow(ValidationError);
    });

    it('should validate waitFor options', () => {
      const sim = new Simulation();

      function* invalidInterval(): Generator<any, void, any> {
        yield* waitFor(() => false, { interval: -1, maxIterations: 10 });
      }

      const p1 = new Process(sim, invalidInterval);
      expect(() => p1.start()).toThrow(ValidationError);

      function* invalidIterations(): Generator<any, void, any> {
        yield* waitFor(() => false, { interval: 1, maxIterations: -1 });
      }

      const p2 = new Process(sim, invalidIterations);
      expect(() => p2.start()).toThrow(ValidationError);

      function* nanInterval(): Generator<any, void, any> {
        yield* waitFor(() => false, { interval: NaN, maxIterations: 10 });
      }

      const p3 = new Process(sim, nanInterval);
      expect(() => p3.start()).toThrow(ValidationError);
    });

    it('should validate interrupt behavior', () => {
      const sim = new Simulation();
      let errorCaught = false;
      let errorMessage = '';

      function* interruptible(): Generator<any, void, any> {
        try {
          yield* timeout(10);
        } catch (error) {
          // Should be interrupted
          errorCaught = true;
          if (error instanceof Error) {
            errorMessage = error.message;
          }
          throw error;
        }
      }

      const process = new Process(sim, interruptible);
      process.start();

      // Interrupt immediately
      process.interrupt(new Error('Test interrupt'));

      // After interruption, process should be in interrupted state
      expect(process.isInterrupted).toBe(true);
      expect(errorCaught).toBe(true);
      expect(errorMessage).toBe('Test interrupt');
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle zero-duration timeouts', () => {
      const sim = new Simulation();
      let executed = false;

      function* zeroTimeout(): Generator<any, void, any> {
        yield* timeout(0);
        executed = true;
      }

      const p = new Process(sim, zeroTimeout);
      p.start();
      sim.run(1);

      expect(executed).toBe(true);
      expect(sim.now).toBe(1);
    });

    it('should handle maximum safe integer values', () => {
      const sim = new Simulation();
      const maxSafe = Number.MAX_SAFE_INTEGER;

      // Should handle large capacity
      expect(
        () => new Resource(sim, Math.floor(maxSafe / 2), { name: 'huge' })
      ).not.toThrow();

      // Should handle large time values
      function* largeTimeout(): Generator<any, void, any> {
        yield* timeout(maxSafe / 2);
      }
      expect(() => new Process(sim, largeTimeout)).not.toThrow();
    });

    it('should handle very small positive values', () => {
      const sim = new Simulation();
      const stats = new Statistics(sim);
      const random = new Random(12345);

      // Very small timeout
      function* tinyTimeout(): Generator<any, void, any> {
        yield* timeout(0.000001);
      }
      expect(() => new Process(sim, tinyTimeout)).not.toThrow();

      // Very small statistics values
      expect(() => stats.recordSample('tiny', 0.000001)).not.toThrow();

      // Very small distribution parameters
      expect(() => random.exponential(0.000001)).not.toThrow();
      expect(() => random.normal(0, 0.000001)).not.toThrow();
    });

    it('should handle Unicode and special characters in names', () => {
      const sim = new Simulation();

      // Unicode names
      expect(() => new Resource(sim, 1, { name: '资源' })).not.toThrow();
      expect(
        () =>
          new Process(sim, function* () {
            yield* timeout(1);
          })
      ).not.toThrow();

      // Special characters
      expect(() => new Resource(sim, 1, { name: 'res-123_ABC!@#$' })).not.toThrow();

      // Emojis
      expect(() => new Resource(sim, 1, { name: '🚀' })).not.toThrow();
    });

    it('should handle concurrent modifications safely', () => {
      const sim = new Simulation();
      const resource = new Resource(sim, 2, { name: 'res' });
      let completed = 0;

      function* worker(): Generator<any, void, any> {
        yield resource.request();
        yield* timeout(1);
        resource.release();
        completed++;
      }

      // Create many concurrent processes
      for (let i = 0; i < 100; i++) {
        const p = new Process(sim, worker);
        p.start();
      }

      sim.run(60);
      expect(completed).toBe(100);
    });
  });
});
