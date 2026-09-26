import { describe, it, expect } from 'vitest';
import { Random, ValidationError } from '../../src/index.js';

const N = 100_000;

function sampleStats(
  draw: () => number,
  n = N
): { mean: number; variance: number } {
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const v = draw();
    sum += v;
    sumSq += v * v;
  }
  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  return { mean, variance };
}

/** Relative closeness: |a - b| <= tol * |b| */
function expectClose(actual: number, expected: number, tol: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(
    tol * Math.abs(expected)
  );
}

/** Lanczos approximation of the gamma function, used for Weibull's mean. */
function gammaFn(z: number): number {
  const g = 7;
  const coef = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gammaFn(1 - z));
  z -= 1;
  let x = coef[0]!;
  for (let i = 1; i < g + 2; i++) x += coef[i]! / (z + i);
  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

describe('Random: additional distributions', () => {
  describe('lognormal', () => {
    it('is strictly positive with the expected mean and variance', () => {
      const rng = new Random(42);
      const mu = 1.2;
      const sigma = 0.5;
      const { mean, variance } = sampleStats(() => rng.lognormal(mu, sigma));
      const expectedMean = Math.exp(mu + (sigma * sigma) / 2);
      const expectedVar =
        (Math.exp(sigma * sigma) - 1) * Math.exp(2 * mu + sigma * sigma);
      expectClose(mean, expectedMean, 0.02);
      expectClose(variance, expectedVar, 0.08);
      for (let i = 0; i < 1000; i++)
        expect(rng.lognormal(mu, sigma)).toBeGreaterThan(0);
    });

    it('lognormalParams round-trips a desired mean and standard deviation', () => {
      const rng = new Random(7);
      const { mu, sigma } = Random.lognormalParams(12, 4);
      const { mean, variance } = sampleStats(() => rng.lognormal(mu, sigma));
      expectClose(mean, 12, 0.02);
      expectClose(Math.sqrt(variance), 4, 0.05);
    });

    it('validates parameters', () => {
      const rng = new Random(1);
      expect(() => rng.lognormal(NaN, 1)).toThrow(ValidationError);
      expect(() => rng.lognormal(0, -1)).toThrow(ValidationError);
      expect(() => Random.lognormalParams(0, 1)).toThrow(ValidationError);
      expect(() => Random.lognormalParams(1, -1)).toThrow(ValidationError);
    });
  });

  describe('gamma', () => {
    it.each([
      [0.5, 2],
      [1, 3],
      [2.5, 1.5],
      [9, 0.5],
    ])(
      'shape %p scale %p has mean k*theta and variance k*theta^2',
      (shape, scale) => {
        const rng = new Random(123);
        const { mean, variance } = sampleStats(() => rng.gamma(shape, scale));
        expectClose(mean, shape * scale, 0.03);
        expectClose(variance, shape * scale * scale, 0.1);
      }
    );

    it('is strictly positive', () => {
      const rng = new Random(5);
      for (let i = 0; i < 10_000; i++) {
        expect(rng.gamma(0.3, 1)).toBeGreaterThan(0);
      }
    });

    it('defaults scale to 1 and validates parameters', () => {
      const rng = new Random(9);
      const { mean } = sampleStats(() => rng.gamma(4), 20_000);
      expectClose(mean, 4, 0.05);
      expect(() => rng.gamma(0)).toThrow(ValidationError);
      expect(() => rng.gamma(-1, 1)).toThrow(ValidationError);
      expect(() => rng.gamma(1, 0)).toThrow(ValidationError);
      expect(() => rng.gamma(Infinity, 1)).toThrow(ValidationError);
    });
  });

  describe('erlang', () => {
    it('has mean = mean and variance = mean^2 / k', () => {
      const rng = new Random(2024);
      const { mean, variance } = sampleStats(() => rng.erlang(4, 20));
      expectClose(mean, 20, 0.02);
      expectClose(variance, 100, 0.1);
    });

    it('with k = 1 behaves like an exponential', () => {
      const rng = new Random(11);
      const { mean, variance } = sampleStats(() => rng.erlang(1, 5));
      expectClose(mean, 5, 0.03);
      expectClose(variance, 25, 0.1);
    });

    it('validates parameters', () => {
      const rng = new Random(3);
      expect(() => rng.erlang(0, 5)).toThrow(ValidationError);
      expect(() => rng.erlang(2.5, 5)).toThrow(ValidationError);
      expect(() => rng.erlang(2, 0)).toThrow(ValidationError);
    });
  });

  describe('weibull', () => {
    it.each([
      [0.8, 10],
      [1, 5],
      [2.5, 1000],
    ])('shape %p scale %p has mean scale*Gamma(1+1/shape)', (shape, scale) => {
      const rng = new Random(77);
      const { mean } = sampleStats(() => rng.weibull(shape, scale));
      expectClose(mean, scale * gammaFn(1 + 1 / shape), 0.03);
    });

    it('is non-negative and validates parameters', () => {
      const rng = new Random(8);
      for (let i = 0; i < 10_000; i++) {
        expect(rng.weibull(1.5)).toBeGreaterThanOrEqual(0);
      }
      expect(() => rng.weibull(0, 1)).toThrow(ValidationError);
      expect(() => rng.weibull(1, -1)).toThrow(ValidationError);
    });
  });

  describe('beta', () => {
    it.each([
      [2, 38],
      [1, 1],
      [5, 2],
    ])('alpha %p beta %p stays in (0, 1) with mean a/(a+b)', (a, b) => {
      const rng = new Random(31);
      let min = Infinity;
      let max = -Infinity;
      const { mean, variance } = sampleStats(() => {
        const v = rng.beta(a, b);
        if (v < min) min = v;
        if (v > max) max = v;
        return v;
      });
      expect(min).toBeGreaterThan(0);
      expect(max).toBeLessThan(1);
      expectClose(mean, a / (a + b), 0.02);
      expectClose(variance, (a * b) / ((a + b) ** 2 * (a + b + 1)), 0.1);
    });

    it('validates parameters', () => {
      const rng = new Random(4);
      expect(() => rng.beta(0, 1)).toThrow(ValidationError);
      expect(() => rng.beta(1, -2)).toThrow(ValidationError);
    });
  });

  describe('bernoulli', () => {
    it('returns true with probability p', () => {
      const rng = new Random(99);
      let trues = 0;
      for (let i = 0; i < N; i++) if (rng.bernoulli(0.3)) trues++;
      expectClose(trues / N, 0.3, 0.03);
    });

    it('handles the endpoints and validates p', () => {
      const rng = new Random(6);
      for (let i = 0; i < 100; i++) {
        expect(rng.bernoulli(0)).toBe(false);
        expect(rng.bernoulli(1)).toBe(true);
      }
      expect(() => rng.bernoulli(1.5)).toThrow(ValidationError);
      expect(() => rng.bernoulli(-0.1)).toThrow(ValidationError);
      expect(() => rng.bernoulli(NaN)).toThrow(ValidationError);
    });
  });

  describe('geometric', () => {
    it('counts trials until first success with mean 1/p', () => {
      const rng = new Random(2);
      const p = 0.25;
      let min = Infinity;
      const { mean, variance } = sampleStats(() => {
        const v = rng.geometric(p);
        expect(Number.isInteger(v)).toBe(true);
        if (v < min) min = v;
        return v;
      });
      expect(min).toBe(1);
      expectClose(mean, 1 / p, 0.02);
      expectClose(variance, (1 - p) / (p * p), 0.06);
    });

    it('returns 1 when p is 1 and validates p', () => {
      const rng = new Random(13);
      expect(rng.geometric(1)).toBe(1);
      expect(() => rng.geometric(0)).toThrow(ValidationError);
      expect(() => rng.geometric(1.01)).toThrow(ValidationError);
    });
  });

  describe('weightedChoice and discrete', () => {
    it('chooses items proportionally to their weights', () => {
      const rng = new Random(55);
      const counts = { a: 0, b: 0, c: 0 };
      for (let i = 0; i < N; i++) {
        counts[rng.weightedChoice(['a', 'b', 'c'] as const, [6, 3, 1])]++;
      }
      expectClose(counts.a / N, 0.6, 0.03);
      expectClose(counts.b / N, 0.3, 0.05);
      expectClose(counts.c / N, 0.1, 0.1);
    });

    it('never returns zero-weight items', () => {
      const rng = new Random(21);
      for (let i = 0; i < 5000; i++) {
        expect(rng.weightedChoice(['never', 'always'], [0, 1])).toBe('always');
      }
    });

    it('discrete() matches weightedChoice()', () => {
      const a = new Random(1234);
      const b = new Random(1234);
      const entries = [
        { value: 'critical', weight: 0.1 },
        { value: 'urgent', weight: 0.3 },
        { value: 'routine', weight: 0.6 },
      ];
      for (let i = 0; i < 500; i++) {
        expect(a.discrete(entries)).toBe(
          b.weightedChoice(
            entries.map((e) => e.value),
            entries.map((e) => e.weight)
          )
        );
      }
    });

    it('validates inputs', () => {
      const rng = new Random(17);
      expect(() => rng.weightedChoice([], [])).toThrow(ValidationError);
      expect(() => rng.weightedChoice(['a'], [1, 2])).toThrow(ValidationError);
      expect(() => rng.weightedChoice(['a', 'b'], [0, 0])).toThrow(
        ValidationError
      );
      expect(() => rng.weightedChoice(['a', 'b'], [1, -1])).toThrow(
        ValidationError
      );
      expect(() => rng.discrete([])).toThrow(ValidationError);
    });
  });

  describe('empirical', () => {
    const samples = [4.2, 5.1, 3.8, 6.4, 5.5, 4.9];

    it('without interpolation returns observed values only, uniformly', () => {
      const rng = new Random(88);
      const seen = new Map<number, number>();
      for (let i = 0; i < N; i++) {
        const v = rng.empirical(samples);
        expect(samples).toContain(v);
        seen.set(v, (seen.get(v) ?? 0) + 1);
      }
      expect(seen.size).toBe(samples.length);
      for (const count of seen.values()) {
        expectClose(count / N, 1 / samples.length, 0.05);
      }
    });

    it('with interpolation stays within [min, max] and produces in-between values', () => {
      const rng = new Random(89);
      let between = 0;
      for (let i = 0; i < 10_000; i++) {
        const v = rng.empirical(samples, { interpolate: true });
        expect(v).toBeGreaterThanOrEqual(3.8);
        expect(v).toBeLessThanOrEqual(6.4);
        if (!samples.includes(v)) between++;
      }
      expect(between).toBeGreaterThan(9000);
    });

    it('interpolated mean approximates the sample mean', () => {
      const rng = new Random(90);
      const { mean } = sampleStats(
        () => rng.empirical(samples, { interpolate: true }),
        50_000
      );
      // Linear interpolation over sorted samples has mean equal to the
      // trapezoid average, which sits close to the sample mean for this data.
      const sampleMean = samples.reduce((a, b) => a + b, 0) / samples.length;
      expect(Math.abs(mean - sampleMean)).toBeLessThan(0.3);
    });

    it('handles a single sample and validates input', () => {
      const rng = new Random(91);
      expect(rng.empirical([7], { interpolate: true })).toBe(7);
      expect(rng.empirical([7])).toBe(7);
      expect(() => rng.empirical([])).toThrow(ValidationError);
      expect(() => rng.empirical([1, NaN], { interpolate: true })).toThrow(
        ValidationError
      );
    });
  });

  describe('reproducibility', () => {
    it('produces identical streams for identical seeds across all distributions', () => {
      const a = new Random(31337);
      const b = new Random(31337);
      const draw = (r: Random) => [
        r.lognormal(1, 0.5),
        r.gamma(2.5, 2),
        r.erlang(3, 9),
        r.weibull(1.5, 100),
        r.beta(2, 5),
        r.bernoulli(0.5),
        r.geometric(0.3),
        r.weightedChoice([1, 2, 3], [1, 1, 1]),
        r.empirical([1, 2, 3], { interpolate: true }),
      ];
      for (let i = 0; i < 100; i++) {
        expect(draw(a)).toEqual(draw(b));
      }
    });

    it('existing distributions never return Infinity or NaN even when the generator hits 0', () => {
      // Seed 0 makes the LCG produce state 0 -> the first next() is not 0, but the
      // period contains exactly one zero state. Exhaustively checking is too slow;
      // instead verify the guard directly via a seed engineered to land on 0.
      // seed s such that (a*s + c) mod m == 0  =>  s = (-c * a^-1) mod m
      const a = 1664525;
      const c = 1013904223;
      const m = 2 ** 32;
      // Modular inverse of a (odd) modulo 2^32 via Newton iteration
      let inv = 1n;
      const A = BigInt(a);
      const M = BigInt(m);
      for (let i = 0; i < 6; i++) inv = (inv * (2n - A * inv)) % M;
      inv = ((inv % M) + M) % M;
      const s = Number((((M - BigInt(c)) % M) * inv) % M);
      expect((a * s + c) % m).toBe(0);

      const rng = new Random(s);
      const e = rng.exponential(5);
      expect(Number.isFinite(e)).toBe(true);

      rng.setSeed(s);
      const n = rng.normal(0, 1);
      expect(Number.isFinite(n)).toBe(true);
    });
  });
});
