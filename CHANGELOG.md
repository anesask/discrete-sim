# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.5] - 2026-02-11

### Added

- **Enhanced Input Validation**: Comprehensive runtime validation across all core modules to improve error messages and prevent invalid operations
  - All validation errors now use consistent `ValidationError` type with detailed context
  - Added empty string validation for metric names and resource names
  - Added NaN/Infinity validation for all numeric parameters (Statistics, Random, Resource priority)
  - Improved error messages with actionable guidance and parameter context
  - 100% functional test pass rate (426/426 tests) with validation coverage
- **React Fast Refresh Compatibility Utilities**: New utilities to help developers avoid common React integration issues
  - `analyzeExportsForReact()`: Analyzes module exports for potential Fast Refresh compatibility issues
  - `warnReactCompatibilityIssues()`: Logs warnings in development mode for problematic export patterns
  - `withReactCompatCheck()`: HOF wrapper to automatically check exports for compatibility
  - `ExportAnalysis` type: Interface for detailed export analysis results
  - Comprehensive React integration guide at `examples/react-integration/REACT_INTEGRATION.md`
  - Example React context implementation at `examples/react-integration/SimulationContext.tsx`
  - Detects and warns about:
    - Mixed default and named exports with hooks
    - Incomplete hook names (e.g., "useSim" instead of "useSimulation")
    - Mixing React components/hooks with non-React exports
    - Anonymous function exports
- **Developer Experience Improvements**:
  - Development-only warnings (no production overhead)
  - Clear, actionable error messages with links to documentation
  - Best practices guide for React integration
- **Test Suite Hygiene**: Standardized test file naming conventions and improved test organization
  - All test files now use consistent kebab-case naming (e.g., `event-queue.test.ts`)
  - Added comprehensive performance benchmarks in `tests/benchmarks/` for quick performance validation
  - Added scalability tests in `tests/performance/` to verify O(n) and O(log n) complexity guarantees
  - Fixed all linting errors in test files for better maintainability
  - Test categories clearly separated: unit, integration, benchmarks, performance, and validation

### Documentation

- New `REACT_INTEGRATION.md` guide covering:
  - Fast Refresh compatibility best practices
  - Common issues and solutions
  - Proper export patterns for React components and hooks
  - Example project structure
  - Vite configuration tips

## [0.1.4] - 2026-02-09

**Performance Optimization Release** - Focused on performance improvements for resource queuing and statistics calculations. Released separately from v0.1.3 to maintain clear upgrade paths and ensure full backward compatibility with existing codebases.

### Changed

- **Optimized Resource queue insertion**: Implemented binary search for priority queue insertion
  - Search complexity reduced from O(n) to O(log n)
  - Significantly faster for resources with large queues
  - Maintains correct priority ordering and FIFO behavior within same priority
  - Added 3 comprehensive tests including 100-request stress test
- **Optimized Statistics query methods**: Implemented caching for expensive statistics calculations
  - `getPercentile()` now caches sorted array: First call O(n log n), subsequent calls O(1)
  - `getMin()` / `getMax()` now maintain cached values incrementally: O(1) instead of O(n)
  - `getHistogram()` now caches results by bin count: Dramatically faster for repeated calls
  - Cache automatically invalidated when new samples are recorded via `recordSample()`
  - Min/max values updated incrementally as samples arrive (O(1) per sample)
  - Percentile calculations can reuse cached sorted array across different percentiles
  - Significant performance improvement for simulations with frequent statistics queries
  - Added 19 comprehensive tests for caching behavior and performance

### Migration Notes

No breaking changes - all optimizations are internal implementations. Existing code will benefit from performance improvements without any modifications required.

## [0.1.3] - 2026-02-09

### Added

- **Process cleanup on reset**: Simulation now properly interrupts and cleans up active processes during reset
  - `reset()` interrupts all running processes with an error
  - Processes can catch the interruption error and handle cleanup gracefully
  - Active processes are automatically removed from tracking when completed or interrupted
  - Internal `_removeProcess()` method for automatic cleanup
  - 7 comprehensive tests for process cleanup functionality
