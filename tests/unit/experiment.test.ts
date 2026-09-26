import { describe, it, expect } from 'vitest';
import {
  Experiment,
  deriveSeed,
  Simulation,
  Resource,
  Random,
  Statistics,
  timeout,
  ValidationError,
} from '../../src/index.js';

interface Mm1Params {
  servers: number;
  arrivalRate: number;
  serviceRate: number;
  customers: number;
}

/** M/M/c model returning the mean wait in queue and server utilization. */
function mmcModel(p: Mm1Params, seed: number) {
  const sim = new Simulation();
  const rng = new Random(seed);
  const stats = new Statistics(sim);
  stats.enableSampleTracking('wait');
  const server = new Resource(sim, p.servers);

  function* customer() {
    const arrived = sim.now;
    yield server.request();
    stats.recordSample('wait', sim.now - arrived);
    yield* timeout(rng.exponential(1 / p.serviceRate));
    server.release();
  }

  sim.process(function* () {
    for (let i = 0; i < p.customers; i++) {
      sim.process(customer);
      yield* timeout(rng.exponential(1 / p.arrivalRate));
    }
  });

  sim.run();
  return {
    meanWait: stats.getSampleMean('wait'),
    utilization: server.stats.utilizationRate,
  };
}

const baseParams: Mm1Params = {
  servers: 1,
  arrivalRate: 0.7,
  serviceRate: 1,
  customers: 3000,
};

describe('deriveSeed', () => {
  it('is deterministic, in range, and spreads adjacent indices apart', () => {
    const a = deriveSeed(42, 0);
    expect(deriveSeed(42, 0)).toBe(a);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(a)).toBe(true);

    const seeds = new Set<number>();
    for (let i = 0; i < 1000; i++) seeds.add(deriveSeed(42, i));
    expect(seeds.size).toBe(1000);
    expect(Math.abs(deriveSeed(42, 1) - deriveSeed(42, 0))).toBeGreaterThan(
      1000
    );
    expect(deriveSeed(43, 0)).not.toBe(deriveSeed(42, 0));
  });
});

