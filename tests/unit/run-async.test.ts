import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  Simulation,
  Resource,
  Random,
  Statistics,
  timeout,
  ValidationError,
  ProgressInfo,
} from '../../src/index.js';

/** Small M/M/1 model; returns the statistics object so results can be compared. */
function buildModel(sim: Simulation, seed: number, customers: number) {
  const rng = new Random(seed);
  const stats = new Statistics(sim);
  stats.enableSampleTracking('wait');
  const server = new Resource(sim, 1);

  function* customer() {
    const arrived = sim.now;
    yield server.request();
    stats.recordSample('wait', sim.now - arrived);
    yield* timeout(rng.exponential(1));
    server.release();
  }

  sim.process(function* () {
    for (let i = 0; i < customers; i++) {
      sim.process(customer);
      yield* timeout(rng.exponential(1 / 0.8));
    }
  });

  return stats;
}

describe('runAsync', () => {
  it('produces the same result as run() for the same seeded model', async () => {
    const simA = new Simulation();
    const statsA = buildModel(simA, 11, 500);
    const resultA = simA.run();

    const simB = new Simulation();
    const statsB = buildModel(simB, 11, 500);
    const resultB = await simB.runAsync({ batchSize: 37 });

    expect(resultB.endTime).toBe(resultA.endTime);
    expect(resultB.eventsProcessed).toBe(resultA.eventsProcessed);
    expect(statsB.getSampleMean('wait')).toBe(statsA.getSampleMean('wait'));
    expect(statsB.getSampleCount('wait')).toBe(500);
  });

  it('respects until and yields to the event loop between batches', async () => {
    const sim = new Simulation();
    for (let t = 1; t <= 50; t++) sim.schedule(t, () => {});

    let ticks = 0;
    const ticker = setInterval(() => ticks++, 0);
    const result = await sim.runAsync({ until: 25.5, batchSize: 5 });
    clearInterval(ticker);

    expect(result.endTime).toBe(25.5);
    expect(result.eventsProcessed).toBe(25);
    expect(sim.now).toBe(25.5);
    expect(ticks).toBeGreaterThan(0);
  });

  it('advances to until when events run out early', async () => {
    const sim = new Simulation();
    sim.schedule(3, () => {});
    const result = await sim.runAsync({ until: 10 });
    expect(result.endTime).toBe(10);
    expect(result.eventsProcessed).toBe(1);
  });

  it('emits progress after each batch and complete at the end', async () => {
    const sim = new Simulation();
    for (let t = 1; t <= 10; t++) sim.schedule(t, () => {});
    const progress: ProgressInfo[] = [];
    let completed = 0;
    sim.on('progress', (info) => progress.push(info));
    sim.on('complete', () => completed++);

    await sim.runAsync({ batchSize: 4 });

    expect(progress.map((p) => p.eventsProcessed)).toEqual([4, 8, 10]);
    expect(progress.map((p) => p.now)).toEqual([4, 8, 10]);
    expect(progress[2]!.eventsInQueue).toBe(0);
    expect(completed).toBe(1);
  });

  it('stops early when the signal is aborted and resolves with the partial result', async () => {
    const sim = new Simulation();
    for (let t = 1; t <= 100; t++) sim.schedule(t, () => {});
    const controller = new AbortController();
    sim.on('progress', (info) => {
      if (info.eventsProcessed >= 20) controller.abort();
    });

    const result = await sim.runAsync({
      batchSize: 10,
      signal: controller.signal,
    });

    expect(result.eventsProcessed).toBe(20);
    expect(sim.now).toBe(20);
    // The remaining events are still there; a later run() continues
    const rest = sim.run();
    expect(rest.eventsProcessed).toBe(80);
  });

  it('rejects a concurrent run and validates options', async () => {
    const sim = new Simulation();
    for (let t = 1; t <= 10; t++) sim.schedule(t, () => {});
    const pending = sim.runAsync({ batchSize: 1 });
    expect(() => sim.run()).toThrow('already running');
    await expect(sim.runAsync()).rejects.toThrow('already running');
    await pending;

    await expect(sim.runAsync({ batchSize: 0 })).rejects.toThrow(
      ValidationError
    );
    await expect(sim.runAsync({ batchSize: 2.5 })).rejects.toThrow(
      ValidationError
    );
    await expect(sim.runAsync({ until: -1 })).rejects.toThrow(ValidationError);
  });

  it('propagates errors thrown by events and releases the running flag', async () => {
    const sim = new Simulation();
    sim.schedule(1, () => {
      throw new Error('boom');
    });
    await expect(sim.runAsync()).rejects.toThrow('boom');
    // Can run again afterwards
    sim.schedule(1, () => {});
    expect(sim.run().eventsProcessed).toBe(1);
  });
});

