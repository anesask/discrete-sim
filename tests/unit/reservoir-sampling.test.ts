import { describe, it, expect } from 'vitest';
import {
  Simulation,
  Statistics,
  Random,
  ValidationError,
} from '../../src/index.js';

describe('Statistics reservoir sampling (maxSamples)', () => {
  it('keeps exact count, mean, variance, min and max while bounding stored samples', () => {
    const sim = new Simulation({ randomSeed: 5 });
    const stats = new Statistics(sim);
    stats.enableSampleTracking('x', { maxSamples: 1000 });
    const rng = new Random(11);
    let sum = 0;
    let sumSq = 0;
    let min = Infinity;
    let max = -Infinity;
    const n = 200_000;
    for (let i = 0; i < n; i++) {
      const v = rng.exponential(3);
      stats.recordSample('x', v);
      sum += v;
      sumSq += v * v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const mean = sum / n;
    expect(stats.getSampleCount('x')).toBe(n);
    expect(stats.getSampleMean('x')).toBeCloseTo(mean, 8);
    expect(stats.getVariance('x')).toBeCloseTo(sumSq / n - mean * mean, 4);
    expect(stats.getMin('x')).toBe(min);
    expect(stats.getMax('x')).toBe(max);
    expect(stats.isSampleReservoir('x')).toBe(true);
  });

  it('estimates percentiles within a few percent of the exact values', () => {
    const sim = new Simulation({ randomSeed: 7 });
    const exact = new Statistics(sim);
    const approx = new Statistics(sim);
    exact.enableSampleTracking('w');
    approx.enableSampleTracking('w', { maxSamples: 10_000 });
    const rng = new Random(2024);
    for (let i = 0; i < 300_000; i++) {
      const v = rng.exponential(1);
      exact.recordSample('w', v);
      approx.recordSample('w', v);
    }
    for (const p of [50, 90, 95, 99]) {
      const e = exact.getPercentile('w', p);
      const a = approx.getPercentile('w', p);
      expect(Math.abs(a - e) / e).toBeLessThan(p >= 99 ? 0.12 : 0.05);
    }
    const hist = approx.getHistogram('w', 10);
    expect(hist.reduce((acc, b) => acc + b.count, 0)).toBe(10_000);
  });

  it('is reproducible for the same simulation seed', () => {
    const run = (seed: number) => {
      const sim = new Simulation({ randomSeed: seed });
      const stats = new Statistics(sim);
      stats.enableSampleTracking('x', { maxSamples: 50 });
      const rng = new Random(1);
      for (let i = 0; i < 5000; i++) stats.recordSample('x', rng.uniform(0, 1));
      return stats.getPercentiles('x', [25, 50, 75]);
    };
    expect(run(3)).toEqual(run(3));
    expect(run(3)).not.toEqual(run(4));
  });

  it('behaves exactly like unbounded tracking until the limit is reached', () => {
    const sim = new Simulation();
    const stats = new Statistics(sim);
    stats.enableSampleTracking('x', { maxSamples: 100 });
    for (let v = 1; v <= 100; v++) stats.recordSample('x', v);
    expect(stats.isSampleReservoir('x')).toBe(false);
    expect(stats.getPercentile('x', 50)).toBe(50.5);
    expect(stats.getHistogram('x', 4).map((b) => b.count)).toEqual([
      25, 25, 25, 25,
    ]);
  });

  it('rejects batch means on a reservoir and validates maxSamples', () => {
    const sim = new Simulation();
    const stats = new Statistics(sim);
    expect(() => stats.enableSampleTracking('x', { maxSamples: 1 })).toThrow(
      ValidationError
    );
    expect(() => stats.enableSampleTracking('x', { maxSamples: 2.5 })).toThrow(
      ValidationError
    );
    stats.enableSampleTracking('x', { maxSamples: 10 });
    for (let i = 0; i < 100; i++) stats.recordSample('x', i);
    expect(() => stats.getBatchMeansCI('x', { batches: 2 })).toThrow(
      /reservoir/
    );
    // Re-enabling without the option lifts the limit for future samples
    stats.enableSampleTracking('x');
    expect(stats.isSampleReservoir('x')).toBe(false);
  });
});