describe('Experiment', () => {
  describe('replicate', () => {
    it('produces a confidence interval that contains the M/M/1 theoretical mean wait', () => {
      const exp = new Experiment(mmcModel);
      const rep = exp.replicate(baseParams, { replications: 20, seed: 7 });

      // Wq = rho / (mu - lambda) = 0.7 / 0.3
      const theoretical = 0.7 / 0.3;
      const ci = rep.confidenceInterval('meanWait', 0.95);

      expect(rep.n).toBe(20);
      expect(rep.metrics).toEqual(['meanWait', 'utilization']);
      expect(ci.n).toBe(20);
      expect(ci.lower).toBeLessThan(theoretical);
      expect(ci.upper).toBeGreaterThan(theoretical);
      expect(ci.halfWidth).toBeLessThan(theoretical * 0.25);
      expect(rep.mean('utilization')).toBeGreaterThan(0.6);
      expect(rep.mean('utilization')).toBeLessThan(0.8);
    });

    it('is reproducible for the same base seed and differs for another', () => {
      const exp = new Experiment(mmcModel);
      const small = { ...baseParams, customers: 300 };
      const a = exp.replicate(small, { replications: 5, seed: 99 });
      const b = exp.replicate(small, { replications: 5, seed: 99 });
      const c = exp.replicate(small, { replications: 5, seed: 100 });

      expect(a.runs).toEqual(b.runs);
      expect(a.seeds).toEqual(b.seeds);
      expect(a.runs).not.toEqual(c.runs);
    });

    it('passes derived seeds and replication indices to the model', () => {
      const calls: Array<{ seed: number; replication: number }> = [];
      const exp = new Experiment<{ x: number }, { v: number }>(
        (p, seed, replication) => {
          calls.push({ seed, replication });
          return { v: p.x * (replication + 1) };
        }
      );
      const rep = exp.replicate({ x: 2 }, { replications: 4, seed: 1 });

      expect(calls.map((c) => c.replication)).toEqual([0, 1, 2, 3]);
      expect(calls.map((c) => c.seed)).toEqual(
        [0, 1, 2, 3].map((i) => deriveSeed(1, i))
      );
      expect(rep.values('v')).toEqual([2, 4, 6, 8]);
      expect(rep.mean('v')).toBe(5);
      expect(rep.min('v')).toBe(2);
      expect(rep.max('v')).toBe(8);
      expect(rep.stdDev('v')).toBeCloseTo(Math.sqrt(20 / 3), 10);
    });

    it('reports progress', () => {
      const progress: Array<[number, number]> = [];
      const exp = new Experiment<Record<string, never>, { v: number }>(() => ({
        v: 1,
      }));
      exp.replicate(
        {},
        { replications: 3, onProgress: (d, t) => progress.push([d, t]) }
      );
      expect(progress).toEqual([
        [1, 3],
        [2, 3],
        [3, 3],
      ]);
    });

    it('builds a summary, a table and CSV', () => {
      const exp = new Experiment<{ k: number }, { a: number; b: number }>(
        (p, _seed, r) => ({ a: p.k + r, b: 10 * r })
      );
      const rep = exp.replicate({ k: 1 }, { replications: 3, seed: 5 });

      const s = rep.summary(0.9);
      expect(s.a.n).toBe(3);
      expect(s.a.mean).toBe(2);
      expect(s.a.min).toBe(1);
      expect(s.a.max).toBe(3);
      expect(s.a.ci.confidence).toBe(0.9);
      expect(s.b.mean).toBe(10);

      const table = rep.table();
      expect(table).toHaveLength(3);
      expect(table[1]).toEqual({
        replication: 1,
        seed: deriveSeed(5, 1),
        a: 2,
        b: 10,
      });

      const csv = rep.toCSV().split('\n');
      expect(csv[0]).toBe('replication,seed,a,b');
      expect(csv[1]).toBe(`0,${deriveSeed(5, 0)},1,0`);
      expect(csv).toHaveLength(4);
    });

    it('rejects a model that returns non-numeric metrics', () => {
      const exp = new Experiment<Record<string, never>, { v: number }>(() => ({
        v: NaN,
      }));
      const rep = exp.replicate({}, { replications: 2 });
      expect(() => rep.mean('v')).toThrow(ValidationError);
    });

    it('validates options', () => {
      const exp = new Experiment<Record<string, never>, { v: number }>(() => ({
        v: 1,
      }));
      expect(() => exp.replicate({}, { replications: 0 })).toThrow(
        ValidationError
      );
      expect(() => exp.replicate({}, { replications: 2.5 })).toThrow(
        ValidationError
      );
      expect(() => exp.replicate({}, { replications: 1, seed: -1 })).toThrow(
        ValidationError
      );
      expect(() => exp.replicate({}, { replications: 1, seed: 1.5 })).toThrow(
        ValidationError
      );
      expect(() =>
        exp.replicate({}, { replications: 1 }).confidenceInterval('v', 1)
      ).toThrow(ValidationError);
      // @ts-expect-error model must be a function
      expect(() => new Experiment('nope')).toThrow(ValidationError);
    });
  });

  describe('sweep', () => {
    it('enumerates the full factorial in row-major order', () => {
      const combos = Experiment.combinations<{ a: number; b: string }>({
        a: [1, 2],
        b: ['x', 'y', 'z'],
      });
      expect(combos).toEqual([
        { a: 1, b: 'x' },
        { a: 1, b: 'y' },
        { a: 1, b: 'z' },
        { a: 2, b: 'x' },
        { a: 2, b: 'y' },
        { a: 2, b: 'z' },
      ]);
      expect(Experiment.combinations<{ a: number }>({ a: [] })).toEqual([]);
    });

    it('shows mean wait decreasing with more servers, using common random numbers', () => {
      const exp = new Experiment(mmcModel);
      const sweep = exp.sweep(
        {
          servers: [1, 2, 3],
          arrivalRate: [0.7],
          serviceRate: [1],
          customers: [1500],
        },
        { replications: 8, seed: 3 }
      );

      expect(sweep.scenarios).toHaveLength(3);
      const rows = sweep.compare('meanWait');
      expect(rows.map((r) => r.params.servers)).toEqual([1, 2, 3]);
      expect(rows[0]!.mean).toBeGreaterThan(rows[1]!.mean);
      expect(rows[1]!.mean).toBeGreaterThan(rows[2]!.mean);
      expect(rows[0]!.n).toBe(8);
      expect(rows[0]!.lower).toBeLessThan(rows[0]!.mean);
      expect(rows[0]!.upper).toBeGreaterThan(rows[0]!.mean);

      // Common random numbers: same seeds in every scenario
      expect(sweep.scenarios[1]!.seeds).toEqual(sweep.scenarios[0]!.seeds);

      expect(sweep.best('meanWait').params.servers).toBe(3);
      expect(sweep.best('utilization', 'max').params.servers).toBe(1);
    });

    it('reports overall progress and exports CSV with parameter columns', () => {
      const progress: number[] = [];
      const exp = new Experiment<{ a: number; b: number }, { v: number }>(
        (p, _s, r) => ({ v: p.a * 10 + p.b + r })
      );
      const sweep = exp.sweep(
        { a: [1, 2], b: [0, 5] },
        { replications: 2, seed: 9, onProgress: (d) => progress.push(d) }
      );
      expect(progress).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

      const csv = sweep.toCSV().split('\n');
      expect(csv[0]).toBe('a,b,replication,seed,v');
      expect(csv).toHaveLength(9);
      expect(csv[1]).toBe(`1,0,0,${deriveSeed(9, 0)},10`);
      expect(csv[8]).toBe(`2,5,1,${deriveSeed(9, 1)},26`);
    });

    it('rejects an empty parameter space', () => {
      const exp = new Experiment<{ a: number }, { v: number }>(() => ({
        v: 1,
      }));
      expect(() => exp.sweep({ a: [] }, { replications: 1 })).toThrow(
        ValidationError
      );
    });
  });

  it('run() executes the model once with the given seed', () => {
    const exp = new Experiment<{ x: number }, { v: number }>((p, seed, r) => ({
      v: p.x + seed + r,
    }));
    expect(exp.run({ x: 1 }, 10)).toEqual({ v: 11 });
    expect(exp.run({ x: 1 }, 10, 5)).toEqual({ v: 16 });
  });
});
