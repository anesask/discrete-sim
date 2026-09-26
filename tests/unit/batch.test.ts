import { describe, it, expect, beforeEach } from 'vitest';
import {
  Simulation,
  Batch,
  timeout,
  anyOf,
  ValidationError,
} from '../../src/index.js';

interface Part {
  id: number;
}

describe('Batch', () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  describe('forming batches', () => {
    it('releases a full batch to a waiting taker', () => {
      const batch = new Batch<Part>(sim, 3);
      const taken: Array<{ time: number; ids: number[]; partial: boolean }> =
        [];

      sim.process(function* () {
        const req = batch.take();
        yield req;
        taken.push({
          time: sim.now,
          ids: req.items!.map((p) => p.id),
          partial: req.isPartial!,
        });
      });

      sim.process(function* () {
        for (let i = 0; i < 3; i++) {
          yield* timeout(2);
          yield batch.put({ id: i });
        }
      });

      sim.run();
      expect(taken).toEqual([{ time: 6, ids: [0, 1, 2], partial: false }]);
      expect(batch.size).toBe(0);
      expect(batch.stats.totalBatches).toBe(1);
      expect(batch.stats.partialBatches).toBe(0);
      expect(batch.stats.averageBatchSize).toBe(3);
      // items waited 4, 2, 0
      expect(batch.stats.averageItemWaitTime).toBeCloseTo(2, 10);
    });

    it('hands an already formed batch to a later taker immediately', () => {
      const batch = new Batch<Part>(sim, 2);
      let takenAt = -1;
      sim.process(function* () {
        yield batch.put({ id: 1 });
        yield batch.put({ id: 2 });
      });
      sim.process(function* () {
        yield* timeout(10);
        const req = batch.take();
        yield req;
        takenAt = sim.now;
        expect(req.items).toHaveLength(2);
      });
      sim.run();
      expect(takenAt).toBe(10);
      expect(batch.stats.averageTakeWaitTime).toBe(0);
    });

    it('releases a partial batch after maxWait since the first item', () => {
      const batch = new Batch<Part>(sim, 10, { maxWait: 15 });
      const taken: Array<{ time: number; count: number; partial: boolean }> =
        [];

      sim.process(function* () {
        for (let k = 0; k < 2; k++) {
          const req = batch.take();
          yield req;
          taken.push({
            time: sim.now,
            count: req.items!.length,
            partial: req.isPartial!,
          });
        }
      });

      sim.process(function* () {
        yield* timeout(5); // first item at t=5 -> partial release at t=20
        yield batch.put({ id: 1 });
        yield* timeout(3);
        yield batch.put({ id: 2 });
        yield* timeout(30); // t=38: a new round starts, released at t=53
        yield batch.put({ id: 3 });
      });

      sim.run();
      expect(taken).toEqual([
        { time: 20, count: 2, partial: true },
        { time: 53, count: 1, partial: true },
      ]);
      expect(batch.stats.partialBatches).toBe(2);
    });

    it('does not release an empty batch and cancels the timer when a batch fills first', () => {
      const batch = new Batch<Part>(sim, 2, { maxWait: 100 });
      const taken: number[] = [];
      sim.process(function* () {
        for (let k = 0; k < 2; k++) {
          const req = batch.take();
          yield req;
          taken.push(sim.now);
        }
      });
      sim.process(function* () {
        yield batch.put({ id: 1 });
        yield batch.put({ id: 2 }); // full at t=0, timer cancelled
        yield* timeout(200);
        yield batch.put({ id: 3 }); // new round at t=200, partial at t=300
      });
      sim.run();
      expect(taken).toEqual([0, 300]);
      expect(sim.now).toBe(300);
    });

    it('serves several takers in FIFO order', () => {
      const batch = new Batch<Part>(sim, 1);
      const order: string[] = [];
      for (const name of ['a', 'b', 'c']) {
        sim.process(function* () {
          const req = batch.take();
          yield req;
          order.push(`${name}:${req.items![0]!.id}`);
        });
      }
      sim.process(function* () {
        for (let i = 0; i < 3; i++) {
          yield* timeout(1);
          yield batch.put({ id: i });
        }
      });
      sim.run();
      expect(order).toEqual(['a:0', 'b:1', 'c:2']);
    });
  });

  describe('back-pressure', () => {
    it('blocks puts while a formed batch waits to be taken, then admits them', () => {
      const batch = new Batch<Part>(sim, 2);
      const acceptedAt: number[] = [];

      sim.process(function* () {
        for (let i = 0; i < 4; i++) {
          yield batch.put({ id: i });
          acceptedAt.push(sim.now);
        }
      });

      sim.process(function* () {
        yield* timeout(10);
        const req = batch.take();
        yield req;
        expect(req.items!.map((p) => p.id)).toEqual([0, 1]);
      });

      sim.run();
      // items 0 and 1 accepted at t=0 (batch forms); item 2 waits until the take at t=10
      expect(acceptedAt).toEqual([0, 0, 10, 10]);
      expect(batch.putQueueLength).toBe(0);
      expect(batch.readyCount).toBe(1); // [2, 3] formed, untaken
      expect(batch.stats.averagePutWaitTime).toBeCloseTo(10 / 4, 10);
    });

    it('unbounded batches never block puts', () => {
      const batch = new Batch<Part>(sim, 2, { unbounded: true });
      const acceptedAt: number[] = [];
      sim.process(function* () {
        for (let i = 0; i < 6; i++) {
          yield batch.put({ id: i });
          acceptedAt.push(sim.now);
        }
      });
      sim.run();
      expect(acceptedAt).toEqual([0, 0, 0, 0, 0, 0]);
      expect(batch.readyCount).toBe(3);
    });
  });

  describe('cancellation', () => {
    it('removes a waiting taker when its process is interrupted', () => {
      const batch = new Batch<Part>(sim, 1);
      const taker = sim.process(function* () {
        yield batch.take();
        throw new Error('should not get a batch');
      });
      sim.schedule(5, () => taker.interrupt());
      sim.process(function* () {
        yield* timeout(10);
        yield batch.put({ id: 1 });
      });
      sim.run();
      expect(taker.isInterrupted).toBe(true);
      expect(batch.takeQueueLength).toBe(0);
      expect(batch.readyCount).toBe(1);
    });

    it('removes a blocked put when its process is interrupted', () => {
      const batch = new Batch<Part>(sim, 1);
      sim.process(function* () {
        yield batch.put({ id: 0 }); // forms a batch nobody takes
      });
      const producer = sim.process(function* () {
        yield* timeout(1);
        yield batch.put({ id: 1 }); // blocked by back-pressure
      });
      sim.schedule(2, () => producer.interrupt());
      sim.run();
      expect(batch.putQueueLength).toBe(0);
      expect(batch.stats.totalPuts).toBe(2);
    });

    it('works inside anyOf with a timeout', () => {
      const batch = new Batch<Part>(sim, 5, { maxWait: 100 });
      let outcome = '';
      sim.process(function* () {
        const take = batch.take();
        const result = yield* anyOf([take, timeout(20)]);
        outcome = result.winner === take ? 'batch' : 'timeout';
      });
      sim.process(function* () {
        yield batch.put({ id: 1 });
      });
      sim.run();
      expect(outcome).toBe('timeout');
      expect(batch.takeQueueLength).toBe(0);
      expect(batch.stats.partialBatches).toBe(1); // still released at t=100
    });
  });

  describe('validation', () => {
    it('rejects bad construction and null items', () => {
      expect(() => new Batch(sim, 0)).toThrow(ValidationError);
      expect(() => new Batch(sim, 2.5)).toThrow(ValidationError);
      expect(() => new Batch(sim, NaN)).toThrow(ValidationError);
      expect(() => new Batch(sim, 3, { maxWait: 0 })).toThrow(ValidationError);
      expect(() => new Batch(sim, 3, { maxWait: Infinity })).toThrow(
        ValidationError
      );
      expect(() => new Batch(sim, 3, { name: ' ' })).toThrow(ValidationError);
      const batch = new Batch<Part | null>(sim, 3, { name: 'oven' });
      expect(batch.name).toBe('oven');
      expect(batch.batchSize).toBe(3);
      expect(() => batch.put(null)).toThrow(ValidationError);
    });
  });
});
