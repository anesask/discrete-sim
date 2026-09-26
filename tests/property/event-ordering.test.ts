import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Simulation } from '../../src/index.js';

/**
 * Property: for any set of scheduled events, execution order is
 * (time ascending, priority ascending, insertion order).
 */
describe('property: event ordering', () => {
  it('executes events in (time, priority, insertion) order', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            delay: fc.oneof(
              fc.constantFrom(0, 1, 2, 5, 10), // many ties on purpose
              fc.double({ min: 0, max: 100, noNaN: true })
            ),
            priority: fc.integer({ min: -3, max: 3 }),
          }),
          { minLength: 1, maxLength: 60 }
        ),
        (events) => {
          const sim = new Simulation();
          const executed: number[] = [];
          events.forEach((e, index) => {
            sim.schedule(e.delay, () => executed.push(index), e.priority);
          });
          sim.run();

          const expected = events
            .map((e, index) => ({ ...e, index }))
            .sort(
              (a, b) =>
                a.delay - b.delay ||
                a.priority - b.priority ||
                a.index - b.index
            )
            .map((e) => e.index);

          expect(executed).toEqual(expected);
          expect(sim.now).toBe(Math.max(...events.map((e) => e.delay)));
        }
      ),
      { numRuns: 200 }
    );
  });

  it('cancelling any subset of events removes exactly those events', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0, max: 50, noNaN: true }), {
          minLength: 1,
          maxLength: 40,
        }),
        fc.array(fc.boolean(), { minLength: 40, maxLength: 40 }),
        (delays, cancelMask) => {
          const sim = new Simulation();
          const executed = new Set<number>();
          const ids = delays.map((d, i) =>
            sim.schedule(d, () => executed.add(i))
          );
          const cancelled = new Set<number>();
          ids.forEach((id, i) => {
            if (cancelMask[i]) {
              expect(sim.cancel(id)).toBe(true);
              cancelled.add(i);
            }
          });
          sim.run();
          for (let i = 0; i < delays.length; i++) {
            expect(executed.has(i)).toBe(!cancelled.has(i));
          }
          // Cancelling again reports false
          ids.forEach((id) => expect(sim.cancel(id)).toBe(false));
        }
      ),
      { numRuns: 100 }
    );
  });
});
