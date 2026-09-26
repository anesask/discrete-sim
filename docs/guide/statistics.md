# Statistics

Time-weighted averages, counters, samples with percentiles, and confidence intervals.

Collect and analyze simulation data with comprehensive metrics:

```typescript
const stats = new Statistics(sim);

// Time-weighted averages
stats.recordValue('temperature', 25.5);

// Counters
stats.increment('customers-served');

// Advanced statistics (v0.1.2+)
stats.enableSampleTracking('wait-time');
stats.recordSample('wait-time', 5.2);
stats.recordSample('wait-time', 3.1);

// Get statistics
const avgTemp = stats.getAverage('temperature');
const count = stats.getCount('customers-served');

// Percentiles for SLA tracking
const p50 = stats.getPercentile('wait-time', 50); // Median
const p95 = stats.getPercentile('wait-time', 95);
const p99 = stats.getPercentile('wait-time', 99);

// Variance and standard deviation (optimized with Welford's algorithm)
const variance = stats.getVariance('wait-time'); // O(1) - instant!
const stdDev = stats.getStdDev('wait-time'); // O(1) - instant!

// Histograms
const histogram = stats.getHistogram('wait-time', 10);

// Warm-up period (v0.1.3+)
stats.setWarmupPeriod(1000); // Exclude first 1000 time units
// Statistics now only include steady-state behavior after warm-up

// Confidence intervals and summaries (v0.1.15+)
const ci = stats.getConfidenceInterval('wait-time', 0.95);
console.log(
  `mean ${ci.mean.toFixed(2)} +/- ${ci.halfWidth.toFixed(2)} (n=${ci.n})`
);

// Queue waits within one run are autocorrelated; batch means gives an honest interval
const bm = stats.getBatchMeansCI('wait-time', { batches: 20 });

// Several percentiles from one sort, or everything at once
const { 50: median, 95: p95b } = stats.getPercentiles('wait-time', [50, 95]);
const summary = stats.getSummary('wait-time'); // n, mean, stdDev, min, max, p50, p95, p99, ci
```

**One run is not an answer.** A single simulation run is one sample path. Report a confidence interval, and for decisions between scenarios run several replications with different seeds and compare the intervals.

**Performance Note:** Mean, variance, and standard deviation calculations use Welford's online algorithm for O(1) computation, making them instantaneous even with millions of samples.
