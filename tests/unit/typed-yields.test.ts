import { describe, it, expect, beforeEach } from 'vitest';
import {
  Simulation,
  Resource,
  Store,
  Buffer,
  Batch,
  SimEvent,
  timeout,
  ProcessDoneResult,
} from '../../src/index.js';

interface Pallet {
  id: string;
  destination: string;
}

describe('typed yield* helpers', () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  it('resource.acquire returns the granted request for release', () => {
    const server = new Resource(sim, 1);
    const log: string[] = [];
    sim.process(function* () {
      const grant = yield* server.acquire();
      log.push(`granted:${grant.isGranted}`);
      yield* timeout(3);
      server.release(grant);
      log.push(`released:${grant.isReleased}`);
    });
    sim.run();
    expect(log).toEqual(['granted:true', 'released:true']);
    expect(server.inUse).toBe(0);
  });

  it('store.takeItem returns the item with its type; putItem stores it', () => {
    const store = new Store<Pallet>(sim, 10);
    let taken: Pallet | undefined;
    sim.process(function* () {
      yield* store.putItem({ id: 'A', destination: 'LA' });
      yield* store.putItem({ id: 'B', destination: 'NYC' });
      // Type check: the result is a Pallet, no assertion needed
      const pallet: Pallet = yield* store.takeItem(
        (p) => p.destination === 'NYC'
      );
      taken = pallet;
    });
    sim.run();
    expect(taken).toEqual({ id: 'B', destination: 'NYC' });
    expect(store.size).toBe(1);
  });

  it('store.takeItem waits for a matching item', () => {
    const store = new Store<Pallet>(sim, 10);
    let takenAt = -1;
    sim.process(function* () {
      const p = yield* store.takeItem();
      takenAt = sim.now;
      expect(p.id).toBe('late');
    });
    sim.process(function* () {
      yield* timeout(7);
      yield* store.putItem({ id: 'late', destination: 'X' });
    });
    sim.run();
    expect(takenAt).toBe(7);
  });

  it('buffer.takeAmount / putAmount block and resume like get / put', () => {
    const tank = new Buffer(sim, 100, { initialLevel: 0 });
    let gotAt = -1;
    sim.process(function* () {
      yield* tank.takeAmount(30);
      gotAt = sim.now;
    });
    sim.process(function* () {
      yield* timeout(4);
      yield* tank.putAmount(50);
    });
    sim.run();
    expect(gotAt).toBe(4);
    expect(tank.level).toBe(20);
  });

  it('batch.takeBatch returns items and isPartial', () => {
    const oven = new Batch<Pallet>(sim, 2, { maxWait: 10 });
    const loads: Array<{ count: number; partial: boolean }> = [];
    sim.process(function* () {
      for (let k = 0; k < 2; k++) {
        const { items, isPartial } = yield* oven.takeBatch();
        const first: Pallet | undefined = items[0];
        loads.push({ count: items.length, partial: isPartial });
        expect(first?.id).toBeDefined();
      }
    });
    sim.process(function* () {
      yield* oven.putItem({ id: '1', destination: 'X' });
      yield* oven.putItem({ id: '2', destination: 'X' }); // full load at t=0
      yield* timeout(20);
      yield* oven.putItem({ id: '3', destination: 'X' }); // partial at t=30
    });
    sim.run();
    expect(loads).toEqual([
      { count: 2, partial: false },
      { count: 1, partial: true },
    ]);
  });

  it('event.waitValue returns the trigger payload', () => {
    const alarm = new SimEvent(sim, 'alarm');
    let severity = '';
    sim.process(function* () {
      const payload = yield* alarm.waitValue<{ severity: string }>();
      severity = payload.severity;
    });
    sim.schedule(5, () => alarm.trigger({ severity: 'high' }));
    sim.run();
    expect(severity).toBe('high');
  });

  it('process.join returns how the child ended', () => {
    const child = sim.process(function* () {
      yield* timeout(4);
    });
    const victim = sim.process(function* () {
      yield* timeout(100);
    });
    let a: ProcessDoneResult | undefined;
    let b: ProcessDoneResult | undefined;
    sim.process(function* () {
      a = yield* child.join();
      b = yield* victim.join();
    });
    sim.schedule(6, () => victim.interrupt(new Error('cut')));
    sim.run();
    expect(a).toEqual({ state: 'completed' });
    expect(b?.state).toBe('interrupted');
    expect(b?.error?.message).toBe('cut');
  });
});