- **Configurable waitFor polling**: Improved condition waiting with customizable interval and timeout
  - `interval` option: Configure polling interval (default: 1 time unit)
  - `maxIterations` option: Set maximum polling attempts before timeout (default: Infinity)
  - New `ConditionTimeoutError`: Thrown when max iterations exceeded
  - `WaitForOptions` interface for type-safe configuration
  - Support for interval of 0 (immediate rechecks) and Infinity maxIterations
  - Comprehensive validation for interval and maxIterations parameters
  - 9 comprehensive tests for configurable polling functionality
- **Warm-up Period Support**: Statistics can now exclude initial transient behavior from calculations
  - `setWarmupPeriod(endTime)`: Set warm-up period end time
  - `getWarmupPeriod()`: Get current warm-up period
  - `isInWarmup()`: Check if simulation is in warm-up phase
  - Time-weighted averages and timeseries automatically exclude warm-up period
  - 8 comprehensive tests for warm-up period functionality
- **Event Tracing**: Detailed event execution logging for debugging and analysis
  - `enableEventTrace()`: Enable event tracing
  - `disableEventTrace()`: Disable event tracing
  - `getEventTrace()`: Get array of all executed events with timing info
  - `clearEventTrace()`: Clear event trace
  - Each trace entry includes event ID, time, priority, and execution order
  - 7 comprehensive tests for event tracing
- **Random Seed Validation**: Prevent overflow and invalid seed values
  - Validates seed is finite, integer, non-negative, and within safe range (0 to 2^32-1)
  - Automatic modulo wrapping for `Date.now()` timestamps
  - Clear error messages for invalid seeds
  - 10 comprehensive tests for seed validation
- **New Random Distributions**: Added triangular and Poisson distributions to Random class
  - `triangular(min, max, mode?)`: Triangular distribution useful for modeling when min, max, and most likely values are known
  - `poisson(lambda)`: Poisson distribution for modeling discrete events in fixed intervals
  - 10 comprehensive tests for new distributions with statistical validation
- Documentation for preemption feature in main README (feature existed but was undocumented)
  - Priority queuing examples
  - Preemptive resources with error handling
  - Complete code examples with `PreemptionError`
- Validation for `Simulation.run(until)` parameter to reject negative values, NaN, and Infinity
- `SimulationResult` interface documentation in README API Reference section
- Readonly modifiers on class properties to prevent accidental mutation
  - Applied to `Simulation`, `Resource`, `Process`, and `Statistics` classes
  - Improved type safety and prevented unintended reassignments
- "Limitations & Performance" section in README
  - Scale considerations with performance benchmarks
  - Memory usage guidelines
  - Clear guidance on when to use discrete-sim vs alternatives like SimPy
  - Performance optimization tips

### Changed

- **Optimized variance calculation**: Implemented Welford's online algorithm for O(1) incremental mean and variance updates
  - `getSampleMean()` now O(1) instead of O(n)
  - `getVariance()` now O(1) instead of O(n)
  - `getSampleCount()` now O(1) instead of O(n)
  - Maintains numerical stability for large datasets
  - Produces identical results to naive two-pass algorithm
  - Added 5 comprehensive tests for Welford's algorithm accuracy and performance
- Updated README with new waitFor options and ConditionTimeoutError documentation
- Process class now properly tracks and cleans up active processes in Simulation

### Fixed

- `SimulationResult.statistics` now properly populated with actual simulation statistics instead of empty object
- Added test coverage for statistics population in simulation results
- Resource `activeUsers` array filtering now modifies in-place instead of reassignment (required for readonly)
- EventQueue performance test thresholds increased to prevent flaky failures in CI/CD environments
  - Accounts for `localeCompare()` overhead in deterministic event ordering
  - Accounts for system load variations across different environments

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
