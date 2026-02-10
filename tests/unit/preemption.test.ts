import { describe, it, expect, beforeEach } from 'vitest';
import {
  Simulation,
  Process,
  Resource,
  PreemptionError,
  timeout,
} from '../../src/index.js';

describe('Preemption', () => {
  let sim: Simulation;
  const results: string[] = [];

  beforeEach(() => {
    sim = new Simulation();
    results.length = 0;
  });

  describe('basic preemption', () => {
    it('should preempt lower priority when resource is full', () => {
      const server = new Resource(sim, 1, { name: 'Server', preemptive: true });

      function* lowPriority() {
        try {
          yield server.request(10); // Low priority
          results.push('low-acquired');
          yield* timeout(5);
          results.push('low-completed');
          server.release();
        } catch (err) {
          if (err instanceof PreemptionError) {
            results.push('low-preempted');
          }
        }
      }

      function* highPriority() {
        yield* timeout(1); // Arrive after low priority starts
        yield server.request(0); // High priority
        results.push('high-acquired');
        yield* timeout(3);
        results.push('high-completed');
        server.release();
      }

      const p1 = new Process(sim, lowPriority);
      const p2 = new Process(sim, highPriority);

      p1.start();
      p2.start();

      sim.run();

      // Low priority acquires, then gets preempted, high priority runs
      expect(results).toEqual([
        'low-acquired',
        'low-preempted',
        'high-acquired',
        'high-completed',
      ]);
    });

    it('should not preempt if priority is equal', () => {
      const server = new Resource(sim, 1, { name: 'Server', preemptive: true });

      function* customer(id: string, priority: number) {
        try {
          yield server.request(priority);
          results.push(`${id}-acquired`);
          yield* timeout(5);
          results.push(`${id}-completed`);
          server.release();
        } catch (err) {
          if (err instanceof PreemptionError) {
            results.push(`${id}-preempted`);
          }
        }
      }

      const p1 = new Process(sim, () => customer('first', 5));
      const p2 = new Process(sim, () => customer('second', 5));

      p1.start();
      p2.start();

      sim.run();

      // Same priority - no preemption, FIFO order
      expect(results).toEqual([
        'first-acquired',
        'first-completed',
        'second-acquired',
        'second-completed',
      ]);
    });

    it('should not preempt if new priority is lower', () => {
      const server = new Resource(sim, 1, { name: 'Server', preemptive: true });

      function* customer(id: string, priority: number) {
        try {
          yield server.request(priority);
          results.push(`${id}-acquired`);
          yield* timeout(5);
          results.push(`${id}-completed`);
          server.release();
        } catch (err) {
          if (err instanceof PreemptionError) {
            results.push(`${id}-preempted`);
          }
        }
      }

      const p1 = new Process(sim, () => customer('high', 0));
      const p2 = new Process(sim, () => customer('low', 10));

      p1.start();
      p2.start();

      sim.run();

      // High priority not preempted by low priority
      expect(results).toEqual([
        'high-acquired',
        'high-completed',
        'low-acquired',
        'low-completed',
      ]);
    });
  });

  describe('multiple capacity preemption', () => {
    it('should only preempt when all slots full', () => {
      const server = new Resource(sim, 2, { name: 'Server', preemptive: true });

      function* customer(id: string, priority: number) {
        try {
          yield server.request(priority);
          results.push(`${id}-acquired`);
          yield* timeout(5);
          results.push(`${id}-completed`);
          server.release();
        } catch (err) {
          if (err instanceof PreemptionError) {
            results.push(`${id}-preempted`);
          }
        }
      }

      // Two low priority customers occupy both slots
      const p1 = new Process(sim, () => customer('low1', 10));
      const p2 = new Process(sim, () => customer('low2', 10));
      const p3 = new Process(sim, () => customer('high', 0));

      p1.start();
      p2.start();
      p3.start();

      sim.run();

      // High priority preempts one of the low priority processes
      expect(results).toContain('high-acquired');
      expect(results).toContain('low1-preempted');
      expect(results).not.toContain('low2-preempted'); // Only one preempted
    });

    it('should preempt the lowest priority user', () => {
      const server = new Resource(sim, 2, { name: 'Server', preemptive: true });

      function* customer(id: string, priority: number) {
        try {
          yield server.request(priority);
          results.push(`${id}-acquired`);
          yield* timeout(5);
          results.push(`${id}-completed`);
          server.release();
        } catch (err) {
          if (err instanceof PreemptionError) {
            results.push(`${id}-preempted`);
          }
        }
      }

      // One medium, one low priority occupy slots
      const p1 = new Process(sim, () => customer('medium', 5));
      const p2 = new Process(sim, () => customer('lowest', 20));
      const p3 = new Process(sim, () => customer('high', 0));

      p1.start();
      p2.start();
      p3.start();

      sim.run();

      // High preempts lowest (priority 20), not medium (priority 5)
      expect(results).toContain('high-acquired');
      expect(results).toContain('lowest-preempted');
      expect(results).not.toContain('medium-preempted');
    });
  });

  describe('preemption recovery', () => {
    it('should allow preempted process to retry', () => {
      const server = new Resource(sim, 1, { name: 'Server', preemptive: true });

      function* lowPriority() {
        let attempts = 0;
        while (attempts < 2) {
          try {
            attempts++;
            yield server.request(10);
            results.push(`low-acquired-${attempts}`);
            yield* timeout(3);
            results.push(`low-completed-${attempts}`);
            server.release();
            return;
          } catch (err) {
            if (err instanceof PreemptionError) {
              results.push(`low-preempted-${attempts}`);
              // Retry
            } else {
              throw err;
            }
          }
        }
      }

      function* highPriority() {
        yield* timeout(1);
        yield server.request(0);
        results.push('high-acquired');
        yield* timeout(2);
        results.push('high-completed');
        server.release();
      }

      const p1 = new Process(sim, lowPriority);
      const p2 = new Process(sim, highPriority);

      p1.start();
      p2.start();

      sim.run();

      // Low gets preempted, then retries and completes
      expect(results).toContain('low-acquired-1');
      expect(results).toContain('low-preempted-1');
      expect(results).toContain('high-acquired');
      expect(results).toContain('high-completed');
      expect(results).toContain('low-acquired-2');
      expect(results).toContain('low-completed-2');
    });
  });

  describe('preemption statistics', () => {
    it('should track total preemptions', () => {
      const server = new Resource(sim, 1, { name: 'Server', preemptive: true });

      function* customer(priority: number, arrivalTime: number) {
        yield* timeout(arrivalTime);
        try {
          yield server.request(priority);
          yield* timeout(5); // Longer service time
          server.release();
        } catch (err) {
          if (err instanceof PreemptionError) {
            // Preempted, don't retry
          }
        }
      }

      // Start with one low priority customer
      const p1 = new Process(sim, () => customer(10, 0));
      p1.start();

      // Three progressively higher priority customers
      // Each arrives during service and preempts the previous
      const p2 = new Process(sim, () => customer(5, 1)); // Preempts low (pri 10)
      const p3 = new Process(sim, () => customer(0, 2.5)); // Preempts medium (pri 5)
      const p4 = new Process(sim, () => customer(-5, 4)); // Preempts high (pri 0)

      p2.start();
      p3.start();
      p4.start();

      sim.run();

      const stats = server.stats;
      // Should have 3 preemptions total
      expect(stats.totalPreemptions).toBe(3);
    });

    it('should have zero preemptions for non-preemptive resource', () => {
      const server = new Resource(sim, 1, {
        name: 'Server',
        preemptive: false,
      });

      function* customer(priority: number) {
        yield server.request(priority);
        yield* timeout(2);
        server.release();
      }

      const p1 = new Process(sim, () => customer(10));
      const p2 = new Process(sim, () => customer(0));

      p1.start();
      p2.start();

      sim.run();

      const stats = server.stats;
      expect(stats.totalPreemptions).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle immediate preemption on acquisition', () => {
      const server = new Resource(sim, 1, { name: 'Server', preemptive: true });

      function* customer(id: string, priority: number) {
        try {
          yield server.request(priority);
          results.push(`${id}-acquired`);
          yield* timeout(10);
          results.push(`${id}-completed`);
          server.release();
        } catch (err) {
          if (err instanceof PreemptionError) {
            results.push(`${id}-preempted`);
          }
        }
      }

      const p1 = new Process(sim, () => customer('low', 10));
      const p2 = new Process(sim, () => customer('high', 0));

      p1.start();
      p2.start(); // Immediate preemption

      sim.run();

      expect(results[0]).toBe('low-acquired');
      expect(results[1]).toBe('low-preempted');
      expect(results[2]).toBe('high-acquired');
    });

    it('should handle cascade preemption with multiple priorities', () => {
      const server = new Resource(sim, 1, { name: 'Server', preemptive: true });

      function* customer(id: string, priority: number, arrivalDelay: number) {
        yield* timeout(arrivalDelay);
        try {
          yield server.request(priority);
          results.push(`${id}-acquired`);
          yield* timeout(10);
          results.push(`${id}-completed`);
          server.release();
        } catch (err) {
          if (err instanceof PreemptionError) {
            results.push(`${id}-preempted`);
          }
        }
      }

      const p1 = new Process(sim, () => customer('lowest', 100, 0));
      const p2 = new Process(sim, () => customer('medium', 50, 1));
      const p3 = new Process(sim, () => customer('highest', 0, 2));

      p1.start();
      p2.start();
      p3.start();

      sim.run();

      // Lowest gets preempted by medium, medium gets preempted by highest
      expect(results).toContain('lowest-preempted');
      expect(results).toContain('medium-preempted');
      expect(results).toContain('highest-acquired');
      expect(results).toContain('highest-completed');
    });

    it('should handle preemption with queued requests', () => {
      const server = new Resource(sim, 1, { name: 'Server', preemptive: true });

      function* customer(id: string, priority: number) {
        try {
          yield server.request(priority);
          results.push(`${id}-acquired`);
          yield* timeout(5);
          results.push(`${id}-completed`);
          server.release();
        } catch (err) {
          if (err instanceof PreemptionError) {
            results.push(`${id}-preempted`);
          }
        }
      }

      // Start low priority
      const p1 = new Process(sim, () => customer('low1', 10));
      p1.start();

      // Queue more low priority
      const p2 = new Process(sim, () => customer('low2', 10));
      const p3 = new Process(sim, () => customer('low3', 10));
      p2.start();
      p3.start();

      // High priority arrives
      const p4 = new Process(sim, () => customer('high', 0));
      p4.start();

      sim.run();

      // High priority preempts and runs before queued low priority
      expect(results).toContain('low1-preempted');
      expect(results).toContain('high-acquired');
      expect(results).toContain('high-completed');
    });
  });

  describe('process interruption API', () => {
    it('should throw PreemptionError to interrupted process', () => {
      const server = new Resource(sim, 1, { name: 'Server', preemptive: true });
      let caughtError: Error | null = null;

      function* customer() {
        try {
          yield server.request(10);
          yield* timeout(5);
          server.release();
        } catch (err) {
          caughtError = err as Error;
        }
      }

      function* preemptor() {
        yield* timeout(1);
        yield server.request(0);
        yield* timeout(1);
        server.release();
      }

      const p1 = new Process(sim, customer);
      const p2 = new Process(sim, preemptor);

      p1.start();
      p2.start();

      sim.run();

      expect(caughtError).toBeInstanceOf(PreemptionError);
      expect(caughtError?.name).toBe('PreemptionError');
      expect(caughtError?.message).toContain('Preempted by higher priority');
    });
  });

  describe('non-preemptive behavior', () => {
    it('should queue higher priority when preemption disabled', () => {
      const server = new Resource(sim, 1, {
        name: 'Server',
        preemptive: false,
      });

      function* customer(id: string, priority: number) {
        yield server.request(priority);
        results.push(`${id}-acquired`);
        yield* timeout(5);
        results.push(`${id}-completed`);
        server.release();
      }

      const p1 = new Process(sim, () => customer('low', 10));
      const p2 = new Process(sim, () => customer('high', 0));

      p1.start();
      p2.start();

      sim.run();

      // Non-preemptive: low finishes first despite lower priority
      expect(results).toEqual([
        'low-acquired',
        'low-completed',
        'high-acquired',
        'high-completed',
      ]);
    });
  });

  describe('complex scenarios', () => {
    it('should handle emergency interrupt scenario', () => {
      const hospital = new Resource(sim, 2, {
        name: 'Operating Room',
        preemptive: true,
      });

      function* patient(id: string, priority: number, arrivalTime: number) {
        yield* timeout(arrivalTime);
        try {
          yield hospital.request(priority);
          results.push(`${id}-started`);
          yield* timeout(10);
          results.push(`${id}-finished`);
          hospital.release();
        } catch (err) {
          if (err instanceof PreemptionError) {
            results.push(`${id}-postponed`);
            // Emergency case, patient waits for next available slot
            yield hospital.request(priority);
            results.push(`${id}-rescheduled`);
            yield* timeout(10);
            results.push(`${id}-finished`);
            hospital.release();
          }
        }
      }

      // Two routine surgeries occupying rooms
      const p1 = new Process(sim, () => patient('routine-1', 50, 0));
      const p2 = new Process(sim, () => patient('routine-2', 50, 0));

      // Emergency arrives
      const p3 = new Process(sim, () => patient('emergency', 0, 2));

      p1.start();
      p2.start();
      p3.start();

      sim.run();

      // One routine gets postponed, emergency takes priority
      const postponedCount = results.filter((r) =>
        r.includes('postponed')
      ).length;
      expect(postponedCount).toBe(1);
      expect(results).toContain('emergency-started');
      expect(results).toContain('emergency-finished');
    });
  });
});
