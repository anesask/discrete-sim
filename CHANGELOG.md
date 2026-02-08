# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2026-02-08

### Added

- **Advanced Statistics**: Comprehensive statistical analysis capabilities
  - `enableSampleTracking()` / `recordSample()`: Track raw sample values for advanced calculations
  - `getPercentile(name, percentile)`: Calculate percentiles (P50, P95, P99, etc.) for SLA tracking
  - `getVariance(name)`: Calculate variance of samples
  - `getStdDev(name)`: Calculate standard deviation of samples
  - `getMin(name)` / `getMax(name)`: Get minimum and maximum values
  - `getSampleMean(name)`: Calculate arithmetic mean of samples
  - `getSampleCount(name)`: Get number of samples recorded
  - `getHistogram(name, bins)`: Generate histogram distribution with configurable bins
- Enhanced `toJSON()` export to include sample statistics with percentiles
- Enhanced `toCSV()` export to include sample statistics section
- New `HistogramBin` interface for histogram data
- 36 comprehensive tests for advanced statistics features

### Changed

- Updated bank-tellers example to demonstrate percentile tracking (P50, P95, P99) and standard deviation
- Improved Statistics class documentation with advanced usage examples

### Fixed

- Histogram generation now correctly handles edge case where all sample values are identical (range = 0)

## [0.1.1] - 2026-02-07

### Added

- Initial release with core simulation features
- Process-based modeling with generators
- Resource management with FIFO queuing
- Priority queues and preemption support
- Time-weighted statistics and counters
- Reproducible random number generation
- Comprehensive validation and error handling
- 242 passing tests with 80%+ coverage
- 7 working examples (M/M/1 queue, warehouse, restaurant, bank tellers, etc.)

## [0.1.0] - 2026-02-06

### Added

- Initial beta release
