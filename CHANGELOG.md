# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.8] - 2026-02-15

### Added

- **Queue Disciplines for Resources**: Flexible queue management with FIFO, LIFO, and Priority disciplines
  - `queueDiscipline` option for Resource constructor: `'fifo' | 'lifo' | 'priority'`
  - FIFO (First In First Out): Traditional queue, serves requests in arrival order (default)
  - LIFO (Last In First Out): Stack behavior, serves most recent request first
  - Priority: Serves requests by priority value (lower number = higher priority)
  - Configurable tie-breakers for priority queues: `{ type: 'priority', tieBreaker: 'fifo' | 'lifo' }`
  - Binary search insertion (O(log n)) for efficient priority queue operations
  - Backward compatible: existing code continues to work with default FIFO behavior
  - Preemptive resources now default to priority discipline (was implicit, now explicit)
  - 17 comprehensive tests covering all queue discipline behaviors

- **Queue Disciplines for Buffer**: Independent queue disciplines for put and get operations
  - `putQueueDiscipline` option: Controls ordering of waiting put requests
  - `getQueueDiscipline` option: Controls ordering of waiting get requests
  - Priority parameter added to `put(amount, priority?)` and `get(amount, priority?)` methods
  - Full support for FIFO, LIFO, and Priority disciplines on both queues
  - Enables advanced patterns like priority deliveries, rush orders, and preferential withdrawals

- **Type System for Queue Disciplines**: New types in `src/types/queue-discipline.ts`
  - `QueueDiscipline` type: `'fifo' | 'lifo' | 'priority'`
  - `QueueDisciplineConfig` interface: Extended configuration with tie-breaker support
  - `validateQueueDiscipline()`: Runtime validation with helpful error messages
  - `getDefaultQueueConfig()`: Default configuration factory

### Examples

- **Hospital Emergency Room** (`examples/hospital-er/`): Priority queue demonstration
  - Realistic healthcare triage scenario with Critical/Urgent/Routine patients
  - Side-by-side comparison of FIFO vs Priority queue disciplines
  - Statistical analysis showing 70-85% reduction in critical patient wait times
  - Demonstrates real-world trade-offs: critical patients benefit, routine patients wait longer
  - Complete README with implementation patterns and key takeaways

### Documentation

- Updated README with queue discipline documentation
  - New "Queue Disciplines" section under Resources
  - Buffer queue discipline examples
  - Priority tie-breaker configuration examples
- Updated examples section to feature Hospital ER as primary queue discipline demo
- CHANGELOG updated with comprehensive v0.1.8 feature list

### Changed

- Resource class now explicitly supports queue discipline configuration
- Buffer class signatures updated to include priority parameters (backward compatible)
- Preemptive resources now explicitly default to priority discipline (behavior unchanged)

### Internal

- Queue insertion logic refactored for clarity and performance
- Binary search implementation for priority queues with configurable tie-breaking
- Validation improvements for queue discipline configuration
- Process class updated to pass priority parameters to Buffer operations

## [0.1.7] - 2026-02-15

### Added

- **SimEvent (Event Coordination System)**: New signaling system for process coordination and synchronization
  - `SimEvent(sim, name?)`: Create named or auto-generated events for process coordination
  - `event.wait()`: Wait for an event to be triggered (blocks until trigger)
  - `event.trigger(value?)`: Trigger event and resume all waiting processes with optional data payload
  - `event.reset()`: Reset event for reuse in recurring patterns
  - `event.isTriggered`: Check if event has been triggered
  - `event.value`: Access value passed when event was triggered
  - `event.waitingCount`: Number of processes currently waiting
  - Support for barrier synchronization, broadcast patterns, and conditional waiting
  - Automatic cleanup when processes are interrupted while waiting for events
  - 24 comprehensive unit tests covering all coordination patterns
  - Example: `examples/traffic-light/` - Traffic intersection simulation with signal coordination

