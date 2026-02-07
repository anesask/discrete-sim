import { describe, it, expect } from 'vitest';
import { Random } from '../../src/random/Random';

describe('Random', () => {
  describe('initialization and seeding', () => {
    it('should create random generator with default seed', () => {
      const rng = new Random();
      expect(rng).toBeDefined();
      expect(rng.getSeed()).toBeGreaterThan(0);
    });

    it('should create random generator with custom seed', () => {
      const rng = new Random(12345);
      expect(rng.getSeed()).toBe(12345);
    });

    it('should allow changing seed', () => {
      const rng = new Random(111);
      expect(rng.getSeed()).toBe(111);

      rng.setSeed(222);
      expect(rng.getSeed()).toBe(222);
    });

    it('should produce same sequence with same seed', () => {
      const rng1 = new Random(12345);
      const rng2 = new Random(12345);

      const sequence1 = Array.from({ length: 10 }, () => rng1.uniform(0, 1));
      const sequence2 = Array.from({ length: 10 }, () => rng2.uniform(0, 1));

      expect(sequence1).toEqual(sequence2);
    });

    it('should produce different sequences with different seeds', () => {
      const rng1 = new Random(111);
      const rng2 = new Random(222);

      const sequence1 = Array.from({ length: 10 }, () => rng1.uniform(0, 1));
      const sequence2 = Array.from({ length: 10 }, () => rng2.uniform(0, 1));

      expect(sequence1).not.toEqual(sequence2);
    });

    it('should restart sequence when seed is reset', () => {
      const rng = new Random(12345);
      const value1 = rng.uniform(0, 1);

      rng.setSeed(12345);
      const value2 = rng.uniform(0, 1);

      expect(value1).toBe(value2);
    });
  });

  describe('uniform distribution', () => {
    it('should generate values in range', () => {
      const rng = new Random(12345);
      for (let i = 0; i < 100; i++) {
        const value = rng.uniform(0, 1);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    });

    it('should generate values in custom range', () => {
      const rng = new Random(12345);
      for (let i = 0; i < 100; i++) {
        const value = rng.uniform(10, 20);
        expect(value).toBeGreaterThanOrEqual(10);
        expect(value).toBeLessThan(20);
      }
    });

    it('should handle negative ranges', () => {
      const rng = new Random(12345);
      for (let i = 0; i < 100; i++) {
        const value = rng.uniform(-10, -5);
        expect(value).toBeGreaterThanOrEqual(-10);
        expect(value).toBeLessThan(-5);
      }
    });

    it('should throw error if min >= max', () => {
      const rng = new Random();
      expect(() => rng.uniform(5, 5)).toThrow('min must be less than max');
      expect(() => rng.uniform(10, 5)).toThrow('min must be less than max');
    });

    it('should have approximately uniform distribution', () => {
      const rng = new Random(12345);
      const n = 10000;
      const bins = 10;
      const counts = new Array(bins).fill(0);

      for (let i = 0; i < n; i++) {
        const value = rng.uniform(0, bins);
        const bin = Math.floor(value);
        counts[bin]++;
      }

      // Each bin should have approximately n/bins values
      const expected = n / bins;
      const tolerance = expected * 0.1; // 10% tolerance

      for (const count of counts) {
        expect(count).toBeGreaterThan(expected - tolerance);
        expect(count).toBeLessThan(expected + tolerance);
      }
    });
  });

  describe('exponential distribution', () => {
    it('should generate positive values', () => {
      const rng = new Random(12345);
      for (let i = 0; i < 100; i++) {
        const value = rng.exponential(5);
        expect(value).toBeGreaterThan(0);
      }
    });

    it('should throw error for non-positive mean', () => {
      const rng = new Random();
      expect(() => rng.exponential(0)).toThrow('mean must be positive');
      expect(() => rng.exponential(-5)).toThrow('mean must be positive');
    });

    it('should have approximately correct mean', () => {
      const rng = new Random(12345);
      const mean = 10;
      const n = 10000;

      let sum = 0;
      for (let i = 0; i < n; i++) {
        sum += rng.exponential(mean);
      }

      const sampleMean = sum / n;
      // Sample mean should be within 5% of theoretical mean
      expect(sampleMean).toBeGreaterThan(mean * 0.95);
      expect(sampleMean).toBeLessThan(mean * 1.05);
    });

    it('should match exponential distribution properties', () => {
      const rng = new Random(12345);
      const mean = 5;
      const n = 10000;
      const values: number[] = [];

      for (let i = 0; i < n; i++) {
        values.push(rng.exponential(mean));
      }

      // About 63.2% of values should be less than the mean
      const lessThanMean = values.filter((v) => v < mean).length;
      const proportion = lessThanMean / n;

      expect(proportion).toBeGreaterThan(0.60);
      expect(proportion).toBeLessThan(0.66);
    });
  });

  describe('normal distribution', () => {
    it('should generate values around mean', () => {
      const rng = new Random(12345);
      const mean = 100;
      const stdDev = 15;

      const values = Array.from({ length: 100 }, () => rng.normal(mean, stdDev));

      // At least some values should be both above and below the mean
      const above = values.filter((v) => v > mean).length;
      const below = values.filter((v) => v < mean).length;

      expect(above).toBeGreaterThan(0);
      expect(below).toBeGreaterThan(0);
    });

    it('should throw error for negative stdDev', () => {
      const rng = new Random();
      expect(() => rng.normal(0, -1)).toThrow('stdDev must be non-negative');
    });

    it('should return mean when stdDev is zero', () => {
      const rng = new Random(12345);
      for (let i = 0; i < 10; i++) {
        expect(rng.normal(42, 0)).toBe(42);
      }
    });

    it('should have approximately correct mean', () => {
      const rng = new Random(12345);
      const mean = 100;
      const stdDev = 15;
      const n = 10000;

      let sum = 0;
      for (let i = 0; i < n; i++) {
        sum += rng.normal(mean, stdDev);
      }

      const sampleMean = sum / n;
      // Sample mean should be within 5% of theoretical mean
      expect(sampleMean).toBeGreaterThan(mean * 0.95);
      expect(sampleMean).toBeLessThan(mean * 1.05);
    });

    it('should have approximately correct standard deviation', () => {
      const rng = new Random(12345);
      const mean = 100;
      const stdDev = 15;
      const n = 10000;

      const values: number[] = [];
      for (let i = 0; i < n; i++) {
        values.push(rng.normal(mean, stdDev));
      }

      const sampleMean = values.reduce((a, b) => a + b, 0) / n;
      const variance =
        values.reduce((sum, v) => sum + (v - sampleMean) ** 2, 0) / (n - 1);
      const sampleStdDev = Math.sqrt(variance);

      // Sample stdDev should be within 10% of theoretical stdDev
      expect(sampleStdDev).toBeGreaterThan(stdDev * 0.9);
      expect(sampleStdDev).toBeLessThan(stdDev * 1.1);
    });

    it('should follow 68-95-99.7 rule approximately', () => {
      const rng = new Random(12345);
      const mean = 0;
      const stdDev = 1;
      const n = 10000;

      const values = Array.from({ length: n }, () => rng.normal(mean, stdDev));

      // ~68% within 1 stdDev
      const within1 = values.filter((v) => Math.abs(v) <= 1).length / n;
      expect(within1).toBeGreaterThan(0.65);
      expect(within1).toBeLessThan(0.71);

      // ~95% within 2 stdDev
      const within2 = values.filter((v) => Math.abs(v) <= 2).length / n;
      expect(within2).toBeGreaterThan(0.93);
      expect(within2).toBeLessThan(0.97);
    });
  });

  describe('randint', () => {
    it('should generate integers in range', () => {
      const rng = new Random(12345);
      for (let i = 0; i < 100; i++) {
        const value = rng.randint(1, 6);
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(6);
        expect(Number.isInteger(value)).toBe(true);
      }
    });

    it('should handle single value range', () => {
      const rng = new Random(12345);
      for (let i = 0; i < 10; i++) {
        expect(rng.randint(5, 5)).toBe(5);
      }
    });

    it('should handle negative ranges', () => {
      const rng = new Random(12345);
      for (let i = 0; i < 100; i++) {
        const value = rng.randint(-10, -5);
        expect(value).toBeGreaterThanOrEqual(-10);
        expect(value).toBeLessThanOrEqual(-5);
      }
    });

    it('should throw error if min > max', () => {
      const rng = new Random();
      expect(() => rng.randint(10, 5)).toThrow(
        'min must be less than or equal to max'
      );
    });

    it('should have approximately uniform distribution', () => {
      const rng = new Random(12345);
      const min = 1;
      const max = 6;
      const n = 6000;
      const counts = new Map<number, number>();

      for (let i = 0; i < n; i++) {
        const value = rng.randint(min, max);
        counts.set(value, (counts.get(value) || 0) + 1);
      }

      // Each value should appear approximately n/(max-min+1) times
      const expected = n / (max - min + 1);
      const tolerance = expected * 0.1; // 10% tolerance

      for (let i = min; i <= max; i++) {
        const count = counts.get(i) || 0;
        expect(count).toBeGreaterThan(expected - tolerance);
        expect(count).toBeLessThan(expected + tolerance);
      }
    });
  });

  describe('choice', () => {
    it('should choose element from array', () => {
      const rng = new Random(12345);
      const array = ['a', 'b', 'c', 'd', 'e'];

      for (let i = 0; i < 50; i++) {
        const element = rng.choice(array);
        expect(array).toContain(element);
      }
    });

    it('should throw error for empty array', () => {
      const rng = new Random();
      expect(() => rng.choice([])).toThrow('Cannot choose from empty array');
    });

    it('should handle single element array', () => {
      const rng = new Random(12345);
      const array = ['only'];

      for (let i = 0; i < 10; i++) {
        expect(rng.choice(array)).toBe('only');
      }
    });

    it('should have approximately uniform distribution', () => {
      const rng = new Random(12345);
      const array = ['a', 'b', 'c', 'd', 'e'];
      const n = 5000;
      const counts = new Map<string, number>();

      for (let i = 0; i < n; i++) {
        const element = rng.choice(array);
        counts.set(element, (counts.get(element) || 0) + 1);
      }

      const expected = n / array.length;
      const tolerance = expected * 0.1;

      for (const element of array) {
        const count = counts.get(element) || 0;
        expect(count).toBeGreaterThan(expected - tolerance);
        expect(count).toBeLessThan(expected + tolerance);
      }
    });
  });

  describe('shuffle', () => {
    it('should shuffle array in place', () => {
      const rng = new Random(12345);
      const array = [1, 2, 3, 4, 5];
      const original = [...array];

      const result = rng.shuffle(array);

      // Should return same array reference
      expect(result).toBe(array);

      // Should contain same elements
      expect(array.sort()).toEqual(original.sort());
    });

    it('should produce different shuffle with different seeds', () => {
      const rng1 = new Random(111);
      const rng2 = new Random(222);

      // Use larger array to reduce chance of collision
      const array1 = Array.from({ length: 20 }, (_, i) => i);
      const array2 = Array.from({ length: 20 }, (_, i) => i);

      rng1.shuffle(array1);
      rng2.shuffle(array2);

      // With 20 elements, probability of same shuffle is negligible
      expect(array1).not.toEqual(array2);
    });

    it('should produce same shuffle with same seed', () => {
      const rng1 = new Random(12345);
      const rng2 = new Random(12345);

      const array1 = [1, 2, 3, 4, 5];
      const array2 = [1, 2, 3, 4, 5];

      rng1.shuffle(array1);
      rng2.shuffle(array2);

      expect(array1).toEqual(array2);
    });

    it('should handle empty array', () => {
      const rng = new Random();
      const array: number[] = [];

      expect(() => rng.shuffle(array)).not.toThrow();
      expect(array).toEqual([]);
    });

    it('should handle single element array', () => {
      const rng = new Random();
      const array = [42];

      rng.shuffle(array);
      expect(array).toEqual([42]);
    });
  });
});
