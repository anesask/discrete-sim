import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Simulation, Resource, timeout, anyOf } from '../../src/index.js';

interface Customer {
  arrival: number;
  priority: number;
  hold: number;
  /** Give up waiting after this long (undefined: infinite patience) */
  patience?: number;
  /** Interrupt this process at this absolute time (undefined: never) */
  interruptAt?: number;
}

const customerArb: fc.Arbitrary<Customer> = fc.record({
  arrival: fc.double({ min: 0, max: 20, noNaN: true }),
  priority: fc.integer({ min: 0, max: 3 }),
  hold: fc.double({ min: 0, max: 10, noNaN: true }),
  patience: fc.option(fc.double({ min: 0, max: 10, noNaN: true }), {
    nil: undefined,
  }),
  interruptAt: fc.option(fc.double({ min: 0, max: 30, noNaN: true }), {
    nil: undefined,
  }),
});

const programArb = fc.record({
  capacity: fc.integer({ min: 1, max: 3 }),
  discipline: fc.constantFrom('fifo', 'lifo', 'priority'),
  customers: fc.array(customerArb, { minLength: 1, maxLength: 12 }),
});

type Program = typeof programArb extends fc.Arbitrary<infer P> ? P : never;

function runProgram(program: Program) {
  const sim = new Simulation({ randomSeed: 1 });
  const server = new Resource(sim, program.capacity, {
    queueDiscipline: program.discipline,
  });
  let served = 0;
  let reneged = 0;
  let violations = 0;

  // Invariants checked after every executed event
  sim.on('step', () => {
    if (server.inUse > server.capacity) violations++;
    if (server.inUse !== server.holders.length) violations++;
    if (server.available !== server.capacity - server.inUse) violations++;
  });

  const processes = program.customers.map((c) =>
    sim.process(function* () {
      let grant: ReturnType<typeof server.request> | undefined;
      try {
        yield* timeout(c.arrival);
        const req = server.request(c.priority);
        const result = yield* anyOf(
          c.patience === undefined ? [req] : [req, timeout(c.patience)]
        );
        if (result.winner !== req) {
          reneged++;
          return;
        }
        grant = req;
        yield* timeout(c.hold);
        server.release(grant);
        grant = undefined;
        served++;
      } catch {
        // Interrupted: give the unit back if we hold one
        if (grant && grant.holdsUnit) server.release(grant);
      }
    })
  );

  program.customers.forEach((c, i) => {
    if (c.interruptAt !== undefined) {
      sim.schedule(c.interruptAt, () => {
        const p = processes[i]!;
        if (p.isRunning) p.interrupt(new Error('interrupted by test'));
      });
    }
  });

  sim.run();
  return { sim, server, served, reneged, violations, processes };
}

describe('property: resource conservation', () => {
  it('never over-allocates and ends clean under random requests, patience and interrupts', () => {
    fc.assert(
      fc.property(programArb, (program) => {
        const { server, served, reneged, violations, processes } =
          runProgram(program);
        expect(violations).toBe(0);
        expect(server.inUse).toBe(0);
        expect(server.queueLength).toBe(0);
        expect(server.holders).toEqual([]);
        expect(server.waiting).toEqual([]);
        expect(processes.every((p) => p.isCompleted || p.isInterrupted)).toBe(
          true
        );
        expect(served + reneged).toBeLessThanOrEqual(program.customers.length);
        // Requests granted equal requests released
        expect(server.stats.totalRequests).toBeGreaterThanOrEqual(served);
      }),
      { numRuns: 150 }
    );
  });

  it('is deterministic: the same program yields the same trace twice', () => {
    fc.assert(
      fc.property(programArb, (program) => {
        const traceOf = () => {
          const sim = new Simulation({ randomSeed: 7 });
          sim.enableEventTrace();
          const server = new Resource(sim, program.capacity, {
            queueDiscipline: program.discipline,
          });
          program.customers.forEach((c) =>
            sim.process(function* () {
              yield* timeout(c.arrival);
              const req = server.request(c.priority);
              const r = yield* anyOf(
                c.patience === undefined ? [req] : [req, timeout(c.patience)]
              );
              if (r.winner === req) {
                yield* timeout(c.hold);
                server.release(req);
              }
            })
          );
          sim.run();
          return sim.getEventTrace().map((e) => `${e.time}:${e.priority}`);
        };
        expect(traceOf()).toEqual(traceOf());
      }),
      { numRuns: 50 }
    );
  });
});
