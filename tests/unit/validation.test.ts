import { describe, it, expect } from 'vitest';
import {
  ValidationError,
  Simulation,
  Resource,
  Process,
  Timeout,
  Random,
} from '../../src/index.js';

describe('Input Validation', () => {
  describe('ValidationError', () => {
    it('should be instanceable and include context', () => {
      const error = new ValidationError('Test error', { value: 42 });
      expect(error).toBeInstanceOf(ValidationError);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('ValidationError');
      expect(error.message).toBe('Test error');
      expect(error.context).toEqual({ value: 42 });
    });
  });

  describe('Simulation validation', () => {
    it('should reject negative delay in schedule()', () => {
      const sim = new Simulation();
      expect(() => {
        sim.schedule(-1, () => {});
      }).toThrow(ValidationError);
    });

    it('should provide helpful error message for negative delay', () => {
      const sim = new Simulation();
      try {
        sim.schedule(-5, () => {});
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        const ve = error as ValidationError;
        expect(ve.message).toContain('delay must be non-negative');
        expect(ve.message).toContain('(got -5)');
        expect(ve.context).toEqual({ delay: -5 });
      }
    });

    it('should accept zero delay', () => {
      const sim = new Simulation();
      expect(() => {
        sim.schedule(0, () => {});
      }).not.toThrow();
    });

    it('should accept positive delays', () => {
      const sim = new Simulation();
      expect(() => {
        sim.schedule(10, () => {});
        sim.schedule(0.5, () => {});
        sim.schedule(1000, () => {});
      }).not.toThrow();
    });
  });

  describe('Resource validation', () => {
    it('should reject zero capacity', () => {
      const sim = new Simulation();
      expect(() => {
        new Resource(sim, 0);
      }).toThrow(ValidationError);
    });

    it('should reject negative capacity', () => {
      const sim = new Simulation();
      expect(() => {
        new Resource(sim, -1);
      }).toThrow(ValidationError);
    });

    it('should reject non-integer capacity', () => {
      const sim = new Simulation();
      expect(() => {
        new Resource(sim, 2.5);
      }).toThrow(ValidationError);
    });

    it('should reject NaN capacity', () => {
      const sim = new Simulation();
      expect(() => {
        new Resource(sim, NaN);
      }).toThrow(ValidationError);
    });

    it('should reject Infinity capacity', () => {
      const sim = new Simulation();
      expect(() => {
        new Resource(sim, Infinity);
      }).toThrow(ValidationError);
    });

    it('should provide helpful error for invalid capacity', () => {
      const sim = new Simulation();
      try {
        new Resource(sim, 0, { name: 'Server' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        const ve = error as ValidationError;
        expect(ve.message).toContain('capacity must be at least 1');
        expect(ve.message).toContain('(got 0)');
        expect(ve.message).toContain('Server');
      }
    });

    it('should accept valid capacity values', () => {
      const sim = new Simulation();
      expect(() => {
        new Resource(sim, 1);
        new Resource(sim, 5);
        new Resource(sim, 100);
      }).not.toThrow();
    });

    it('should provide helpful error when releasing unused resource', () => {
      const sim = new Simulation();
      const resource = new Resource(sim, 1, { name: 'TestResource' });

      try {
        resource.release();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        const ve = error as ValidationError;
        expect(ve.message).toContain('TestResource');
        expect(ve.message).toContain('no units currently in use');
        expect(ve.message).toContain('Did you forget to request it first?');
      }
    });
  });

  describe('Process validation', () => {
    it('should reject negative timeout', () => {
      expect(() => {
        new Timeout(-1);
      }).toThrow(ValidationError);
    });

    it('should reject NaN timeout', () => {
      expect(() => {
        new Timeout(NaN);
      }).toThrow(ValidationError);
    });

    it('should reject Infinity timeout', () => {
      expect(() => {
        new Timeout(Infinity);
      }).toThrow(ValidationError);
    });

    it('should provide helpful error for negative timeout', () => {
      try {
        new Timeout(-10);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        const ve = error as ValidationError;
        expect(ve.message).toContain('delay must be non-negative');
        expect(ve.message).toContain('(got -10)');
        expect(ve.message).toContain('timeout(0) for immediate continuation');
      }
    });

    it('should accept valid timeout values', () => {
      expect(() => {
        new Timeout(0);
        new Timeout(1);
        new Timeout(100.5);
      }).not.toThrow();
    });

    it('should reject starting already-started process', () => {
      const sim = new Simulation();
      function* gen() {
        yield new Timeout(10);
      }
      const process = new Process(sim, gen);
      process.start();

      expect(() => {
        process.start();
      }).toThrow(ValidationError);
    });

    it('should provide helpful error for double-start', () => {
      const sim = new Simulation();
      function* gen() {
        yield new Timeout(10);
      }
      const process = new Process(sim, gen);
      process.start();

      try {
        process.start();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        const ve = error as ValidationError;
        expect(ve.message).toContain("state 'running'");
        expect(ve.message).toContain('must be in one of: pending');
      }
    });

    it('should reject interrupting non-running process', () => {
      const sim = new Simulation();
      function* gen() {
        yield new Timeout(10);
      }
      const process = new Process(sim, gen);

      expect(() => {
        process.interrupt();
      }).toThrow(ValidationError);
    });

    it('should provide helpful error for invalid interrupt', () => {
      const sim = new Simulation();
      function* gen() {
        yield new Timeout(10);
      }
      const process = new Process(sim, gen);

      try {
        process.interrupt();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        const ve = error as ValidationError;
        expect(ve.message).toContain("state 'pending'");
        expect(ve.message).toContain('must be in one of: running');
      }
    });

    it('should provide helpful error for invalid yield value', () => {
      const sim = new Simulation();
      function* gen() {
        yield 'invalid' as any; // Invalid yield value
      }
      const process = new Process(sim, gen);

      try {
        process.start();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        const ve = error as ValidationError;
        expect(ve.message).toContain('Invalid yield value');
        expect(ve.message).toContain(
          'Expected one of: Timeout, ResourceRequest, Condition'
        );
        expect(ve.message).toContain('Did you forget to use yield*');
      }
    });
  });

  describe('Random validation', () => {
    it('should reject invalid uniform() parameters', () => {
      const rng = new Random(42);
      expect(() => {
        rng.uniform(5, 3); // min > max
      }).toThrow('min must be less than max');
    });

    it('should reject non-positive exponential mean', () => {
      const rng = new Random(42);
      expect(() => {
        rng.exponential(-1);
      }).toThrow('mean must be positive');

      expect(() => {
        rng.exponential(0);
      }).toThrow('mean must be positive');
    });

    it('should reject negative normal stdDev', () => {
      const rng = new Random(42);
      expect(() => {
        rng.normal(0, -1);
      }).toThrow('stdDev must be non-negative');
    });

    it('should reject invalid randint() range', () => {
      const rng = new Random(42);
      expect(() => {
        rng.randint(5, 3); // min > max
      }).toThrow('min must be less than or equal to max');
    });

    it('should reject choice() on empty array', () => {
      const rng = new Random(42);
      expect(() => {
        rng.choice([]);
      }).toThrow('Cannot choose from empty array');
    });
  });

  describe('Edge cases and comprehensive validation', () => {
    it('should handle very large valid values', () => {
      const sim = new Simulation();
      expect(() => {
        sim.schedule(1e9, () => {});
        new Resource(sim, 1000000);
        new Timeout(1e6);
      }).not.toThrow();
    });

    it('should handle very small positive values', () => {
      const sim = new Simulation();
      expect(() => {
        sim.schedule(1e-10, () => {});
        new Timeout(1e-10);
      }).not.toThrow();
    });

    it('should validate decimal vs integer requirements', () => {
      const sim = new Simulation();
      // Delays can be decimal
      expect(() => {
        sim.schedule(0.5, () => {});
        new Timeout(0.1);
      }).not.toThrow();

      // Capacities must be integers
      expect(() => {
        new Resource(sim, 2.5);
      }).toThrow(ValidationError);
    });

    it('should provide context in all validation errors', () => {
      const sim = new Simulation();

      // Test that context is provided
      try {
        sim.schedule(-1, () => {});
      } catch (error) {
        expect((error as ValidationError).context).toBeDefined();
        expect((error as ValidationError).context?.delay).toBe(-1);
      }

      try {
        new Resource(sim, 0);
      } catch (error) {
        expect((error as ValidationError).context).toBeDefined();
        expect((error as ValidationError).context?.capacity).toBe(0);
      }

      try {
        new Timeout(-5);
      } catch (error) {
        expect((error as ValidationError).context).toBeDefined();
        expect((error as ValidationError).context?.delay).toBe(-5);
      }
    });
  });
});
