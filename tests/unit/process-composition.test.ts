import { describe, it, expect, beforeEach } from 'vitest';
import {
  Simulation,
  Resource,
  Buffer,
  Store,
  SimEvent,
  Process,
  timeout,
  waitFor,
  anyOf,
  allOf,
  AnyOfRequest,
  Timeout,
  ValidationError,
} from '../../src/index.js';

describe('Process composition', () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  describe('process.done()', () => {
    it('resumes the parent when the child completes', () => {
      const log: string[] = [];
      const child = sim.process(function* () {
        yield* timeout(7);
        log.push(`child done at ${sim.now}`);
      });

      sim.process(function* () {
        const done = child.done();
        yield done;
        log.push(`parent resumed at ${sim.now}`);
        expect(done.result?.state).toBe('completed');
        expect(child.isCompleted).toBe(true);
      });

      sim.run();
      expect(log).toEqual(['child done at 7', 'parent resumed at 7']);
    });

    it('resolves immediately for a child that already finished', () => {
      const child = sim.process(function* () {
        yield* timeout(1);
      });
      let resumedAt = -1;

      sim.process(function* () {
        yield* timeout(10);
        yield child.done();
        resumedAt = sim.now;
      });

      sim.run();
      expect(resumedAt).toBe(10);
    });

    it('reports interruption of the child', () => {
      const child = sim.process(function* () {
        yield* timeout(100);
      });
      let state: string | undefined;
      let message: string | undefined;

      sim.process(function* () {
        const done = child.done();
        yield done;
        state = done.result?.state;
        message = done.result?.error?.message;
      });

      sim.schedule(5, () => child.interrupt(new Error('stop')));
      sim.run();

      expect(state).toBe('interrupted');
      expect(message).toBe('stop');
      expect(sim.now).toBe(5);
    });

    it('lets several parents join the same child', () => {
      const child = sim.process(function* () {
        yield* timeout(3);
      });
      const resumed: number[] = [];
      for (let i = 0; i < 3; i++) {
        sim.process(function* () {
          yield child.done();
          resumed.push(sim.now);
        });
      }
      sim.run();
      expect(resumed).toEqual([3, 3, 3]);
    });
  });

  describe('anyOf', () => {
    it('lets a timeout win over a busy resource and leaves no queued request behind', () => {
      const server = new Resource(sim, 1);
      let outcome = '';

      sim.process(function* () {
        yield server.request();
        yield* timeout(100);
        server.release();
      });

      sim.process(function* () {
        yield* timeout(1);
        const req = server.request();
        const result = yield* anyOf([req, timeout(5)]);
        outcome = result.winner === req ? 'served' : 'gave up';
        expect(result.index).toBe(1);
        expect(result.completed).toEqual([result.winner]);
        expect(result.winner).toBeInstanceOf(Timeout);
      });

      sim.run();
      expect(outcome).toBe('gave up');
      expect(server.queueLength).toBe(0);
      expect(sim.now).toBe(100);
    });

    it('lets the request win when the resource frees up first', () => {
      const server = new Resource(sim, 1);
      let servedAt = -1;

      sim.process(function* () {
        yield server.request();
        yield* timeout(3);
        server.release();
      });

      sim.process(function* () {
        yield* timeout(1);
        const req = server.request();
        const result = yield* anyOf([req, timeout(5)]);
        expect(result.winner).toBe(req);
        expect(result.index).toBe(0);
        servedAt = sim.now;
        expect(server.inUse).toBe(1);
        yield* timeout(2);
        server.release();
      });

      sim.run();
      expect(servedAt).toBe(3);
      expect(server.inUse).toBe(0);
    });

    it('works with SimEvent, Buffer and Store branches', () => {
      const gate = new SimEvent(sim, 'gate');
      const tank = new Buffer(sim, 100, { initialLevel: 0 });
      const shelf = new Store<string>(sim, 10);
      const winners: string[] = [];

      sim.process(function* () {
        const wait = gate.wait();
        const fuel = tank.get(10);
        const item = shelf.get();
        const result = yield* anyOf([wait, fuel, item, timeout(50)]);
        winners.push(
          result.winner === wait
            ? 'gate'
            : result.winner === fuel
              ? 'fuel'
              : result.winner === item
                ? 'item'
                : 'timeout'
        );
        expect(tank.getQueueLength).toBe(0);
        expect(shelf.getQueueLength).toBe(0);
        expect(gate.waitingCount).toBe(0);
      });

      sim.process(function* () {
        yield* timeout(4);
        yield shelf.put('pallet');
      });

      sim.run();
      expect(winners).toEqual(['item']);
      expect(shelf.size).toBe(0);
    });

    it('reports every branch that completed at the same instant', () => {
      const a = new Resource(sim, 1);
      const b = new Resource(sim, 1);
      let completedCount = 0;

      sim.process(function* () {
        const ra = a.request();
        const rb = b.request();
        const result = yield* anyOf([ra, rb, timeout(1)]);
        completedCount = result.completed.length;
        expect(result.winner).toBe(ra);
        expect(result.completed).toContain(rb);
        // Both were granted; the caller owns both units
        expect(a.inUse).toBe(1);
        expect(b.inUse).toBe(1);
        a.release();
        b.release();
      });

      sim.run();
      expect(completedCount).toBe(2);
      expect(sim.now).toBe(0);
    });

    it('undoes a grant that arrives in the same instant after another branch settled', () => {
      const server = new Resource(sim, 1);
      let winnerIsTimeout = false;

      // Holder releases exactly at t=5; its timeout event is scheduled first.
      sim.process(function* () {
        yield server.request();
        yield* timeout(5);
        server.release();
      });

      // Racer's timeout for t=5 is scheduled after the holder's, so at t=5 the
      // release (and the 0-delay grant it schedules) come before the racer's
      // timeout fires. The grant callback is scheduled after the timeout event,
      // so the timeout wins and the late grant must be given back.
      sim.process(function* () {
        const req = server.request();
        const result = yield* anyOf([req, timeout(5)]);
        winnerIsTimeout = result.winner !== req;
      });

      sim.run();
      expect(winnerIsTimeout).toBe(true);
      expect(server.inUse).toBe(0);
      expect(server.queueLength).toBe(0);
    });

    it('can be yielded directly as an AnyOfRequest', () => {
      let resumedAt = -1;
      sim.process(function* () {
        const race = new AnyOfRequest([timeout(3), timeout(8)]);
        yield race;
        resumedAt = sim.now;
        expect(race.result?.index).toBe(0);
        expect(race.branches).toHaveLength(2);
      });
      sim.run();
      expect(resumedAt).toBe(3);
    });

    it('rejects empty branch lists, conditions and unknown values', () => {
      expect(() => new AnyOfRequest([])).toThrow(ValidationError);
      // @ts-expect-error conditions are not waitable
      expect(() => new AnyOfRequest([waitFor(() => true)])).toThrow(
        ValidationError
      );
      // @ts-expect-error not a waitable
      expect(() => new AnyOfRequest([{ nope: true }])).toThrow(ValidationError);
    });
  });

  describe('allOf', () => {
    it('resumes once, when the last branch completes', () => {
      const server = new Resource(sim, 1);
      const gate = new SimEvent(sim);
      let resumedAt = -1;

      sim.process(function* () {
        const req = server.request();
        const completed = yield* allOf([req, gate.wait(), timeout(4)]);
        resumedAt = sim.now;
        expect(completed).toHaveLength(3);
        expect(server.inUse).toBe(1);
        server.release();
      });

      sim.schedule(9, () => gate.trigger());
      sim.run();
      expect(resumedAt).toBe(9);
    });

    it('joins several child processes', () => {
      const children = [2, 5, 3].map((d) =>
        sim.process(function* () {
          yield* timeout(d);
        })
      );
      let resumedAt = -1;
      sim.process(function* () {
        yield* allOf(children.map((c) => c.done()));
        resumedAt = sim.now;
      });
      sim.run();
      expect(resumedAt).toBe(5);
      expect(children.every((c) => c.isCompleted)).toBe(true);
    });
  });

  describe('interruption cleanup', () => {
    it('removes a plain resource request from the queue when the process is interrupted', () => {
      const server = new Resource(sim, 1);
      sim.process(function* () {
        yield server.request();
        yield* timeout(10);
        server.release();
      });
      const waiter = sim.process(function* () {
        yield server.request();
        throw new Error('should not be granted');
      });

      sim.schedule(2, () => waiter.interrupt());
      sim.run();

      expect(waiter.isInterrupted).toBe(true);
      expect(server.queueLength).toBe(0);
      expect(server.inUse).toBe(0);
    });

    it('cancels every pending branch of an anyOf when the process is interrupted', () => {
      const server = new Resource(sim, 1);
      const gate = new SimEvent(sim);
      const tank = new Buffer(sim, 10, { initialLevel: 0 });
      let resumed = false;

      sim.process(function* () {
        yield server.request();
        yield* timeout(50);
        server.release();
      });

      const racer = sim.process(function* () {
        try {
          yield* anyOf([
            server.request(),
            gate.wait(),
            tank.get(5),
            timeout(30),
          ]);
          resumed = true;
        } catch {
          // interrupted
        }
      });

      sim.schedule(3, () => racer.interrupt(new Error('cancelled')));
      sim.run();

      expect(resumed).toBe(false);
      expect(server.queueLength).toBe(0);
      expect(gate.waitingCount).toBe(0);
      expect(tank.getQueueLength).toBe(0);
      expect(sim.now).toBe(50);
    });

    it('cancels a pending done() subscription on interrupt', () => {
      const child = sim.process(function* () {
        yield* timeout(10);
      });
      let resumed = false;
      const parent = sim.process(function* () {
        try {
          yield child.done();
          resumed = true;
        } catch {
          // interrupted
        }
      });
      sim.schedule(1, () => parent.interrupt());
      sim.run();
      expect(resumed).toBe(false);
      expect(child.isCompleted).toBe(true);
    });
  });

  it('still rejects unknown yielded values', () => {
    // @ts-expect-error deliberately wrong yielded value
    const proc = new Process(sim, function* () {
      yield 42;
    });
    expect(() => proc.start()).toThrow(ValidationError);
  });
});
