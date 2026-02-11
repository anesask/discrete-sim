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
    it('should reject negative run duration', async () => {
      const sim = new Simulation();
      await expect(sim.run(-1)).rejects.toThrow(ValidationError);
      await expect(sim.run(-100)).rejects.toThrow(ValidationError);
    });

    it('should reject NaN run duration', async () => {
      const sim = new Simulation();
      await expect(sim.run(NaN)).rejects.toThrow(ValidationError);
    });

    it('should reject Infinity run duration', async () => {
      const sim = new Simulation();
      await expect(sim.run(Infinity)).rejects.toThrow(ValidationError);
    });

    it('should reject non-number run duration', async () => {
      const sim = new Simulation();
      // @ts-expect-error Testing invalid input
      await expect(sim.run('100')).rejects.toThrow(ValidationError);
      // @ts-expect-error Testing invalid input
      await expect(sim.run(null)).rejects.toThrow(ValidationError);
      // @ts-expect-error Testing invalid input
      await expect(sim.run(undefined)).rejects.toThrow(ValidationError);
    });

    it('should validate process names', () => {
      const sim = new Simulation();
      function* dummy() {
        yield timeout(sim, 1);
      }

      // Empty name should throw
      expect(() => new Process(sim, '', dummy())).toThrow(ValidationError);

      // Null/undefined should throw
      // @ts-expect-error Testing invalid input
      expect(() => new Process(sim, null, dummy())).toThrow();
      // @ts-expect-error Testing invalid input
      expect(() => new Process(sim, undefined, dummy())).toThrow();

      // Very long names should be allowed
      const longName = 'a'.repeat(1000);
      expect(() => new Process(sim, longName, dummy())).not.toThrow();
    });
  });

  describe('Resource Validation', () => {
    it('should reject invalid capacity', () => {
      const sim = new Simulation();

      // Zero capacity
      expect(() => new Resource(sim, 'res', 0)).toThrow(ValidationError);

      // Negative capacity
      expect(() => new Resource(sim, 'res', -1)).toThrow(ValidationError);

      // Non-integer capacity
      expect(() => new Resource(sim, 'res', 1.5)).toThrow(ValidationError);

      // NaN capacity
      expect(() => new Resource(sim, 'res', NaN)).toThrow(ValidationError);

      // Infinity capacity
      expect(() => new Resource(sim, 'res', Infinity)).toThrow(ValidationError);

      // Non-number capacity
      // @ts-expect-error Testing invalid input
      expect(() => new Resource(sim, 'res', '10')).toThrow();
    });

    it('should reject empty resource name', () => {
      const sim = new Simulation();
      expect(() => new Resource(sim, '', 1)).toThrow(ValidationError);
    });

    it('should validate request priority', async () => {
      const sim = new Simulation();
      const resource = new Resource(sim, 'res', 1);

      function* testProcess(priority: number): Generator<any, void, any> {
        yield resource.request(priority);
        resource.release();
      }

      // Negative priority should throw
      const p1 = new Process(sim, 'p1', testProcess(-1));
      await sim.run(1);
      expect(p1.error).toBeInstanceOf(ValidationError);

      // Reset for next test
      sim.reset();

      // NaN priority should throw
      const p2 = new Process(sim, 'p2', testProcess(NaN));
      await sim.run(1);
      expect(p2.error).toBeInstanceOf(ValidationError);

      // Reset for next test
      sim.reset();

      // Infinity priority should throw
      const p3 = new Process(sim, 'p3', testProcess(Infinity));
      await sim.run(1);
      expect(p3.error).toBeInstanceOf(ValidationError);
    });

    it('should validate release operations', () => {
      const sim = new Simulation();
      const resource = new Resource(sim, 'res', 1);

      // Release without request should throw
      expect(() => resource.release()).toThrow(Error);

      // Multiple releases should throw
      function* doubleRelease(): Generator<any, void, any> {
        yield resource.request();
        resource.release();
        resource.release(); // Should throw
      }

      const process = new Process(sim, 'test', doubleRelease());
      sim.run(1);
      expect(process.error).toBeDefined();
    });
  });

  describe('Statistics Validation', () => {
    it('should validate metric names', () => {
      const stats = new Statistics();

      // Empty name should throw
      expect(() => stats.recordCounter('', 1)).toThrow(ValidationError);
      expect(() => stats.recordTimeWeighted('', 1, 0)).toThrow(ValidationError);
      expect(() => stats.recordSample('', 1)).toThrow(ValidationError);

      // Null/undefined should throw
      // @ts-expect-error Testing invalid input
      expect(() => stats.recordCounter(null, 1)).toThrow();
      // @ts-expect-error Testing invalid input
      expect(() => stats.recordCounter(undefined, 1)).toThrow();
    });

    it('should validate numeric values', () => {
      const stats = new Statistics();

      // NaN values should throw
      expect(() => stats.recordCounter('metric', NaN)).toThrow(ValidationError);
      expect(() => stats.recordTimeWeighted('metric', NaN, 0)).toThrow(
        ValidationError
      );
      expect(() => stats.recordSample('metric', NaN)).toThrow(ValidationError);

      // Non-number values should throw
      // @ts-expect-error Testing invalid input
      expect(() => stats.recordCounter('metric', '10')).toThrow();
      // @ts-expect-error Testing invalid input
      expect(() => stats.recordSample('metric', null)).toThrow();
    });

    it('should validate time values', () => {
      const stats = new Statistics();

      // Negative time should throw
      expect(() => stats.recordTimeWeighted('metric', 1, -1)).toThrow(
        ValidationError
      );

      // NaN time should throw
      expect(() => stats.recordTimeWeighted('metric', 1, NaN)).toThrow(
        ValidationError
      );

      // Infinity time should throw
      expect(() => stats.recordTimeWeighted('metric', 1, Infinity)).toThrow(
        ValidationError
      );
    });

    it('should validate percentile values', () => {
      const stats = new Statistics();
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
      const stats = new Statistics();
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
      const stats = new Statistics();

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

      // Too large seed should be wrapped
      expect(() => new Random(2 ** 32 + 1)).not.toThrow();

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
      expect(() => random.normal(0, 0)).toThrow(ValidationError);

      // Triangular: invalid bounds should throw
      expect(() => random.triangular(10, 5, 7)).toThrow(ValidationError);
      expect(() => random.triangular(0, 10, 15)).toThrow(ValidationError);
      expect(() => random.triangular(0, 10, -5)).toThrow(ValidationError);

      // Poisson: negative lambda should throw
      expect(() => random.poisson(-1)).toThrow(ValidationError);
      expect(() => random.poisson(0)).toThrow(ValidationError);

      // Choice: empty array should throw
      expect(() => random.choice([])).toThrow(ValidationError);

      // Sample: k > population should throw
      expect(() => random.sample([1, 2, 3], 5)).toThrow(ValidationError);
      expect(() => random.sample([1, 2, 3], -1)).toThrow(ValidationError);
    });

    it('should validate int parameters', () => {
      const random = new Random(12345);

      // min > max should throw
      expect(() => random.int(10, 5)).toThrow(ValidationError);

      // Non-integer bounds should throw
      expect(() => random.int(1.5, 10)).toThrow(ValidationError);
      expect(() => random.int(1, 10.5)).toThrow(ValidationError);

      // NaN bounds should throw
      expect(() => random.int(NaN, 10)).toThrow(ValidationError);
      expect(() => random.int(1, NaN)).toThrow(ValidationError);

      // Infinity bounds should throw
      expect(() => random.int(-Infinity, 10)).toThrow(ValidationError);
      expect(() => random.int(1, Infinity)).toThrow(ValidationError);
    });
  });

  describe('Process Validation', () => {
    it('should validate timeout duration', async () => {
      const sim = new Simulation();

      function* negativeTimeout(): Generator<any, void, any> {
        yield timeout(sim, -1);
      }

      const p1 = new Process(sim, 'p1', negativeTimeout());
      await sim.run(1);
      expect(p1.error).toBeInstanceOf(ValidationError);

      // Reset for next test
      sim.reset();

      function* nanTimeout(): Generator<any, void, any> {
        yield timeout(sim, NaN);
      }

      const p2 = new Process(sim, 'p2', nanTimeout());
      await sim.run(1);
      expect(p2.error).toBeInstanceOf(ValidationError);
    });

    it('should validate waitFor options', async () => {
      const sim = new Simulation();

      function* invalidInterval(): Generator<any, void, any> {
        yield waitFor(sim, () => false, { interval: -1, maxIterations: 10 });
      }

      const p1 = new Process(sim, 'p1', invalidInterval());
      await sim.run(1);
      expect(p1.error).toBeInstanceOf(ValidationError);

      // Reset for next test
      sim.reset();

      function* invalidIterations(): Generator<any, void, any> {
        yield waitFor(sim, () => false, { interval: 1, maxIterations: -1 });
      }

      const p2 = new Process(sim, 'p2', invalidIterations());
      await sim.run(1);
      expect(p2.error).toBeInstanceOf(ValidationError);

      // Reset for next test
      sim.reset();

      function* nanInterval(): Generator<any, void, any> {
        yield waitFor(sim, () => false, { interval: NaN, maxIterations: 10 });
      }

      const p3 = new Process(sim, 'p3', nanInterval());
      await sim.run(1);
      expect(p3.error).toBeInstanceOf(ValidationError);
    });

    it('should validate interrupt behavior', async () => {
      const sim = new Simulation();

      function* interruptible(): Generator<any, void, any> {
        try {
          yield timeout(sim, 10);
        } catch (error) {
          // Should be interrupted
          expect(error).toBeInstanceOf(Error);
          throw error;
        }
      }

      const process = new Process(sim, 'test', interruptible());

      // Interrupt immediately
      process.interrupt(new Error('Test interrupt'));

      await sim.run(1);
      expect(process.error).toBeInstanceOf(Error);
      expect(process.error?.message).toBe('Test interrupt');
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle zero-duration timeouts', async () => {
      const sim = new Simulation();
      let executed = false;

      function* zeroTimeout(): Generator<any, void, any> {
        yield timeout(sim, 0);
        executed = true;
      }

      new Process(sim, 'test', zeroTimeout());
      await sim.run(1);

      expect(executed).toBe(true);
      expect(sim.now).toBe(1);
    });

    it('should handle maximum safe integer values', () => {
      const sim = new Simulation();
      const maxSafe = Number.MAX_SAFE_INTEGER;

      // Should handle large capacity
      expect(
        () => new Resource(sim, 'huge', Math.floor(maxSafe / 2))
      ).not.toThrow();

      // Should handle large time values
      function* largeTimeout(): Generator<any, void, any> {
        yield timeout(sim, maxSafe / 2);
      }
      expect(() => new Process(sim, 'test', largeTimeout())).not.toThrow();
    });

    it('should handle very small positive values', () => {
      const sim = new Simulation();
      const stats = new Statistics();
      const random = new Random(12345);

      // Very small timeout
      function* tinyTimeout(): Generator<any, void, any> {
        yield timeout(sim, 0.000001);
      }
      expect(() => new Process(sim, 'test', tinyTimeout())).not.toThrow();

      // Very small statistics values
      expect(() => stats.recordSample('tiny', 0.000001)).not.toThrow();

      // Very small distribution parameters
      expect(() => random.exponential(0.000001)).not.toThrow();
      expect(() => random.normal(0, 0.000001)).not.toThrow();
    });

    it('should handle Unicode and special characters in names', () => {
      const sim = new Simulation();

      // Unicode names
      expect(() => new Resource(sim, '资源', 1)).not.toThrow();
      expect(
        () =>
          new Process(
            sim,
            'プロセス',
            (function* () {
              yield timeout(sim, 1);
            })()
          )
      ).not.toThrow();

      // Special characters
      expect(() => new Resource(sim, 'res-123_ABC!@#$', 1)).not.toThrow();

      // Emojis
      expect(() => new Resource(sim, '🚀', 1)).not.toThrow();
    });

    it('should handle concurrent modifications safely', async () => {
      const sim = new Simulation();
      const resource = new Resource(sim, 'res', 2);
      let completed = 0;

      function* worker(): Generator<any, void, any> {
        yield resource.request();
        yield timeout(sim, 1);
        resource.release();
        completed++;
      }

      // Create many concurrent processes
      for (let i = 0; i < 100; i++) {
        new Process(sim, `worker-${i}`, worker());
      }

      await sim.run(60);
      expect(completed).toBe(100);
    });
  });
});
