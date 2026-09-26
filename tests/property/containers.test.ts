import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  Simulation,
  Buffer,
  Store,
  Batch,
  Random,
  timeout,
  anyOf,
} from '../../src/index.js';

describe('property: container conservation', () => {
  it('Buffer level stays within [0, capacity] and matches puts minus gets', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 50 }),
        fc.array(
          fc.record({
            at: fc.double({ min: 0, max: 20, noNaN: true }),
            put: fc.boolean(),
            amount: fc.integer({ min: 1, max: 5 }),
            patience: fc.option(fc.double({ min: 0, max: 5, noNaN: true }), {
              nil: undefined,
            }),
          }),
          { minLength: 1, maxLength: 20 }
        ),
        (capacity, ops) => {
          const sim = new Simulation();
          const buffer = new Buffer(sim, capacity, { initialLevel: 0 });
          let putDone = 0;
          let gotDone = 0;
          let pending = 0; // infinite-patience waiters that can never be served stay queued
          let violations = 0;
          sim.on('step', () => {
            if (buffer.level < 0 || buffer.level > capacity) violations++;
          });
          for (const op of ops) {
            sim.process(function* () {
              yield* timeout(op.at);
              const req = op.put
                ? buffer.put(op.amount)
                : buffer.get(op.amount);
              if (op.patience === undefined) pending++;
              const r = yield* anyOf(
                op.patience === undefined ? [req] : [req, timeout(op.patience)]
              );
              if (r.winner === req) {
                if (op.patience === undefined) pending--;
                if (op.put) putDone += op.amount;
                else gotDone += op.amount;
              }
            });
          }
          sim.run();
          expect(violations).toBe(0);
          expect(buffer.level).toBe(putDone - gotDone);
          expect(buffer.putQueueLength + buffer.getQueueLength).toBe(pending);
        }
      ),
      { numRuns: 150 }
    );
  });

  it('Store size equals items put minus items taken and never exceeds capacity', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.array(
          fc.record({
            at: fc.double({ min: 0, max: 20, noNaN: true }),
            put: fc.boolean(),
            color: fc.constantFrom('red', 'blue'),
            filtered: fc.boolean(),
            patience: fc.option(fc.double({ min: 0, max: 5, noNaN: true }), {
              nil: undefined,
            }),
          }),
          { minLength: 1, maxLength: 20 }
        ),
        (capacity, ops) => {
          const sim = new Simulation();
          const store = new Store<{ color: string }>(sim, capacity);
          let putDone = 0;
          let gotDone = 0;
          let pending = 0;
          let violations = 0;
          sim.on('step', () => {
            if (store.size < 0 || store.size > capacity) violations++;
          });
          for (const op of ops) {
            sim.process(function* () {
              yield* timeout(op.at);
              const req = op.put
                ? store.put({ color: op.color })
                : store.get(
                    op.filtered ? (i) => i.color === op.color : undefined
                  );
              if (op.patience === undefined) pending++;
              const r = yield* anyOf(
                op.patience === undefined ? [req] : [req, timeout(op.patience)]
              );
              if (r.winner === req) {
                if (op.patience === undefined) pending--;
                if (op.put) putDone++;
                else gotDone++;
              }
            });
          }
          sim.run();
          expect(violations).toBe(0);
          expect(store.size).toBe(putDone - gotDone);
          expect(store.items.length).toBe(store.size);
          expect(store.putQueueLength + store.getQueueLength).toBe(pending);
        }
      ),
      { numRuns: 150 }
    );
  });

  it('Batch: accepted items are all accounted for in taken, ready and accumulating', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4 }),
        fc.option(fc.double({ min: 0.5, max: 10, noNaN: true }), {
          nil: undefined,
        }),
        fc.array(fc.double({ min: 0, max: 20, noNaN: true }), {
          minLength: 1,
          maxLength: 20,
        }),
        fc.array(fc.double({ min: 0, max: 30, noNaN: true }), {
          minLength: 0,
          maxLength: 6,
        }),
        (batchSize, maxWait, putTimes, takeTimes) => {
          const sim = new Simulation();
          const batch = new Batch<number>(sim, batchSize, { maxWait });
          let accepted = 0;
          let taken = 0;
          for (const t of putTimes) {
            sim.process(function* () {
              yield* timeout(t);
              const req = batch.put(1);
              const r = yield* anyOf([req, timeout(5)]);
              if (r.winner === req) accepted++;
            });
          }
          for (const t of takeTimes) {
            sim.process(function* () {
              yield* timeout(t);
              const req = batch.take();
              const r = yield* anyOf([req, timeout(15)]);
              if (r.winner === req) taken += req.items!.length;
            });
          }
          sim.run();
          const ready = batch.stats.totalBatches - batch.stats.totalTakes;
          expect(ready).toBe(batch.readyCount);
          // Every accepted item is either in a formed batch (taken or ready) or still accumulating
          const batched = Math.round(
            batch.stats.averageBatchSize * batch.stats.totalBatches
          );
          expect(batched + batch.size).toBe(accepted);
          expect(taken).toBeLessThanOrEqual(batched);
          expect(batch.putQueueLength).toBe(0);
          expect(batch.takeQueueLength).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('property: random streams', () => {
  it('different stream names never coincide on the first draws', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0xffffffff }),
        fc.string({ minLength: 1, maxLength: 12 }),
        fc.string({ minLength: 1, maxLength: 12 }),
        (seed, a, b) => {
          fc.pre(a !== b);
          const rng = new Random(seed);
          const sa = rng.stream(a);
          const sb = rng.stream(b);
          const xa = Array.from({ length: 8 }, () => sa.uniform(0, 1));
          const xb = Array.from({ length: 8 }, () => sb.uniform(0, 1));
          expect(xa).not.toEqual(xb);
        }
      ),
      { numRuns: 200 }
    );
  });
});
