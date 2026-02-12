import { describe, it, expect } from 'vitest';
import {
  Simulation,
  Buffer,
  Process,
  ProcessGenerator,
  timeout,
  ValidationError,
} from '../../src/index.js';

describe('Buffer', () => {
  describe('Construction', () => {
    it('should create buffer with valid capacity', () => {
      const sim = new Simulation();
      const buffer = new Buffer(sim, 100);

      expect(buffer.capacity).toBe(100);
      expect(buffer.level).toBe(0);
      expect(buffer.available).toBe(100);
      expect(buffer.name).toBe('Buffer');
    });

    it('should create buffer with initial level', () => {
      const sim = new Simulation();
      const buffer = new Buffer(sim, 100, { initialLevel: 50 });

      expect(buffer.level).toBe(50);
      expect(buffer.available).toBe(50);
    });

    it('should create buffer with custom name', () => {
      const sim = new Simulation();
      const buffer = new Buffer(sim, 100, { name: 'Fuel Tank' });

      expect(buffer.name).toBe('Fuel Tank');
    });

    it('should reject zero capacity', () => {
      const sim = new Simulation();
      expect(() => new Buffer(sim, 0)).toThrow(ValidationError);
    });

    it('should reject negative capacity', () => {
      const sim = new Simulation();
      expect(() => new Buffer(sim, -10)).toThrow(ValidationError);
    });

    it('should reject NaN capacity', () => {
      const sim = new Simulation();
      expect(() => new Buffer(sim, NaN)).toThrow(ValidationError);
    });

    it('should reject negative initial level', () => {
      const sim = new Simulation();
      expect(() => new Buffer(sim, 100, { initialLevel: -10 })).toThrow(
        ValidationError
      );
    });

    it('should reject initial level > capacity', () => {
      const sim = new Simulation();
      expect(() => new Buffer(sim, 100, { initialLevel: 150 })).toThrow(
        ValidationError
      );
    });

    it('should reject empty name', () => {
      const sim = new Simulation();
      expect(() => new Buffer(sim, 100, { name: '' })).toThrow(
        ValidationError
      );
    });
  });

  describe('Basic Put Operations', () => {
    it('should put tokens when space available', () => {
      const sim = new Simulation();
      const buffer = new Buffer(sim, 100);
      let putCompleted = false;

      function* producer(): ProcessGenerator {
        yield buffer.put(50);
        putCompleted = true;
      }

      const p = new Process(sim, producer);
      p.start();

      expect(buffer.level).toBe(50);
      expect(buffer.available).toBe(50);
      expect(putCompleted).toBe(true);
    });

    it('should put multiple times', () => {
      const sim = new Simulation();
      const buffer = new Buffer(sim, 100);

      function* producer(): ProcessGenerator {
        yield buffer.put(30);
        yield buffer.put(20);
        yield buffer.put(10);
      }

      const p = new Process(sim, producer);
      p.start();

      expect(buffer.level).toBe(60);
      expect(buffer.available).toBe(40);
    });

    it('should block when buffer is full', () => {
      const sim = new Simulation();
      const buffer = new Buffer(sim, 100, { initialLevel: 100 });
      let putCompleted = false;

      function* producer(): ProcessGenerator {
        yield buffer.put(10);
        putCompleted = true;
      }

      const p = new Process(sim, producer);
      p.start();

      // Should be blocked
      expect(putCompleted).toBe(false);
      expect(buffer.putQueueLength).toBe(1);
      expect(buffer.level).toBe(100);
    });

    it('should reject put amount > capacity', () => {
      const sim = new Simulation();
      const buffer = new Buffer(sim, 100);

      function* producer(): ProcessGenerator {
        yield buffer.put(150);
      }

      const p = new Process(sim, producer);
      expect(() => p.start()).toThrow(ValidationError);
    });

    it('should reject zero put amount', () => {
      const sim = new Simulation();
      const buffer = new Buffer(sim, 100);

      expect(() => buffer.put(0)).toThrow(ValidationError);
    });

    it('should reject negative put amount', () => {
      const sim = new Simulation();
      const buffer = new Buffer(sim, 100);

      expect(() => buffer.put(-10)).toThrow(ValidationError);
    });
  });

  describe('Basic Get Operations', () => {
    it('should get tokens when available', () => {
      const sim = new Simulation();
      const buffer = new Buffer(sim, 100, { initialLevel: 50 });
      let getCompleted = false;

      function* consumer(): ProcessGenerator {
        yield buffer.get(30);
        getCompleted = true;
      }

      const p = new Process(sim, consumer);
      p.start();

      expect(buffer.level).toBe(20);
      expect(buffer.available).toBe(80);
      expect(getCompleted).toBe(true);
    });

    it('should get multiple times', () => {
      const sim = new Simulation();
      const buffer = new Buffer(sim, 100, { initialLevel: 100 });

      function* consumer(): ProcessGenerator {
        yield buffer.get(20);
        yield buffer.get(15);
        yield buffer.get(10);
      }

      const p = new Process(sim, consumer);
      p.start();

      expect(buffer.level).toBe(55);
      expect(buffer.available).toBe(45);
    });

    it('should block when buffer is empty', () => {
      const sim = new Simulation();
      const buffer = new Buffer(sim, 100); // Empty
      let getCompleted = false;

      function* consumer(): ProcessGenerator {
        yield buffer.get(10);
        getCompleted = true;
      }

      const p = new Process(sim, consumer);
      p.start();

      // Should be blocked
      expect(getCompleted).toBe(false);
      expect(buffer.getQueueLength).toBe(1);
      expect(buffer.level).toBe(0);
    });

    it('should block when insufficient tokens', () => {
      const sim = new Simulation();
      const buffer = new Buffer(sim, 100, { initialLevel: 5 });
      let getCompleted = false;

      function* consumer(): ProcessGenerator {
        yield buffer.get(10);
        getCompleted = true;
      }

      const p = new Process(sim, consumer);
      p.start();

      // Should be blocked (needs 10, only has 5)
      expect(getCompleted).toBe(false);
      expect(buffer.getQueueLength).toBe(1);
      expect(buffer.level).toBe(5);
    });

    it('should reject zero get amount', () => {
      const sim = new Simulation();
      const buffer = new Buffer(sim, 100);

      expect(() => buffer.get(0)).toThrow(ValidationError);
    });

    it('should reject negative get amount', () => {
      const sim = new Simulation();
      const buffer = new Buffer(sim, 100);

      expect(() => buffer.get(-10)).toThrow(ValidationError);
    });
  });

  describe('Queue Management', () => {
    it('should fulfill put request when space becomes available', () => {
      const sim = new Simulation();
      const buffer = new Buffer(sim, 100, { initialLevel: 90 });
      let producerCompleted = false;

      function* producer(): ProcessGenerator {
        yield buffer.put(20); // Will block (needs 20, only 10 available)
        producerCompleted = true;
      }

      function* consumer(): ProcessGenerator {
        yield* timeout(5);
        yield buffer.get(15); // Free up 15 units
      }

      new Process(sim, producer).start();
      new Process(sim, consumer).start();

      sim.run(10);

      // Producer should complete after consumer frees space
      expect(producerCompleted).toBe(true);
      expect(buffer.level).toBe(95); // 90 - 15 + 20
    });

    it('should fulfill get request when tokens become available', () => {
      const sim = new Simulation();
      const buffer = new Buffer(sim, 100, { initialLevel: 5 });
      let consumerCompleted = false;

      function* consumer(): ProcessGenerator {
        yield buffer.get(20); // Will block (needs 20, only 5 available)
        consumerCompleted = true;
      }

      function* producer(): ProcessGenerator {
        yield* timeout(5);
        yield buffer.put(30); // Add 30 units
      }

      new Process(sim, consumer).start();
      new Process(sim, producer).start();

      sim.run(10);

      // Consumer should complete after producer adds tokens
      expect(consumerCompleted).toBe(true);
      expect(buffer.level).toBe(15); // 5 + 30 - 20
    });

    it('should process queued requests in FIFO order', () => {
      const sim = new Simulation();
      const buffer = new Buffer(sim, 100); // Empty
      const completionOrder: number[] = [];

      function* consumer(id: number): Generator {
        yield buffer.get(10);
        completionOrder.push(id);
      }

      // Queue 3 consumers
      new Process(sim, () => consumer(1)).start();
      new Process(sim, () => consumer(2)).start();
      new Process(sim, () => consumer(3)).start();

      expect(buffer.getQueueLength).toBe(3);

      // Producer adds enough for all
      function* producer(): ProcessGenerator {
        yield* timeout(5);
        yield buffer.put(30);
      }

      new Process(sim, producer).start();
      sim.run(10);

      // Should complete in FIFO order
      expect(completionOrder).toEqual([1, 2, 3]);
      expect(buffer.level).toBe(0); // 30 - 30
    });

    it('should handle mixed put and get queues', () => {
      const sim = new Simulation();
      const buffer = new Buffer(sim, 50, { initialLevel: 25 });

      function* producer(): ProcessGenerator {
        yield buffer.put(40); // Will block (needs 40 space, only 25 available)
      }

      function* consumer(): ProcessGenerator {
        yield buffer.get(30); // Will block (needs 30, only 25 available)
      }

      new Process(sim, producer).start();
      expect(buffer.putQueueLength).toBe(1);

      new Process(sim, consumer).start();

      sim.run(1);

      // Both should be blocked - deadlock situation
      // Consumer needs 30 but only 25 available
      // Producer can't add 40 because only 25 space available
      expect(buffer.level).toBe(25); // No change
      expect(buffer.putQueueLength).toBe(1); // Producer still waiting
      expect(buffer.getQueueLength).toBe(1); // Consumer still waiting
    });
  });

  describe('Statistics', () => {
    it('should track total puts and gets', () => {
      const sim = new Simulation();
      const buffer = new Buffer(sim, 100, { initialLevel: 50 });

      function* process(): ProcessGenerator {
        yield buffer.put(20);
        yield buffer.get(30);
        yield buffer.put(10);
      }

      new Process(sim, process).start();

      const stats = buffer.stats;
      expect(stats.totalPuts).toBe(2);
      expect(stats.totalGets).toBe(1);
      expect(stats.totalAmountPut).toBe(30);
      expect(stats.totalAmountGot).toBe(30);
    });

    it('should track average level over time', () => {
      const sim = new Simulation();
      const buffer = new Buffer(sim, 100, { initialLevel: 50 });

      function* process(): ProcessGenerator {
        yield* timeout(10); // Level 50 for 10 time units
        yield buffer.put(30); // Level becomes 80
        yield* timeout(10); // Level 80 for 10 time units
      }

      new Process(sim, process).start();
      sim.run(20);

      const stats = buffer.stats;
      // Average: (50*10 + 80*10) / 20 = 65
      expect(stats.averageLevel).toBeCloseTo(65, 1);
    });

    it('should track put queue length over time', () => {
      const sim = new Simulation();
      const buffer = new Buffer(sim, 100, { initialLevel: 100 }); // Full

      function* producer(): ProcessGenerator {
        yield buffer.put(10); // Will queue
      }

      new Process(sim, producer).start();
      expect(buffer.putQueueLength).toBe(1);

      function* consumer(): ProcessGenerator {
        yield* timeout(10);
        yield buffer.get(20); // Free space at t=10
      }

      new Process(sim, consumer).start();
      sim.run(20);

      const stats = buffer.stats;
      // Queue length 1 for 10 time units, then 0
      expect(stats.averagePutQueueLength).toBeCloseTo(0.5, 1);
    });

    it('should track get queue length over time', () => {
      const sim = new Simulation();
      const buffer = new Buffer(sim, 100); // Empty

      function* consumer(): ProcessGenerator {
        yield buffer.get(10); // Will queue
      }

      new Process(sim, consumer).start();
      expect(buffer.getQueueLength).toBe(1);

      function* producer(): ProcessGenerator {
        yield* timeout(10);
        yield buffer.put(20); // Add tokens at t=10
      }

      new Process(sim, producer).start();
      sim.run(20);

      const stats = buffer.stats;
      // Queue length 1 for 10 time units, then 0
      expect(stats.averageGetQueueLength).toBeCloseTo(0.5, 1);
    });

    it('should track wait times', () => {
      const sim = new Simulation();
      const buffer = new Buffer(sim, 100); // Empty

      function* consumer(): ProcessGenerator {
        yield buffer.get(10); // Will wait
      }

      function* producer(): ProcessGenerator {
        yield* timeout(5);
        yield buffer.put(20); // Fulfill at t=5
      }

      new Process(sim, consumer).start();
      new Process(sim, producer).start();

      sim.run(10);

      const stats = buffer.stats;
      expect(stats.averageGetWaitTime).toBe(5);
    });
  });

  describe('Producer-Consumer Patterns', () => {
    it('should handle single producer, single consumer', () => {
      const sim = new Simulation();
      const buffer = new Buffer(sim, 50);
      let produced = 0;
      let consumed = 0;

      function* producer(): ProcessGenerator {
        for (let i = 0; i < 5; i++) {
          yield* timeout(2);
          yield buffer.put(10);
          produced += 10;
        }
      }

      function* consumer(): ProcessGenerator {
        for (let i = 0; i < 5; i++) {
          yield* timeout(3);
          yield buffer.get(10);
          consumed += 10;
        }
      }

      new Process(sim, producer).start();
      new Process(sim, consumer).start();

      sim.run(20);

      expect(produced).toBe(50);
      expect(consumed).toBe(50);
    });

    it('should handle multiple producers, single consumer', () => {
      const sim = new Simulation();
      const buffer = new Buffer(sim, 100);
      let consumed = 0;

      function* producer(amount: number): Generator {
        for (let i = 0; i < 3; i++) {
          yield* timeout(2);
          yield buffer.put(amount);
        }
      }

      function* consumer(): ProcessGenerator {
        for (let i = 0; i < 6; i++) {
          yield buffer.get(10);
          consumed += 10;
        }
      }

      new Process(sim, () => producer(10)).start();
      new Process(sim, () => producer(10)).start();
      new Process(sim, consumer).start();

      sim.run(20);

      expect(consumed).toBe(60);
      expect(buffer.stats.totalAmountPut).toBe(60);
    });

    it('should handle single producer, multiple consumers', () => {
      const sim = new Simulation();
      const buffer = new Buffer(sim, 100);
      let consumed = 0;

      function* producer(): ProcessGenerator {
        for (let i = 0; i < 6; i++) {
          yield* timeout(2);
          yield buffer.put(10);
        }
      }

      function* consumer(): ProcessGenerator {
        for (let i = 0; i < 3; i++) {
          yield buffer.get(10);
          consumed += 10;
        }
      }

      new Process(sim, producer).start();
      new Process(sim, consumer).start();
      new Process(sim, consumer).start();

      sim.run(20);

      expect(consumed).toBe(60);
      expect(buffer.stats.totalAmountGot).toBe(60);
    });
  });

  describe('Edge Cases', () => {
    it('should handle buffer at full capacity', () => {
      const sim = new Simulation();
      const buffer = new Buffer(sim, 100, { initialLevel: 100 });

      expect(buffer.level).toBe(100);
      expect(buffer.available).toBe(0);

      function* producer(): ProcessGenerator {
        yield buffer.put(10);
      }

      new Process(sim, producer).start();
      expect(buffer.putQueueLength).toBe(1);
    });

    it('should handle buffer at zero level', () => {
      const sim = new Simulation();
      const buffer = new Buffer(sim, 100); // Empty

      expect(buffer.level).toBe(0);
      expect(buffer.available).toBe(100);

      function* consumer(): ProcessGenerator {
        yield buffer.get(10);
      }

      new Process(sim, consumer).start();
      expect(buffer.getQueueLength).toBe(1);
    });

    it('should handle exact capacity put', () => {
      const sim = new Simulation();
      const buffer = new Buffer(sim, 100);

      function* producer(): ProcessGenerator {
        yield buffer.put(100);
      }

      new Process(sim, producer).start();

      expect(buffer.level).toBe(100);
      expect(buffer.available).toBe(0);
    });

    it('should handle exact level get', () => {
      const sim = new Simulation();
      const buffer = new Buffer(sim, 100, { initialLevel: 100 });

      function* consumer(): ProcessGenerator {
        yield buffer.get(100);
      }

      new Process(sim, consumer).start();

      expect(buffer.level).toBe(0);
      expect(buffer.available).toBe(100);
    });

    it('should handle rapid put/get alternation', () => {
      const sim = new Simulation();
      const buffer = new Buffer(sim, 100, { initialLevel: 50 });

      function* process(): ProcessGenerator {
        yield buffer.get(10);
        yield buffer.put(15);
        yield buffer.get(20);
        yield buffer.put(25);
        yield buffer.get(5);
      }

      new Process(sim, process).start();

      // 50 - 10 + 15 - 20 + 25 - 5 = 55
      expect(buffer.level).toBe(55);
    });

    it('should handle large number of operations', () => {
      const sim = new Simulation();
      const buffer = new Buffer(sim, 1000, { initialLevel: 500 });

      function* process(): ProcessGenerator {
        for (let i = 0; i < 100; i++) {
          if (i % 2 === 0) {
            yield buffer.put(5);
          } else {
            yield buffer.get(5);
          }
        }
      }

      new Process(sim, process).start();

      expect(buffer.stats.totalPuts).toBe(50);
      expect(buffer.stats.totalGets).toBe(50);
      expect(buffer.level).toBe(500); // Same as start
    });
  });
});
