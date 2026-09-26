import { describe, it, expect, beforeEach } from 'vitest';
import {
  Simulation,
  Statistics,
  Random,
  ValidationError,
} from '../../src/index.js';
import {
  studentTCritical,
  studentTQuantile,
  studentTCdf,
  normalQuantile,
  regularizedIncompleteBeta,
} from '../../src/statistics/distributions.js';

describe('Student t helpers', () => {
  it.each([
    // [df, confidence, two-sided critical value from standard tables]
    [1, 0.95, 12.7062],
    [2, 0.95, 4.302653],
    [5, 0.95, 2.570582],
    [9, 0.95, 2.262157],
    [29, 0.95, 2.04523],
    [30, 0.99, 2.749996],
    [100, 0.9, 1.660234],
    [1000, 0.95, 1.962339],
  ])('critical value for df=%p, confidence=%p', (df, confidence, expected) => {
    expect(studentTCritical(confidence, df)).toBeCloseTo(expected, 4);
  });

  it('approaches the normal quantile for large df', () => {
    expect(studentTCritical(0.95, 1e7)).toBeCloseTo(1.959964, 5);
    expect(normalQuantile(0.975)).toBeCloseTo(1.959964, 6);
    expect(normalQuantile(0.5)).toBeCloseTo(0, 9);
    expect(normalQuantile(0.001)).toBeCloseTo(-3.090232, 5);
  });

  it('quantile inverts the CDF and is antisymmetric', () => {
    for (const df of [1, 3, 10, 50]) {
      for (const p of [0.6, 0.9, 0.975, 0.999]) {
        const t = studentTQuantile(p, df);
        expect(studentTCdf(t, df)).toBeCloseTo(p, 8);
        expect(studentTQuantile(1 - p, df)).toBeCloseTo(-t, 8);
      }
    }
    expect(studentTQuantile(0.5, 7)).toBe(0);
  });

  it('regularized incomplete beta matches known values', () => {
    expect(regularizedIncompleteBeta(0.5, 1, 1)).toBeCloseTo(0.5, 12);
    expect(regularizedIncompleteBeta(0.5, 2, 2)).toBeCloseTo(0.5, 12);
    expect(regularizedIncompleteBeta(0.2, 2, 3)).toBeCloseTo(0.1808, 4);
    expect(regularizedIncompleteBeta(0, 2, 3)).toBe(0);
    expect(regularizedIncompleteBeta(1, 2, 3)).toBe(1);
  });
});

