import { describe, it, expect, beforeEach } from 'vitest';
import {
  Simulation,
  Store,
  timeout,
  ValidationError,
} from '../../src/index.js';

interface Pallet {
  id: string;
  destination?: string;
}

/**
 * Helpers: fill a store, then have several processes wait to put/get while a
 * consumer/producer frees or adds capacity one unit at a time. The order in
 * which waiters are served reveals the queue discipline.
 */
describe('Store queue disciplines', () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  describe('put queue', () => {
    /**
     * Store capacity 1 is filled at t=0. Waiters arrive at t=1, 2, 3 (staggered so
     * FIFO/LIFO are distinguishable). A consumer removes one item every 10 units
     * starting at t=10, so exactly one waiting put is admitted per removal.
     */
    function runPutScenario(
      store: Store<Pallet>,
      puts: Array<{ id: string; priority?: number }>
    ): string[] {
      const admitted: string[] = [];

      sim.process(function* () {
        yield store.put({ id: 'initial' });
      });

      puts.forEach((p, i) => {
        sim.process(function* () {
          yield* timeout(i + 1);
          yield store.put({ id: p.id }, p.priority);
          admitted.push(p.id);
        });
      });

      sim.process(function* () {
        for (let k = 0; k < puts.length; k++) {
          yield* timeout(10);
          const req = store.get();
          yield req;
        }
      });

      sim.run();
      return admitted;
    }

    it('defaults to FIFO', () => {
      const store = new Store<Pallet>(sim, 1);
      const order = runPutScenario(store, [
        { id: 'A' },
        { id: 'B' },
        { id: 'C' },
      ]);
      expect(order).toEqual(['A', 'B', 'C']);
    });

    it('supports LIFO', () => {
      const store = new Store<Pallet>(sim, 1, { putQueueDiscipline: 'lifo' });
      const order = runPutScenario(store, [
        { id: 'A' },
        { id: 'B' },
        { id: 'C' },
      ]);
      expect(order).toEqual(['C', 'B', 'A']);
    });

    it('supports priority (lower number served first)', () => {
      const store = new Store<Pallet>(sim, 1, {
        putQueueDiscipline: 'priority',
      });
      const order = runPutScenario(store, [
        { id: 'routine', priority: 5 },
        { id: 'rush', priority: 1 },
        { id: 'normal', priority: 3 },
      ]);
      expect(order).toEqual(['rush', 'normal', 'routine']);
    });

    it('breaks priority ties with FIFO by default', () => {
      const store = new Store<Pallet>(sim, 1, {
        putQueueDiscipline: 'priority',
      });
      const order = runPutScenario(store, [
        { id: 'A', priority: 2 },
        { id: 'B', priority: 2 },
        { id: 'C', priority: 2 },
      ]);
      expect(order).toEqual(['A', 'B', 'C']);
    });

    it('can break priority ties with LIFO', () => {
      const store = new Store<Pallet>(sim, 1, {
        putQueueDiscipline: { type: 'priority', tieBreaker: 'lifo' },
      });
      const order = runPutScenario(store, [
        { id: 'A', priority: 2 },
        { id: 'B', priority: 2 },
        { id: 'C', priority: 2 },
      ]);
      expect(order).toEqual(['C', 'B', 'A']);
    });

    it('ignores priority under FIFO', () => {
      const store = new Store<Pallet>(sim, 1);
      const order = runPutScenario(store, [
        { id: 'A', priority: 9 },
        { id: 'B', priority: 1 },
      ]);
      expect(order).toEqual(['A', 'B']);
    });
  });

  describe('get queue', () => {
    /**
     * Store starts empty. Getters arrive at t=1, 2, 3 and wait. A producer puts
     * one item every 10 units starting at t=10. Which getter receives each item
     * reveals the get queue discipline.
     */
    function runGetScenario(
      store: Store<Pallet>,
      getters: Array<{ name: string; priority?: number }>
    ): string[] {
      const served: string[] = [];

      getters.forEach((g, i) => {
        sim.process(function* () {
          yield* timeout(i + 1);
          const req = store.get(undefined, g.priority);
          yield req;
          served.push(g.name);
        });
      });

      sim.process(function* () {
        for (let k = 0; k < getters.length; k++) {
          yield* timeout(10);
          yield store.put({ id: `item-${k}` });
        }
      });

      sim.run();
      return served;
    }

    it('defaults to FIFO', () => {
      const store = new Store<Pallet>(sim, 10);
      const order = runGetScenario(store, [
        { name: 'A' },
        { name: 'B' },
        { name: 'C' },
      ]);
      expect(order).toEqual(['A', 'B', 'C']);
    });

    it('supports LIFO', () => {
      const store = new Store<Pallet>(sim, 10, { getQueueDiscipline: 'lifo' });
      const order = runGetScenario(store, [
        { name: 'A' },
        { name: 'B' },
        { name: 'C' },
      ]);
      expect(order).toEqual(['C', 'B', 'A']);
    });

    it('supports priority', () => {
      const store = new Store<Pallet>(sim, 10, {
        getQueueDiscipline: 'priority',
      });
      const order = runGetScenario(store, [
        { name: 'economy', priority: 10 },
        { name: 'express', priority: 1 },
        { name: 'standard', priority: 5 },
      ]);
      expect(order).toEqual(['express', 'standard', 'economy']);
    });

    it('serves the highest-priority waiter whose filter matches', () => {
      const store = new Store<Pallet>(sim, 10, {
        getQueueDiscipline: 'priority',
      });
      const served: string[] = [];

      // High priority, but only wants NYC pallets
      sim.process(function* () {
        const req = store.get((p) => p.destination === 'NYC', 1);
        yield req;
        served.push(`nyc-getter:${req.retrievedItem!.id}`);
      });

      // Lower priority, takes anything
      sim.process(function* () {
        yield* timeout(1);
        const req = store.get(undefined, 5);
        yield req;
        served.push(`any-getter:${req.retrievedItem!.id}`);
      });

      sim.process(function* () {
        yield* timeout(10);
        yield store.put({ id: 'P1', destination: 'LA' }); // skips NYC getter
        yield* timeout(10);
        yield store.put({ id: 'P2', destination: 'NYC' }); // NYC getter
      });

      sim.run();
      expect(served).toEqual(['any-getter:P1', 'nyc-getter:P2']);
    });

    it('does not change which stored item is returned', () => {
      // Discipline orders waiting requests, not items. With items already
      // present, an unfiltered get always returns the oldest stored item.
      const store = new Store<Pallet>(sim, 10, {
        getQueueDiscipline: 'lifo',
      });
      let got: string | undefined;

      sim.process(function* () {
        yield store.put({ id: 'first' });
        yield store.put({ id: 'second' });
        const req = store.get();
        yield req;
        got = req.retrievedItem!.id;
      });

      sim.run();
      expect(got).toBe('first');
    });
  });

  describe('configuration and validation', () => {
    it('accepts string and object discipline configuration', () => {
      expect(
        () =>
          new Store(sim, 1, {
            putQueueDiscipline: 'lifo',
            getQueueDiscipline: { type: 'priority', tieBreaker: 'lifo' },
          })
      ).not.toThrow();
    });

    it('rejects an invalid discipline', () => {
      expect(
        () =>
          new Store(sim, 1, {
            // @ts-expect-error invalid discipline on purpose
            putQueueDiscipline: 'random',
          })
      ).toThrow(/Invalid queue discipline/);
    });

    it('rejects non-finite priorities', () => {
      const store = new Store<Pallet>(sim, 1);
      expect(() => store.put({ id: 'x' }, NaN)).toThrow(ValidationError);
      expect(() => store.get(undefined, Infinity)).toThrow(ValidationError);
    });

    it('keeps existing call signatures working', () => {
      const store = new Store<Pallet>(sim, 1);
      expect(store.put({ id: 'x' }).priority).toBe(0);
      expect(store.get().priority).toBe(0);
      expect(store.get((p) => p.id === 'x').priority).toBe(0);
    });
  });
});
