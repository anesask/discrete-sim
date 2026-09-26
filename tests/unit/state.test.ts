import { describe, it, expect, beforeEach } from 'vitest';
import {
  Simulation,
  State,
  timeout,
  anyOf,
  ValidationError,
} from '../../src/index.js';

describe('State', () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  it('resumes waiters exactly at the set() that satisfies them, without polling events', () => {
    const stock = new State(sim, 0);
    let resumedAt = -1;
    let seen = -1;
    sim.enableEventTrace();

    sim.process(function* () {
      seen = yield* stock.until((n) => n >= 10);
      resumedAt = sim.now;
    });
    sim.process(function* () {
      yield* timeout(3);
      stock.set(4); // not enough
      yield* timeout(3);
      stock.set(12); // satisfies at t=6
      yield* timeout(3);
      stock.set(20);
    });

    sim.run();
    expect(resumedAt).toBe(6);
    expect(seen).toBe(12);
    // three timeouts + one 0-delay resume = 4 events, no polling
    expect(sim.getEventTrace()).toHaveLength(4);
    expect(stock.changes).toBe(3);
  });

  it('resolves immediately when the predicate already holds', () => {
    const open = new State(sim, true);
    let resumedAt = -1;
    sim.process(function* () {
      yield* timeout(2);
      yield* open.until((v) => v);
      resumedAt = sim.now;
    });
    sim.run();
    expect(resumedAt).toBe(2);
  });

  it('serves several waiters with different predicates in FIFO order', () => {
    const level = new State(sim, 0);
    const order: string[] = [];
    for (const [name, threshold] of [
      ['a', 5],
      ['b', 3],
      ['c', 9],
    ] as const) {
      sim.process(function* () {
        yield* level.until((n) => n >= threshold);
        order.push(`${name}@${sim.now}`);
      });
    }
    sim.process(function* () {
      yield* timeout(1);
      level.set(4); // b
      yield* timeout(1);
      level.update((n) => n + 6); // a and c (10)
    });
    sim.run();
    expect(order).toEqual(['b@1', 'a@2', 'c@2']);
    expect(level.waitingCount).toBe(0);
  });

  it('works inside anyOf with a timeout and is cancelled on interrupt', () => {
    const ready = new State(sim, false);
    let outcome = '';
    sim.process(function* () {
      const wait = ready.waitUntil((v) => v);
      const result = yield* anyOf([wait, timeout(5)]);
      outcome = result.winner === wait ? 'ready' : 'timeout';
    });
    const other = sim.process(function* () {
      yield ready.waitUntil((v) => v);
    });
    sim.schedule(2, () => other.interrupt());
    sim.run();
    expect(outcome).toBe('timeout');
    expect(ready.waitingCount).toBe(0);
  });

  it('tracks time-weighted statistics when asked', () => {
    const machine = new State<'idle' | 'busy' | 'down'>(sim, 'idle', {
      trackTime: true,
      name: 'machine',
    });
    const load = new State(sim, 2, { trackTime: true });
    sim.process(function* () {
      yield* timeout(10);
      machine.set('busy');
      load.set(6);
      yield* timeout(30);
      machine.set('down');
      load.set(0);
      yield* timeout(10);
    });
    sim.run(50);
    expect(machine.timeIn('idle')).toBe(10);
    expect(machine.timeIn('busy')).toBe(30);
    expect(machine.timeIn('down')).toBe(10);
    // (2*10 + 6*30 + 0*10) / 50 = 4.0
    expect(load.averageValue).toBeCloseTo(4, 10);
    expect(machine.name).toBe('machine');
  });

  it('validates input and tracking requirements', () => {
    const s = new State(sim, 1);
    expect(() => s.averageValue).toThrow(ValidationError);
    expect(() => s.timeIn(1)).toThrow(ValidationError);
    // @ts-expect-error predicate required
    expect(() => s.waitUntil('nope')).toThrow(ValidationError);
    // @ts-expect-error function required
    expect(() => s.update(3)).toThrow(ValidationError);
    expect(() => new State(sim, 1, { name: ' ' })).toThrow(ValidationError);
    const text = new State(sim, 'a', { trackTime: true });
    expect(() => text.averageValue).toThrow(/numeric/);
  });
});
