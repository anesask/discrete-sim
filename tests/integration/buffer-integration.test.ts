import { describe, it, expect, beforeEach } from 'vitest';
import { Simulation } from '../../src/core/Simulation.js';
import { Process, timeout } from '../../src/core/Process.js';
import { Buffer } from '../../src/resources/Buffer.js';
import { Resource } from '../../src/resources/Resource.js';

describe('Buffer Integration Tests', () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  describe('Producer-Consumer Pattern', () => {
    it('should handle single producer and single consumer', () => {
      const buffer = new Buffer(sim, 100, { name: 'Shared Buffer' });
      let producedCount = 0;
      let consumedCount = 0;

      function* producer() {
        for (let i = 0; i < 5; i++) {
          yield* timeout(2);
          yield buffer.put(10);
          producedCount++;
        }
      }

      function* consumer() {
        for (let i = 0; i < 5; i++) {
          yield* timeout(3);
          yield buffer.get(10);
          consumedCount++;
        }
      }

      new Process(sim, producer).start();
      new Process(sim, consumer).start();

      sim.run(20);

      expect(producedCount).toBe(5);
      expect(consumedCount).toBe(5);
      expect(buffer.level).toBe(0); // All produced was consumed
      expect(buffer.stats.totalAmountPut).toBe(50);
      expect(buffer.stats.totalAmountGot).toBe(50);
    });

    it('should handle multiple producers and consumers', () => {
      const buffer = new Buffer(sim, 200, { initialLevel: 50 });
      const produced: number[] = [];
      const consumed: number[] = [];

      function* producer(id: number, count: number) {
        for (let i = 0; i < count; i++) {
          yield* timeout(1);
          yield buffer.put(5);
          produced.push(id);
        }
      }

      function* consumer(id: number, count: number) {
        for (let i = 0; i < count; i++) {
          yield* timeout(1.5);
          yield buffer.get(5);
          consumed.push(id);
        }
      }

      // 3 producers, 2 consumers
      new Process(sim, () => producer(1, 5)).start();
      new Process(sim, () => producer(2, 5)).start();
      new Process(sim, () => producer(3, 5)).start();
      new Process(sim, () => consumer(1, 10)).start();
      new Process(sim, () => consumer(2, 5)).start();

      sim.run(20);

      expect(produced.length).toBe(15); // 3 producers × 5
      expect(consumed.length).toBe(15); // 15 consumed total
      expect(buffer.level).toBe(50); // Back to initial level
    });
  });

  describe('Buffer + Resource Integration', () => {
    it('should coordinate buffer access with resource usage', () => {
      const fuelTank = new Buffer(sim, 1000, { initialLevel: 500 });
      const fuelPump = new Resource(sim, 2, { name: 'Fuel Pump' });
      const events: string[] = [];

      function* truck(id: number, fuelNeeded: number) {
        events.push(`Truck ${id} arrives`);

        // Wait for pump availability
        yield fuelPump.request();
        events.push(`Truck ${id} at pump`);

        // Get fuel from tank
        yield fuelTank.get(fuelNeeded);
        events.push(`Truck ${id} fueling`);

        // Refuel time
        yield* timeout(5);
        events.push(`Truck ${id} done`);

        // Release pump
        fuelPump.release();
      }

      // 4 trucks arrive simultaneously
      new Process(sim, () => truck(1, 50)).start();
      new Process(sim, () => truck(2, 100)).start();
      new Process(sim, () => truck(3, 75)).start();
      new Process(sim, () => truck(4, 80)).start();

      sim.run(20);

      // All trucks should be served
      const doneEvents = events.filter((e) => e.includes('done'));
      expect(doneEvents.length).toBe(4);

      // Total fuel dispensed
      expect(fuelTank.stats.totalAmountGot).toBe(305); // 50+100+75+80
      expect(fuelTank.level).toBe(195); // 500 - 305

      // Pump stats
      const pumpStats = fuelPump.stats;
      expect(pumpStats.totalRequests).toBe(4);
      expect(pumpStats.totalReleases).toBe(4);
    });

    it('should handle resource preemption with buffer operations', () => {
      const buffer = new Buffer(sim, 100, { initialLevel: 50 });
      const resource = new Resource(sim, 1, {
        name: 'Worker',
        preemptive: true,
      });
      const completed: number[] = [];

      function* lowPriorityTask(id: number) {
        try {
          yield resource.request(10); // Low priority
          yield buffer.get(20);
          yield* timeout(10);
          resource.release();
          completed.push(id);
        } catch {
          // Preempted - don't add to completed
        }
      }

      function* highPriorityTask(id: number) {
        yield resource.request(0); // High priority
        yield buffer.get(10);
        yield* timeout(5);
        resource.release();
        completed.push(id);
      }

      // Start low priority task
      new Process(sim, () => lowPriorityTask(1)).start();

      // High priority arrives and preempts
      sim.schedule(2, () => {
        new Process(sim, () => highPriorityTask(2)).start();
      });

      sim.run(20);

      // High priority should complete first
      expect(completed[0]).toBe(2);
    });
  });

  describe('Complex Workflow Integration', () => {
    it('should simulate assembly line with buffer stages', () => {
      const rawMaterials = new Buffer(sim, 500, { initialLevel: 200 });
      const workInProgress = new Buffer(sim, 300, { initialLevel: 0 });
      const finished = new Buffer(sim, 200, { initialLevel: 0 });

      function* stage1Worker() {
        // Extract from raw materials, put in WIP
        for (let i = 0; i < 10; i++) {
          yield rawMaterials.get(10);
          yield* timeout(2); // Processing time
          yield workInProgress.put(10);
        }
      }

      function* stage2Worker() {
        // Extract from WIP, put in finished
        for (let i = 0; i < 10; i++) {
          yield workInProgress.get(10);
          yield* timeout(3); // Processing time
          yield finished.put(10);
        }
      }

      new Process(sim, stage1Worker).start();
      new Process(sim, stage2Worker).start();

      sim.run(50);

      // Stage 1 should complete
      expect(rawMaterials.level).toBe(100); // 200 - 100
      expect(workInProgress.level).toBe(0); // Drained by stage 2
      expect(finished.level).toBe(100); // All processed
    });

    it('should handle deadlock prevention with timeouts', () => {
      const buffer1 = new Buffer(sim, 50, { initialLevel: 25 });
      const buffer2 = new Buffer(sim, 50, { initialLevel: 25 });
      let process1Completed = false;
      let process2Completed = false;

      function* process1() {
        yield buffer1.get(10);
        yield* timeout(1);
        yield buffer2.get(10);
        yield* timeout(1);
        yield buffer1.put(10);
        yield buffer2.put(10);
        process1Completed = true;
      }

      function* process2() {
        yield buffer2.get(10);
        yield* timeout(1);
        yield buffer1.get(10);
        yield* timeout(1);
        yield buffer2.put(10);
        yield buffer1.put(10);
        process2Completed = true;
      }

      new Process(sim, process1).start();
      new Process(sim, process2).start();

      sim.run(10);

      // Both processes should complete (no deadlock)
      expect(process1Completed).toBe(true);
      expect(process2Completed).toBe(true);
      expect(buffer1.level).toBe(25); // Back to initial
      expect(buffer2.level).toBe(25); // Back to initial
    });
  });

  describe('Buffer Statistics Integration', () => {
    it('should track comprehensive statistics across simulation', () => {
      const tank = new Buffer(sim, 1000, { initialLevel: 500 });
      const deliveryTimes: number[] = [];
      const withdrawalTimes: number[] = [];

      function* supplier() {
        for (let i = 0; i < 3; i++) {
          yield* timeout(10);
          const startTime = sim.now;
          yield tank.put(200);
          deliveryTimes.push(sim.now - startTime);
        }
      }

      function* consumer() {
        for (let i = 0; i < 6; i++) {
          yield* timeout(5);
          const startTime = sim.now;
          yield tank.get(100);
          withdrawalTimes.push(sim.now - startTime);
        }
      }

      new Process(sim, supplier).start();
      new Process(sim, consumer).start();

      sim.run(50);

      const stats = tank.stats;

      // Verify operations
      expect(stats.totalPuts).toBe(3);
      expect(stats.totalGets).toBe(6);
      expect(stats.totalAmountPut).toBe(600);
      expect(stats.totalAmountGot).toBe(600);

      // Verify average level is meaningful
      expect(stats.averageLevel).toBeGreaterThan(0);
      expect(stats.averageLevel).toBeLessThanOrEqual(tank.capacity);

      // Verify wait times are tracked
      expect(stats.averageGetWaitTime).toBeGreaterThanOrEqual(0);
      expect(stats.averagePutWaitTime).toBeGreaterThanOrEqual(0);

      // Final level should be initial (net zero flow)
      expect(tank.level).toBe(500);
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle simultaneous put and get at capacity boundaries', () => {
      const buffer = new Buffer(sim, 100, { initialLevel: 0 });

      function* producer() {
        yield buffer.put(100); // Fill to capacity
      }

      function* consumer() {
        yield* timeout(0.1);
        yield buffer.get(100); // Drain completely
      }

      new Process(sim, producer).start();
      new Process(sim, consumer).start();

      sim.run(5);

      expect(buffer.level).toBe(0);
      expect(buffer.stats.totalPuts).toBe(1);
      expect(buffer.stats.totalGets).toBe(1);
    });

    it('should handle rapid alternating put/get operations', () => {
      const buffer = new Buffer(sim, 100, { initialLevel: 50 });

      function* oscillator() {
        for (let i = 0; i < 20; i++) {
          if (i % 2 === 0) {
            yield buffer.put(10);
          } else {
            yield buffer.get(10);
          }
          yield* timeout(0.1);
        }
      }

      new Process(sim, oscillator).start();

      sim.run(5);

      expect(buffer.level).toBe(50); // Same as initial
      expect(buffer.stats.totalPuts).toBe(10);
      expect(buffer.stats.totalGets).toBe(10);
    });

    it('should maintain consistency under heavy concurrent load', () => {
      const buffer = new Buffer(sim, 1000, { initialLevel: 500 });
      let totalProduced = 0;
      let totalConsumed = 0;

      function* producer() {
        for (let i = 0; i < 50; i++) {
          yield buffer.put(5);
          totalProduced += 5;
          yield* timeout(0.2);
        }
      }

      function* consumer() {
        for (let i = 0; i < 50; i++) {
          yield buffer.get(5);
          totalConsumed += 5;
          yield* timeout(0.2);
        }
      }

      // 10 producers, 10 consumers
      for (let i = 0; i < 10; i++) {
        new Process(sim, producer).start();
        new Process(sim, consumer).start();
      }

      sim.run(20);

      // Verify consistency
      expect(totalProduced).toBe(buffer.stats.totalAmountPut);
      expect(totalConsumed).toBe(buffer.stats.totalAmountGot);
      expect(buffer.level).toBe(
        500 + totalProduced - totalConsumed
      );
    });
  });
});