describe('Statistics confidence intervals', () => {
  let sim: Simulation;
  let stats: Statistics;

  beforeEach(() => {
    sim = new Simulation();
    stats = new Statistics(sim);
  });

  describe('getConfidenceInterval', () => {
    it('matches a hand-computed t interval for n = 10', () => {
      // Sample: mean 5.5, sample sd = sqrt(82.5 / 9) = 3.02765
      // 95% t(9) = 2.262157 -> half width = 2.262157 * 3.02765 / sqrt(10) = 2.16585
      stats.enableSampleTracking('x');
      for (let v = 1; v <= 10; v++) stats.recordSample('x', v);

      const ci = stats.getConfidenceInterval('x', 0.95);
      expect(ci.n).toBe(10);
      expect(ci.confidence).toBe(0.95);
      expect(ci.mean).toBeCloseTo(5.5, 10);
      expect(ci.stdError).toBeCloseTo(3.02765 / Math.sqrt(10), 4);
      expect(ci.halfWidth).toBeCloseTo(2.16585, 4);
      expect(ci.lower).toBeCloseTo(5.5 - 2.16585, 4);
      expect(ci.upper).toBeCloseTo(5.5 + 2.16585, 4);
    });

    it('is wider at higher confidence', () => {
      stats.enableSampleTracking('x');
      const rng = new Random(1);
      for (let i = 0; i < 200; i++) stats.recordSample('x', rng.normal(10, 2));
      const ci90 = stats.getConfidenceInterval('x', 0.9);
      const ci99 = stats.getConfidenceInterval('x', 0.99);
      expect(ci99.halfWidth).toBeGreaterThan(ci90.halfWidth);
      expect(ci90.mean).toBe(ci99.mean);
    });

    it('covers the true mean about 95% of the time', () => {
      const rng = new Random(2026);
      const trueMean = 50;
      let covered = 0;
      const trials = 400;
      for (let t = 0; t < trials; t++) {
        const s = new Statistics(sim);
        s.enableSampleTracking('x');
        for (let i = 0; i < 15; i++)
          s.recordSample('x', rng.normal(trueMean, 8));
        const ci = s.getConfidenceInterval('x', 0.95);
        if (ci.lower <= trueMean && trueMean <= ci.upper) covered++;
      }
      const coverage = covered / trials;
      expect(coverage).toBeGreaterThan(0.91);
      expect(coverage).toBeLessThan(0.99);
    });

    it('is unbounded with fewer than two samples', () => {
      stats.enableSampleTracking('x');
      let ci = stats.getConfidenceInterval('x');
      expect(ci.n).toBe(0);
      expect(ci.halfWidth).toBe(Infinity);
      expect(ci.lower).toBe(-Infinity);
      expect(ci.upper).toBe(Infinity);

      stats.recordSample('x', 4);
      ci = stats.getConfidenceInterval('x');
      expect(ci.n).toBe(1);
      expect(ci.mean).toBe(4);
      expect(ci.halfWidth).toBe(Infinity);
    });

    it('has zero width when all samples are identical', () => {
      stats.enableSampleTracking('x');
      for (let i = 0; i < 5; i++) stats.recordSample('x', 7);
      const ci = stats.getConfidenceInterval('x');
      expect(ci.halfWidth).toBe(0);
      expect(ci.lower).toBe(7);
      expect(ci.upper).toBe(7);
    });

    it('validates the confidence level', () => {
      stats.enableSampleTracking('x');
      expect(() => stats.getConfidenceInterval('x', 0)).toThrow(
        ValidationError
      );
      expect(() => stats.getConfidenceInterval('x', 1)).toThrow(
        ValidationError
      );
      expect(() => stats.getConfidenceInterval('x', 95)).toThrow(
        ValidationError
      );
      expect(() => stats.getConfidenceInterval('x', NaN)).toThrow(
        ValidationError
      );
    });
  });

  describe('getPercentiles', () => {
    it('returns the same values as repeated getPercentile calls', () => {
      stats.enableSampleTracking('x');
      const rng = new Random(3);
      for (let i = 0; i < 1000; i++)
        stats.recordSample('x', rng.exponential(4));
      const many = stats.getPercentiles('x', [0, 50, 90, 95, 99, 100]);
      for (const p of [0, 50, 90, 95, 99, 100]) {
        expect(many[p]).toBe(stats.getPercentile('x', p));
      }
    });

    it('returns zeros for an unknown metric and validates percentiles', () => {
      expect(stats.getPercentiles('nope', [50, 95])).toEqual({ 50: 0, 95: 0 });
      stats.enableSampleTracking('x');
      stats.recordSample('x', 1);
      expect(() => stats.getPercentiles('x', [50, 101])).toThrow(
        ValidationError
      );
    });
  });

  describe('getBatchMeansCI', () => {
    it('produces a wider interval than the naive one for positively autocorrelated data', () => {
      // AR(1) process with strong positive autocorrelation
      stats.enableSampleTracking('x');
      const rng = new Random(11);
      let x = 0;
      for (let i = 0; i < 4000; i++) {
        x = 0.9 * x + rng.normal(0, 1);
        stats.recordSample('x', x + 10);
      }
      const naive = stats.getConfidenceInterval('x');
      const batched = stats.getBatchMeansCI('x', { batches: 20 });

      expect(batched.batches).toBe(20);
      expect(batched.batchSize).toBe(200);
      expect(batched.n).toBe(4000);
      expect(batched.batchMeans).toHaveLength(20);
      expect(batched.mean).toBeCloseTo(naive.mean, 8);
      expect(batched.halfWidth).toBeGreaterThan(naive.halfWidth * 2);
    });

    it('agrees with the naive interval for independent data', () => {
      stats.enableSampleTracking('x');
      const rng = new Random(12);
      for (let i = 0; i < 20000; i++) stats.recordSample('x', rng.normal(5, 1));
      const naive = stats.getConfidenceInterval('x');
      const batched = stats.getBatchMeansCI('x', { batches: 40 });
      // Same order of magnitude; batching loses some degrees of freedom
      expect(batched.halfWidth).toBeGreaterThan(naive.halfWidth * 0.6);
      expect(batched.halfWidth).toBeLessThan(naive.halfWidth * 1.8);
    });

    it('drops the remainder that does not fill a batch', () => {
      stats.enableSampleTracking('x');
      for (let i = 1; i <= 23; i++) stats.recordSample('x', i);
      const r = stats.getBatchMeansCI('x', { batches: 4 });
      expect(r.batchSize).toBe(5);
      expect(r.n).toBe(20);
      expect(r.batchMeans).toEqual([3, 8, 13, 18]);
    });

    it('validates inputs', () => {
      stats.enableSampleTracking('x');
      for (let i = 0; i < 5; i++) stats.recordSample('x', i);
      expect(() => stats.getBatchMeansCI('x', { batches: 10 })).toThrow(
        /Not enough samples/
      );
      expect(() => stats.getBatchMeansCI('x', { batches: 1 })).toThrow(
        ValidationError
      );
      expect(() => stats.getBatchMeansCI('x', { batches: 2.5 })).toThrow(
        ValidationError
      );
      expect(() => stats.getBatchMeansCI('x', { confidence: 1.5 })).toThrow(
        ValidationError
      );
    });
  });

  describe('getSummary', () => {
    it('collects count, moments, extremes, percentiles and the interval', () => {
      stats.enableSampleTracking('x');
      for (let v = 1; v <= 100; v++) stats.recordSample('x', v);
      const s = stats.getSummary('x', 0.9);
      expect(s.n).toBe(100);
      expect(s.mean).toBeCloseTo(50.5, 10);
      expect(s.min).toBe(1);
      expect(s.max).toBe(100);
      expect(s.p50).toBeCloseTo(50.5, 10);
      expect(s.p95).toBeCloseTo(stats.getPercentile('x', 95), 10);
      expect(s.p99).toBeCloseTo(stats.getPercentile('x', 99), 10);
      expect(s.stdDev).toBeCloseTo(stats.getStdDev('x'), 10);
      expect(s.variance).toBeCloseTo(stats.getVariance('x'), 10);
      expect(s.ci.confidence).toBe(0.9);
      expect(s.ci).toEqual(stats.getConfidenceInterval('x', 0.9));
    });

    it('is safe on an empty metric', () => {
      const s = stats.getSummary('nothing');
      expect(s.n).toBe(0);
      expect(s.mean).toBe(0);
      expect(s.ci.halfWidth).toBe(Infinity);
    });
  });
});
