import { describe, it, expect, beforeEach } from 'vitest';
import { Simulation } from '../../src/core/Simulation.js';
import { Statistics } from '../../src/statistics/Statistics.js';

describe('Advanced Statistics', () => {
  let sim: Simulation;
  let stats: Statistics;

  beforeEach(() => {
    sim = new Simulation();
    stats = new Statistics(sim);
  });

  describe('Sample Tracking', () => {
    it('should enable sample tracking for a metric', () => {
      stats.enableSampleTracking('test-metric');
      stats.recordSample('test-metric', 10);
      stats.recordSample('test-metric', 20);

      expect(stats.getSampleCount('test-metric')).toBe(2);
    });

    it('should ignore samples when tracking is not enabled', () => {
      stats.recordSample('test-metric', 10);
      expect(stats.getSampleCount('test-metric')).toBe(0);
    });

    it('should disable sample tracking', () => {
      stats.enableSampleTracking('test-metric');
      stats.recordSample('test-metric', 10);
      stats.disableSampleTracking('test-metric');
      stats.recordSample('test-metric', 20);

      expect(stats.getSampleCount('test-metric')).toBe(1);
    });

    it('should return 0 for non-existent metrics', () => {
      expect(stats.getSampleCount('non-existent')).toBe(0);
    });
  });

  describe('Percentiles', () => {
    beforeEach(() => {
      stats.enableSampleTracking('wait-time');
    });

    it('should calculate P50 (median)', () => {
      const samples = [1, 2, 3, 4, 5];
      samples.forEach((s) => stats.recordSample('wait-time', s));

      expect(stats.getPercentile('wait-time', 50)).toBe(3);
    });

    it('should calculate P95', () => {
      const samples = Array.from({ length: 100 }, (_, i) => i + 1);
      samples.forEach((s) => stats.recordSample('wait-time', s));

      const p95 = stats.getPercentile('wait-time', 95);
      expect(p95).toBeCloseTo(95.05, 1);
    });

    it('should calculate P99', () => {
      const samples = Array.from({ length: 100 }, (_, i) => i + 1);
      samples.forEach((s) => stats.recordSample('wait-time', s));

      const p99 = stats.getPercentile('wait-time', 99);
      expect(p99).toBeCloseTo(99.01, 1);
    });

    it('should handle single sample', () => {
      stats.recordSample('wait-time', 42);
      expect(stats.getPercentile('wait-time', 50)).toBe(42);
      expect(stats.getPercentile('wait-time', 95)).toBe(42);
    });

    it('should handle two samples', () => {
      stats.recordSample('wait-time', 10);
      stats.recordSample('wait-time', 20);

      expect(stats.getPercentile('wait-time', 50)).toBe(15);
    });

    it('should return 0 for empty samples', () => {
      expect(stats.getPercentile('wait-time', 50)).toBe(0);
    });

    it('should handle unsorted data', () => {
      [5, 1, 9, 3, 7].forEach((s) => stats.recordSample('wait-time', s));
      expect(stats.getPercentile('wait-time', 50)).toBe(5);
    });
  });

  describe('Variance and Standard Deviation', () => {
    beforeEach(() => {
      stats.enableSampleTracking('response-time');
    });

    it('should calculate variance', () => {
      // Samples: [2, 4, 6, 8]
      // Mean: 5
      // Variance: ((2-5)^2 + (4-5)^2 + (6-5)^2 + (8-5)^2) / 4 = (9 + 1 + 1 + 9) / 4 = 5
      [2, 4, 6, 8].forEach((s) => stats.recordSample('response-time', s));

      expect(stats.getVariance('response-time')).toBe(5);
    });

    it('should calculate standard deviation', () => {
      // StdDev should be sqrt(variance)
      [2, 4, 6, 8].forEach((s) => stats.recordSample('response-time', s));

      expect(stats.getStdDev('response-time')).toBeCloseTo(Math.sqrt(5), 5);
    });

    it('should return 0 variance for single sample', () => {
      stats.recordSample('response-time', 42);
      expect(stats.getVariance('response-time')).toBe(0);
      expect(stats.getStdDev('response-time')).toBe(0);
    });

    it('should return 0 for empty samples', () => {
      expect(stats.getVariance('response-time')).toBe(0);
      expect(stats.getStdDev('response-time')).toBe(0);
    });

    it('should handle identical values', () => {
      [5, 5, 5, 5].forEach((s) => stats.recordSample('response-time', s));
      expect(stats.getVariance('response-time')).toBe(0);
      expect(stats.getStdDev('response-time')).toBe(0);
    });
  });

  describe('Min, Max, and Mean', () => {
    beforeEach(() => {
      stats.enableSampleTracking('values');
    });

    it('should calculate min', () => {
      [10, 5, 20, 3, 15].forEach((s) => stats.recordSample('values', s));
      expect(stats.getMin('values')).toBe(3);
    });

    it('should calculate max', () => {
      [10, 5, 20, 3, 15].forEach((s) => stats.recordSample('values', s));
      expect(stats.getMax('values')).toBe(20);
    });

    it('should calculate sample mean', () => {
      [2, 4, 6, 8].forEach((s) => stats.recordSample('values', s));
      expect(stats.getSampleMean('values')).toBe(5);
    });

    it('should handle negative values', () => {
      [-10, -5, 0, 5, 10].forEach((s) => stats.recordSample('values', s));
      expect(stats.getMin('values')).toBe(-10);
      expect(stats.getMax('values')).toBe(10);
      expect(stats.getSampleMean('values')).toBe(0);
    });

    it('should return 0 for empty samples', () => {
      expect(stats.getMin('values')).toBe(0);
      expect(stats.getMax('values')).toBe(0);
      expect(stats.getSampleMean('values')).toBe(0);
    });
  });

  describe('Histograms', () => {
    beforeEach(() => {
      stats.enableSampleTracking('distribution');
    });

    it('should generate histogram with default bins', () => {
      // Add 100 samples uniformly distributed from 0-100
      for (let i = 0; i < 100; i++) {
        stats.recordSample('distribution', i);
      }

      const histogram = stats.getHistogram('distribution');
      expect(histogram).toHaveLength(10); // Default 10 bins
    });

    it('should generate histogram with custom bins', () => {
      for (let i = 0; i < 50; i++) {
        stats.recordSample('distribution', i);
      }

      const histogram = stats.getHistogram('distribution', 5);
      expect(histogram).toHaveLength(5);
    });

    it('should calculate correct bin ranges', () => {
      // Samples from 0-9
      for (let i = 0; i < 10; i++) {
        stats.recordSample('distribution', i);
      }

      const histogram = stats.getHistogram('distribution', 10);

      expect(histogram[0]!.min).toBe(0);
      expect(histogram[9]!.max).toBe(9);
    });

    it('should count samples in bins correctly', () => {
      // Add 10 samples of value 5 (all the same)
      for (let i = 0; i < 10; i++) {
        stats.recordSample('distribution', 5);
      }

      const histogram = stats.getHistogram('distribution', 10);
      // When all values are the same, we get a single bin
      expect(histogram).toHaveLength(1);
      expect(histogram[0]!.count).toBe(10);
    });

    it('should calculate frequencies correctly', () => {
      for (let i = 0; i < 100; i++) {
        stats.recordSample('distribution', i);
      }

      const histogram = stats.getHistogram('distribution', 10);
      const totalFrequency = histogram.reduce((sum, bin) => sum + bin.frequency, 0);
      expect(totalFrequency).toBeCloseTo(1.0, 5);
    });

    it('should handle edge case with single value', () => {
      stats.recordSample('distribution', 42);

      const histogram = stats.getHistogram('distribution', 10);
      // Single value = range of 0, returns single bin
      expect(histogram).toHaveLength(1);
      expect(histogram[0]!.count).toBe(1);
      expect(histogram[0]!.min).toBe(42);
      expect(histogram[0]!.max).toBe(42);
    });

    it('should return empty array for no samples', () => {
      const histogram = stats.getHistogram('distribution');
      expect(histogram).toEqual([]);
    });

    it('should handle values at max edge', () => {
      [0, 10].forEach((s) => stats.recordSample('distribution', s));

      const histogram = stats.getHistogram('distribution', 2);
      expect(histogram[0]!.count).toBe(1);
      expect(histogram[1]!.count).toBe(1);
    });
  });

  describe('JSON Export', () => {
    it('should include sample statistics in JSON export', () => {
      stats.enableSampleTracking('wait-time');
      [1, 2, 3, 4, 5].forEach((s) => stats.recordSample('wait-time', s));

      const json = stats.toJSON() as Record<string, unknown>;

      expect(json).toHaveProperty('samples');
      const samples = json.samples as Record<string, unknown>;
      expect(samples).toHaveProperty('wait-time');

      const waitTimeStats = samples['wait-time'] as Record<string, unknown>;
      expect(waitTimeStats.count).toBe(5);
      expect(waitTimeStats.mean).toBe(3);
      expect(waitTimeStats.min).toBe(1);
      expect(waitTimeStats.max).toBe(5);
      expect(waitTimeStats.p50).toBe(3);
    });

    it('should not include samples section if no samples tracked', () => {
      const json = stats.toJSON() as Record<string, unknown>;
      const samples = json.samples as Record<string, unknown>;
      expect(Object.keys(samples)).toHaveLength(0);
    });
  });

  describe('CSV Export', () => {
    it('should include sample statistics in CSV export', () => {
      stats.enableSampleTracking('wait-time');
      [1, 2, 3, 4, 5].forEach((s) => stats.recordSample('wait-time', s));

      const csv = stats.toCSV();

      expect(csv).toContain('# Sample Statistics');
      expect(csv).toContain('Metric,Count,Mean,Min,Max,Variance,StdDev,P50,P95,P99');
      expect(csv).toContain('wait-time');
    });

    it('should not include samples section if no samples tracked', () => {
      const csv = stats.toCSV();
      expect(csv).not.toContain('# Sample Statistics');
    });
  });

  describe('Reset', () => {
    it('should clear samples but preserve tracking settings', () => {
      stats.enableSampleTracking('metric');
      stats.recordSample('metric', 10);
      stats.recordSample('metric', 20);

      expect(stats.getSampleCount('metric')).toBe(2);

      stats.reset();

      expect(stats.getSampleCount('metric')).toBe(0);

      // Should still be tracking
      stats.recordSample('metric', 30);
      expect(stats.getSampleCount('metric')).toBe(1);
    });
  });

  describe('Real-world Scenario: Queue Wait Times', () => {
    it('should track queue wait time statistics', () => {
      stats.enableSampleTracking('queue-wait');

      // Simulate 1000 customer wait times
      const waitTimes = [];
      for (let i = 0; i < 1000; i++) {
        // Exponential-like distribution
        const waitTime = Math.random() * 10;
        waitTimes.push(waitTime);
        stats.recordSample('queue-wait', waitTime);
      }

      expect(stats.getSampleCount('queue-wait')).toBe(1000);

      const mean = stats.getSampleMean('queue-wait');
      expect(mean).toBeGreaterThan(0);
      expect(mean).toBeLessThan(10);

      const p95 = stats.getPercentile('queue-wait', 95);
      expect(p95).toBeGreaterThan(mean);

      const stdDev = stats.getStdDev('queue-wait');
      expect(stdDev).toBeGreaterThan(0);

      const histogram = stats.getHistogram('queue-wait', 10);
      expect(histogram).toHaveLength(10);
    });
  });

  describe('Real-world Scenario: SLA Tracking', () => {
    it('should track P95 and P99 for SLA compliance', () => {
      stats.enableSampleTracking('response-time');

      // Simulate 10000 response times
      // Most responses are fast (95%), some medium (4%), few slow (1%)
      for (let i = 0; i < 9500; i++) {
        stats.recordSample('response-time', 0.1 + Math.random() * 0.4); // 0.1-0.5s
      }
      for (let i = 0; i < 400; i++) {
        stats.recordSample('response-time', 0.5 + Math.random() * 1.5); // 0.5-2.0s
      }
      for (let i = 0; i < 100; i++) {
        stats.recordSample('response-time', 2.0 + Math.random() * 3.0); // 2.0-5.0s
      }

      const p50 = stats.getPercentile('response-time', 50);
      const p95 = stats.getPercentile('response-time', 95);
      const p99 = stats.getPercentile('response-time', 99);

      // P50 should be in the fast range (well within first 9500 samples)
      expect(p50).toBeGreaterThanOrEqual(0.1);
      expect(p50).toBeLessThanOrEqual(0.5);

      // P95 is at the boundary (9500th sample), could be at edge of fast range or start of medium
      expect(p95).toBeGreaterThanOrEqual(0.1);
      expect(p95).toBeLessThan(2.5);

      // P99 should be in the medium range (9900th sample)
      expect(p99).toBeGreaterThanOrEqual(0.5);
      expect(p99).toBeLessThan(5.0);

      // Check that percentiles are ordered
      expect(p50).toBeLessThanOrEqual(p95);
      expect(p95).toBeLessThanOrEqual(p99);
    });
  });

  describe("Welford's Algorithm Optimization", () => {
    beforeEach(() => {
      stats.enableSampleTracking('values');
    });

    it('should calculate variance accurately with Welford algorithm', () => {
      // Test with known values
      const samples = [2, 4, 4, 4, 5, 5, 7, 9];
      samples.forEach((s) => stats.recordSample('values', s));

      // Expected: mean = 5, variance = 4
      const mean = stats.getSampleMean('values');
      const variance = stats.getVariance('values');
      const stdDev = stats.getStdDev('values');

      expect(mean).toBeCloseTo(5, 10);
      expect(variance).toBeCloseTo(4, 10);
      expect(stdDev).toBeCloseTo(2, 10);
    });

    it('should handle large datasets efficiently', () => {
      // Generate 10,000 samples
      const startTime = Date.now();

      for (let i = 0; i < 10000; i++) {
        stats.recordSample('values', Math.random() * 100);
      }

      const recordTime = Date.now() - startTime;

      // Should be fast (O(1) per sample)
      expect(recordTime).toBeLessThan(100); // 100ms for 10k samples

      // Calculations should also be fast (O(1))
      const calcStart = Date.now();
      const mean = stats.getSampleMean('values');
      const variance = stats.getVariance('values');
      const stdDev = stats.getStdDev('values');
      const count = stats.getSampleCount('values');
      const calcTime = Date.now() - calcStart;

      expect(calcTime).toBeLessThan(10); // Should be instant
      expect(count).toBe(10000);
      expect(mean).toBeGreaterThan(0);
      expect(mean).toBeLessThan(100);
      expect(variance).toBeGreaterThan(0);
      expect(stdDev).toBeGreaterThan(0);
    });

    it('should maintain numerical stability', () => {
      // Test with values that could cause numerical instability
      const largeBase = 1e9;
      const samples = [largeBase + 1, largeBase + 2, largeBase + 3];

      samples.forEach((s) => stats.recordSample('values', s));

      const mean = stats.getSampleMean('values');
      const variance = stats.getVariance('values');

      // Mean should be approximately largeBase + 2
      expect(mean).toBeCloseTo(largeBase + 2, 5);

      // Variance should be approximately 2/3 (not affected by large base)
      expect(variance).toBeCloseTo(2 / 3, 5);
    });

    it('should produce identical results to naive calculation', () => {
      const samples = [1.5, 2.3, 3.7, 4.1, 5.9, 6.2, 7.8, 8.4, 9.1];

      samples.forEach((s) => stats.recordSample('values', s));

      // Calculate expected values manually
      const naiveMean = samples.reduce((a, b) => a + b, 0) / samples.length;
      const naiveVariance =
        samples.reduce((sum, val) => sum + Math.pow(val - naiveMean, 2), 0) /
        samples.length;
      const naiveStdDev = Math.sqrt(naiveVariance);

      // Compare with Welford's algorithm results
      const welfordMean = stats.getSampleMean('values');
      const welfordVariance = stats.getVariance('values');
      const welfordStdDev = stats.getStdDev('values');

      // Should match within floating-point precision
      expect(welfordMean).toBeCloseTo(naiveMean, 12);
      expect(welfordVariance).toBeCloseTo(naiveVariance, 12);
      expect(welfordStdDev).toBeCloseTo(naiveStdDev, 12);
    });

    it('should handle incremental updates correctly', () => {
      // Add samples one by one and check consistency
      stats.recordSample('values', 10);
      expect(stats.getSampleMean('values')).toBe(10);
      expect(stats.getVariance('values')).toBe(0);

      stats.recordSample('values', 20);
      expect(stats.getSampleMean('values')).toBe(15);
      expect(stats.getVariance('values')).toBe(25);

      stats.recordSample('values', 30);
      expect(stats.getSampleMean('values')).toBe(20);
      expect(stats.getVariance('values')).toBeCloseTo(66.666666, 5);
    });
  });
});