describe('runRealtime', () => {
  let sim: Simulation;

  beforeEach(() => {
    vi.useFakeTimers();
    sim = new Simulation();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('executes events when their wall-clock time is due', async () => {
    const executed: number[] = [];
    [1, 2, 3].forEach((t) => sim.schedule(t, () => executed.push(t)));

    const handle = sim.runRealtime({ factor: 1 }); // 1 s per simulation unit
    expect(handle.isActive).toBe(true);
    expect(executed).toEqual([]);

    await vi.advanceTimersByTimeAsync(999);
    expect(executed).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(executed).toEqual([1]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(executed).toEqual([1, 2]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(executed).toEqual([1, 2, 3]);

    const result = await handle.done;
    expect(result.eventsProcessed).toBe(3);
    expect(result.endTime).toBe(3);
    expect(handle.isActive).toBe(false);
  });

  it('pauses, resumes and re-paces', async () => {
    const executed: number[] = [];
    [1, 2, 3].forEach((t) => sim.schedule(t, () => executed.push(t)));
    const handle = sim.runRealtime({ factor: 1 });

    await vi.advanceTimersByTimeAsync(1000);
    expect(executed).toEqual([1]);

    handle.pause();
    expect(handle.isPaused).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(executed).toEqual([1]); // clock frozen while paused

    handle.resume();
    expect(handle.isPaused).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(executed).toEqual([1, 2]); // paused time did not count

    handle.setFactor(0.5); // now 500 ms per unit
    await vi.advanceTimersByTimeAsync(499);
    expect(executed).toEqual([1, 2]);
    await vi.advanceTimersByTimeAsync(1);
    expect(executed).toEqual([1, 2, 3]);

    await expect(handle.done).resolves.toMatchObject({ eventsProcessed: 3 });
  });

  it('stop() ends the run early with the partial result', async () => {
    [1, 2, 3].forEach((t) => sim.schedule(t, () => {}));
    let completed = 0;
    sim.on('complete', () => completed++);
    const handle = sim.runRealtime({ factor: 0.1 });

    await vi.advanceTimersByTimeAsync(150);
    handle.stop();
    const result = await handle.done;

    expect(result.eventsProcessed).toBe(1);
    expect(sim.now).toBe(1);
    expect(completed).toBe(1);
    expect(handle.isActive).toBe(false);
    // Idempotent
    handle.stop();
    handle.pause();
    handle.resume();
    expect(sim.statistics.eventsProcessed).toBe(1);
  });

  it('honours until, emits progress per event and frees the running flag', async () => {
    [1, 2, 3, 4].forEach((t) => sim.schedule(t, () => {}));
    const progress: number[] = [];
    sim.on('progress', (info) => progress.push(info.now));

    const handle = sim.runRealtime({ factor: 0.01, until: 2.5 });
    expect(() => sim.run()).toThrow('already running');

    await vi.advanceTimersByTimeAsync(100);
    const result = await handle.done;

    expect(progress).toEqual([1, 2]);
    expect(result.endTime).toBe(2.5);
    expect(result.eventsProcessed).toBe(2);
    expect(sim.run().eventsProcessed).toBe(2); // remaining events still runnable
  });

  it('runs overdue events immediately after a big factor change', async () => {
    const executed: number[] = [];
    [1, 2, 3].forEach((t) => sim.schedule(t, () => executed.push(t)));
    const handle = sim.runRealtime({ factor: 10 }); // very slow
    await vi.advanceTimersByTimeAsync(100);
    expect(executed).toEqual([]);

    handle.setFactor(0.001); // 1 ms per unit: everything is due almost at once
    await vi.advanceTimersByTimeAsync(10);
    expect(executed).toEqual([1, 2, 3]);
    await handle.done;
  });

  it('rejects the done promise when an event throws', async () => {
    sim.schedule(1, () => {
      throw new Error('kaboom');
    });
    const handle = sim.runRealtime({ factor: 0.001 });
    const settled = handle.done.catch((e: Error) => e.message);
    await vi.advanceTimersByTimeAsync(10);
    await expect(settled).resolves.toBe('kaboom');
    expect(handle.isActive).toBe(false);
    expect(() => sim.run()).not.toThrow(); // flag released
  });

  it('validates factor', () => {
    expect(() => sim.runRealtime({ factor: 0 })).toThrow(ValidationError);
    expect(() => sim.runRealtime({ factor: -1 })).toThrow(ValidationError);
    expect(() => sim.runRealtime({ factor: Infinity })).toThrow(
      ValidationError
    );
    const handle = sim.runRealtime({ factor: 1 });
    expect(() => handle.setFactor(0)).toThrow(ValidationError);
    handle.stop();
  });
});
