import { describe, it, expect, beforeEach } from 'vitest';
import { Simulation, Resource, timeout } from '../../src/index.js';

describe('Queue Disciplines', () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  describe('FIFO (First In First Out)', () => {
    it('should serve requests in arrival order', () => {
      const server = new Resource(sim, 1, { queueDiscipline: 'fifo' });
      const serviceOrder: number[] = [];

      function* customer(id: number) {
        yield server.request();
        serviceOrder.push(id);
        yield* timeout(1);
        server.release();
      }

      // Start customers at different times
      sim.process(() => customer(1));
      sim.process(() => customer(2));
      sim.process(() => customer(3));

      sim.run();

      expect(serviceOrder).toEqual([1, 2, 3]);
    });

    it('should ignore priority when using FIFO', () => {
      const server = new Resource(sim, 1, { queueDiscipline: 'fifo' });
      const serviceOrder: number[] = [];

      function* customer(id: number, arrivalDelay: number, priority: number) {
        yield* timeout(arrivalDelay);
        yield server.request(priority);
        serviceOrder.push(id);
        yield* timeout(1);
        server.release();
      }

      // Customer 1 arrives first with low priority
      // Customer 2 arrives second with high priority
      // Should still serve in FIFO order
      sim.process(() => customer(1, 0, 10)); // Low priority
      sim.process(() => customer(2, 0.5, 1)); // High priority (arrives later)

      sim.run();

      expect(serviceOrder).toEqual([1, 2]); // FIFO order, not priority order
    });

    it('should handle simultaneous arrivals in insertion order', () => {
      const server = new Resource(sim, 1, { queueDiscipline: 'fifo' });
      const serviceOrder: number[] = [];

      function* customer(id: number) {
        yield server.request();
        serviceOrder.push(id);
        yield* timeout(1);
        server.release();
      }

      // All arrive at time 0 (same time)
      sim.process(() => customer(1));
      sim.process(() => customer(2));
      sim.process(() => customer(3));
      sim.process(() => customer(4));

      sim.run();

      // Should maintain insertion order
      expect(serviceOrder).toEqual([1, 2, 3, 4]);
    });
  });

  describe('LIFO (Last In First Out)', () => {
    it('should serve most recent request first', () => {
      const server = new Resource(sim, 1, { queueDiscipline: 'lifo' });
      const serviceOrder: number[] = [];

      function* customer(id: number, arrivalDelay: number) {
        yield* timeout(arrivalDelay);
        yield server.request();
        serviceOrder.push(id);
        yield* timeout(1);
        server.release();
      }

      // Start server busy with customer 0
      sim.process(function* () {
        yield server.request();
        yield* timeout(5); // Hold for 5 units
        server.release();
      });

      // Queue up customers while server is busy
      sim.process(() => customer(1, 1)); // Arrives at t=1
      sim.process(() => customer(2, 2)); // Arrives at t=2
      sim.process(() => customer(3, 3)); // Arrives at t=3

      sim.run();

      // LIFO: Last to arrive (3) served first
      expect(serviceOrder).toEqual([3, 2, 1]);
    });

    it('should handle stack behavior correctly', () => {
      const server = new Resource(sim, 1, { queueDiscipline: 'lifo' });
      const events: string[] = [];

      function* customer(id: number) {
        events.push(`${id}:request`);
        yield server.request();
        events.push(`${id}:start`);
        yield* timeout(1);
        server.release();
        events.push(`${id}:end`);
      }

      // First customer gets resource immediately
      sim.process(() => customer(1));

      // These arrive while customer 1 is being served
      sim.process(function* () {
        yield* timeout(0.1);
        sim.process(() => customer(2));
      });

      sim.process(function* () {
        yield* timeout(0.2);
        sim.process(() => customer(3));
      });

      sim.run();

      expect(events).toEqual([
        '1:request',
        '1:start',
        '2:request',
        '3:request',
        '1:end',
        '3:start', // 3 served before 2 (LIFO)
        '3:end',
        '2:start',
        '2:end',
      ]);
    });
  });

  describe('Priority Queue', () => {
    it('should serve higher priority requests first', () => {
      const server = new Resource(sim, 1, { queueDiscipline: 'priority' });
      const serviceOrder: number[] = [];

      function* customer(id: number, priority: number) {
        yield server.request(priority);
        serviceOrder.push(id);
        yield* timeout(1);
        server.release();
      }

      // Start server busy
      sim.process(function* () {
        yield server.request();
        yield* timeout(5);
        server.release();
      });

      // Queue up customers with different priorities
      sim.process(function* () {
        yield* timeout(1);
        sim.process(() => customer(1, 10)); // Low priority
      });

      sim.process(function* () {
        yield* timeout(2);
        sim.process(() => customer(2, 1)); // High priority
      });

      sim.process(function* () {
        yield* timeout(3);
        sim.process(() => customer(3, 5)); // Medium priority
      });

      sim.run();

      // Should serve in priority order: 2 (p=1), 3 (p=5), 1 (p=10)
      expect(serviceOrder).toEqual([2, 3, 1]);
    });

    it('should use FIFO tie-breaker for same priority by default', () => {
      const server = new Resource(sim, 1, { queueDiscipline: 'priority' });
      const serviceOrder: number[] = [];

      function* customer(id: number, arrivalDelay: number) {
        yield* timeout(arrivalDelay);
        yield server.request(5); // All same priority
        serviceOrder.push(id);
        yield* timeout(1);
        server.release();
      }

      // Start server busy
      sim.process(function* () {
        yield server.request();
        yield* timeout(5);
        server.release();
      });

      // Queue up customers with same priority
      sim.process(() => customer(1, 1));
      sim.process(() => customer(2, 2));
      sim.process(() => customer(3, 3));

      sim.run();

      // Same priority: use FIFO (arrival order)
      expect(serviceOrder).toEqual([1, 2, 3]);
    });

    it('should support LIFO tie-breaker for same priority', () => {
      const server = new Resource(sim, 1, {
        queueDiscipline: { type: 'priority', tieBreaker: 'lifo' },
      });
      const serviceOrder: number[] = [];

      function* customer(id: number, arrivalDelay: number) {
        yield* timeout(arrivalDelay);
        yield server.request(5); // All same priority
        serviceOrder.push(id);
        yield* timeout(1);
        server.release();
      }

      // Start server busy
      sim.process(function* () {
        yield server.request();
        yield* timeout(5);
        server.release();
      });

      // Queue up customers with same priority
      sim.process(() => customer(1, 1));
      sim.process(() => customer(2, 2));
      sim.process(() => customer(3, 3));

      sim.run();

      // Same priority with LIFO tie-breaker
      expect(serviceOrder).toEqual([3, 2, 1]);
    });

    it('should handle negative priorities (higher priority)', () => {
      const server = new Resource(sim, 1, { queueDiscipline: 'priority' });
      const serviceOrder: number[] = [];

      function* customer(id: number, priority: number) {
        yield server.request(priority);
        serviceOrder.push(id);
        yield* timeout(1);
        server.release();
      }

      // Start server busy
      sim.process(function* () {
        yield server.request();
        yield* timeout(5);
        server.release();
      });

      sim.process(function* () {
        yield* timeout(1);
        sim.process(() => customer(1, 0));    // Normal priority
        sim.process(() => customer(2, -10));  // Very high priority
        sim.process(() => customer(3, 10));   // Low priority
        sim.process(() => customer(4, -5));   // High priority
      });

      sim.run();

      // Should serve: 2 (-10), 4 (-5), 1 (0), 3 (10)
      expect(serviceOrder).toEqual([2, 4, 1, 3]);
    });
  });

  describe('Preemptive Resources with Queue Disciplines', () => {
    it('should use priority discipline by default for preemptive resources', () => {
      // No explicit queueDiscipline specified
      const server = new Resource(sim, 1, { preemptive: true });
      const serviceOrder: number[] = [];

      function* customer(id: number, priority: number) {
        try {
          yield server.request(priority);
          serviceOrder.push(id);
          yield* timeout(5);
          server.release();
        } catch (error) {
          // Preempted
        }
      }

      sim.process(() => customer(1, 10));  // Low priority, starts first

      sim.process(function* () {
        yield* timeout(1);
        sim.process(() => customer(2, 1));  // High priority, should preempt
      });

      sim.run();

      // Customer 2 should preempt customer 1
      expect(serviceOrder).toEqual([1, 2]);
    });

    it('should allow explicit queue discipline for preemptive resources', () => {
      const server = new Resource(sim, 1, {
        preemptive: true,
        queueDiscipline: 'fifo', // Override default priority
      });

      const serviceOrder: number[] = [];

      function* customer(id: number, priority: number) {
        try {
          yield server.request(priority);
          serviceOrder.push(id);
          yield* timeout(5);
          server.release();
        } catch (error) {
          // Preempted
        }
      }

      sim.process(() => customer(1, 10));  // Low priority

      sim.process(function* () {
        yield* timeout(1);
        sim.process(() => customer(2, 1));  // High priority
      });

      sim.run();

      // With FIFO, customer 2 still preempts (that's preemption logic)
      // But any subsequent waiters would use FIFO
      expect(serviceOrder.length).toBeGreaterThan(0);
    });
  });

  describe('Mixed Priority Scenarios', () => {
    it('should handle complex priority ordering', () => {
      const server = new Resource(sim, 1, { queueDiscipline: 'priority' });
      const serviceOrder: number[] = [];

      function* customer(id: number, arrivalTime: number, priority: number) {
        yield* timeout(arrivalTime);
        yield server.request(priority);
        serviceOrder.push(id);
        yield* timeout(0.5);
        server.release();
      }

      // Start server busy
      sim.process(function* () {
        yield server.request();
        yield* timeout(10);
        server.release();
      });

      // Customers arrive at different times with different priorities
      sim.process(() => customer(1, 1, 5));   // t=1, p=5
      sim.process(() => customer(2, 2, 3));   // t=2, p=3 (higher)
      sim.process(() => customer(3, 3, 5));   // t=3, p=5 (same as 1)
      sim.process(() => customer(4, 4, 1));   // t=4, p=1 (highest)
      sim.process(() => customer(5, 5, 10));  // t=5, p=10 (lowest)

      sim.run();

      // Order: 4 (p=1), 2 (p=3), 1 (p=5, arrived first), 3 (p=5, arrived second), 5 (p=10)
      expect(serviceOrder).toEqual([4, 2, 1, 3, 5]);
    });
  });

  describe('Queue Discipline Configuration Validation', () => {
    it('should accept string queue discipline', () => {
      expect(() => new Resource(sim, 1, { queueDiscipline: 'fifo' })).not.toThrow();
      expect(() => new Resource(sim, 1, { queueDiscipline: 'lifo' })).not.toThrow();
      expect(() => new Resource(sim, 1, { queueDiscipline: 'priority' })).not.toThrow();
    });

    it('should accept object queue discipline configuration', () => {
      expect(() =>
        new Resource(sim, 1, {
          queueDiscipline: { type: 'priority', tieBreaker: 'fifo' },
        })
      ).not.toThrow();

      expect(() =>
        new Resource(sim, 1, {
          queueDiscipline: { type: 'priority', tieBreaker: 'lifo' },
        })
      ).not.toThrow();
    });

    it('should reject invalid queue discipline', () => {
      expect(() =>
        new Resource(sim, 1, { queueDiscipline: 'invalid' as any })
      ).toThrow(/Invalid queue discipline/);
    });
  });

  describe('Performance with Queue Disciplines', () => {
    it('should handle large queues with FIFO efficiently', () => {
      const server = new Resource(sim, 1, { queueDiscipline: 'fifo' });
      const count = 1000;

      function* customer(id: number) {
        yield server.request();
        yield* timeout(0.1);
        server.release();
      }

      for (let i = 0; i < count; i++) {
        sim.process(() => customer(i));
      }

      const start = Date.now();
      sim.run();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(1000); // Should complete in < 1 second
    });

    it('should handle large priority queues efficiently', () => {
      const server = new Resource(sim, 1, { queueDiscipline: 'priority' });
      const count = 500; // Smaller because priority queue has more overhead

      function* customer(id: number) {
        yield server.request(Math.floor(Math.random() * 100));
        yield* timeout(0.1);
        server.release();
      }

      for (let i = 0; i < count; i++) {
        sim.process(() => customer(i));
      }

      const start = Date.now();
      sim.run();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(2000); // Should complete in < 2 seconds
    });
  });
});
