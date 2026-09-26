import { describe, it, expect, beforeEach } from 'vitest';
import {
  Simulation,
  Schedule,
  Resource,
  timeout,
  ValidationError,
} from '../../src/index.js';

describe('Schedule', () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  const daySegments = [
    { from: 0, to: 8, value: 'night' },
    { from: 8, to: 12, value: 'morning' },
    { from: 12, to: 13, value: 'lunch' },
    { from: 13, to: 17, value: 'afternoon' },
    { from: 17, to: 24, value: 'evening' },
  ];

  describe('lookup', () => {
    it('returns the segment value for times inside a periodic schedule and wraps', () => {
      const s = new Schedule(sim, { period: 24, segments: daySegments });
      expect(s.isPeriodic).toBe(true);
      expect(s.at(0)).toBe('night');
      expect(s.at(7.999)).toBe('night');
      expect(s.at(8)).toBe('morning');
      expect(s.at(12)).toBe('lunch');
      expect(s.at(23.5)).toBe('evening');
      expect(s.at(24)).toBe('night'); // next day
      expect(s.at(24 + 9)).toBe('morning');
      expect(s.at(24 * 10 + 16.9)).toBe('afternoon');
    });

    it('accepts segments in any order', () => {
      const s = new Schedule(sim, {
        period: 24,
        segments: [...daySegments].reverse(),
      });
      expect(s.at(10)).toBe('morning');
    });

    it('holds the last value after a non-periodic schedule ends', () => {
      const s = new Schedule(sim, {
        segments: [
          { from: 0, to: 10, value: 1 },
          { from: 10, to: 20, value: 2 },
        ],
      });
      expect(s.isPeriodic).toBe(false);
      expect(s.at(5)).toBe(1);
      expect(s.at(15)).toBe(2);
      expect(s.at(20)).toBe(2);
      expect(s.at(1e6)).toBe(2);
    });

    it('uses defaultValue in gaps and throws without one', () => {
      const withDefault = new Schedule(sim, {
        period: 10,
        defaultValue: 0,
        segments: [{ from: 2, to: 4, value: 1 }],
      });
      expect(withDefault.at(1)).toBe(0);
      expect(withDefault.at(3)).toBe(1);
      expect(withDefault.at(7)).toBe(0);

      const strict = new Schedule(sim, {
        period: 10,
        segments: [{ from: 2, to: 4, value: 1 }],
      });
      expect(() => strict.at(1)).toThrow(ValidationError);
      expect(strict.at(2)).toBe(1);

      const nonPeriodic = new Schedule(sim, {
        segments: [{ from: 5, to: 6, value: 'x' }],
      });
      expect(() => nonPeriodic.at(1)).toThrow(ValidationError); // before first
      expect(nonPeriodic.at(100)).toBe('x'); // held
    });

    it('tracks the simulation clock through current', () => {
      const s = new Schedule(sim, { period: 24, segments: daySegments });
      const seen: string[] = [];
      sim.process(function* () {
        for (const t of [1, 9, 12.5, 26]) {
          yield* timeout(t - sim.now);
          seen.push(s.current);
        }
      });
      sim.run();
      expect(seen).toEqual(['night', 'morning', 'lunch', 'night']);
    });

    it('supports object values', () => {
      const s = new Schedule<{ rate: number; servers: number }>(sim, {
        segments: [
          { from: 0, to: 10, value: { rate: 1, servers: 2 } },
          { from: 10, to: 20, value: { rate: 5, servers: 4 } },
        ],
      });
      expect(s.at(12)).toEqual({ rate: 5, servers: 4 });
    });
  });

  describe('boundaries', () => {
    it('finds the next change in periodic schedules, including the wrap', () => {
      const s = new Schedule(sim, { period: 24, segments: daySegments });
      expect(s.nextChangeAfter(0)).toBe(8);
      expect(s.nextChangeAfter(8)).toBe(12);
      expect(s.nextChangeAfter(11.9)).toBe(12);
      expect(s.nextChangeAfter(17)).toBe(24);
      expect(s.nextChangeAfter(24)).toBe(32);
      expect(s.nextChangeAfter(47.5)).toBe(48);
      expect(s.hasMoreChanges).toBe(true);
    });

    it('finds the next change with gaps in a periodic schedule', () => {
      const s = new Schedule(sim, {
        period: 10,
        defaultValue: 0,
        segments: [{ from: 2, to: 4, value: 1 }],
      });
      expect(s.nextChangeAfter(0)).toBe(2);
      expect(s.nextChangeAfter(2)).toBe(4);
      expect(s.nextChangeAfter(4)).toBe(12);
      expect(s.nextChangeAfter(13)).toBe(14);
    });

    it('runs out of changes in non-periodic schedules', () => {
      const s = new Schedule(sim, {
        segments: [
          { from: 0, to: 10, value: 1 },
          { from: 10, to: 20, value: 2 },
        ],
      });
      expect(s.nextChangeAfter(0)).toBe(10);
      expect(s.nextChangeAfter(10)).toBe(20);
      expect(s.nextChangeAfter(20)).toBe(Infinity);
      expect(s.hasMoreChanges).toBe(true);
      sim.schedule(25, () => {});
      sim.run();
      expect(s.hasMoreChanges).toBe(false);
    });
  });

  describe('waitForChange and onChange', () => {
    it('waitForChange resumes at each boundary and returns the new value', () => {
      const s = new Schedule(sim, { period: 24, segments: daySegments });
      const log: Array<[number, string]> = [];
      sim.process(function* () {
        for (let i = 0; i < 6; i++) {
          const v = yield* s.waitForChange();
          log.push([sim.now, v]);
        }
      });
      sim.run();
      expect(log).toEqual([
        [8, 'morning'],
        [12, 'lunch'],
        [13, 'afternoon'],
        [17, 'evening'],
        [24, 'night'],
        [32, 'morning'],
      ]);
    });

    it('waitForChange throws when nothing lies ahead', () => {
      const s = new Schedule(sim, { segments: [{ from: 0, to: 5, value: 1 }] });
      let error: unknown;
      sim.process(function* () {
        yield* timeout(10);
        try {
          yield* s.waitForChange();
        } catch (e) {
          error = e;
        }
      });
      sim.run();
      expect(error).toBeInstanceOf(ValidationError);
    });

    it('onChange drives a handler, optionally immediately, and stops when done', () => {
      const s = new Schedule(sim, {
        segments: [
          { from: 0, to: 10, value: 1 },
          { from: 10, to: 20, value: 2 },
        ],
      });
      const calls: Array<[number, number]> = [];
      const proc = s.onChange((v, t) => calls.push([v, t]), {
        immediate: true,
      });
      sim.run();
      expect(calls).toEqual([
        [1, 0],
        [2, 10],
        [2, 20],
      ]);
      expect(proc.isCompleted).toBe(true);
    });

    it('onChange can be stopped by interrupting the process', () => {
      const s = new Schedule(sim, { period: 24, segments: daySegments });
      const calls: number[] = [];
      const proc = s.onChange((_v, t) => calls.push(t));
      sim.schedule(20, () => proc.interrupt());
      sim.run();
      expect(calls).toEqual([8, 12, 13, 17]);
      expect(sim.now).toBe(20);
    });
  });

  describe('validation', () => {
    it('rejects bad input', () => {
      expect(() => new Schedule(sim, { segments: [] })).toThrow(
        ValidationError
      );
      expect(
        () => new Schedule(sim, { segments: [{ from: 5, to: 5, value: 1 }] })
      ).toThrow(ValidationError);
      expect(
        () => new Schedule(sim, { segments: [{ from: -1, to: 5, value: 1 }] })
      ).toThrow(ValidationError);
      expect(
        () =>
          new Schedule(sim, {
            segments: [
              { from: 0, to: 6, value: 1 },
              { from: 5, to: 10, value: 2 },
            ],
          })
      ).toThrow(/overlap/);
      expect(
        () =>
          new Schedule(sim, {
            period: 8,
            segments: [{ from: 0, to: 10, value: 1 }],
          })
      ).toThrow(/beyond the period/);
      expect(
        () =>
          new Schedule(sim, {
            period: 0,
            segments: [{ from: 0, to: 1, value: 1 }],
          })
      ).toThrow(ValidationError);
      const s = new Schedule(sim, { segments: [{ from: 0, to: 1, value: 1 }] });
      expect(() => s.at(NaN)).toThrow(ValidationError);
      // @ts-expect-error handler must be a function
      expect(() => s.onChange('nope')).toThrow(ValidationError);
    });
  });
});

