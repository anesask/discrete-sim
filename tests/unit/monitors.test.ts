import { describe, it, expect } from 'vitest';
import {
  Simulation,
  Resource,
  Buffer,
  Store,
  Batch,
  timeout,
  ValidationError,
} from '../../src/index.js';

describe('Monitors', () => {
  it('Resource history records inUse and queueLength as a step function', () => {
    const sim = new Simulation();
    const server = new Resource(sim, 1, { monitor: true });
    sim.process(function* () {
      const a = yield* server.acquire(); // t=0: inUse 1
      yield* timeout(10);
      server.release(a); // t=10: inUse 0 then granted to b -> 1
    });
    sim.process(function* () {
      yield* timeout(2);
      const b = yield* server.acquire(); // t=2 queued (queue 1), granted t=10
      yield* timeout(5);
      server.release(b); // t=15: inUse 0
    });
    sim.run();

    const history = server.history!;
    expect(history.names).toEqual(['inUse', 'queueLength', 'capacity']);
    // At t=10 the release and the queued grant happen in the same instant,
    // so inUse never changes there and no point is recorded.
    expect(history.series('inUse')).toEqual([
      { time: 0, value: 1 },
      { time: 15, value: 0 },
    ]);
    expect(history.series('queueLength')).toEqual([
      { time: 0, value: 0 },
      { time: 2, value: 1 },
      { time: 10, value: 0 },
    ]);
    expect(history.series('capacity')).toEqual([{ time: 0, value: 1 }]);
  });

  it('collapses several changes at the same instant into the final value', () => {
    const sim = new Simulation();
    const server = new Resource(sim, 3, { monitor: true });
    sim.process(function* () {
      const a = yield* server.acquire();
      const b = yield* server.acquire();
      const c = yield* server.acquire(); // all at t=0 -> inUse 3
      yield* timeout(4);
      server.release(a);
      server.release(b); // t=4 -> 1
      yield* timeout(1);
      server.release(c);
    });
    sim.run();
    expect(server.history!.series('inUse')).toEqual([
      { time: 0, value: 3 },
      { time: 4, value: 1 },
      { time: 5, value: 0 },
    ]);
  });

  it('every throttles recording to bound memory', () => {
    const sim = new Simulation();
    const tank = new Buffer(sim, 1000, {
      initialLevel: 0,
      monitor: { every: 10 },
    });
    sim.process(function* () {
      for (let i = 0; i < 100; i++) {
        yield* timeout(1);
        yield tank.put(1);
      }
    });
    sim.run();
    const level = tank.history!.series('level');
    expect(level.length).toBeLessThanOrEqual(12);
    expect(level[level.length - 1]!.value).toBe(100);
    for (let i = 1; i < level.length; i++) {
      expect(level[i]!.time - level[i - 1]!.time).toBeGreaterThanOrEqual(10);
    }
  });

  it('Store and Batch expose histories; disabled monitors are undefined', () => {
    const sim = new Simulation();
    const shelf = new Store<number>(sim, 5, { monitor: true });
    const oven = new Batch<number>(sim, 2, { monitor: true });
    const plain = new Resource(sim, 1);
    sim.process(function* () {
      yield shelf.put(1);
      yield* timeout(1);
      yield shelf.put(2);
      yield oven.put(1);
      yield* timeout(1);
      yield oven.put(2); // batch forms at t=2
    });
    sim.run();
    expect(shelf.history!.series('size').map((p) => p.value)).toEqual([1, 2]);
    expect(oven.history!.series('readyCount')).toEqual([
      { time: 0, value: 0 },
      { time: 2, value: 1 },
    ]);
    expect(oven.history!.series('size').map((p) => p.value)).toEqual([0, 1, 0]);
    expect(plain.history).toBeUndefined();
  });

  it('exports CSV and JSON', () => {
    const sim = new Simulation();
    const server = new Resource(sim, 1, { monitor: true });
    sim.process(function* () {
      const a = yield* server.acquire();
      yield* timeout(3);
      server.release(a);
    });
    sim.run();
    const csv = server.history!.toCSV().split('\n');
    expect(csv[0]).toBe('time,inUse,queueLength,capacity');
    expect(csv[1]).toBe('0,1,0,1');
    expect(csv[2]).toBe('3,0,0,1');
    const json = server.history!.toJSON();
    expect(Object.keys(json)).toEqual(['inUse', 'queueLength', 'capacity']);
    expect(() => server.history!.series('nope')).toThrow(ValidationError);
    expect(() => new Resource(sim, 1, { monitor: { every: 0 } })).toThrow(
      ValidationError
    );
  });

  it('holders and waiting views describe who has and who wants the resource', () => {
    const sim = new Simulation();
    const server = new Resource(sim, 1);
    const snapshot: {
      holders: string[];
      waiting: Array<[string, number, number]>;
    } = {
      holders: [],
      waiting: [],
    };
    sim.process(
      function* () {
        const a = yield* server.acquire();
        yield* timeout(10);
        server.release(a);
      },
      { name: 'first' }
    );
    sim.process(
      function* () {
        yield* timeout(2);
        const b = yield* server.acquire(5);
        server.release(b);
      },
      { name: 'second' }
    );
    sim.schedule(6, () => {
      snapshot.holders = server.holders.map((p) => p.name);
      snapshot.waiting = server.waiting.map((w) => [
        w.process?.name ?? '?',
        w.priority,
        w.since,
      ]);
    });
    sim.run();
    expect(snapshot.holders).toEqual(['first']);
    expect(snapshot.waiting).toEqual([['second', 5, 2]]);
    expect(server.holders).toEqual([]);
    expect(server.waiting).toEqual([]);
  });
});
