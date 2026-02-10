import { describe, it, expect, beforeEach } from 'vitest';
import { Simulation, Process, Resource, timeout } from '../../src/index.js';

describe('Priority Queues', () => {
  let sim: Simulation;
  let server: Resource;
  const results: string[] = [];

  beforeEach(() => {
    sim = new Simulation();
    server = new Resource(sim, 1, { name: 'Server' });
    results.length = 0;
  });

  describe('basic priority ordering', () => {
    it('should serve lower priority number first', () => {
      function* occupier() {
        // Occupy server first so others queue up
        yield server.request(0);
        yield* timeout(1);
        server.release();
      }

      function* customer(id: string, priority: number) {
        yield server.request(priority);
        results.push(id);
        yield* timeout(1);
        server.release();
      }

      // Occupy server first
      const c0 = new Process(sim, occupier);
      c0.start();

      // Then queue customers with different priorities
      const c1 = new Process(sim, () => customer('Low', 10));
      const c2 = new Process(sim, () => customer('High', 0));
      const c3 = new Process(sim, () => customer('Medium', 5));

      c1.start();
      c2.start();
      c3.start();

      sim.run();

      // High (0) should be first, Medium (5) second, Low (10) last
      expect(results).toEqual(['High', 'Medium', 'Low']);
    });

    it('should default to priority 0 when not specified', () => {
      function* customer(id: string, priority?: number) {
        if (priority !== undefined) {
          yield server.request(priority);
        } else {
          yield server.request(); // No priority specified
        }
        results.push(id);
        yield* timeout(1);
        server.release();
      }

      const c1 = new Process(sim, () => customer('Default'));
      const c2 = new Process(sim, () => customer('Low', 10));

      c1.start();
      c2.start();

      sim.run();

      // Default (0) should come before Low (10)
      expect(results).toEqual(['Default', 'Low']);
    });

    it('should handle negative priorities', () => {
      function* occupier() {
        yield server.request(0);
        yield* timeout(1);
        server.release();
      }

      function* customer(id: string, priority: number) {
        yield server.request(priority);
        results.push(id);
        yield* timeout(1);
        server.release();
      }

      // Occupy server first
      const c0 = new Process(sim, occupier);
      c0.start();

      // Queue customers
      const c1 = new Process(sim, () => customer('Normal', 0));
      const c2 = new Process(sim, () => customer('VIP', -10));
      const c3 = new Process(sim, () => customer('SuperVIP', -100));

      c1.start();
      c2.start();
      c3.start();

      sim.run();

      expect(results).toEqual(['SuperVIP', 'VIP', 'Normal']);
    });
  });

  describe('FIFO within same priority', () => {
    it('should maintain arrival order for same priority', () => {
      function* customer(id: string) {
        yield server.request(5); // All same priority
        results.push(id);
        yield* timeout(1);
        server.release();
      }

      for (let i = 1; i <= 5; i++) {
        const c = new Process(sim, () => customer(`C${i}`));
        c.start();
      }

      sim.run();

      // Should maintain FIFO order
      expect(results).toEqual(['C1', 'C2', 'C3', 'C4', 'C5']);
    });

    it('should maintain FIFO within default priority', () => {
      function* customer(id: string) {
        yield server.request(); // All default priority (0)
        results.push(id);
        yield* timeout(1);
        server.release();
      }

      for (let i = 1; i <= 4; i++) {
        const c = new Process(sim, () => customer(`C${i}`));
        c.start();
      }

      sim.run();

      expect(results).toEqual(['C1', 'C2', 'C3', 'C4']);
    });
  });

  describe('mixed priorities', () => {
    it('should correctly order multiple priority levels', () => {
      function* customer(id: string, priority: number, delay: number) {
        yield* timeout(delay); // Stagger arrivals
        yield server.request(priority);
        results.push(id);
        yield* timeout(1);
        server.release();
      }

      // First customer occupies server
      const c0 = new Process(sim, () => customer('First', 0, 0));
      c0.start();

      // Others arrive while first is being served
      const c1 = new Process(sim, () => customer('Low1', 10, 0.1));
      const c2 = new Process(sim, () => customer('High', -5, 0.2));
      const c3 = new Process(sim, () => customer('Medium', 5, 0.3));
      const c4 = new Process(sim, () => customer('Low2', 10, 0.4));
      const c5 = new Process(sim, () => customer('VIP', -10, 0.5));

      c1.start();
      c2.start();
      c3.start();
      c4.start();
      c5.start();

      sim.run();

      // First is served immediately, then by priority:
      // VIP (-10), High (-5), Medium (5), Low1 (10), Low2 (10)
      expect(results).toEqual([
        'First',
        'VIP',
        'High',
        'Medium',
        'Low1',
        'Low2',
      ]);
    });

    it('should work with multiple capacity', () => {
      const multiServer = new Resource(sim, 2, { name: 'MultiServer' });
      const localResults: string[] = [];

      function* customer(id: string, priority: number) {
        yield multiServer.request(priority);
        localResults.push(`${id}-start`);
        yield* timeout(1);
        localResults.push(`${id}-end`);
        multiServer.release();
      }

      // Create customers
      const c1 = new Process(sim, () => customer('Low', 10));
      const c2 = new Process(sim, () => customer('High', 0));
      const c3 = new Process(sim, () => customer('Med', 5));
      const c4 = new Process(sim, () => customer('Low2', 10));

      c1.start();
      c2.start();
      c3.start();
      c4.start();

      sim.run();

      // First two start immediately (capacity 2)
      expect(localResults[0]).toBe('Low-start');
      expect(localResults[1]).toBe('High-start');

      // After one finishes, next by priority is Med (5)
      // Then Low2 (10)
    });
  });

  describe('resource statistics with priorities', () => {
    it('should track wait times correctly with priorities', () => {
      function* customer(priority: number) {
        yield server.request(priority);
        yield* timeout(5);
        server.release();
      }

      // First customer gets server immediately
      const c1 = new Process(sim, () => customer(0));
      c1.start();

      // Others arrive and queue
      const c2 = new Process(sim, () => customer(10)); // Low priority - waits longest
      const c3 = new Process(sim, () => customer(0)); // High priority - served before c2

      c2.start();
      c3.start();

      sim.run();

      const stats = server.stats;
      expect(stats.totalRequests).toBe(3);

      // Average wait time should be calculated correctly
      // c1: 0 wait, c3: 5 wait (after c1), c2: 10 wait (after c1 and c3)
      // Average: (0 + 5 + 10) / 3 = 5
      expect(stats.averageWaitTime).toBeCloseTo(5, 2);
    });

    it('should track queue length with priority insertions', () => {
      function* customer(priority: number) {
        yield server.request(priority);
        yield* timeout(1);
        server.release();
      }

      // Occupy server
      const c1 = new Process(sim, () => customer(0));
      c1.start();

      // Queue up multiple with different priorities
      const c2 = new Process(sim, () => customer(10));
      const c3 = new Process(sim, () => customer(5));
      const c4 = new Process(sim, () => customer(1));

      c2.start();
      c3.start();
      c4.start();

      sim.run();

      const stats = server.stats;

      // All requests should be processed
      expect(stats.totalRequests).toBe(4);
      expect(stats.totalReleases).toBe(4);

      // Queue should have been emptied
      expect(server.queueLength).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle priority 0 correctly', () => {
      function* customer(id: string, priority: number) {
        yield server.request(priority);
        results.push(id);
        yield* timeout(1);
        server.release();
      }

      const c1 = new Process(sim, () => customer('Zero', 0));
      const c2 = new Process(sim, () => customer('One', 1));

      c1.start();
      c2.start();

      sim.run();

      expect(results).toEqual(['Zero', 'One']);
    });

    it('should handle very large priority numbers', () => {
      function* occupier() {
        yield server.request(0);
        yield* timeout(1);
        server.release();
      }

      function* customer(id: string, priority: number) {
        yield server.request(priority);
        results.push(id);
        yield* timeout(1);
        server.release();
      }

      // Occupy server first
      const c0 = new Process(sim, occupier);
      c0.start();

      // Queue customers
      const c1 = new Process(sim, () => customer('VeryLow', 999999));
      const c2 = new Process(sim, () => customer('Normal', 0));

      c1.start();
      c2.start();

      sim.run();

      expect(results).toEqual(['Normal', 'VeryLow']);
    });

    it('should handle many customers with same priority', () => {
      function* customer(id: number) {
        yield server.request(5);
        results.push(`C${id}`);
        yield* timeout(0.5);
        server.release();
      }

      // Create 20 customers all with priority 5
      for (let i = 1; i <= 20; i++) {
        const c = new Process(sim, () => customer(i));
        c.start();
      }

      sim.run();

      // Should maintain FIFO order
      expect(results.length).toBe(20);
      for (let i = 0; i < 20; i++) {
        expect(results[i]).toBe(`C${i + 1}`);
      }
    });
  });

  describe('complex scenarios', () => {
    it('should handle dynamic arrivals with different priorities', () => {
      function* arrivalProcess() {
        // Regular customers arrive every 2 time units
        for (let i = 0; i < 3; i++) {
          const c = new Process(sim, () => regularCustomer(i));
          c.start();
          yield* timeout(2);
        }
      }

      function* regularCustomer(id: number) {
        yield server.request(10); // Low priority
        results.push(`Regular${id}`);
        yield* timeout(5);
        server.release();
      }

      function* vipCustomer(id: number) {
        yield* timeout(1); // Arrive after first regular
        yield server.request(0); // High priority
        results.push(`VIP${id}`);
        yield* timeout(5);
        server.release();
      }

      const arrivals = new Process(sim, arrivalProcess);
      arrivals.start();

      // VIP arrives during first regular's service
      const vip = new Process(sim, () => vipCustomer(0));
      vip.start();

      sim.run();

      // Regular0 starts first, VIP cuts in line, then Regular1, Regular2
      expect(results[0]).toBe('Regular0');
      expect(results[1]).toBe('VIP0');
      expect(results[2]).toBe('Regular1');
      expect(results[3]).toBe('Regular2');
    });
  });

  describe('binary search optimization', () => {
    it('should maintain correct priority order with many queued requests', () => {
      function* occupier() {
        yield server.request();
        yield* timeout(1);
        server.release();
      }

      function* customer(id: number, priority: number) {
        yield server.request(priority);
        results.push(`${priority}-${id}`);
        server.release();
      }

      // Occupy server first
      sim.process(occupier);

      // Create many requests with various priorities (will all queue)
      for (let i = 0; i < 100; i++) {
        const priority = Math.floor(Math.random() * 10);
        sim.process(() => customer(i, priority));
      }

      sim.run();

      // Verify results are in priority order
      for (let i = 1; i < results.length; i++) {
        const prevPriority = parseInt(results[i - 1]!.split('-')[0]!);
        const currPriority = parseInt(results[i]!.split('-')[0]!);
        expect(currPriority).toBeGreaterThanOrEqual(prevPriority);
      }

      // Verify all customers were served
      expect(results.length).toBe(100);
    });

    it('should maintain FIFO order within same priority', () => {
      function* occupier() {
        yield server.request();
        yield* timeout(1);
        server.release();
      }

      function* customer(id: number) {
        yield server.request(5); // All same priority
        results.push(`${id}`);
        server.release();
      }

      // Occupy server
      sim.process(occupier);

      // Queue 10 customers with same priority
      for (let i = 0; i < 10; i++) {
        sim.process(() => customer(i));
      }

      sim.run();

      // Should be served in order: 0,1,2,3,4,5,6,7,8,9
      expect(results).toEqual([
        '0',
        '1',
        '2',
        '3',
        '4',
        '5',
        '6',
        '7',
        '8',
        '9',
      ]);
    });

    it('should handle interleaved priorities correctly', () => {
      function* occupier() {
        yield server.request();
        yield* timeout(1);
        server.release();
      }

      function* customer(id: string, priority: number) {
        yield server.request(priority);
        results.push(id);
        server.release();
      }

      // Occupy server
      sim.process(occupier);

      // Queue in specific pattern: high, low, high, low, medium
      sim.process(() => customer('H1', 0));
      sim.process(() => customer('L1', 10));
      sim.process(() => customer('H2', 0));
      sim.process(() => customer('L2', 10));
      sim.process(() => customer('M1', 5));

      sim.run();

      // Should be: H1, H2, M1, L1, L2 (priority order, FIFO within same priority)
      expect(results).toEqual(['H1', 'H2', 'M1', 'L1', 'L2']);
    });
  });
});