describe('Resource.setCapacity', () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  it('exposes capacity and grants waiting requests when capacity grows', () => {
    const r = new Resource(sim, 1);
    const grantedAt: number[] = [];
    for (let i = 0; i < 3; i++) {
      sim.process(function* () {
        yield r.request();
        grantedAt.push(sim.now);
        yield* timeout(100);
        r.release();
      });
    }
    sim.schedule(5, () => r.setCapacity(3));
    sim.run();

    expect(r.capacity).toBe(3);
    expect(grantedAt).toEqual([0, 5, 5]);
  });

  it('sheds surplus units as they are released when capacity shrinks', () => {
    const r = new Resource(sim, 3);
    const grantedAt: number[] = [];
    // Three users hold all units until t=10, 20, 30
    [10, 20, 30].forEach((hold) => {
      sim.process(function* () {
        yield r.request();
        yield* timeout(hold);
        r.release();
      });
    });
    // A fourth waits
    sim.process(function* () {
      yield* timeout(1);
      yield r.request();
      grantedAt.push(sim.now);
      r.release();
    });

    sim.schedule(5, () => {
      r.setCapacity(1);
      expect(r.inUse).toBe(3); // nobody is interrupted
      expect(r.available).toBe(0);
      expect(r.utilization).toBe(1);
    });
    sim.run();

    // Releases at 10 and 20 only shed surplus; the waiter is granted at 30
    expect(grantedAt).toEqual([30]);
    expect(r.inUse).toBe(0);
    expect(r.capacity).toBe(1);
  });

  it('is a no-op for the same value and validates input', () => {
    const r = new Resource(sim, 2);
    r.setCapacity(2);
    expect(r.capacity).toBe(2);
    expect(() => r.setCapacity(0)).toThrow(ValidationError);
    expect(() => r.setCapacity(1.5)).toThrow(ValidationError);
    expect(() => r.setCapacity(-1)).toThrow(ValidationError);
  });

  it('follows a staffing schedule through onChange', () => {
    const r = new Resource(sim, 1);
    const staffing = new Schedule<number>(sim, {
      period: 24,
      segments: [
        { from: 0, to: 8, value: 1 },
        { from: 8, to: 17, value: 3 },
        { from: 17, to: 24, value: 2 },
      ],
    });
    staffing.onChange((n) => r.setCapacity(n), { immediate: true });
    const capacities: Array<[number, number]> = [];
    sim.process(function* () {
      for (const t of [1, 9, 18, 25, 33]) {
        yield* timeout(t - sim.now);
        capacities.push([t, r.capacity]);
      }
    });
    sim.run(40);
    expect(capacities).toEqual([
      [1, 1],
      [9, 3],
      [18, 2],
      [25, 1],
      [33, 3],
    ]);
  });
});
