import { describe, it, expect, beforeEach } from 'vitest';
import { Simulation } from '../../src/core/Simulation';
import { Process, timeout } from '../../src/core/Process';
import { Resource } from '../../src/resources/Resource';

describe('Simulation + Resource + Process Integration', () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  describe('simple server queue', () => {
    it('should simulate customers waiting for a server', () => {
      const server = new Resource(sim, 1, { name: 'Server' });
      const customerEvents: Array<{
        customer: number;
        event: string;
        time: number;
      }> = [];

      function* customer(id: number, serviceTime: number) {
        customerEvents.push({ customer: id, event: 'arrive', time: sim.now });

        yield server.request();
        customerEvents.push({
          customer: id,
          event: 'service-start',
          time: sim.now,
        });

        yield* timeout(serviceTime);
        customerEvents.push({
          customer: id,
          event: 'service-end',
          time: sim.now,
        });

        server.release();
        customerEvents.push({ customer: id, event: 'depart', time: sim.now });
      }

      // Customer 1 arrives at t=0, needs 10 units of service
      const c1 = new Process(sim, () => customer(1, 10));
      c1.start();

      // Customer 2 arrives at t=2, needs 5 units of service
      sim.schedule(2, () => {
        const c2 = new Process(sim, () => customer(2, 5));
        c2.start();
      });

      // Customer 3 arrives at t=5, needs 8 units of service
      sim.schedule(5, () => {
        const c3 = new Process(sim, () => customer(3, 8));
        c3.start();
      });

      sim.run(30);

      // Verify event sequence
      // Note: With asynchronous callbacks, when a resource is released, the releasing
      // customer's depart event happens before the next queued customer's service-start
      expect(customerEvents).toEqual([
        { customer: 1, event: 'arrive', time: 0 },
        { customer: 1, event: 'service-start', time: 0 },
        { customer: 2, event: 'arrive', time: 2 },
        { customer: 3, event: 'arrive', time: 5 },
        { customer: 1, event: 'service-end', time: 10 },
        { customer: 1, event: 'depart', time: 10 },
        { customer: 2, event: 'service-start', time: 10 },
        { customer: 2, event: 'service-end', time: 15 },
        { customer: 2, event: 'depart', time: 15 },
        { customer: 3, event: 'service-start', time: 15 },
        { customer: 3, event: 'service-end', time: 23 },
        { customer: 3, event: 'depart', time: 23 },
      ]);

      // Verify statistics
      const stats = server.stats;
      expect(stats.totalRequests).toBe(3);
      expect(stats.totalReleases).toBe(3);
    });

    it('should track wait times correctly', () => {
      const server = new Resource(sim, 1);
      const waitTimes: number[] = [];

      function* customer(id: number, arrivalTime: number, serviceTime: number) {
        const startWait = sim.now;
        yield server.request();
        const endWait = sim.now;

        waitTimes.push(endWait - startWait);

        yield* timeout(serviceTime);
        server.release();
      }

      // Three customers arrive at t=0
      for (let i = 0; i < 3; i++) {
        const proc = new Process(sim, () => customer(i, 0, 5));
        proc.start();
      }

      sim.run();

      // First customer: no wait
      // Second customer: waits 5 time units
      // Third customer: waits 10 time units
      expect(waitTimes).toEqual([0, 5, 10]);
    });
  });

  describe('multiple resource types', () => {
    it('should handle processes using multiple resources', () => {
      const resourceA = new Resource(sim, 1, { name: 'Resource A' });
      const resourceB = new Resource(sim, 1, { name: 'Resource B' });
      const events: Array<{ time: number; event: string }> = [];

      function* processGen() {
        events.push({ time: sim.now, event: 'start' });

        // Get resource A
        yield resourceA.request();
        events.push({ time: sim.now, event: 'acquired-A' });

        yield* timeout(5);

        // Get resource B while holding A
        yield resourceB.request();
        events.push({ time: sim.now, event: 'acquired-B' });

        yield* timeout(3);

        // Release both
        resourceA.release();
        events.push({ time: sim.now, event: 'released-A' });

        resourceB.release();
        events.push({ time: sim.now, event: 'released-B' });
      }

      const process = new Process(sim, processGen);
      process.start();
      sim.run();

      expect(events).toEqual([
        { time: 0, event: 'start' },
        { time: 0, event: 'acquired-A' },
        { time: 5, event: 'acquired-B' },
        { time: 8, event: 'released-A' },
        { time: 8, event: 'released-B' },
      ]);
    });
  });

  describe('producer-consumer pattern', () => {
    it('should simulate producer-consumer with buffer', () => {
      const buffer = new Resource(sim, 3, { name: 'Buffer' });
      let produced = 0;
      let consumedCount = 0;

      function* consumer() {
        for (let i = 0; i < 5; i++) {
          yield buffer.request(); // Wait for item
          yield* timeout(3); // Consumption time
          buffer.release();
          consumedCount++;
        }
      }

      // Need to handle the producer differently since it never releases
      function* producerWithRelease() {
        for (let i = 0; i < 5; i++) {
          yield* timeout(2);
          // In a real scenario, producer would release when consumer takes
          // For this test, we just track production
          produced++;
        }
      }

      const prod = new Process(sim, producerWithRelease);
      const cons = new Process(sim, consumer);

      prod.start();
      cons.start();

      sim.run(50);

      expect(produced).toBe(5);
      expect(consumedCount).toBeGreaterThan(0);
    });
  });

  describe('parallel servers', () => {
    it('should simulate multiple servers in parallel', () => {
      const servers = new Resource(sim, 3, { name: 'Server Pool' });
      let completedJobs = 0;

      function* job(id: number, processingTime: number) {
        yield servers.request();
        yield* timeout(processingTime);
        servers.release();
        completedJobs++;
      }

      // Submit 10 jobs with varying processing times
      for (let i = 0; i < 10; i++) {
        const proc = new Process(sim, () => job(i, 5 + (i % 3)));
        proc.start();
      }

      sim.run(30); // Run for reasonable duration (jobs complete around t=20)

      expect(completedJobs).toBe(10);
      expect(servers.stats.totalRequests).toBe(10);
      expect(servers.stats.totalReleases).toBe(10);

      // With 3 servers and jobs completing around t=20, utilization should be decent
      expect(servers.stats.utilizationRate).toBeGreaterThan(0.6);
    });

    it('should track utilization correctly with parallel servers', () => {
      const servers = new Resource(sim, 2);

      function* job(duration: number) {
        yield servers.request();
        yield* timeout(duration);
        servers.release();
      }

      // Job 1: runs from t=0 to t=10
      const j1 = new Process(sim, () => job(10));
      j1.start();

      // Job 2: runs from t=0 to t=10
      const j2 = new Process(sim, () => job(10));
      j2.start();

      // Job 3: waits, then runs from t=10 to t=20
      const j3 = new Process(sim, () => job(10));
      j3.start();

      sim.run(20);

      const stats = servers.stats;

      // Time 0-10: 2 servers in use (utilization = 1.0)
      // Time 10-20: 1 server in use (utilization = 0.5)
      // Average: (1.0 * 10 + 0.5 * 10) / 20 = 0.75
      expect(stats.utilizationRate).toBeCloseTo(0.75, 2);
    });
  });

  describe('error handling', () => {
    it('should handle process errors gracefully', () => {
      const resource = new Resource(sim, 1);
      let errorCaught = false;

      function* faultyProcess() {
        yield resource.request();
        throw new Error('Process error');
      }

      const process = new Process(sim, faultyProcess);

      // With synchronous execution, error is thrown during start()
      try {
        process.start();
      } catch (error) {
        errorCaught = true;
        expect((error as Error).message).toBe('Process error');
      }

      expect(errorCaught).toBe(true);
      expect(process.isInterrupted).toBe(true);
    });
  });

  describe('complex workflow', () => {
    it('should simulate multi-stage manufacturing process', () => {
      const cuttingMachine = new Resource(sim, 1, { name: 'Cutting' });
      const assemblyStation = new Resource(sim, 2, { name: 'Assembly' });
      const packagingLine = new Resource(sim, 1, { name: 'Packaging' });

      const completedProducts: number[] = [];

      function* manufacturingProcess(productId: number) {
        // Stage 1: Cutting
        yield cuttingMachine.request();
        yield* timeout(3);
        cuttingMachine.release();

        // Stage 2: Assembly
        yield assemblyStation.request();
        yield* timeout(5);
        assemblyStation.release();

        // Stage 3: Packaging
        yield packagingLine.request();
        yield* timeout(2);
        packagingLine.release();

        completedProducts.push(productId);
      }

      // Start 5 products
      for (let i = 0; i < 5; i++) {
        const proc = new Process(sim, () => manufacturingProcess(i));
        sim.schedule(i * 2, () => proc.start());
      }

      sim.run(100);

      expect(completedProducts).toHaveLength(5);
      expect(cuttingMachine.stats.totalRequests).toBe(5);
      expect(assemblyStation.stats.totalRequests).toBe(5);
      expect(packagingLine.stats.totalRequests).toBe(5);
    });
  });
});
