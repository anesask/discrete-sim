import { describe, it, expect, beforeEach } from 'vitest';
import {
  Simulation,
  Resource,
  PreemptionError,
  ValidationError,
  timeout,
  anyOf,
} from '../../src/index.js';

describe('Resource.release(request) ownership', () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  it('tracks granted, released and holdsUnit on the request', () => {
    const server = new Resource(sim, 1);
    const states: string[] = [];

    sim.process(function* () {
      const req = server.request();
      expect(req.isGranted).toBe(false);
      expect(req.holdsUnit).toBe(false);
      yield req;
      states.push(`granted:${req.isGranted} holds:${req.holdsUnit}`);
      yield* timeout(5);
      server.release(req);
      states.push(`released:${req.isReleased} holds:${req.holdsUnit}`);
    });

    sim.run();
    expect(states).toEqual([
      'granted:true holds:true',
      'released:true holds:false',
    ]);
    expect(server.inUse).toBe(0);
  });

  it('marks queued requests granted when their turn comes', () => {
    const server = new Resource(sim, 1);
    let grantedAt = -1;
    sim.process(function* () {
      const a = server.request();
      yield a;
      yield* timeout(10);
      server.release(a);
    });
    sim.process(function* () {
      yield* timeout(1);
      const b = server.request();
      yield b;
      grantedAt = sim.now;
      expect(b.isGranted).toBe(true);
      server.release(b);
    });
    sim.run();
    expect(grantedAt).toBe(10);
    expect(server.inUse).toBe(0);
  });

  it('rejects releasing a request that was never granted', () => {
    const server = new Resource(sim, 1);
    const req = server.request();
    expect(() => server.release(req)).toThrow(/never granted/);
    expect(server.inUse).toBe(0);
  });

  it('rejects releasing the same request twice', () => {
    const server = new Resource(sim, 2);
    let error: unknown;
    sim.process(function* () {
      const req = server.request();
      yield req;
      server.release(req);
      try {
        server.release(req);
      } catch (e) {
        error = e;
      }
    });
    sim.run();
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as Error).message).toMatch(/already released/);
    expect(server.inUse).toBe(0);
  });

  it('rejects a request that belongs to another resource', () => {
    const a = new Resource(sim, 1, { name: 'A' });
    const b = new Resource(sim, 1, { name: 'B' });
    let error: unknown;
    sim.process(function* () {
      const req = a.request();
      yield req;
      try {
        b.release(req);
      } catch (e) {
        error = e;
      }
      a.release(req);
    });
    sim.run();
    expect((error as Error).message).toMatch(/made on 'A'/);
    expect(a.inUse).toBe(0);
    expect(b.inUse).toBe(0);
  });

  it('marks a preempted request and rejects releasing it afterwards', () => {
    const server = new Resource(sim, 1, { preemptive: true });
    let preemptedError: unknown;
    let releaseError: unknown;

    sim.process(function* () {
      const low = server.request(10);
      yield low;
      try {
        yield* timeout(100);
        server.release(low);
      } catch (e) {
        preemptedError = e;
        expect(low.isPreempted).toBe(true);
        expect(low.holdsUnit).toBe(false);
        try {
          server.release(low);
        } catch (e2) {
          releaseError = e2;
        }
      }
    });

    sim.process(function* () {
      yield* timeout(5);
      const high = server.request(0);
      yield high;
      yield* timeout(3);
      server.release(high);
    });

    sim.run();
    expect(preemptedError).toBeInstanceOf(PreemptionError);
    expect((releaseError as Error).message).toMatch(/preempted/);
    expect(server.inUse).toBe(0);
    expect(server.stats.totalPreemptions).toBe(1);
  });

  it('keeps the unchecked release() working', () => {
    const server = new Resource(sim, 1);
    sim.process(function* () {
      yield server.request();
      yield* timeout(1);
      server.release();
    });
    sim.run();
    expect(server.inUse).toBe(0);
  });

  it('a late grant inside anyOf is released through its own request', () => {
    const server = new Resource(sim, 1);
    let winnerIsTimeout = false;
    let racerRequest: ReturnType<typeof server.request> | undefined;
    sim.process(function* () {
      yield server.request();
      yield* timeout(5);
      server.release();
    });
    sim.process(function* () {
      const req = server.request();
      racerRequest = req;
      const result = yield* anyOf([req, timeout(5)]);
      winnerIsTimeout = result.winner !== req;
    });
    sim.run();
    expect(winnerIsTimeout).toBe(true);
    // The grant arrived after the race settled and was given back through the request
    expect(racerRequest!.isGranted).toBe(true);
    expect(racerRequest!.isReleased).toBe(true);
    expect(racerRequest!.holdsUnit).toBe(false);
    expect(server.inUse).toBe(0);
  });
});
