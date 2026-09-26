/**
 * Numerical helpers for statistical inference (Student's t quantiles).
 * Dependency-free, accurate to roughly 1e-9, and only called once per
 * confidence-interval request, so speed is not a concern.
 *
 * @internal
 */

/**
 * Natural log of the gamma function (Lanczos approximation, g = 7).
 */
export function lnGamma(x: number): number {
  const coefficients = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    // Reflection formula
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  }
  x -= 1;
  let sum = coefficients[0]!;
  const t = x + 7.5;
  for (let i = 1; i < coefficients.length; i++) {
    sum += coefficients[i]! / (x + i);
  }
  return (
    0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(sum)
  );
}

/**
 * Continued fraction for the incomplete beta function (Lentz's method).
 */
function betaContinuedFraction(a: number, b: number, x: number): number {
  const maxIterations = 1000;
  const epsilon = 1e-15;
  const tiny = 1e-300;

  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= maxIterations; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;

    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < epsilon) break;
  }
  return h;
}

/**
 * Regularized incomplete beta function I_x(a, b).
 */
export function regularizedIncompleteBeta(
  x: number,
  a: number,
  b: number
): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const lnBeta =
    lnGamma(a + b) -
    lnGamma(a) -
    lnGamma(b) +
    a * Math.log(x) +
    b * Math.log(1 - x);
  const front = Math.exp(lnBeta);

  // Use the symmetry relation to keep the continued fraction convergent
  if (x < (a + 1) / (a + b + 2)) {
    return (front * betaContinuedFraction(a, b, x)) / a;
  }
  return 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/**
 * Cumulative distribution function of Student's t with `df` degrees of freedom.
 */
export function studentTCdf(t: number, df: number): number {
  if (!Number.isFinite(t)) return t > 0 ? 1 : 0;
  const x = df / (df + t * t);
  const tail = 0.5 * regularizedIncompleteBeta(x, df / 2, 0.5);
  return t >= 0 ? 1 - tail : tail;
}

/**
 * Standard normal quantile (Acklam's algorithm, relative error ~1e-9).
 */
export function normalQuantile(p: number): number {
  if (!(p > 0 && p < 1)) {
    if (p === 0) return -Infinity;
    if (p === 1) return Infinity;
    return NaN;
  }
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let q: number;
  let r: number;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q +
        c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
    );
  }
  if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r +
        a[5]!) *
        q) /
      (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1)
    );
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return (
    -(
      ((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q +
      c[5]!
    ) /
    ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
  );
}

/**
 * Quantile (inverse CDF) of Student's t distribution.
 * Bisection on the CDF; for very large df the normal quantile is used.
 *
 * @param p - Cumulative probability in (0, 1)
 * @param df - Degrees of freedom (> 0)
 */
export function studentTQuantile(p: number, df: number): number {
  if (!(p > 0 && p < 1)) {
    if (p === 0) return -Infinity;
    if (p === 1) return Infinity;
    return NaN;
  }
  if (!(df > 0)) return NaN;
  if (df > 1e6) return normalQuantile(p);
  if (p === 0.5) return 0;

  // Work with the upper tail and mirror for p < 0.5
  const target = p > 0.5 ? p : 1 - p;
  let lo = 0;
  let hi = 1;
  while (studentTCdf(hi, df) < target) {
    hi *= 2;
    if (hi > 1e12) break;
  }
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (studentTCdf(mid, df) < target) {
      lo = mid;
    } else {
      hi = mid;
    }
    if (hi - lo < 1e-12 * Math.max(1, hi)) break;
  }
  const t = 0.5 * (lo + hi);
  return p > 0.5 ? t : -t;
}

/**
 * Two-sided critical value t* such that P(-t* < T < t*) = confidence.
 *
 * @param confidence - Confidence level in (0, 1), e.g. 0.95
 * @param df - Degrees of freedom (> 0)
 */
export function studentTCritical(confidence: number, df: number): number {
  return studentTQuantile(0.5 + confidence / 2, df);
}
