import { describe, it, expect } from 'vitest';
import { Random, ValidationError } from '../../src/index.js';

describe('Random core (xoshiro128**)', () => {
  describe('seeding', () => {
    it('getSeed returns the seed the generator was created or reseeded with', () => {
      const rng = new Random(12345);
      rng.uniform(0, 1);
      rng.uniform(0, 1);
      expect(rng.getSeed()).toBe(12345);
      rng.setSeed(777);
      rng.normal(0, 1);
      expect(rng.getSeed()).toBe(777);
    });

    it('same seed gives the same sequence; setSeed restarts it', () => {
      const a = new Random(42);
      const b = new Random(42);
      const first = Array.from({ length: 20 }, () => a.uniform(0, 1));
      expect(Array.from({ length: 20 }, () => b.uniform(0, 1))).toEqual(first);
      a.setSeed(42);
      expect(Array.from({ length: 20 }, () => a.uniform(0, 1))).toEqual(first);
    });

    it('adjacent seeds give unrelated sequences', () => {
      const a = new Random(1000);
      const b = new Random(1001);
      let same = 0;
      for (let i = 0; i < 1000; i++) {
        if (Math.abs(a.uniform(0, 1) - b.uniform(0, 1)) < 1e-3) same++;
      }
      expect(same).toBeLessThan(10);
    });

    it('unseeded generators get a random 32-bit seed that reproduces them', () => {
      const a = new Random();
      const seed = a.getSeed();
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0xffffffff);
      const b = new Random(seed);
      expect(b.uniform(0, 1)).toBe(a.uniform(0, 1));
      expect(Random.randomSeed()).toBeLessThanOrEqual(0xffffffff);
    });
  });

  describe('state', () => {
    it('getState/setState replays from a checkpoint', () => {
      const rng = new Random(9);
      for (let i = 0; i < 5; i++) rng.uniform(0, 1);
      const state = rng.getState();
      const expected = Array.from({ length: 10 }, () => rng.exponential(2));
      rng.setState(state);
      expect(Array.from({ length: 10 }, () => rng.exponential(2))).toEqual(
        expected
      );
    });

    it('rejects malformed state', () => {
      const rng = new Random(1);
      expect(() => rng.setState([1, 2, 3])).toThrow(ValidationError);
      expect(() => rng.setState([0, 0, 0, 0, 0])).toThrow(ValidationError);
      expect(() => rng.setState([1.5, 2, 3, 4, 0])).toThrow(ValidationError);
    });
  });

  describe('streams', () => {
    it('named streams are reproducible and independent of parent usage', () => {
      const a = new Random(42);
      const b = new Random(42);
      b.uniform(0, 1);
      b.uniform(0, 1); // parent usage must not matter
      const sa = a.stream('arrivals');
      const sb = b.stream('arrivals');
      expect(Array.from({ length: 10 }, () => sa.uniform(0, 1))).toEqual(
        Array.from({ length: 10 }, () => sb.uniform(0, 1))
      );
    });

    it('different names and different base seeds give different streams', () => {
      const rng = new Random(42);
      const s1 = rng.stream('arrivals');
      const s2 = rng.stream('service');
      const s3 = new Random(43).stream('arrivals');
      const x1 = Array.from({ length: 10 }, () => s1.uniform(0, 1));
      const x2 = Array.from({ length: 10 }, () => s2.uniform(0, 1));
      const x3 = Array.from({ length: 10 }, () => s3.uniform(0, 1));
      expect(x1).not.toEqual(x2);
      expect(x1).not.toEqual(x3);
      expect(s1.getSeed()).not.toBe(s2.getSeed());
    });

    it('spawn is deterministic given the parent state', () => {
      const a = new Random(5);
      const b = new Random(5);
      const ca = a.spawn();
      const cb = b.spawn();
      expect(ca.getSeed()).toBe(cb.getSeed());
      expect(a.spawn().getSeed()).not.toBe(ca.getSeed());
    });

    it('validates stream names', () => {
      const rng = new Random(1);
      expect(() => rng.stream('')).toThrow(ValidationError);
      // @ts-expect-error name must be a string
      expect(() => rng.stream(3)).toThrow(ValidationError);
    });
  });

  describe('quality', () => {
    it('uniform output is uniform across 10 bins (chi-square)', () => {
      const rng = new Random(2024);
      const bins = new Array<number>(10).fill(0);
      const n = 200_000;
      for (let i = 0; i < n; i++) bins[Math.floor(rng.uniform(0, 1) * 10)]!++;
      const expected = n / 10;
      const chi2 = bins.reduce(
        (acc, c) => acc + (c - expected) ** 2 / expected,
        0
      );
      // 9 degrees of freedom: 99.9% critical value is 27.9
      expect(chi2).toBeLessThan(27.9);
    });

    it('has negligible lag-1 autocorrelation', () => {
      const rng = new Random(77);
      const n = 200_000;
      let prev = rng.uniform(0, 1);
      let sum = 0;
      let sumSq = 0;
      let cross = 0;
      const first = prev;
      for (let i = 1; i < n; i++) {
        const x = rng.uniform(0, 1);
        cross += (prev - 0.5) * (x - 0.5);
        sum += x;
        sumSq += (x - 0.5) ** 2;
        prev = x;
      }
      sum += first;
      const r = cross / sumSq;
      expect(Math.abs(r)).toBeLessThan(0.01);
      expect(sum / n).toBeCloseTo(0.5, 2);
    });

    it('low bits are as good as high bits (randint parity)', () => {
      const rng = new Random(3);
      let odd = 0;
      const n = 100_000;
      for (let i = 0; i < n; i++) if (rng.randint(0, 1) === 1) odd++;
      expect(odd / n).toBeGreaterThan(0.49);
      expect(odd / n).toBeLessThan(0.51);
      // No short cycle in the low bit: consecutive pairs should cover all 4 combos
      const combos = new Set<string>();
      let a = rng.randint(0, 1);
      for (let i = 0; i < 100; i++) {
        const b = rng.randint(0, 1);
        combos.add(`${a}${b}`);
        a = b;
      }
      expect(combos.size).toBe(4);
    });
  });
});
