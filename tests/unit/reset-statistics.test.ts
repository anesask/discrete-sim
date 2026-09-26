import { describe, it, expect } from 'vitest';
import {
  Simulation,
  Resource,
  Buffer,
  Store,
  Batch,
  Statistics,
  timeout,
} from '../../src/index.js';

describe('resetStatistics (warm-up handling)', () => {
  it('Resource: averages reflect only the time after the reset, state is kept', () => {
    const sim = new Simulation();
    const server = new Resource(sim, 1);
    // Busy from 0 to 100 with a queue of 1; idle from 100 to 200
    sim.process(function* () {
      yield server.request();
      yield* timeout(100);
      server.release();
    });
    sim.process(function* () {
      yield server.request(); // waits 0..100, served 100..100.001
      yield* timeout(0.001);
      server.release();
    });
    sim.schedule(100, () => server.resetStatistics());
    sim.run(200);

    const s = server.stats;
    expect(s.totalRequests).toBe(0); // both requests were before the reset
    expect(s.averageQueueLength).toBeCloseTo(0, 6);
    expect(s.utilizationRate).toBeCloseTo(0.001 / 100, 6);
    expect(server.inUse).toBe(0);
  });

  it('Resource: units in use and the queue survive the reset', () => {
    const sim = new Simulation();
    const server = new Resource(sim, 1);
    let servedAt = -1;
    sim.process(function* () {
      yield server.request();
      yield* timeout(50);
      server.release();
    });
    sim.process(function* () {
      yield server.request();
      servedAt = sim.now;
      server.release();
    });
    sim.schedule(10, () => {
      server.resetStatistics();
      expect(server.inUse).toBe(1);
      expect(server.queueLength).toBe(1);
    });
    sim.run();
    expect(servedAt).toBe(50);
    // The waiter's grant happened after the reset: counted, with 40 of wait
    expect(server.stats.totalRequests).toBe(0);
  });

  it('Buffer, Store and Batch reset counters but keep contents', () => {
    const sim = new Simulation();
    const tank = new Buffer(sim, 100, { initialLevel: 50 });
    const shelf = new Store<number>(sim, 10);
    const oven = new Batch<number>(sim, 2);
    sim.process(function* () {
      yield tank.put(10);
      yield shelf.put(1);
      yield oven.put(1);
      yield oven.put(2);
      yield* timeout(5);
      sim.resetStatistics();
      yield tank.get(20);
      yield shelf.put(2);
    });
    sim.run();
    expect(tank.level).toBe(40);
    expect(tank.stats.totalPuts).toBe(0);
    expect(tank.stats.totalGets).toBe(1);
    expect(shelf.size).toBe(2);
    expect(shelf.stats.totalPuts).toBe(1);
    expect(oven.readyCount).toBe(1);
    expect(oven.stats.totalBatches).toBe(0);
    expect(oven.stats.totalPuts).toBe(0);
  });

  it('Statistics keeps current values and restarts time-weighted averages', () => {
    const sim = new Simulation();
    const stats = new Statistics(sim);
    stats.enableSampleTracking('w');
    stats.enableTimeseries('q');
    sim.process(function* () {
      stats.recordValue('q', 10);
      stats.increment('served', 5);
      stats.recordSample('w', 100);
      yield* timeout(10);
      sim.resetStatistics();
      yield* timeout(10);
      stats.recordValue('q', 0); // q was 10 for the 10 units after the reset
      stats.recordSample('w', 1);
      yield* timeout(10);
    });
    sim.run();
    expect(stats.getAverage('q')).toBeCloseTo(5, 10); // (10*10 + 0*10) / 20
    expect(stats.getCount('served')).toBe(0);
    expect(stats.getSampleCount('w')).toBe(1);
    expect(stats.getSampleMean('w')).toBe(1);
    expect(stats.getTimeseries('q').map((p) => p.value)).toEqual([0]);
  });

  it('sim.resetStatistics() reaches every collector created for the simulation', () => {
    const sim = new Simulation();
    const a = new Resource(sim, 1);
    const b = new Buffer(sim, 10);
    const st = new Statistics(sim);
    sim.process(function* () {
      yield a.request();
      a.release();
      yield b.put(1);
      st.increment('x');
    });
    sim.run();
    expect(a.stats.totalRequests).toBe(1);
    sim.resetStatistics();
    expect(a.stats.totalRequests).toBe(0);
    expect(b.stats.totalPuts).toBe(0);
    expect(st.getCount('x')).toBe(0);
  });
});
