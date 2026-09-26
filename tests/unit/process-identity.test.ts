import { describe, it, expect, beforeEach } from 'vitest';
import {
  Simulation,
  Process,
  Resource,
  SimEvent,
  timeout,
  ProcessTraceEvent,
  ResourceTraceEvent,
  ProgressInfo,
} from '../../src/index.js';

describe('Process identity', () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  it('assigns monotonic ids and default names', () => {
    const a = sim.process(function* () {
      yield* timeout(1);
    });
    const b = sim.process(function* () {
      yield* timeout(1);
    });
    expect(a.id).toBe(1);
    expect(b.id).toBe(2);
    expect(a.name).toBe('process-1');
    expect(b.name).toBe('process-2');
  });

  it('uses the given name or the generator function name', () => {
    function* loader() {
      yield* timeout(1);
    }
    const named = sim.process(loader);
    const explicit = sim.process(() => loader(), { name: 'truck-7' });
    const direct = new Process(sim, loader, { name: 'direct' });
    expect(named.name).toBe('loader');
    expect(explicit.name).toBe('truck-7');
    expect(direct.name).toBe('direct');
    expect(direct.id).toBe(3);
  });

  it('lists active processes and drops finished ones', () => {
    const p = sim.process(function* () {
      yield* timeout(5);
    });
    expect([...sim.processes]).toContain(p);
    sim.run();
    expect(sim.processes.size).toBe(0);
  });

  it('annotates unhandled errors with the process name, id and time', () => {
    sim.process(
      function* () {
        yield* timeout(12.5);
        throw new Error('conveyor jammed');
      },
      { name: 'loader' }
    );
    let caught: Error | undefined;
    try {
      sim.run();
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught!.message).toContain('conveyor jammed');
    expect(caught!.message).toContain('process "loader"');
    expect(caught!.message).toContain('t=12.5');
    const info = (
      caught as Error & { process?: { id: number; name: string; time: number } }
    ).process;
    expect(info).toEqual({ id: 1, name: 'loader', time: 12.5 });
  });

  it('emits typed process trace events with id and name', () => {
    const events: ProcessTraceEvent[] = [];
    sim.enableTrace({ processes: true });
    const unsubscribe = sim.on('trace:process', (e) => {
      events.push(e);
    });
    const p = sim.process(
      function* () {
        yield* timeout(3);
      },
      { name: 'worker' }
    );
    const victim = sim.process(function* () {
      yield* timeout(100);
    });
    sim.schedule(4, () => victim.interrupt(new Error('stop')));
    sim.run();
    unsubscribe();

    const ops = events.map((e) => `${e.operation}:${e.processName}`);
    expect(ops).toEqual([
      'process:start:worker',
      'process:start:process-2',
      'process:complete:worker',
      'process:interrupt:process-2',
      'process:interrupted:process-2',
    ]);
    expect(events[0]!.processId).toBe(p.id);
    expect(events[0]!.time).toBe(0);
    expect(events[2]!.time).toBe(3);
    expect(events[3]!.error?.message).toBe('stop');
  });

  it('resource trace events carry the requesting process', () => {
    const events: ResourceTraceEvent[] = [];
    sim.enableTrace({ resources: true });
    sim.on('trace:resource', (e) => events.push(e));
    const server = new Resource(sim, 1, { name: 'Server' });
    sim.process(
      function* () {
        const grant = yield* server.acquire();
        yield* timeout(1);
        server.release(grant);
      },
      { name: 'client' }
    );
    sim.run();
    const request = events.find((e) => e.operation === 'resource:request');
    expect(request?.processId).toBe(1);
    expect(request?.processName).toBe('client');
    expect(request?.name).toBe('Server');
  });
});

describe('typed simulation events', () => {
  it('on() returns an unsubscribe function and handlers are typed', () => {
    const sim = new Simulation();
    const progress: ProgressInfo[] = [];
    const off = sim.on('progress', (info) => {
      progress.push(info); // ProgressInfo, no cast needed
    });
    let completeCalls = 0;
    sim.on('complete', (result) => {
      expect(typeof result.endTime).toBe('number');
      completeCalls++;
    });
    for (let t = 1; t <= 4; t++) sim.schedule(t, () => {});
    return sim.runAsync({ batchSize: 2 }).then(() => {
      expect(progress.map((p) => p.eventsProcessed)).toEqual([2, 4]);
      expect(completeCalls).toBe(1);
      off();
      sim.schedule(5, () => {});
      return sim.runAsync().then(() => {
        expect(progress).toHaveLength(2); // unsubscribed
      });
    });
  });

  it('simevent trace payloads are typed', () => {
    const sim = new Simulation();
    sim.enableTrace({ simEvents: true });
    const names: string[] = [];
    sim.on('trace:simevent', (e) => names.push(`${e.operation}:${e.name}`));
    const gate = new SimEvent(sim, 'gate');
    sim.process(function* () {
      yield gate.wait();
    });
    sim.schedule(1, () => gate.trigger());
    sim.run();
    expect(names).toContain('event:wait:gate');
    expect(names).toContain('event:trigger:gate');
  });

  it('rejects a handler with the wrong signature at compile time', () => {
    const sim = new Simulation();
    // @ts-expect-error progress handlers receive ProgressInfo, not a string
    sim.on('progress', (info: string) => info.length);
    // @ts-expect-error unknown event name
    sim.on('nope', () => {});
    expect(true).toBe(true);
  });
});
