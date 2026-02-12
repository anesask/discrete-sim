import { describe, it, expect } from 'vitest';
import { Simulation, Resource, Statistics, Random } from '../../src/index.js';
import * as timeout from '../../src/core/Process.js';

/**
 * Basic Benchmark Tests
 *
 * These tests measure performance of core functionality
 * with reasonable limits to ensure tests run quickly.
 */
describe('Basic Benchmarks', () => {
  describe('Simulation Engine', () => {
    it('should handle 100 concurrent processes efficiently', () => {
      const sim = new Simulation();
      const resource = new Resource(sim, 5, { name: 'workers' });

      const startTime = performance.now();

      // Create 100 simple processes
      for (let i = 0; i < 100; i++) {
        sim.process(function* () {
          const req = resource.request();
          yield req;
          yield* timeout.timeout(0.5);
          resource.release();
        });
      }

      // Run simulation
      const result = sim.run(50);
      const endTime = performance.now();
      const elapsed = endTime - startTime;

      // Should complete within 200ms
      expect(elapsed).toBeLessThan(200);
      expect(result.endTime).toBe(50);
      expect(result.eventsProcessed).toBeGreaterThan(100);
    });

    it('should efficiently process events in sequence', () => {
      const sim = new Simulation();
      let counter = 0;

      const startTime = performance.now();

      // Create a chain of processes
      sim.process(function* () {
        for (let i = 0; i < 100; i++) {
          yield* timeout.timeout(0.1);
          counter++;
        }
      });

      sim.run(15);
      const endTime = performance.now();
      const elapsed = endTime - startTime;

      // Should complete within 50ms
      expect(elapsed).toBeLessThan(50);
      expect(counter).toBe(100);
    });
  });

  describe('Resource Management', () => {
    it('should handle queue operations efficiently', () => {
      const sim = new Simulation();
      const resource = new Resource(sim, 2, { name: 'servers' });
      let completed = 0;

      const startTime = performance.now();

      // Create 50 processes competing for 2 resources
      for (let i = 0; i < 50; i++) {
        sim.process(function* () {
          const req = resource.request();
          yield req;
          yield* timeout.timeout(0.2);
          resource.release();
          completed++;
        });
      }

      sim.run(10);
      const endTime = performance.now();
      const elapsed = endTime - startTime;

      // Should complete within 100ms
      expect(elapsed).toBeLessThan(100);
      expect(completed).toBeGreaterThan(0);
      expect(resource.stats.totalRequests).toBe(50);
    });

    it('should handle priority queuing efficiently', () => {
      const sim = new Simulation();
      const resource = new Resource(sim, 1, { name: 'priority-server' });
      const priorities: number[] = [];

      const startTime = performance.now();

      // Create processes with different priorities
      for (let i = 0; i < 20; i++) {
        const priority = i % 5; // Priorities 0-4
        sim.process(function* () {
          const req = resource.request(priority);
          yield req;
          priorities.push(priority);
          yield* timeout.timeout(0.1);
          resource.release();
        });
      }

      sim.run(5);
      const endTime = performance.now();
      const elapsed = endTime - startTime;

      // Should complete within 50ms
      expect(elapsed).toBeLessThan(50);

      // Check that lower priority numbers were generally served first
      const firstHalf = priorities.slice(0, 10);
      const secondHalf = priorities.slice(10);
      const avgFirstHalf = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const avgSecondHalf = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

      // Lower priorities (smaller numbers) should be served first on average
      expect(avgFirstHalf).toBeLessThanOrEqual(avgSecondHalf);
    });
  });

  describe('Statistics Collection', () => {
    it('should record statistics efficiently', () => {
      const sim = new Simulation();
      const stats = new Statistics(sim);

      const startTime = performance.now();

      // Record 1000 samples
      for (let i = 0; i < 1000; i++) {
        stats.increment('counter1');
        if (i % 10 === 0) {
          stats.recordValue('metric1', i);
        }
      }

      // Query statistics
      const count = stats.getCount('counter1');

      const endTime = performance.now();
      const elapsed = endTime - startTime;

      // Should complete within 50ms (relaxed for CI)
      expect(elapsed).toBeLessThan(50);
      expect(count).toBe(1000);
    });

    it('should handle sample tracking efficiently', () => {
      const sim = new Simulation();
      const stats = new Statistics(sim);
      stats.enableSampleTracking('response-time');

      const startTime = performance.now();

      // Record 500 samples
      for (let i = 0; i < 500; i++) {
        stats.recordSample('response-time', Math.random() * 100);
      }

      // Calculate percentiles
      const p50 = stats.getPercentile('response-time', 50);
      const p95 = stats.getPercentile('response-time', 95);
      const p99 = stats.getPercentile('response-time', 99);

      const endTime = performance.now();
      const elapsed = endTime - startTime;

      // Should complete within 100ms (relaxed for CI environments)
      expect(elapsed).toBeLessThan(100);
      expect(p50).toBeGreaterThan(0);
      expect(p95).toBeGreaterThan(p50);
      expect(p99).toBeGreaterThan(p95);
    });
  });

  describe('Random Number Generation', () => {
    it('should generate uniform distribution efficiently', () => {
      const rng = new Random(12345);

      const startTime = performance.now();

      // Generate 10000 random numbers
      const numbers: number[] = [];
      for (let i = 0; i < 10000; i++) {
        numbers.push(rng.uniform(0, 100));
      }

      const endTime = performance.now();
      const elapsed = endTime - startTime;

      // Should complete within 100ms (relaxed for CI)
      expect(elapsed).toBeLessThan(100);

      // Check distribution properties
      const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
      expect(mean).toBeCloseTo(50, -1); // Should be around 50
    });

    it('should generate various distributions efficiently', () => {
      const rng = new Random(54321);

      const startTime = performance.now();

      // Generate 1000 samples from each distribution
      for (let i = 0; i < 1000; i++) {
        rng.exponential(2);
        rng.normal(100, 15);
        rng.triangular(0, 100, 40);
        rng.poisson(5);
      }

      const endTime = performance.now();
      const elapsed = endTime - startTime;

      // Should complete within 100ms for 4000 total samples
      expect(elapsed).toBeLessThan(100);
    });
  });
});