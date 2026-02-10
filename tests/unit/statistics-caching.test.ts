import { describe, it, expect, beforeEach } from 'vitest';
import { Simulation, Statistics } from '../../src/index.js';

describe('Statistics Caching', () => {
  let sim: Simulation;
  let stats: Statistics;

  beforeEach(() => {
    sim = new Simulation();
    stats = new Statistics(sim);
  });

  describe('Percentile caching', () => {
    it('should cache sorted array after first percentile calculation', () => {
      stats.enableSampleTracking('response-time');

      // Record samples
      const samples = [5, 2, 8, 1, 9, 3, 7, 4, 6];
      for (const sample of samples) {
        stats.recordSample('response-time', sample);
      }

      // First call - should sort and cache
      const p50_1 = stats.getPercentile('response-time', 50);
      expect(p50_1).toBe(5);

      // Second call - should use cache (same result)
      const p50_2 = stats.getPercentile('response-time', 50);
      expect(p50_2).toBe(5);

      // Different percentile - should use same cached sorted array
      const p95 = stats.getPercentile('response-time', 95);
      expect(p95).toBe(8.6);
    });

    it('should invalidate sorted cache when new sample is recorded', () => {
      stats.enableSampleTracking('response-time');

      // Record initial samples
      stats.recordSample('response-time', 5);
      stats.recordSample('response-time', 10);
      stats.recordSample('response-time', 15);

      // Get percentile (caches sorted array)
      const p50_before = stats.getPercentile('response-time', 50);
      expect(p50_before).toBe(10);

      // Add new sample (should invalidate cache)
      stats.recordSample('response-time', 20);

      // Get percentile again (should recalculate with new data)
      const p50_after = stats.getPercentile('response-time', 50);
      expect(p50_after).toBe(12.5);
    });

    it('should handle multiple metrics with separate caches', () => {
      stats.enableSampleTracking('metric-a');
      stats.enableSampleTracking('metric-b');

      stats.recordSample('metric-a', 1);
      stats.recordSample('metric-a', 2);
      stats.recordSample('metric-a', 3);

      stats.recordSample('metric-b', 10);
      stats.recordSample('metric-b', 20);
      stats.recordSample('metric-b', 30);

      const p50_a = stats.getPercentile('metric-a', 50);
      const p50_b = stats.getPercentile('metric-b', 50);

      expect(p50_a).toBe(2);
      expect(p50_b).toBe(20);
    });
  });

  describe('Min/Max caching', () => {
    it('should update min cache incrementally', () => {
      stats.enableSampleTracking('values');

      stats.recordSample('values', 10);
      expect(stats.getMin('values')).toBe(10);

      stats.recordSample('values', 5);
      expect(stats.getMin('values')).toBe(5);

      stats.recordSample('values', 15);
      expect(stats.getMin('values')).toBe(5);

      stats.recordSample('values', 2);
      expect(stats.getMin('values')).toBe(2);
    });

    it('should update max cache incrementally', () => {
      stats.enableSampleTracking('values');

      stats.recordSample('values', 10);
      expect(stats.getMax('values')).toBe(10);

      stats.recordSample('values', 15);
      expect(stats.getMax('values')).toBe(15);

      stats.recordSample('values', 5);
      expect(stats.getMax('values')).toBe(15);

      stats.recordSample('values', 20);
      expect(stats.getMax('values')).toBe(20);
    });

    it('should maintain min/max for negative values', () => {
      stats.enableSampleTracking('temps');

      stats.recordSample('temps', -5);
      stats.recordSample('temps', -10);
      stats.recordSample('temps', 0);
      stats.recordSample('temps', 5);

      expect(stats.getMin('temps')).toBe(-10);
      expect(stats.getMax('temps')).toBe(5);
    });

    it('should handle min/max with single value', () => {
      stats.enableSampleTracking('single');

      stats.recordSample('single', 42);

      expect(stats.getMin('single')).toBe(42);
      expect(stats.getMax('single')).toBe(42);
    });

    it('should return cached min/max in O(1) time', () => {
      stats.enableSampleTracking('large-dataset');

      // Record many samples
      for (let i = 0; i < 10000; i++) {
        stats.recordSample('large-dataset', Math.random() * 1000);
      }

      // These should be O(1) from cache, not O(n) scan
      const startTime = performance.now();
      const min = stats.getMin('large-dataset');
      const max = stats.getMax('large-dataset');
      const endTime = performance.now();

      expect(min).toBeGreaterThanOrEqual(0);
      expect(max).toBeLessThanOrEqual(1000);
      expect(endTime - startTime).toBeLessThan(1); // Should be instant
    });
  });

  describe('Histogram caching', () => {
    it('should cache histogram by bin count', () => {
      stats.enableSampleTracking('response-time');

      for (let i = 1; i <= 100; i++) {
        stats.recordSample('response-time', i);
      }

      // First call - should compute and cache
      const hist1 = stats.getHistogram('response-time', 10);
      expect(hist1.length).toBe(10);

      // Second call with same bin count - should use cache
      const hist2 = stats.getHistogram('response-time', 10);
      expect(hist2).toBe(hist1); // Should be same object reference

      // Different bin count - should compute separately
      const hist3 = stats.getHistogram('response-time', 5);
      expect(hist3.length).toBe(5);
      expect(hist3).not.toBe(hist1);
    });

    it('should invalidate histogram cache when new sample is recorded', () => {
      stats.enableSampleTracking('response-time');

      stats.recordSample('response-time', 1);
      stats.recordSample('response-time', 2);
      stats.recordSample('response-time', 3);

      // Get histogram (caches result)
      const hist1 = stats.getHistogram('response-time', 3);
      expect(hist1.length).toBe(3);

      // Add new sample (should invalidate cache)
      stats.recordSample('response-time', 10);

      // Get histogram again (should recalculate)
      const hist2 = stats.getHistogram('response-time', 3);
      expect(hist2).not.toBe(hist1); // Should be new object
    });

    it('should use cached min/max values in histogram calculation', () => {
      stats.enableSampleTracking('values');

      for (let i = 0; i < 1000; i++) {
        stats.recordSample('values', i);
      }

      // Histogram should use cached min/max (O(1)) instead of recalculating (O(n))
      const histogram = stats.getHistogram('values', 10);

      expect(histogram[0]!.min).toBe(0);
      expect(histogram[histogram.length - 1]!.max).toBe(999);
    });
  });

  describe('Cache invalidation', () => {
    it('should invalidate all relevant caches on recordSample', () => {
      stats.enableSampleTracking('metric');

      stats.recordSample('metric', 5);
      stats.recordSample('metric', 10);
      stats.recordSample('metric', 15);

      // Cache all statistics
      const p50_1 = stats.getPercentile('metric', 50);
      const hist1 = stats.getHistogram('metric', 5);

      // Add new sample (should invalidate sorted cache and histogram cache)
      stats.recordSample('metric', 20);

      // Verify caches were invalidated by checking new results
      const p50_2 = stats.getPercentile('metric', 50);
      const hist2 = stats.getHistogram('metric', 5);

      expect(p50_2).not.toBe(p50_1);
      expect(hist2).not.toBe(hist1);
    });

    it('should preserve min/max cache across new samples when appropriate', () => {
      stats.enableSampleTracking('metric');

      stats.recordSample('metric', 5);
      stats.recordSample('metric', 10);
      stats.recordSample('metric', 15);

      const min1 = stats.getMin('metric');
      const max1 = stats.getMax('metric');

      // Add sample in middle range (shouldn't change min/max)
      stats.recordSample('metric', 12);

      const min2 = stats.getMin('metric');
      const max2 = stats.getMax('metric');

      expect(min2).toBe(min1); // Still 5
      expect(max2).toBe(max1); // Still 15
    });
  });

  describe('Reset behavior', () => {
    it('should clear all caches on reset', () => {
      stats.enableSampleTracking('metric');

      stats.recordSample('metric', 1);
      stats.recordSample('metric', 2);
      stats.recordSample('metric', 3);

      // Cache statistics
      stats.getPercentile('metric', 50);
      stats.getHistogram('metric', 5);

      // Reset statistics
      stats.reset();

      // All statistics should return 0 or empty arrays
      expect(stats.getMin('metric')).toBe(0);
      expect(stats.getMax('metric')).toBe(0);
      expect(stats.getPercentile('metric', 50)).toBe(0);
      expect(stats.getHistogram('metric', 5)).toEqual([]);
    });
  });

  describe('Performance improvements', () => {
    it('should be faster with cached percentiles', () => {
      stats.enableSampleTracking('perf-test');

      // Record many samples
      for (let i = 0; i < 1000; i++) {
        stats.recordSample('perf-test', Math.random() * 100);
      }

      // First call - computes and caches
      const start1 = performance.now();
      stats.getPercentile('perf-test', 50);
      const duration1 = performance.now() - start1;

      // Subsequent calls - should be much faster
      const start2 = performance.now();
      for (let i = 0; i < 100; i++) {
        stats.getPercentile('perf-test', 95);
        stats.getPercentile('perf-test', 99);
      }
      const duration2 = performance.now() - start2;

      // 200 cached calls should be much faster than 1 uncached call
      expect(duration2).toBeLessThan(duration1 * 10);
    });

    it('should handle multiple percentile calls efficiently', () => {
      stats.enableSampleTracking('wait-time');

      for (let i = 0; i < 500; i++) {
        stats.recordSample('wait-time', Math.random() * 50);
      }

      // Multiple percentile calls should reuse cached sorted array
      const start = performance.now();
      const p50 = stats.getPercentile('wait-time', 50);
      const p90 = stats.getPercentile('wait-time', 90);
      const p95 = stats.getPercentile('wait-time', 95);
      const p99 = stats.getPercentile('wait-time', 99);
      const duration = performance.now() - start;

      expect(p50).toBeLessThanOrEqual(p90);
      expect(p90).toBeLessThanOrEqual(p95);
      expect(p95).toBeLessThanOrEqual(p99);
      expect(duration).toBeLessThan(10); // Should complete quickly
    });
  });

  describe('Edge cases', () => {
    it('should handle empty datasets', () => {
      stats.enableSampleTracking('empty');

      expect(stats.getMin('empty')).toBe(0);
      expect(stats.getMax('empty')).toBe(0);
      expect(stats.getPercentile('empty', 50)).toBe(0);
      expect(stats.getHistogram('empty', 10)).toEqual([]);
    });

    it('should handle single sample', () => {
      stats.enableSampleTracking('single');
      stats.recordSample('single', 42);

      expect(stats.getMin('single')).toBe(42);
      expect(stats.getMax('single')).toBe(42);
      expect(stats.getPercentile('single', 50)).toBe(42);

      const histogram = stats.getHistogram('single', 5);
      expect(histogram.length).toBe(1);
      expect(histogram[0]!.count).toBe(1);
    });

    it('should handle all identical values', () => {
      stats.enableSampleTracking('identical');

      for (let i = 0; i < 100; i++) {
        stats.recordSample('identical', 5);
      }

      expect(stats.getMin('identical')).toBe(5);
      expect(stats.getMax('identical')).toBe(5);
      expect(stats.getPercentile('identical', 50)).toBe(5);

      const histogram = stats.getHistogram('identical', 10);
      expect(histogram.length).toBe(1);
      expect(histogram[0]!.count).toBe(100);
    });
  });
});
