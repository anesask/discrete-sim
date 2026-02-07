import { describe, it, expect, beforeEach } from 'vitest';
import { Simulation } from '../../src/core/Simulation';
import { Resource } from '../../src/resources/Resource';
import { Process, timeout } from '../../src/core/Process';

describe('Resource', () => {
  let sim: Simulation;
  let resource: Resource;

  beforeEach(() => {
    sim = new Simulation();
  });

  describe('initialization', () => {
    it('should create resource with specified capacity', () => {
      resource = new Resource(sim, 3);
      expect(resource.available).toBe(3);
      expect(resource.inUse).toBe(0);
      expect(resource.queueLength).toBe(0);
    });

    it('should create resource with custom name', () => {
      resource = new Resource(sim, 1, { name: 'Server' });
      expect(resource.name).toBe('Server');
    });

    it('should use default name if not provided', () => {
      resource = new Resource(sim, 1);
      expect(resource.name).toBe('Resource');
    });

    it('should throw error for capacity less than 1', () => {
      expect(() => {
        new Resource(sim, 0);
      }).toThrow('capacity must be at least 1');

      expect(() => {
        new Resource(sim, -1);
      }).toThrow('capacity must be at least 1');
    });

    it('should create preemptive resource', () => {
      const resource = new Resource(sim, 1, { preemptive: true });
      expect(resource).toBeDefined();
      expect(resource.capacity).toBe(1);
    });
  });

  describe('basic request and release', () => {
    beforeEach(() => {
      resource = new Resource(sim, 1);
    });

    it('should grant immediate access when available', () => {
      function* processGen() {
        yield resource.request();
        expect(resource.inUse).toBe(1);
        expect(resource.available).toBe(0);
        resource.release();
      }

      const process = new Process(sim, processGen);
      process.start();
      sim.run();

      expect(resource.inUse).toBe(0);
      expect(resource.available).toBe(1);
    });

    it('should throw error when releasing unused resource', () => {
      expect(() => {
        resource.release();
      }).toThrow('no units currently in use');
    });

    it('should throw error when releasing more than in use', () => {
      function* processGen() {
        yield resource.request();
        resource.release();
        resource.release(); // Second release should throw
      }

      const process = new Process(sim, processGen);

      // With synchronous execution, error happens during start()
      expect(() => {
        process.start();
      }).toThrow('no units currently in use');
    });
  });

  describe('capacity management', () => {
    it('should handle single capacity resource', () => {
      resource = new Resource(sim, 1);
      const events: string[] = [];

      function* processGen() {
        events.push('before-request');
        yield resource.request();
        events.push('acquired');
        expect(resource.available).toBe(0);
        resource.release();
        events.push('released');
        expect(resource.available).toBe(1);
      }

      const process = new Process(sim, processGen);
      process.start();
      sim.run();

      expect(events).toEqual(['before-request', 'acquired', 'released']);
    });

    it('should handle multiple capacity resource', () => {
      resource = new Resource(sim, 3);

      function* processGen() {
        yield resource.request();
        expect(resource.available).toBe(2);
        expect(resource.inUse).toBe(1);

        yield resource.request();
        expect(resource.available).toBe(1);
        expect(resource.inUse).toBe(2);

        yield resource.request();
        expect(resource.available).toBe(0);
        expect(resource.inUse).toBe(3);

        resource.release();
        resource.release();
        resource.release();
      }

      const process = new Process(sim, processGen);
      process.start();
      sim.run();
    });

    it('should correctly track utilization', () => {
      resource = new Resource(sim, 4);

      function* processGen() {
        expect(resource.utilization).toBe(0);

        yield resource.request();
        expect(resource.utilization).toBe(0.25);

        yield resource.request();
        expect(resource.utilization).toBe(0.5);

        yield resource.request();
        yield resource.request();
        expect(resource.utilization).toBe(1);

        resource.release();
        expect(resource.utilization).toBe(0.75);

        resource.release();
        resource.release();
        resource.release();
      }

      const process = new Process(sim, processGen);
      process.start();
      sim.run();
    });
  });

  describe('queuing behavior', () => {
    beforeEach(() => {
      resource = new Resource(sim, 1);
    });

    it('should queue requests when capacity exceeded', () => {
      const events: string[] = [];

      function* process1() {
        events.push('p1-request');
        yield resource.request();
        events.push('p1-acquired');
        yield* timeout(10);
        resource.release();
        events.push('p1-released');
      }

      function* process2() {
        events.push('p2-request');
        yield resource.request();
        events.push('p2-acquired');
        resource.release();
        events.push('p2-released');
      }

      const p1 = new Process(sim, process1);
      const p2 = new Process(sim, process2);

      p1.start();
      p2.start();

      sim.run();

      // With asynchronous callbacks, when p1 releases, p1-released is logged
      // before p2-acquired (p2's callback is scheduled for later)
      expect(events).toEqual([
        'p1-request',
        'p1-acquired',
        'p2-request',
        'p1-released',
        'p2-acquired',
        'p2-released',
      ]);
    });

    it('should maintain FIFO order', () => {
      const order: number[] = [];

      function* createProcess(id: number) {
        yield resource.request();
        order.push(id);
        yield* timeout(5);
        resource.release();
      }

      const p1 = new Process(sim, () => createProcess(1));
      const p2 = new Process(sim, () => createProcess(2));
      const p3 = new Process(sim, () => createProcess(3));

      p1.start();
      p2.start();
      p3.start();

      sim.run();

      expect(order).toEqual([1, 2, 3]);
    });

    it('should handle multiple queued requests', () => {
      resource = new Resource(sim, 1);
      let completed = 0;

      function* processGen() {
        yield resource.request();
        completed++;
        resource.release();
      }

      // Create 5 processes
      for (let i = 0; i < 5; i++) {
        const p = new Process(sim, processGen);
        p.start();
      }

      sim.run();

      expect(completed).toBe(5);
    });
  });

  describe('statistics', () => {
    beforeEach(() => {
      resource = new Resource(sim, 2);
    });

    it('should track total requests', () => {
      function* processGen() {
        yield resource.request();
        yield resource.request();
        yield resource.request(); // This one queues
        resource.release();
        resource.release();
        resource.release();
      }

      const process = new Process(sim, processGen);
      process.start();
      sim.run();

      expect(resource.stats.totalRequests).toBe(3);
    });

    it('should track total releases', () => {
      function* processGen() {
        yield resource.request();
        yield resource.request();

        resource.release();
        resource.release();
      }

      const process = new Process(sim, processGen);
      process.start();
      sim.run();

      expect(resource.stats.totalReleases).toBe(2);
    });

    it('should calculate average wait time', () => {
      resource = new Resource(sim, 1);

      function* process1() {
        yield resource.request(); // No wait
        yield* timeout(10);
        resource.release();
      }

      function* process2() {
        yield resource.request(); // Waits 10 time units
        resource.release();
      }

      const p1 = new Process(sim, process1);
      const p2 = new Process(sim, process2);

      p1.start();
      p2.start();

      sim.run();

      const stats = resource.stats;
      // First request: 0 wait, second request: 10 wait
      // Average: (0 + 10) / 2 = 5
      expect(stats.averageWaitTime).toBeCloseTo(5, 1);
    });

    it('should calculate utilization rate over time', () => {
      resource = new Resource(sim, 2);

      function* processGen() {
        // Request at t=0
        yield resource.request();
        // Hold for 10 time units
        yield* timeout(10);
        // Release at t=10
        resource.release();
      }

      const process = new Process(sim, processGen);
      process.start();

      sim.run(20);

      const stats = resource.stats;
      // Utilization is 0.5 (1 out of 2) for 10 time units, then 0 for 10 time units
      // Average: (0.5 * 10 + 0 * 10) / 20 = 0.25
      expect(stats.utilizationRate).toBeCloseTo(0.25, 2);
    });

    it('should calculate average queue length', () => {
      resource = new Resource(sim, 1);

      function* process1() {
        yield resource.request();
        yield* timeout(20);
        resource.release();
      }

      function* process2() {
        yield resource.request();
        resource.release();
      }

      function* process3() {
        yield resource.request();
        resource.release();
      }

      const p1 = new Process(sim, process1);
      const p2 = new Process(sim, process2);
      const p3 = new Process(sim, process3);

      p1.start();
      p2.start();
      p3.start();

      sim.run();

      const stats = resource.stats;
      // Queue length: 2 for some time, then 1, then 0
      // Exact calculation depends on event scheduling
      expect(stats.averageQueueLength).toBeGreaterThan(0);
    });
  });

  describe('integration with simulation', () => {
    it('should work with simulation scheduling', () => {
      resource = new Resource(sim, 1);
      const events: string[] = [];

      function* process1() {
        events.push('p1-request');
        yield resource.request();
        events.push('p1-acquired');

        yield* timeout(5);
        events.push('p1-release');
        resource.release();
      }

      function* process2() {
        events.push('p2-request');
        yield resource.request();
        events.push('p2-acquired');

        yield* timeout(3);
        events.push('p2-release');
        resource.release();
      }

      const p1 = new Process(sim, process1);
      const p2 = new Process(sim, process2);

      p1.start();
      sim.schedule(2, () => p2.start());

      sim.run();

      expect(events).toEqual([
        'p1-request',
        'p1-acquired',
        'p2-request',
        'p1-release',
        'p2-acquired',
        'p2-release',
      ]);
    });

    it('should handle concurrent processes', () => {
      resource = new Resource(sim, 2);
      let completed = 0;

      function* createProcess(duration: number) {
        yield resource.request();
        yield* timeout(duration);
        resource.release();
        completed++;
      }

      for (let i = 0; i < 5; i++) {
        const p = new Process(sim, () => createProcess(5 + i));
        p.start();
      }

      sim.run();

      expect(completed).toBe(5);
      expect(resource.stats.totalRequests).toBe(5);
      expect(resource.stats.totalReleases).toBe(5);
    });
  });
});
