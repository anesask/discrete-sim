import { describe, it, expect } from 'vitest';
import { Simulation, Resource, timeout } from '../../src/index.js';

/** Small model driven entirely by sim.random; returns the completion times. */
function runModel(sim: Simulation): number[] {
  const arrivals = sim.random.stream('arrivals');
  const service = sim.random.stream('service');
  const server = new Resource(sim, 1);
  const done: number[] = [];

  function* customer() {
    yield server.request();
    yield* timeout(service.exponential(1));
    server.release();
    done.push(sim.now);
  }

  sim.process(function* () {
    for (let i = 0; i < 50; i++) {
      sim.process(customer);
      yield* timeout(arrivals.exponential(1.2));
    }
  });

  sim.run();
  return done;
}

describe('Simulation.random and seed', () => {
  it('seeds sim.random from randomSeed so two simulations replay each other', () => {
    const a = runModel(new Simulation({ randomSeed: 2026 }));
    const b = runModel(new Simulation({ randomSeed: 2026 }));
    const c = runModel(new Simulation({ randomSeed: 2027 }));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('exposes the effective seed even when none was given, and it reproduces the run', () => {
    const sim = new Simulation();
    expect(Number.isInteger(sim.seed)).toBe(true);
    expect(sim.random.getSeed()).toBe(sim.seed);
    const first = runModel(sim);
    const replay = runModel(new Simulation({ randomSeed: sim.seed }));
    expect(replay).toEqual(first);
  });

  it('reset() reseeds sim.random so a reset run replays exactly', () => {
    const sim = new Simulation({ randomSeed: 99 });
    const first = runModel(sim);
    sim.reset();
    const second = runModel(sim);
    expect(second).toEqual(first);
  });

  it('validates the seed like Random does', () => {
    expect(() => new Simulation({ randomSeed: -1 })).toThrow(/Seed/);
    expect(() => new Simulation({ randomSeed: 1.5 })).toThrow(/Seed/);
    expect(() => new Simulation({ randomSeed: 2 ** 40 })).toThrow(/Seed/);
  });
});