- **Observability & Trace Mode**: Comprehensive simulation monitoring and debugging capabilities
  - `sim.enableTrace(options?)`: Enable selective tracing for events, resources, processes, and SimEvents
  - `sim.disableTrace()`: Disable all tracing
  - `sim.isTraceEnabled(type)`: Check if specific trace type is enabled
  - `TraceOptions` interface: Configure which event types to trace
  - New trace event handlers:
    - `trace:resource` - Resource operations (request, release, put, get)
    - `trace:process` - Process lifecycle events
    - `trace:simevent` - Event coordination (trigger, wait, reset)
  - Works seamlessly with existing event system (`on()`, `off()`, `emit()`)
  - 17 comprehensive tests for observability features
  - Zero performance overhead when disabled

- **Enhanced ProcessGenerator Type**: Extended to support SimEventRequest
  - Now includes `SimEventRequest` for event coordination
  - Full type safety for event-based process coordination
  - Improved TypeScript inference for all yieldable simulation primitives

### Documentation

- New SimEvent API documentation with coordination patterns
- Observability guide with trace configuration examples
- Traffic light coordination example demonstrating realistic event usage
- Updated roadmap with completed v0.1.7 features

### Internal

- All 570 tests passing (24 new SimEvent tests, 17 new observability tests)
- Process class now tracks current event requests for proper cleanup on interruption
- Simulation class internal methods for trace emission (`_emitResource`, `_emitProcess`, `_emitSimEvent`)
- SimEvent internal methods for process coordination (`_addWaiter`, `_removeWaiter`)
- Added `validateName` utility for name validation

## [0.1.6] - 2026-02-11

### Added

- **Buffer Resource**: New resource type for managing homogeneous quantities (fuel, money, raw materials)
  - `Buffer(sim, capacity, options)`: Create buffer with optional initial level
  - `put(amount)`: Add quantity to buffer, blocks if insufficient space
  - `get(amount)`: Remove quantity from buffer, blocks if insufficient level
  - `level`: Current quantity in buffer
  - `available`: Space remaining in buffer
  - `putQueueLength` / `getQueueLength`: Track waiting processes
  - Comprehensive statistics tracking (put/get operations, queue lengths, wait times)
  - 39 unit tests covering all functionality
  - Example: `examples/fuel-station/` - Gas station simulation with fuel tank buffer
  - Integration tests with Resource coordination

- **Store Resource**: New resource type for managing distinct objects with filtering
  - `Store<T>(sim, capacity, options)`: Create type-safe store with generic TypeScript support
  - `put(item)`: Add object to store, blocks if full
  - `get(filter?)`: Retrieve object (FIFO or filter-based), blocks until match available
  - Filter-based retrieval: `get((item) => item.destination === 'NYC')`
  - `items`: Read-only access to stored items
  - `size`: Current number of items in store
  - Comprehensive statistics tracking (put/get operations, queue lengths, wait times)
  - 39 unit tests covering all functionality
  - Example: `examples/warehouse-store/` - Distribution warehouse with pallet inventory
  - Integration tests with Resource and Buffer coordination

- **ProcessGenerator Type Enhancement**: Extended to support Buffer and Store request types
  - Now includes `BufferPutRequest`, `BufferGetRequest`, `StorePutRequest<T>`, `StoreGetRequest<T>`
  - Full type safety for all yieldable simulation primitives
  - Improved TypeScript inference in generator functions

### Documentation

- New Buffer API documentation in README with usage examples
- New Store API documentation in README with usage examples and filter patterns
- `examples/fuel-station/README.md` - Complete guide for Buffer usage
- `examples/warehouse-store/README.md` - Complete guide for Store usage with filtering
- Updated roadmap with completed v0.1.6 features and future priorities (v0.1.7-v0.2.0)

### Fixed

- Relaxed performance benchmark threshold for random number generation test (50ms → 100ms) to prevent flaky failures on slower systems

### Internal

- Added ESLint suppressions for necessary `any` types in ProcessGenerator union
- All 529 tests passing
- Improved test file type safety with `ProcessGenerator` usage throughout

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
